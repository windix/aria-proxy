"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const pino_1 = __importDefault(require("pino"));
const db_1 = __importDefault(require("./db"));
const jsonrpc_1 = __importDefault(require("./jsonrpc"));
const api_1 = __importDefault(require("./api"));
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL ?? 'debug',
    transport: {
        target: 'pino-pretty',
        options: { colorize: true },
    },
});
const app = (0, express_1.default)();
const port = process.env.PORT ?? 6800;
// Middleware
app.use((0, cors_1.default)());
// Limit raw parsing + content-type spoofing to EXACTLY the /jsonrpc endpoint
app.use('/jsonrpc', (req, _res, next) => {
    if (req.method === 'POST' && !req.headers['content-type']) {
        req.headers['content-type'] = 'text/plain';
    }
    next();
});
// Capture raw text specifically for the rpc endpoint
app.use('/jsonrpc', express_1.default.text({ type: '*/*' }));
// For all UI endpoints (/api/*), parse standard JSON properly!
app.use('/api', express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Modular Routers
app.use('/jsonrpc', (0, jsonrpc_1.default)(db_1.default, exports.logger));
app.use('/api', (0, api_1.default)(db_1.default, exports.logger));
if (require.main === module) {
    app.listen(port, () => {
        exports.logger.info(`Aria2 Proxy listening on port ${port}`);
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map