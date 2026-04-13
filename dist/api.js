"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createApiRouter;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
function createApiRouter(db, logger) {
    const router = express_1.default.Router();
    // API: Get all requests
    router.get('/requests', (req, res) => {
        try {
            const { status } = req.query;
            let results;
            if (status && typeof status === 'string') {
                results = db
                    .prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC')
                    .all(status);
            }
            else {
                results = db
                    .prepare('SELECT * FROM requests ORDER BY created_at DESC')
                    .all();
            }
            // Parse headers JSON string back to array for the UI
            const parsed = results.map((r) => ({
                ...r,
                headers: JSON.parse(r.headers || '[]'),
            }));
            res.json(parsed);
        }
        catch (err) {
            logger.error(err);
            res.status(500).json({ error: err.message });
        }
    });
    // API: Export requests (marks as exported and returns an aria2c input-file string)
    router.post('/requests/export', (req, res) => {
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({ error: 'Invalid request body' });
        }
        const { ids } = req.body;
        if (!ids || (ids !== 'all_pending' && !Array.isArray(ids))) {
            return res.status(400).json({ error: 'ids must be "all_pending" or an array of ids' });
        }
        const getStmt = db.prepare('SELECT * FROM requests WHERE id = ?');
        const updateStmt = db.prepare("UPDATE requests SET status = 'exported' WHERE id = ?");
        let records = [];
        if (ids === 'all_pending') {
            records = db
                .prepare("SELECT * FROM requests WHERE status = 'pending' ORDER BY created_at ASC")
                .all();
        }
        else if (Array.isArray(ids)) {
            for (const id of ids) {
                const rec = getStmt.get(id);
                if (rec)
                    records.push(rec);
            }
        }
        let exportText = '';
        const exportTransaction = db.transaction((recs) => {
            for (const rec of recs) {
                exportText += rec.url + '\n';
                const opts = rec.options_json ? JSON.parse(rec.options_json) : null;
                if (!opts) {
                    // Fallback for older items missing options_json
                    const headers = JSON.parse(rec.headers || '[]');
                    for (const h of headers) {
                        exportText += ' header=' + h + '\n';
                    }
                    if (rec.out_filename) {
                        exportText += ' out=' + rec.out_filename + '\n';
                    }
                }
                else {
                    // Iterate all provided options
                    for (const [key, val] of Object.entries(opts)) {
                        if (key === 'header') {
                            const hs = Array.isArray(val) ? val : [val];
                            for (const h of hs) {
                                exportText += ' header=' + h + '\n';
                            }
                        }
                        else if (key === 'out') {
                            let outVal = val;
                            // Prepend relative directory name if present
                            if (opts['dir']) {
                                const lastFolder = path_1.default.basename(opts['dir']);
                                if (lastFolder)
                                    outVal = lastFolder + '/' + outVal;
                            }
                            exportText += ' out=' + outVal + '\n';
                        }
                        else if (key === 'dir') {
                            // Already merged into out= above, skip
                        }
                        else {
                            exportText += ' ' + key + '=' + String(val) + '\n';
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
        }
        catch (err) {
            logger.error(err);
            res.status(500).json({ error: err.message });
        }
    });
    // API: Delete a single request by ID
    router.delete('/requests/:id', (req, res) => {
        try {
            const info = db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
            if (info.changes > 0) {
                res.json({ success: true });
            }
            else {
                res.status(404).json({ error: 'Not found' });
            }
        }
        catch (err) {
            logger.error(err);
            res.status(500).json({ error: err.message });
        }
    });
    // API: Clear all exported requests
    router.post('/requests/clear', (_req, res) => {
        try {
            const info = db.prepare("DELETE FROM requests WHERE status = 'exported'").run();
            res.json({ success: true, deletedCount: info.changes });
        }
        catch (err) {
            logger.error(err);
            res.status(500).json({ error: err.message });
        }
    });
    // API: Clear ALL requests (including pending)
    router.post('/requests/clear-all', (_req, res) => {
        try {
            const info = db.prepare('DELETE FROM requests').run();
            res.json({ success: true, deletedCount: info.changes });
        }
        catch (err) {
            logger.error(err);
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
//# sourceMappingURL=api.js.map