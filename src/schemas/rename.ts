import fs from 'fs'
import yaml from 'yaml'
import { z } from 'zod'
import type { Logger } from 'pino'

export interface RenameRule {
  target: string
  replacement: string
}

const SingleRuleSchema = z.tuple([z.string().min(1), z.string()])

export const RenameRulesSchema = z
  .array(z.any())
  .catch([])
  .transform((rules) =>
    rules
      .map((r) => SingleRuleSchema.safeParse(r))
      .filter((res) => res.success)
      .map(({ data: [target, replacement] }) => ({
        target,
        replacement,
      })),
  )

export function loadRenameRules(rulesPath: string, logger: Logger): RenameRule[] {
  try {
    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, 'utf8')
      const rules = RenameRulesSchema.parse(yaml.parse(content))
      logger.debug('Rename rules loaded into memory cache')
      return rules
    }
  } catch (err) {
    logger.error(err, 'Failed to parse rename rules from disk')
  }
  return []
}

export function applyRenameRules(filename: string, rules: RenameRule[], logger: Logger): string {
  let newOut = filename

  for (const { target, replacement } of rules) {
    newOut = newOut.split(target).join(replacement)
  }

  if (newOut !== filename) {
    if (newOut.trim() !== '') {
      logger.debug({ original: filename, new: newOut }, 'Applied rename rules to filename')
      return newOut
    } else {
      logger.warn({ out: filename }, 'Rename rules resulted in empty filename, ignoring.')
    }
  }

  return filename
}
