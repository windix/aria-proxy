import express, { type Router, type Request, type Response } from 'express'
import path from 'path'
import type { Logger } from 'pino'

import type { DB, RequestRecord, Aria2Options } from './types'

export default function createApiRouter(db: DB, logger: Logger): Router {
  const router = express.Router()

  // API: Get all requests
  router.get('/requests', (req: Request, res: Response) => {
    try {
      const { status } = req.query

      let results: RequestRecord[]

      if (status && typeof status === 'string') {
        results = db
          .prepare<RequestRecord>(
            'SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC',
          )
          .all(status)
      } else {
        results = db.prepare<RequestRecord>('SELECT * FROM requests ORDER BY created_at DESC').all()
      }

      // Parse headers JSON string back to array for the UI
      const parsed = results.map((r) => ({
        ...r,
        headers: JSON.parse(r.headers || '[]') as string[],
      }))

      res.json(parsed)
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // API: Export requests (marks as exported and returns an aria2c input-file string)
  router.post('/requests/export', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' })
    }

    const { ids } = req.body as { ids?: unknown }

    if (!ids || (ids !== 'all_pending' && !Array.isArray(ids))) {
      return res.status(400).json({ error: 'ids must be "all_pending" or an array of ids' })
    }

    const getStmt = db.prepare<RequestRecord>('SELECT * FROM requests WHERE id = ?')
    const updateStmt = db.prepare("UPDATE requests SET status = 'exported' WHERE id = ?")

    let records: RequestRecord[] = []

    if (ids === 'all_pending') {
      records = db
        .prepare<RequestRecord>(
          "SELECT * FROM requests WHERE status = 'pending' ORDER BY created_at ASC",
        )
        .all()
    } else if (Array.isArray(ids)) {
      for (const id of ids as number[]) {
        const rec = getStmt.get(id)
        if (rec) records.push(rec)
      }
    }

    let exportText = ''

    const exportTransaction = db.transaction((recs: RequestRecord[]) => {
      for (const rec of recs) {
        exportText += rec.url + '\n'

        const opts = rec.options_json ? (JSON.parse(rec.options_json) as Aria2Options) : null

        if (!opts) {
          // Fallback for older items missing options_json
          const headers = JSON.parse(rec.headers || '[]') as string[]
          for (const h of headers) {
            exportText += ' header=' + h + '\n'
          }
          if (rec.out_filename) {
            exportText += ' out=' + rec.out_filename + '\n'
          }
        } else {
          // Iterate all provided options
          for (const [key, val] of Object.entries(opts)) {
            if (key === 'header') {
              // Only emit entries that are actually strings; skip malformed non-string values
              const hs = Array.isArray(val)
                ? val.filter((h): h is string => typeof h === 'string')
                : typeof val === 'string'
                  ? [val]
                  : []
              for (const h of hs) {
                exportText += ' header=' + h + '\n'
              }
            } else if (key === 'out') {
              if (typeof val !== 'string') continue
              let outVal = val
              // Prepend relative directory name if present
              const dirVal = opts['dir']
              if (typeof dirVal === 'string') {
                const lastFolder = path.basename(dirVal)
                if (lastFolder) outVal = lastFolder + '/' + outVal
              }
              exportText += ' out=' + outVal + '\n'
            } else if (key === 'dir') {
              // If 'out' is missing, ensure 'dir' isn't lost
              if (!opts['out'] && typeof val === 'string') {
                const lastFolder = path.basename(val)
                if (lastFolder) exportText += ' dir=' + lastFolder + '\n'
              }
            } else {
              exportText += ' ' + key + '=' + String(val) + '\n'
            }
          }
        }

        // Mark as exported
        updateStmt.run(rec.id)
      }
    })

    try {
      exportTransaction(records)
      res.json({ success: true, text: exportText })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // API: Delete a single request by ID
  router.delete('/requests/:id', (req: Request, res: Response) => {
    try {
      const info = db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id)
      if (info.changes > 0) {
        res.json({ success: true })
      } else {
        res.status(404).json({ error: 'Not found' })
      }
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // API: Clear all exported requests
  router.post('/requests/clear', (_req: Request, res: Response) => {
    try {
      const info = db.prepare("DELETE FROM requests WHERE status = 'exported'").run()
      res.json({ success: true, deletedCount: info.changes })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // API: Clear ALL requests (including pending)
  router.post('/requests/clear-all', (_req: Request, res: Response) => {
    try {
      const info = db.prepare('DELETE FROM requests').run()
      res.json({ success: true, deletedCount: info.changes })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // API: Build version info (commit hash + optional tag, injected at Docker build time)
  router.get('/version', (_req: Request, res: Response) => {
    res.json({
      commit: process.env.GIT_COMMIT || null,
      tag: process.env.GIT_TAG || null,
    })
  })

  return router
}
