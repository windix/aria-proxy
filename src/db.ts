import fs from 'fs'
import path from 'path'
import type { DB } from './types'

const dbPath: string =
  process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '../data/requests.sqlite')

if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

const CREATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    out_filename TEXT,
    headers TEXT,
    options_json TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`

// ---------------------------------------------------------------------------
// Runtime-aware database adapter
//
// Bun ships bun:sqlite as a native built-in; better-sqlite3 requires a native
// Node.js addon that Bun cannot load (github.com/oven-sh/bun/issues/4290).
// We detect the runtime and load the appropriate driver, exposing the same
// synchronous API surface that the rest of the codebase depends on.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any

if (process.versions.bun) {
  // Bun runtime — use the built-in bun:sqlite driver
  // Dynamic require so tsc never tries to resolve the bun:sqlite specifier
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Database } = require('bun:sqlite') as typeof import('bun:sqlite')
  const bunDb = new Database(dbPath)

  bunDb.exec(CREATE_SCHEMA)

  // Wrap bun:sqlite to match the better-sqlite3 interface used in the codebase:
  //   db.prepare(sql).all(...params)
  //   db.prepare(sql).get(...params)
  //   db.prepare(sql).run(...params)
  //   db.transaction(fn)(args)
  //   db.close()
  db = {
    prepare(sql: string) {
      const stmt = bunDb.prepare(sql)
      return {
        all(...params: unknown[]) {
          return stmt.all(...params)
        },
        get(...params: unknown[]) {
          return stmt.get(...params)
        },
        run(...params: unknown[]) {
          const info = stmt.run(...params)
          // better-sqlite3 returns { changes, lastInsertRowid }
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
        },
      }
    },
    exec(sql: string) {
      bunDb.exec(sql)
    },
    transaction<T extends unknown[]>(fn: (...args: T) => void) {
      return bunDb.transaction(fn)
    },
    close() {
      bunDb.close()
    },
  }
} else {
  // Node.js runtime — use better-sqlite3
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3')
  const nodeDb: InstanceType<typeof BetterSqlite3> = new BetterSqlite3(dbPath)
  nodeDb.exec(CREATE_SCHEMA)
  db = nodeDb
}

export default db as DB
