import express, { type Router, type Request, type Response } from 'express'
import path from 'path'
import type { Logger } from 'pino'

import type { DB, Aria2Options } from './types'
import {
  RequestBodySchema,
  JsonRpcIdSchema,
  JsonRpcPayloadSchema,
  AddUriArgsSchema,
  HeaderSchema,
  extractAndFilterHeaders,
} from './schemas/payload'
import { loadRenameRules, applyRenameRules } from './schemas/rename'
import type { RenameRule } from './schemas/rename'

export const testHelpers: { reloadRenameRules?: () => void } = {}

export default function createJsonRpcRouter(db: DB, logger: Logger): Router {
  const router = express.Router()

  // --- RENAME RULES CACHE ---
  let cachedRenameRules: RenameRule[] = []
  const rulesPath = path.join(__dirname, '../data/rename-rules.yaml')

  const reloadRules = () => {
    cachedRenameRules = loadRenameRules(rulesPath, logger)
  }

  reloadRules()

  if (process.env.NODE_ENV === 'test') {
    testHelpers.reloadRenameRules = reloadRules
  }
  // --- END RENAME RULES CACHE ---

  // Helper to send a JSON-RPC 2.0 error response
  const rpcError = (
    res: Response,
    id: string | number | null,
    code: number,
    message: string,
  ): void => {
    res.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
  }

  // aria2 JSON-RPC Endpoint
  router.post('/', (req: Request, res: Response) => {
    // Redact token and cookie values before logging
    const redactedBody =
      typeof req.body === 'string'
        ? req.body.replace(/token:[^"',\s\]]+/g, 'token:[REDACTED]')
        : req.body
    const rawHeaders = req.headers
    const redactedHeaders = { ...rawHeaders }
    if (redactedHeaders['cookie']) redactedHeaders['cookie'] = '[REDACTED]'
    logger.debug(
      { headers: redactedHeaders, rawBody: redactedBody },
      'Received raw JSON-RPC request',
    )

    const bodyParse = RequestBodySchema.safeParse(req.body)
    if (!bodyParse.success) {
      logger.warn('req.body is empty or not text. Request may be completely empty.')
      return rpcError(res, null, -32700, 'Parse error: empty request')
    }

    let rawJson: unknown
    try {
      rawJson = JSON.parse(bodyParse.data)
    } catch {
      logger.error('Failed to parse request body as JSON. Raw body: ' + redactedBody)
      return rpcError(res, null, -32700, 'Parse error: Invalid JSON')
    }

    const parseResult = JsonRpcPayloadSchema.safeParse(rawJson)
    if (!parseResult.success) {
      const idResult = JsonRpcIdSchema.safeParse(rawJson)
      const errId = idResult.success ? idResult.data.id : null
      return rpcError(res, errId, -32600, 'Invalid Request')
    }

    const { id, method, params } = parseResult.data

    // --- RPC SECRET CHECK ---
    if (process.env.ARIA2_RPC_SECRET && params.providedSecret !== process.env.ARIA2_RPC_SECRET) {
      logger.warn('Unauthorized request rejected: Invalid RPC Secret')
      return rpcError(res, id, 1, 'Unauthorized')
    }

    if (method === 'aria2.addUri') {
      if (!params.isArray) {
        return rpcError(res, id, -32602, 'Invalid params')
      }

      const argsParse = AddUriArgsSchema.safeParse(params.args)
      if (!argsParse.success) {
        return rpcError(res, id, -32602, 'Invalid params')
      }

      const [uris, rawOptions] = argsParse.data
      const options = rawOptions as Aria2Options

      // --- NORMALIZATION AND OVERRIDES ---
      // Guard against non-string values in header (untrusted JSON input may contain numbers/objects)
      const customHeaders = HeaderSchema.parse(options.header)

      const { extracted, remaining: finalHeaders } = extractAndFilterHeaders(customHeaders, [
        'referer',
        'cookie',
        'user-agent',
      ])

      // Extract from HTTP headers, explicit options payload, or the ones extracted above
      const referer =
        (req.headers['referer'] as string | undefined) || options['referer'] || extracted['referer']
      if (referer) finalHeaders.push('Referer: ' + referer)

      const cookie =
        (req.headers['cookie'] as string | undefined) || options['cookie'] || extracted['cookie']
      if (cookie) finalHeaders.push('Cookie: ' + cookie)

      // Override User-Agent ONLY if process.env.USER_AGENT is set, otherwise preserve incoming
      const userAgent =
        process.env.USER_AGENT ||
        (req.headers['user-agent'] as string | undefined) ||
        options['user-agent'] ||
        extracted['user-agent']
      if (userAgent) finalHeaders.push('User-Agent: ' + userAgent)

      // Reassign normalized headers and drop bare options
      options.header = finalHeaders
      delete options['user-agent']
      delete options['referer']
      delete options['cookie']
      // --- END NORMALIZATION ---

      // --- AUTOMATED RENAME ---
      if (options.out) {
        options.out = applyRenameRules(options.out, cachedRenameRules, logger)
      }
      // --- END AUTOMATED RENAME ---

      const stmt = db.prepare(
        'INSERT INTO requests (url, out_filename, headers, options_json) VALUES (?, ?, ?, ?)',
      )

      // Run all inserts in a transaction for atomicity
      const insertMany = db.transaction((uriList: string[]) => {
        for (const uri of uriList) {
          const out_filename = options.out ?? null
          const headersStr = JSON.stringify(
            Array.isArray(options.header) ? options.header : [options.header],
          )
          stmt.run(uri, out_filename, headersStr, JSON.stringify(options))
        }
      })

      try {
        insertMany(uris)
        // Generate a reliable 16-char hex GID
        const mockGid = Array.from({ length: 16 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join('')
        res.json({ id, jsonrpc: '2.0', result: mockGid })
      } catch (err) {
        logger.error(err)
        return rpcError(res, id, -32603, 'Internal error')
      }
    } else if (method === 'aria2.getVersion') {
      // Some tools ping getVersion first
      res.json({ id, jsonrpc: '2.0', result: { enabledFeatures: [], version: '1.36.0' } })
    } else {
      // Return mock success for other methods just in case
      res.json({ id, jsonrpc: '2.0', result: 'OK' })
    }
  })

  return router
}
