import {
  ParamsParser,
  HeaderSchema,
  extractAndFilterHeaders,
  AddUriArgsSchema,
  JsonRpcPayloadSchema,
} from '../../src/schemas/payload'

describe('Payload Schemas', () => {
  describe('ParamsParser', () => {
    it('extracts token and shifts remaining args', () => {
      const input = ['token:secret', 'arg1', 'arg2']
      const result = ParamsParser.parse(input)
      expect(result.providedSecret).toBe('secret')
      expect(result.args).toEqual(['arg1', 'arg2'])
    })

    it('handles missing token', () => {
      const input = ['arg1', 'arg2']
      const result = ParamsParser.parse(input)
      expect(result.providedSecret).toBeNull()
      expect(result.args).toEqual(['arg1', 'arg2'])
    })

    it('handles non-array params', () => {
      const input = { not: 'an-array' }
      const result = ParamsParser.parse(input)
      expect(result.isArray).toBe(false)
      expect(result.args).toEqual([])
    })
  })

  describe('HeaderSchema', () => {
    it('converts single string to array', () => {
      const input = 'User-Agent: test'
      const result = HeaderSchema.parse(input)
      expect(result).toEqual(['User-Agent: test'])
    })

    it('filters out non-header strings', () => {
      const input = ['User-Agent: test', 'invalid-header', 123]
      const result = HeaderSchema.parse(input)
      expect(result).toEqual(['User-Agent: test'])
    })

    it('allows spaces after colon', () => {
      const input = ['Key: Value']
      const result = HeaderSchema.parse(input)
      expect(result).toEqual(['Key: Value'])
    })
  })

  describe('extractAndFilterHeaders', () => {
    it('extracts and filters targeted headers while preserving others', () => {
      const headers = [
        'User-Agent: my-agent',
        'Referer: http://ref.com',
        'X-Custom: value',
        'Cookie: c1=v1',
      ]
      const { extracted, remaining } = extractAndFilterHeaders(headers, [
        'user-agent',
        'referer',
        'cookie',
      ])

      expect(extracted['user-agent']).toBe('my-agent')
      expect(extracted['referer']).toBe('http://ref.com')
      expect(extracted['cookie']).toBe('c1=v1')
      expect(remaining).toEqual(['X-Custom: value'])
    })

    it('preserves casing for non-targeted headers', () => {
      const headers = ['X-MY-HEADER: value']
      const { remaining } = extractAndFilterHeaders(headers, ['user-agent'])
      expect(remaining).toEqual(['X-MY-HEADER: value'])
    })
  })

  describe('AddUriArgsSchema', () => {
    it('validates a correct addUri tuple', () => {
      const input = [['http://uri1'], { out: 'file' }]
      const result = AddUriArgsSchema.parse(input)
      expect(result[0]).toEqual(['http://uri1'])
      expect(result[1]).toEqual({ out: 'file' })
    })

    it('accepts extra trailing arguments', () => {
      const input = [['http://uri1'], {}, 10] // 10 is the optinal position
      const result = AddUriArgsSchema.parse(input)
      expect(result).toHaveLength(3)
    })

    it('fails on invalid second argument', () => {
      const input = [['http://uri1'], 'not-an-object']
      const result = AddUriArgsSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('JsonRpcPayloadSchema', () => {
    it('validates standard JSON-RPC 2.0 structure', () => {
      const payload = {
        jsonrpc: '2.0',
        method: 'test',
        params: ['arg1'],
        id: 1,
      }
      const result = JsonRpcPayloadSchema.parse(payload)
      expect(result.method).toBe('test')
      expect(result.params.args).toEqual(['arg1'])
    })
  })
})
