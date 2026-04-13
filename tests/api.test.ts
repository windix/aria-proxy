import request from 'supertest'
import app from '../src/server'
import db from '../src/db'
import fs from 'fs'
import path from 'path'

describe('Dashboard Database API', () => {
  beforeEach(() => {
    // Clear out the db between tests
    db.prepare('DELETE FROM requests').run()
  })

  afterAll(() => {
    db.close()
  })

  it('fetches all requests except deleted ones but preserves accurate totalCount', async () => {
    db.prepare('INSERT INTO requests (url, status) VALUES (?, ?)').run(
      'http://foo.com/bar',
      'pending',
    )
    db.prepare('INSERT INTO requests (url, status) VALUES (?, ?)').run(
      'http://delete.me',
      'deleted',
    )

    const res = await request(app).get('/api/requests').auth('hello', 'world')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].url).toBe('http://foo.com/bar')
    expect(res.body.items[0].status).toBe('pending')
    expect(res.body.totalCount).toBe(2)
  })

  it('exports pending requests exclusively and updates string layout natively', async () => {
    db.prepare('INSERT INTO requests (url, out_filename, options_json) VALUES (?, ?, ?)').run(
      'http://example.com/test.bin',
      'test.bin',
      JSON.stringify({ out: 'test.bin', header: 'Custom: test' }),
    )

    const res = await request(app)
      .post('/api/requests/export')
      .send({ ids: 'all_pending' })
      .auth('hello', 'world')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.text).toContain('http://example.com/test.bin')
    expect(res.body.text).toContain('out=test.bin')
    expect(res.body.text).toContain('header=Custom: test')

    const records = db.prepare('SELECT * FROM requests').all()
    expect((records[0] as { status: string }).status).toBe('exported')
  })

  it('preserves the dir option when out is absent during export', async () => {
    db.prepare('INSERT INTO requests (url, out_filename, options_json) VALUES (?, ?, ?)').run(
      'http://example.com/movie.mkv',
      null,
      JSON.stringify({ dir: '/absolute/downloads/movies' }),
    )

    const res = await request(app)
      .post('/api/requests/export')
      .send({ ids: 'all_pending' })
      .auth('hello', 'world')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.text).toContain('http://example.com/movie.mkv')
    expect(res.body.text).toContain('dir=movies')
    // Should not try to format 'out=' at all
    expect(res.body.text).not.toContain('out=')
  })

  it('soft-deletes exported requests by setting status to deleted entirely', async () => {
    db.prepare("INSERT INTO requests (url, status) VALUES (?, 'exported')").run('http://delete.me')

    const current = db.prepare('SELECT count(*) as count FROM requests').get() as { count: number }
    expect(current.count).toBe(1)

    // Test default behavior (type=exported)
    const res = await request(app).delete('/api/requests').auth('hello', 'world')
    expect(res.status).toBe(200)

    const record = db
      .prepare("SELECT status FROM requests WHERE url = 'http://delete.me'")
      .get() as { status: string }
    expect(record.status).toBe('deleted')
  })

  it('soft-deletes all requests from the db entirely', async () => {
    db.prepare('INSERT INTO requests (url) VALUES (?)').run('http://delete.me')

    const current = db.prepare('SELECT count(*) as count FROM requests').get() as {
      count: number
    }
    expect(current.count).toBe(1)

    const res = await request(app).delete('/api/requests?type=all').auth('hello', 'world')
    expect(res.status).toBe(200)

    const record = db
      .prepare("SELECT status FROM requests WHERE url = 'http://delete.me'")
      .get() as { status: string }
    expect(record.status).toBe('deleted')
  })

  describe('GET /settings', () => {
    it('returns configuration states and masks secret', async () => {
      process.env.ARIA2_RPC_SECRET = 'supersecret123'
      process.env.USER_AGENT = 'Custom/1.0'

      const rulesPath = path.join(__dirname, '../data/rename-rules.yaml')
      const rulesContent = '# test\n- ["A", "B"]'

      fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
      fs.writeFileSync(rulesPath, rulesContent)

      try {
        const res = await request(app).get('/api/settings').auth('hello', 'world')
        expect(res.status).toBe(200)
        expect(res.body.rpcSecretSet).toBe(true)
        expect(res.body.rpcSecret).toBe('supersecret123')
        expect(res.body.userAgentOverride).toBe('Custom/1.0')
        expect(res.body.renameRulesYaml).toBe(rulesContent)
      } finally {
        delete process.env.ARIA2_RPC_SECRET
        delete process.env.USER_AGENT
        if (fs.existsSync(rulesPath)) {
          fs.unlinkSync(rulesPath)
        }
      }
    })

    it('returns nulls when things are not set', async () => {
      const oldSecret = process.env.ARIA2_RPC_SECRET
      const oldAgent = process.env.USER_AGENT
      delete process.env.ARIA2_RPC_SECRET
      delete process.env.USER_AGENT

      const rulesPath = path.join(__dirname, '../data/rename-rules.yaml')
      if (fs.existsSync(rulesPath)) fs.unlinkSync(rulesPath)

      try {
        const res = await request(app).get('/api/settings').auth('hello', 'world')
        expect(res.status).toBe(200)
        expect(res.body.rpcSecretSet).toBe(false)
        expect(res.body.rpcSecret).toBeNull()
        expect(res.body.userAgentOverride).toBeNull()
        expect(res.body.renameRulesYaml).toBeNull()
      } finally {
        if (oldSecret !== undefined) process.env.ARIA2_RPC_SECRET = oldSecret
        if (oldAgent !== undefined) process.env.USER_AGENT = oldAgent
      }
    })
  })
})
