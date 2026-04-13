/** Minimal DB interface covering the synchronous SQLite API used in this project.
 *  Compatible with both better-sqlite3 (Node.js) and bun:sqlite (Bun). */
export interface Statement<Result = unknown> {
  all(...params: unknown[]): Result[]
  get(...params: unknown[]): Result | undefined
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
}

export interface DB {
  prepare<Result = unknown>(sql: string): Statement<Result>
  exec(sql: string): void
  transaction<T extends unknown[]>(fn: (...args: T) => void): (...args: T) => void
  close(): void
}

/** Shape of a row in the `requests` table */
export interface RequestRecord {
  id: number
  url: string
  out_filename: string | null
  /** JSON-encoded array of header strings, e.g. '["Referer: ..."]' */
  headers: string
  /** JSON-encoded Aria2Options object */
  options_json: string | null
  status: 'pending' | 'exported'
  created_at: string
}

/** Aria2 download options as sent in the JSON-RPC params payload */
export interface Aria2Options {
  header?: string | string[]
  out?: string
  dir?: string
  referer?: string
  cookie?: string
  'user-agent'?: string
  [key: string]: unknown
}

/** Parsed JSON-RPC 2.0 request body */
export interface JsonRpcPayload {
  jsonrpc: string
  id: string | number | null
  method: string
  params?: unknown[]
}
