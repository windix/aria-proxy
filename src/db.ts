import Database from 'better-sqlite3';
import path from 'path';

const dbPath: string =
  process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '../data/requests.sqlite');

const db: InstanceType<typeof Database> = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    out_filename TEXT,
    headers TEXT,
    options_json TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
