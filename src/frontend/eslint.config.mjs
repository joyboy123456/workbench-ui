import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'public/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    rules: { 'no-debugger': 'error' },
  },
]
