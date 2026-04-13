// Ambient type declarations for Bun built-in modules.
// These are only loaded at runtime when running under Bun; tsc uses these
// stubs so it can type-check db.ts without needing bun:sqlite installed.

declare module 'bun:sqlite' {
  export interface SQLiteQuery {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown | undefined
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  }

  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean })
    prepare(sql: string): SQLiteQuery
    exec(sql: string): void
    transaction<T extends unknown[]>(fn: (...args: T) => void): (...args: T) => void
    close(): void
  }
}
