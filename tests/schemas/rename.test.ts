import {
  RenameRulesSchema,
  loadRenameRules,
  applyRenameRules,
  type RenameRule,
} from '../../src/schemas/rename'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import type { Logger } from 'pino'

const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
} as unknown as Logger

describe('Rename Schema', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('RenameRulesSchema', () => {
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
        ['', 'empty-target'], // Should fail min(1)
        { not: 'an-array' },
        [123, 456], // Should fail (not strings)
      ]
      const result = RenameRulesSchema.parse(input)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ target: 'valid', replacement: 'rule' })
    })

    it('handles empty input', () => {
      expect(RenameRulesSchema.parse([])).toEqual([])
      expect(RenameRulesSchema.parse(null)).toEqual([])
    })
  })

  describe('loadRenameRules', () => {
    const tempRulesPath = path.join(__dirname, 'temp-rules.yaml')

    afterEach(() => {
      if (fs.existsSync(tempRulesPath)) {
        fs.unlinkSync(tempRulesPath)
      }
    })

    it('loads rules from disk successfully', () => {
      const rules = [['target', 'replacement']]
      fs.writeFileSync(tempRulesPath, yaml.stringify(rules))

      const result = loadRenameRules(tempRulesPath, mockLogger)
      expect(result).toEqual([{ target: 'target', replacement: 'replacement' }])
      expect(mockLogger.debug).toHaveBeenCalledWith('Rename rules loaded into memory cache')
    })

    it('returns empty array if file does not exist', () => {
      const result = loadRenameRules('non-existent.yaml', mockLogger)
      expect(result).toEqual([])
      expect(mockLogger.debug).not.toHaveBeenCalled()
    })

    it('logs error if YAML parsing fails', () => {
      fs.writeFileSync(tempRulesPath, 'invalid: [ yaml')
      const result = loadRenameRules(tempRulesPath, mockLogger)
      expect(result).toEqual([])
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('applyRenameRules', () => {
    it('applies rules correctly', () => {
      const rules: RenameRule[] = [
        { target: 'old', replacement: 'new' },
        { target: '.zip', replacement: '.rar' },
      ]
      const result = applyRenameRules('old-file.zip', rules, mockLogger)
      expect(result).toBe('new-file.rar')
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('returns original filename if no rules match', () => {
      const rules: RenameRule[] = [{ target: 'nomatch', replacement: 'replacement' }]
      const result = applyRenameRules('file.zip', rules, mockLogger)
      expect(result).toBe('file.zip')
      expect(mockLogger.debug).not.toHaveBeenCalled()
    })

    it('ignores rules that result in empty filename', () => {
      const rules: RenameRule[] = [{ target: 'ONLY-THIS', replacement: '' }]
      const result = applyRenameRules('ONLY-THIS', rules, mockLogger)
      expect(result).toBe('ONLY-THIS')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { out: 'ONLY-THIS' },
        'Rename rules resulted in empty filename, ignoring.',
      )
    })
  })
})
