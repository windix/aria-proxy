"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createJsonRpcRouter;
const express_1 = __importDefault(require("express"));
function createJsonRpcRouter(db, logger) {
    const router = express_1.default.Router();
    // Helper to send a JSON-RPC 2.0 error response
    const rpcError = (res, id, code, message) => {
        res.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
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
        }
        catch {
            logger.error('Failed to parse request body as JSON. Raw body: ' + req.body);
            return rpcError(res, null, -32700, 'Parse error: Invalid JSON');
        }
        const { jsonrpc, id, method, params } = parsedBody;
        if (jsonrpc !== '2.0' || !method) {
            return rpcError(res, id, -32600, 'Invalid Request');
        }
        // --- OPTIONAL RPC SECRET CHECK ---
        let isTokenPresent = false;
        if (Array.isArray(params) &&
            params.length > 0 &&
            typeof params[0] === 'string' &&
            params[0].startsWith('token:')) {
            isTokenPresent = true;
            const providedSecret = params[0].substring(6);
            if (process.env.ARIA2_RPC_SECRET && providedSecret !== process.env.ARIA2_RPC_SECRET) {
                logger.warn('Unauthorized request rejected: Invalid RPC Secret');
                return rpcError(res, id, 1, 'Unauthorized');
            }
        }
        else if (process.env.ARIA2_RPC_SECRET) {
            logger.warn('Unauthorized request rejected: Missing RPC Secret');
            return rpcError(res, id, 1, 'Unauthorized');
        }
        if (method === 'aria2.addUri') {
            if (!Array.isArray(params)) {
                return rpcError(res, id, -32602, 'Invalid params');
            }
            const rawUris = isTokenPresent ? params[1] : params[0];
            const rawOptions = isTokenPresent ? params[2] : params[1];
            const uris = Array.isArray(rawUris) ? rawUris : [];
            const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
                ? rawOptions
                : {};
            // --- NORMALIZATION AND OVERRIDES ---
            const customHeaders = Array.isArray(options.header)
                ? options.header
                : options.header
                    ? [options.header]
                    : [];
            let originalReferer = null;
            let originalCookie = null;
            let originalUserAgent = null;
            // Clear out any existing user-agent/referer/cookie from the header array to prevent duplicates
            const finalHeaders = customHeaders.filter((h) => {
                const lower = h.toLowerCase();
                if (lower.startsWith('referer:'))
                    originalReferer = h.substring(8).trim();
                if (lower.startsWith('cookie:'))
                    originalCookie = h.substring(7).trim();
                if (lower.startsWith('user-agent:'))
                    originalUserAgent = h.substring(11).trim();
                return (!lower.startsWith('user-agent:') &&
                    !lower.startsWith('referer:') &&
                    !lower.startsWith('cookie:'));
            });
            // Extract from HTTP headers, explicit options payload, or the ones extracted above
            const referer = req.headers['referer'] || options['referer'] || originalReferer;
            if (referer)
                finalHeaders.push('Referer: ' + referer);
            const cookie = req.headers['cookie'] || options['cookie'] || originalCookie;
            if (cookie)
                finalHeaders.push('Cookie: ' + cookie);
            // Override User-Agent ONLY if process.env.USER_AGENT is set, otherwise preserve incoming
            const userAgent = process.env.USER_AGENT ||
                req.headers['user-agent'] ||
                options['user-agent'] ||
                originalUserAgent;
            if (userAgent)
                finalHeaders.push('User-Agent: ' + userAgent);
            // Reassign normalized headers and drop bare options
            options.header = finalHeaders;
            delete options['user-agent'];
            delete options['referer'];
            delete options['cookie'];
            // --- END NORMALIZATION ---
            const stmt = db.prepare('INSERT INTO requests (url, out_filename, headers, options_json) VALUES (?, ?, ?, ?)');
            // Run all inserts in a transaction for atomicity
            const insertMany = db.transaction((uriList) => {
                for (const uri of uriList) {
                    const out_filename = options.out ?? null;
                    const headersStr = JSON.stringify(Array.isArray(options.header) ? options.header : [options.header]);
                    stmt.run(uri, out_filename, headersStr, JSON.stringify(options));
                }
            });
            try {
                insertMany(uris);
                // Generate a reliable 16-char hex GID
                const mockGid = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                res.json({ id, jsonrpc: '2.0', result: mockGid });
            }
            catch (err) {
                logger.error(err);
                return rpcError(res, id, -32603, 'Internal error');
            }
        }
        else if (method === 'aria2.getVersion') {
            // Some tools ping getVersion first
            res.json({ id, jsonrpc: '2.0', result: { enabledFeatures: [], version: '1.36.0' } });
        }
        else {
            // Return mock success for other methods just in case
            res.json({ id, jsonrpc: '2.0', result: 'OK' });
        }
    });
    return router;
}
//# sourceMappingURL=jsonrpc.js.map