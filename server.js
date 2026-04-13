const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

const app = express();
const port = process.env.PORT || 6800;

// Middleware
app.use(cors());

// Limit raw parsing + content-type spoofing to EXACTLY the /jsonrpc endpoint
app.use('/jsonrpc', (req, res, next) => {
  if (req.method === 'POST' && !req.headers['content-type']) {
    req.headers['content-type'] = 'text/plain';
  }
  next();
});

// Capture raw text specifically for the rpc endpoint
app.use('/jsonrpc', express.text({ type: '*/*' }));

// For all UI endpoints (/api/*), parse standard JSON properly!
app.use('/api', express.json());

app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database('requests.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    out_filename TEXT,
    headers TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.exec('ALTER TABLE requests ADD COLUMN options_json TEXT');
} catch (e) {
  // Ignore if column already exists
}

// Helper to handle RPC errors
const rpcError = (res, id, code, message) => {
  res.json({
    jsonrpc: "2.0",
    id: id || null,
    error: { code, message }
  });
};

// aria2 JSON-RPC Endpoint
app.post('/jsonrpc', (req, res) => {
  logger.debug({ headers: req.headers, rawBody: req.body }, 'Received raw JSON-RPC request');

  if (!req.body || typeof req.body !== 'string' || req.body.trim() === '') {
    logger.warn('req.body is empty or not text. Request may be completely empty.');
    return rpcError(res, null, -32700, 'Parse error: empty request');
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(req.body);
  } catch (err) {
    logger.error('Failed to parse request body as JSON. Raw body: ' + req.body);
    return rpcError(res, null, -32700, 'Parse error: Invalid JSON');
  }

  const { jsonrpc, id, method, params } = parsedBody;
  
  if (jsonrpc !== '2.0' || !method) {
    return rpcError(res, id, -32600, 'Invalid Request');
  }

  if (method === 'aria2.addUri') {
    let token = '';
    let uris = [];
    let options = {};

    if (!Array.isArray(params)) {
      return rpcError(res, id, -32602, 'Invalid params');
    }

    // Determine if token is used
    if (typeof params[0] === 'string' && params[0].startsWith('token:')) {
      token = params[0];
      uris = params[1] || [];
      options = params[2] || {};
    } else if (Array.isArray(params[0])) {
      uris = params[0];
      options = params[1] || {};
    } else {
      return rpcError(res, id, -32602, 'Invalid params');
    }

    // --- NORMALIZATION AND OVERRIDES ---
    const overrideUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
    let customHeaders = Array.isArray(options.header) ? options.header : (options.header ? [options.header] : []);
    
    let originalReferer = null;
    let originalCookie = null;

    // Clear out any existing user-agent/referer/cookie from the payload header array to prevent duplicates
    let finalHeaders = customHeaders.filter(h => {
      const lower = h.toLowerCase();
      if (lower.startsWith('referer:')) originalReferer = h.substring(8).trim();
      if (lower.startsWith('cookie:')) originalCookie = h.substring(7).trim();
      return !lower.startsWith('user-agent:') && !lower.startsWith('referer:') && !lower.startsWith('cookie:');
    });

    // Extract from HTTP headers, explicit options payload, or the ones we just extracted from options.header
    const referer = req.headers['referer'] || options['referer'] || originalReferer;
    if (referer) finalHeaders.push('Referer: ' + referer);
    
    const cookie = req.headers['cookie'] || options['cookie'] || originalCookie;
    if (cookie) finalHeaders.push('Cookie: ' + cookie);

    // Force override User-Agent
    finalHeaders.push('User-Agent: ' + overrideUA);

    // Reassign normalized headers and drop bare options
    options.header = finalHeaders;
    delete options['user-agent'];
    delete options['referer'];
    delete options['cookie'];
    // --- END NORMALIZATION ---

    // Process each URI (though typically there's only one per addUri call)
    let processed = 0;
    const stmt = db.prepare('INSERT INTO requests (url, out_filename, headers, options_json) VALUES (?, ?, ?, ?)');
    
    // We run the inserts in a transaction for safety
    const insertMany = db.transaction((uris) => {
      for (const uri of uris) {
        const out_filename = options.out || null;
        let headersStr = '[]';
        if (options.header) {
          headersStr = JSON.stringify(Array.isArray(options.header) ? options.header : [options.header]);
        }
        stmt.run(uri, out_filename, headersStr, JSON.stringify(options));
        processed++;
      }
    });

    try {
      insertMany(uris);
      // Mocking a successful gid return (16 hex chars)
      const mockGid = Math.random().toString(16).slice(2, 18).padStart(16, '0');
      res.json({
        id: id,
        jsonrpc: "2.0",
        result: mockGid
      });
    } catch (err) {
      console.error(err);
      return rpcError(res, id, -32603, 'Internal error');
    }

  } else if (method === 'aria2.getVersion') {
    // Some tools ping getVersion first
    res.json({
      id: id,
      jsonrpc: "2.0",
      result: { enabledFeatures: [], version: "1.36.0" }
    });
  } else {
    // Return mock success for other methods just in case
    res.json({
      id: id,
      jsonrpc: "2.0",
      result: "OK"
    });
  }
});

// API: Get all requests
app.get('/api/requests', (req, res) => {
  try {
    const status = req.query.status;
    let query = 'SELECT * FROM requests ORDER BY created_at DESC';
    let results = [];
    
    if (status) {
      results = db.prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC').all(status);
    } else {
      results = db.prepare(query).all();
    }
    
    // Parse headers back to array for UI
    results = results.map(r => ({
      ...r,
      headers: JSON.parse(r.headers || '[]')
    }));
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Export requests (marks as exported and returns the raw string)
app.post('/api/requests/export', (req, res) => {
  const { ids } = req.body; // array of ids, or 'all_pending'
  
  const getStmt = db.prepare('SELECT * FROM requests WHERE id = ?');
  const updateStmt = db.prepare("UPDATE requests SET status = 'exported' WHERE id = ?");
  
  let records = [];
  
  if (ids === 'all_pending') {
    records = db.prepare("SELECT * FROM requests WHERE status = 'pending' ORDER BY created_at ASC").all();
  } else if (Array.isArray(ids)) {
    for (const id of ids) {
      const rec = getStmt.get(id);
      if (rec) records.push(rec);
    }
  }

  let exportText = '';
  const exportTransaction = db.transaction((records) => {
    for (const rec of records) {
      exportText += rec.url + "\n";
      
      const opts = rec.options_json ? JSON.parse(rec.options_json) : null;
      
      if (!opts) {
        // Fallback for older items missing options_json
        const headers = JSON.parse(rec.headers || '[]');
        for (const h of headers) {
          exportText += " header=" + h + "\n";
        }
        if (rec.out_filename) {
          exportText += " out=" + rec.out_filename + "\n";
        }
      } else {
        // Iterate all provided options
        for (const [key, val] of Object.entries(opts)) {
          if (key === 'header') {
            const hs = Array.isArray(val) ? val : [val];
            for (const h of hs) {
              exportText += " header=" + h + "\n";
            }
          } else if (key === 'out') {
            let outVal = val;
            // Prepend relative directory name if present
            if (opts['dir']) {
              const lastFolder = path.basename(opts['dir']);
              if (lastFolder) outVal = lastFolder + '/' + outVal;
            }
            exportText += " out=" + outVal + "\n";
          } else if (key === 'dir') {
            // Already merged into out= above, ignore
          } else {
            exportText += " " + key + "=" + val + "\n";
          }
        }
      }
      
      // Mark as exported
      updateStmt.run(rec.id);
    }
  });

  try {
    exportTransaction(records);
    res.json({ success: true, text: exportText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete request
app.delete('/api/requests/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
    if (info.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Clear exported
app.post('/api/requests/clear', (req, res) => {
  try {
    const info = db.prepare("DELETE FROM requests WHERE status = 'exported'").run();
    res.json({ success: true, deletedCount: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Clear ALL (including pending)
app.post('/api/requests/clear-all', (req, res) => {
  try {
    const info = db.prepare("DELETE FROM requests").run();
    res.json({ success: true, deletedCount: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  logger.info("Aria2 Proxy listening on port " + port);
});
