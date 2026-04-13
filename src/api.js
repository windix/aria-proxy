const express = require('express');
const path = require('path');

module.exports = function(db, logger) {
  const router = express.Router();

  // API: Get all requests
  router.get('/requests', (req, res) => {
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
  router.post('/requests/export', (req, res) => {
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
  router.delete('/requests/:id', (req, res) => {
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
  router.post('/requests/clear', (req, res) => {
    try {
      const info = db.prepare("DELETE FROM requests WHERE status = 'exported'").run();
      res.json({ success: true, deletedCount: info.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Clear ALL (including pending)
  router.post('/requests/clear-all', (req, res) => {
    try {
      const info = db.prepare("DELETE FROM requests").run();
      res.json({ success: true, deletedCount: info.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
