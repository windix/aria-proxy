const express = require('express');

module.exports = function(db, logger) {
  const router = express.Router();

  // Helper to handle RPC errors
  const rpcError = (res, id, code, message) => {
    res.json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code, message }
    });
  };

  // aria2 JSON-RPC Endpoint
  router.post('/', (req, res) => {
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

    // --- OPTIONAL RPC SECRET CHECK ---
    let isTokenPresent = false;
    if (Array.isArray(params) && params.length > 0 && typeof params[0] === 'string' && params[0].startsWith('token:')) {
      isTokenPresent = true;
      const providedSecret = params[0].substring(6);
      if (process.env.ARIA2_RPC_SECRET && providedSecret !== process.env.ARIA2_RPC_SECRET) {
        logger.warn(`Unauthorized request rejected: Invalid RPC Secret`);
        return rpcError(res, id, 1, 'Unauthorized');
      }
    } else if (process.env.ARIA2_RPC_SECRET) {
      logger.warn(`Unauthorized request rejected: Missing RPC Secret`);
      return rpcError(res, id, 1, 'Unauthorized');
    }

    if (method === 'aria2.addUri') {
      let uris = [];
      let options = {};

      if (!Array.isArray(params)) {
        return rpcError(res, id, -32602, 'Invalid params');
      }

      if (isTokenPresent) {
        uris = params[1] || [];
        options = params[2] || {};
      } else {
        uris = params[0] || [];
        options = params[1] || {};
      }

      // --- NORMALIZATION AND OVERRIDES ---
      let customHeaders = Array.isArray(options.header) ? options.header : (options.header ? [options.header] : []);
      
      let originalReferer = null;
      let originalCookie = null;
      let originalUserAgent = null;

      // Clear out any existing user-agent/referer/cookie from the payload header array to prevent duplicates
      let finalHeaders = customHeaders.filter(h => {
        const lower = h.toLowerCase();
        if (lower.startsWith('referer:')) originalReferer = h.substring(8).trim();
        if (lower.startsWith('cookie:')) originalCookie = h.substring(7).trim();
        if (lower.startsWith('user-agent:')) originalUserAgent = h.substring(11).trim();
        return !lower.startsWith('user-agent:') && !lower.startsWith('referer:') && !lower.startsWith('cookie:');
      });

      // Extract from HTTP headers, explicit options payload, or the ones we just extracted from options.header
      const referer = req.headers['referer'] || options['referer'] || originalReferer;
      if (referer) finalHeaders.push('Referer: ' + referer);

      const cookie = req.headers['cookie'] || options['cookie'] || originalCookie;
      if (cookie) finalHeaders.push('Cookie: ' + cookie);

      // Override User-Agent ONLY if process.env.USER_AGENT is set, otherwise preserve incoming
      const userAgent = process.env.USER_AGENT || req.headers['user-agent'] || options['user-agent'] || originalUserAgent;
      if (userAgent) {
        finalHeaders.push('User-Agent: ' + userAgent);
      }

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
        logger.error(err);
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

  return router;
};
