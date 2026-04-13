import request from 'supertest'
import app from '../src/server'
import db from '../src/db'

describe('Dashboard Database API', () => {
  beforeEach(() => {
    // Clear out the db between tests
    db.prepare('DELETE FROM requests').run()
  })

  afterAll(() => {
    db.close()
  })

  it('fetches all requests', async () => {
    db.prepare('INSERT INTO requests (url, status) VALUES (?, ?)').run(
      'http://foo.com/bar',
      'pending',
    )

    const res = await request(app).get('/api/requests')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].url).toBe('http://foo.com/bar')
    expect(res.body[0].status).toBe('pending')
  })

  it('exports pending requests exclusively and updates string layout natively', async () => {
    db.prepare('INSERT INTO requests (url, out_filename, options_json) VALUES (?, ?, ?)').run(
      'http://example.com/test.bin',
      'test.bin',
      JSON.stringify({ out: 'test.bin', header: 'Custom: test' }),
    )

    const res = await request(app).post('/api/requests/export').send({ ids: 'all_pending' })

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

    const res = await request(app).post('/api/requests/export').send({ ids: 'all_pending' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.text).toContain('http://example.com/movie.mkv')
    expect(res.body.text).toContain('dir=movies')
    // Should not try to format 'out=' at all
    expect(res.body.text).not.toContain('out=')
  })

  it('clears all requests from the db entirely', async () => {
    db.prepare('INSERT INTO requests (url) VALUES (?)').run('http://delete.me')

    let current = db.prepare('SELECT count(*) as count FROM requests').get() as {
      count: number
    }
    expect(current.count).toBe(1)

    const res = await request(app).post('/api/requests/clear-all')
    expect(res.status).toBe(200)

    current = db.prepare('SELECT count(*) as count FROM requests').get() as { count: number }
    expect(current.count).toBe(0)
  })
})
