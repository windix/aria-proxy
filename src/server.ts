import 'dotenv/config'
import express from 'express'
import path from 'path'
import cors from 'cors'
import pino from 'pino'

import db from './db'
import createJsonRpcRouter from './jsonrpc'
import createApiRouter from './api'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'debug',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
})

const app = express()
const port = process.env.PORT ?? 6800

// Middleware
app.use(cors())

// Limit raw parsing + content-type spoofing to EXACTLY the /jsonrpc endpoint
app.use('/jsonrpc', (req, _res, next) => {
  if (req.method === 'POST' && !req.headers['content-type']) {
    req.headers['content-type'] = 'text/plain'
  }
  next()
})

// Capture raw text specifically for the rpc endpoint
app.use('/jsonrpc', express.text({ type: '*/*' }))

// For all UI endpoints (/api/*), parse standard JSON properly!
app.use('/api', express.json())

// Modular Routers
app.use('/jsonrpc', createJsonRpcRouter(db, logger))

// UI and API Basic Authentication
app.use((req, res, next) => {
  const user = process.env.UI_USERNAME || 'hello'
  const pass = process.env.UI_PASSWORD || 'world'

  const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')

  if (login && password && login === user && password === pass) {
    return next()
  }

  res.set('WWW-Authenticate', 'Basic realm="401"')
  res.status(401).send('Authentication required.')
})

app.use(express.static(path.join(__dirname, '../public')))
app.use('/api', createApiRouter(db, logger))

if (require.main === module) {
  app.listen(port, () => {
    logger.info(`Aria2 Proxy listening on port ${port}`)
  })
}

export default app
