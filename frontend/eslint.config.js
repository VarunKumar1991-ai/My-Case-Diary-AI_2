import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn-style UI primitives (`badge.tsx`, `button.tsx`, ...) and React
    // contexts intentionally export a non-component value alongside the
    // component — `cva` variant functions for fast-refresh-safe styling reuse,
    // and `useAuth`/`useTheme` hooks colocated with their providers (the
    // standard pattern this codebase follows throughout `context/`). Both are
    // deliberate, stable conventions that `react-refresh/only-export-components`
    // is known to false-positive on; Vite's fast refresh still works correctly
    // for these files in practice.
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/context/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
