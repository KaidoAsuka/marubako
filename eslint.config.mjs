import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'release/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '_scaffold/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // The stage of the README demos is a plain page: its scripts run in a browser window.
    files: ['tools/demo/stage/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],
    },
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'electron.vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  },
  prettier,
]
