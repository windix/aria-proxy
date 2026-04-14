import { z } from 'zod'

const RenameRuleTuple = z.array(z.any()).min(2)
export const RenameRulesSchema = z
  .array(z.any())
  .catch([])
  .transform((rules) =>
    rules
      .map((r) => RenameRuleTuple.safeParse(r))
      .filter((res) => res.success)
      .map((res) => ({ target: String(res.data[0]), replacement: String(res.data[1]) })),
  )
