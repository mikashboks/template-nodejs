import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import importPlugin from 'eslint-plugin-import';
import securityPlugin from 'eslint-plugin-security';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import zodPlugin from 'eslint-plugin-zod';
import globals from 'globals';

export default [
  {
    files: ['**/*.ts'],
    // Move all ignores to the top level to ensure they're applied correctly
    ignores: [
      'node_modules/**',
      'dist/**', // This should ignore all files in dist
      'build/**',
      'coverage/**',
      'docs/**',
      '.husky/**',
      '.turbo/**',
      '*.log',
      '*.tgz',
      '.env',
      '.env.*',
      '!*.env.example',
      'prisma/generated/**',
      '**/*.d.ts', // Use ** to match .d.ts files in any directory
      'vitest.config.ts',
      'commitlint.config.*',
      'prettier.config.*',
      'test/**',
      'scripts/**',
    ],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      import: importPlugin,
      security: securityPlugin,
      jsdoc: jsdocPlugin,
      zod: zodPlugin,
    },
    rules: {
      'prettier/prettier': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      //    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-unresolved': 'error',
      'import/newline-after-import': 'warn',
      'zod/prefer-enum': 'error',
      'zod/require-strict': 'error',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/check-types': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': ['warn', 'any', { startLines: 1 }],
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
          alwaysTryTypes: true,
        },
        node: {
          extensions: ['.ts', '.js'],
        },
      },
      jsdoc: {
        mode: 'typescript',
      },
    },
  },
  {
    files: [
      '*.test.ts',
      '*.spec.ts',
      '**/tests/**/*.ts',
      '**/__mocks__/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['eslint.config.js', '*.config.js', '*.config.cjs'],
    languageOptions: {
      parserOptions: { sourceType: 'script' },
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettierRecommended,
];
