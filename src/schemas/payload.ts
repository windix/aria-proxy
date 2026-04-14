import { z } from 'zod'

// --- ZOD SCHEMAS ---
export const RequestBodySchema = z.string().trim().min(1)

export const ParamsParser = z.unknown().transform((params) => {
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

export const AddUriArgsSchema = z
  .tuple([
    z.array(z.string()).optional().default([]),
    z.record(z.string(), z.unknown()).optional().default({}),
  ])
  .rest(z.unknown())

export const HeaderSchema = z
  .union([
    z.string().transform((s) => [s]),
    z.array(z.unknown()).transform((arr) => arr.filter((h) => typeof h === 'string') as string[]),
  ])
  .transform((arr) => arr.filter((h) => /^[^:\s]+:\s*.*$/.test(h)))
  .catch([])
// --- END ZOD SCHEMAS ---

// --- HELPER FUNCTIONS ---
export function extractAndFilterHeaders(headers: string[], targets: string[]) {
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
