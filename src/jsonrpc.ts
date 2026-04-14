import express, { type Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import type { Logger } from 'pino'
import { z } from 'zod'

import type { DB, Aria2Options } from './types'

// --- ZOD SCHEMAS ---
export const RequestBodySchema = z.string().trim().min(1)

const ParamsParser = z.unknown().transform((params) => {
  const isArr = Array.isArray(params)
  const args = isArr ? params : []
  const hasToken = args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('token:')
  return {
    raw: params,
    isArray: isArr,
    providedSecret: hasToken ? (args[0] as string).substring(6) : null,
    args: hasToken ? args.slice(1) : args,
  }
})

export const JsonRpcIdSchema = z.object({
  id: z.union([z.string(), z.number(), z.null()]).optional().default(null),
})

export const JsonRpcPayloadSchema = JsonRpcIdSchema.extend({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: ParamsParser,
})

export type JsonRpcPayload = z.infer<typeof JsonRpcPayloadSchema>

const AddUriArgsSchema = z
  .tuple([
    z.array(z.string()).optional().default([]),
    z.record(z.string(), z.unknown()).optional().default({}),
  ])
  .rest(z.unknown())

const HeaderSchema = z
  .union([
    z.string().transform((s) => [s]),
    z.array(z.unknown()).transform((arr) => arr.filter((h) => typeof h === 'string') as string[]),
  ])
  .transform((arr) => arr.filter((h) => /^[^:\s]+:\s*.*$/.test(h)))
  .catch([])

const RenameRuleTuple = z.tuple([z.coerce.string().min(1), z.coerce.string()]).rest(z.unknown())
export const RenameRulesSchema = z
  .array(z.any())
  .catch([])
  .transform((rules) =>
    rules
      .map((r) => RenameRuleTuple.safeParse(r))
      .filter((res) => res.success)
      .map((res) => ({ target: res.data[0], replacement: res.data[1] })),
  )
// --- END ZOD SCHEMAS ---

// --- HELPER FUNCTIONS ---
function extractAndFilterHeaders(headers: string[], targets: string[]) {
  const extracted: Record<string, string> = {}
  const remaining: string[] = []

  for (const h of headers) {
    const colonIdx = h.indexOf(':')
    const lowerKey = h.substring(0, colonIdx).trim().toLowerCase()

    if (targets.includes(lowerKey)) {
      extracted[lowerKey] = h.substring(colonIdx + 1).trim()
    } else {
      remaining.push(h)
    }
  }

  return { extracted, remaining }
}
// --- END HELPER FUNCTIONS ---

export default function createJsonRpcRouter(db: DB, logger: Logger): Router {
  const router = express.Router()

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
        try {
          const rulesPath = path.join(__dirname, '../data/rename-rules.yaml')
          if (fs.existsSync(rulesPath)) {
            const content = fs.readFileSync(rulesPath, 'utf8')
            const parsedYaml = yaml.parse(content)
            const rules = RenameRulesSchema.parse(parsedYaml)

            let newOut = options.out

            for (const { target, replacement } of rules) {
              newOut = newOut.split(target).join(replacement)
            }

            if (newOut !== options.out) {
              if (newOut.trim() !== '') {
                options.out = newOut
                logger.debug(
                  { original: options.out, new: newOut },
                  'Applied rename rules to filename',
                )
              } else {
                logger.warn(
                  { out: options.out },
                  'Rename rules resulted in empty filename, ignoring.',
                )
              }
            }
          }
        } catch (err) {
          logger.error(err, 'Failed to process rename rules')
        }
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
