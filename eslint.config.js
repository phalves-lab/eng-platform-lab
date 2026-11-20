import js from '@eslint/js'
import sonarjs from 'eslint-plugin-sonarjs'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const SONAR_BUG_RULES = [
  'no-all-duplicated-branches',
  'no-element-overwrite',
  'no-identical-conditions',
  'no-identical-expressions',
  'no-ignored-return',
  'no-use-of-empty-return-value',
  'no-collection-size-mischeck',
  'no-gratuitous-expressions',
  'no-unused-collection',
  'no-empty-collection',
  'non-existent-operator',
]

const isEnabled = (setting) => (Array.isArray(setting) ? setting[0] : setting) !== 'off'

const sonarAsWarnings = Object.fromEntries(
  Object.entries(sonarjs.configs.recommended.rules)
    .filter(([, setting]) => isEnabled(setting))
    .map(([rule]) => [rule, 'warn']),
)

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    plugins: { sonarjs },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always'],
      ...sonarAsWarnings,
      ...Object.fromEntries(SONAR_BUG_RULES.map((rule) => [`sonarjs/${rule}`, 'error'])),
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },
  {
    files: ['**/test/**', '**/*.test.ts'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-nested-functions': 'off',
    },
  },
  {
    files: ['scripts/**', 'tools/*/src/cli.ts'],
    rules: { 'no-console': 'off' },
  },
)
