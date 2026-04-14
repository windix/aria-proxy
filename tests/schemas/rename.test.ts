import { RenameRulesSchema } from '../../src/schemas/rename'

describe('Rename Schema', () => {
  it('parses valid rename rules strictly', () => {
    const input = [
      ['target1', 'replacement1'],
      ['target2', 'replacement2'],
    ]
    const result = RenameRulesSchema.parse(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ target: 'target1', replacement: 'replacement1' })
  })

  it('filters out malformed rules gracefully', () => {
    const input = [
      ['valid', 'rule'],
      ['missing-replacement'],
      { not: 'an-array' },
      [123, 456], // Should be coerced to strings
    ]
    const result = RenameRulesSchema.parse(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ target: 'valid', replacement: 'rule' })
    expect(result[1]).toEqual({ target: '123', replacement: '456' })
  })

  it('handles empty input', () => {
    expect(RenameRulesSchema.parse([])).toEqual([])
    expect(RenameRulesSchema.parse(null)).toEqual([])
  })
})
