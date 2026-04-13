import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // Files/paths to ignore entirely
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },

  // ESLint core recommended rules
  eslint.configs.recommended,

  // TypeScript-ESLint recommended rules (sets parser + plugin automatically)
  tseslint.configs.recommended,

  // Disable any ESLint rules that would conflict with Prettier formatting
  prettierConfig,

  // Project-specific rule overrides
  {
    rules: {
      // Warn on `any` instead of erroring — useful during gradual migration
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow console usage (pino handles logging, but supertest/tests may use it)
      'no-console': 'off',
      // Unused vars: allow underscore-prefixed params (e.g. _res, _next)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
