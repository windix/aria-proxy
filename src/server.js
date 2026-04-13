require('dotenv').config();
const express = require('express');
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

app.use(express.static(path.join(__dirname, '../public')));

// Database setup
const db = require('./db');

// Modular Routers
const jsonRpcRouter = require('./jsonrpc')(db, logger);
const apiRouter = require('./api')(db, logger);

app.use('/jsonrpc', jsonRpcRouter);
app.use('/api', apiRouter);

if (require.main === module) {
  app.listen(port, () => {
    logger.info("Aria2 Proxy listening on port " + port);
  });
}

module.exports = app;
