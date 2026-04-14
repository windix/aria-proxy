import request from 'supertest'
import app from '../src/server'
import db from '../src/db'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import { testHelpers } from '../src/jsonrpc'

describe('JSON-RPC API', () => {
  beforeEach(() => {
    // Clear out the database before each test
    db.prepare('DELETE FROM requests').run()
  })

  afterAll(() => {
    db.close()
  })

  it('rejects invalid JSON-RPC payload', async () => {
    const res = await request(app)
      .post('/jsonrpc')
      .set('Content-Type', 'text/plain')
      .send('not a valid json')

    expect(res.status).toBe(200)
    expect(res.body.error.message).toContain('Parse error')
  })

  it('successfully catches aria2.addUri and saves to db', async () => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: 'test1',
      method: 'aria2.addUri',
      params: [
        ['http://example.com/file.zip'],
        {
          out: 'file.zip',
          header: ['User-Agent: my-agent', 'Referer: http://ref.com'],
        },
      ],
    })

    const res = await request(app).post('/jsonrpc').set('Content-Type', 'text/plain').send(payload)

    expect(res.status).toBe(200)
    expect(res.body.result).toHaveLength(16) // mock GID length

    const records = db.prepare('SELECT * FROM requests').all()
    expect(records).toHaveLength(1)

    const record = records[0] as { url: string; out_filename: string; headers: string }
    expect(record.url).toBe('http://example.com/file.zip')
    expect(record.out_filename).toBe('file.zip')

    // Original headers should not be lost unless explicitly overridden
    const dbHeaders = JSON.parse(record.headers) as string[]
    expect(dbHeaders.some((h) => h.includes('Referer: http://ref.com'))).toBe(true)
  })

  it('enforces ARIA2_RPC_SECRET correctly if it is set in environment', async () => {
    process.env.ARIA2_RPC_SECRET = 'secret123'

    // 1: payload totally missing token
    const payloadFail = JSON.stringify({
      jsonrpc: '2.0',
      id: 't1',
      method: 'aria2.getVersion',
      params: [],
    })

    const failRes = await request(app).post('/jsonrpc').send(payloadFail)
    expect(failRes.body.error.code).toBe(1)
    expect(failRes.body.error.message).toBe('Unauthorized')

    // 2: payload with wrong token string
    const payloadFail2 = JSON.stringify({
      jsonrpc: '2.0',
      id: 't2',
      method: 'aria2.getVersion',
      params: ['token:wrong'],
    })
    const failRes2 = await request(app).post('/jsonrpc').send(payloadFail2)
    expect(failRes2.body.error.code).toBe(1)

    // 3: payload with precise matching token
    const payloadPass = JSON.stringify({
      jsonrpc: '2.0',
      id: 't3',
      method: 'aria2.getVersion',
      params: ['token:secret123'],
    })
    const passRes = await request(app).post('/jsonrpc').send(payloadPass)
    expect(passRes.body.result.version).toBeDefined()

    delete process.env.ARIA2_RPC_SECRET
  })

  it('applies rename rules from data/rename-rules.yaml if present', async () => {
    const rulesPath = path.join(__dirname, '../data/rename-rules.yaml')
    const originalOut = 'TEST-REMOVE-file.zip'

    // Write temporary rules
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
    fs.writeFileSync(
      rulesPath,
      yaml.stringify([
        ['TEST-REMOVE-', ''],
        ['.zip', '.rar'],
      ]),
    )

    // Force cache refresh for the mock file
    if (testHelpers.reloadRenameRules) testHelpers.reloadRenameRules()

    try {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: 'renametest',
        method: 'aria2.addUri',
        params: [['http://example.com/file.zip'], { out: originalOut }],
      })

      const res = await request(app)
        .post('/jsonrpc')
        .set('Content-Type', 'application/json')
        .send(payload)
      expect(res.status).toBe(200)

      const records = db.prepare('SELECT * FROM requests ORDER BY id DESC LIMIT 1').all()
      expect(records).toHaveLength(1)

      const record = records[0] as { url: string; out_filename: string }
      // Should have applied both rules
      expect(record.out_filename).toBe('file.rar')
    } finally {
      // Clean up
      if (fs.existsSync(rulesPath)) {
        fs.unlinkSync(rulesPath)
      }
    }
  })

  it('does not apply rename rules if it results in an empty filename', async () => {
    const rulesPath = path.join(__dirname, '../data/rename-rules.yaml')

    // Write temporary rules
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
    fs.writeFileSync(rulesPath, yaml.stringify([['ONLY-THIS', '']]))

    // Force cache refresh for the mock file
    if (testHelpers.reloadRenameRules) testHelpers.reloadRenameRules()

    try {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: 'renametest2',
        method: 'aria2.addUri',
        params: [
          ['http://example.com/file.zip'],
          { out: 'ONLY-THIS' }, // This would reduce to ''
        ],
      })

      const res = await request(app)
        .post('/jsonrpc')
        .set('Content-Type', 'application/json')
        .send(payload)
      expect(res.status).toBe(200)

      const records = db.prepare('SELECT * FROM requests ORDER BY id DESC LIMIT 1').all()
      expect(records).toHaveLength(1)

      const record = records[0] as { url: string; out_filename: string }
      // Should revert to original
      expect(record.out_filename).toBe('ONLY-THIS')
    } finally {
      // Clean up
      if (fs.existsSync(rulesPath)) {
        fs.unlinkSync(rulesPath)
      }
    }
  })
})
