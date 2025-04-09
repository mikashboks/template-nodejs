module.exports = {
  // Specifies this is the root config; ESLint won't search higher up.
  root: true,

  // Specifies the parser for TypeScript code.
  parser: '@typescript-eslint/parser',

  // Parser options configure how the parser behaves.
  parserOptions: {
    // Link to your project's tsconfig.json for type-aware linting rules.
    project: ['./tsconfig.json'],
    // Root directory for resolving tsconfig.json paths.
    tsconfigRootDir: __dirname,
    // Use ES Modules syntax. Matches package.json "type": "module".
    sourceType: 'module',
    // Use modern ECMAScript features (aligns with tsconfig target: ES2022).
    ecmaVersion: 2022,
  },

  // Defines predefined global variables available during execution.
  env: {
    node: true,   // Node.js global variables and Node.js scoping.
    es2022: true, // Enable ES2022 globals and syntax.
    'vitest-globals/env': true, // Add Vitest globals if you use them (requires eslint-plugin-vitest-globals)
  },

  // Plugins add specific linting capabilities.
  plugins: [
    '@typescript-eslint', // Core TypeScript linting rules
    'prettier',           // Integrates Prettier formatting checks
    'import',             // Linting for ES6+ import/export syntax
    'security',           // Identifies potential security vulnerabilities
    'jsdoc',              // Linting for JSDoc documentation comments
    "zod",
    // 'vitest-globals', // Optional: If you want ESLint to recognize describe(), it(), etc.
  ],

  // Extends existing configurations for a baseline. Rules are applied sequentially.
  extends: [
    'eslint:recommended',                     // ESLint's built-in recommended rules
    'plugin:@typescript-eslint/recommended',  // Recommended rules for TypeScript
    'plugin:@typescript-eslint/recommended-requiring-type-checking', // Stricter rules using type info (can be slower)
    'plugin:security/recommended',            // Recommended security rules
    'plugin:import/recommended',              // Recommended import/export rules
    'plugin:import/typescript',               // Settings for TypeScript import resolution
    'plugin:jsdoc/recommended-typescript',    // Recommended JSDoc rules for TypeScript (use this instead of just recommended)
    'plugin:prettier/recommended',            // IMPORTANT: Turns off ESLint rules conflicting with Prettier and runs Prettier as an ESLint rule. Must be LAST.
  ],

  // Custom rule configurations override or supplement extended rules.
  rules: {
    // Prettier Integration: Report formatting issues as warnings.
    'prettier/prettier': 'warn',

    // TypeScript specific rules:
    '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }], // Warn on unused vars, allowing underscore prefix for ignoring.
    '@typescript-eslint/no-explicit-any': 'error', // **Improvement**: Disallow 'any' type (use 'unknown' or be specific). Changed from 'warn' to 'error' for stricter typing.
    '@typescript-eslint/no-floating-promises': 'error', // Require handling Promises properly (e.g., with await or .catch()). Added for safety.
    '@typescript-eslint/no-misused-promises': 'error', // Avoid passing Promises to places not expecting them (like condition checks). Added for safety.

    // General JavaScript / Node rules:
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }], // Discourage console.log, but allow warn/error/info.
    'no-unused-vars': 'off', // Disable base rule, use '@typescript-eslint/no-unused-vars' instead.
    'eqeqeq': ['error', 'always'], // Enforce strict equality (=== and !==). Added for safety.

    // Import plugin rules:
    'import/order': [ // Enforce a consistent import order. Added for consistency.
      'warn',
      {
        'groups': ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'object', 'type'],
        'newlines-between': 'always',
        'alphabetize': { 'order': 'asc', 'caseInsensitive': true }
      }
    ],
    'import/no-unresolved': 'error', // Ensure imports can be resolved (needs configuration below).
    'import/newline-after-import': 'warn', // Ensure newline after imports.

    // Security rules (can add specific overrides if needed):
    // 'security/detect-object-injection': 'warn', // Example override

    "zod/prefer-enum": 2,
    "zod/require-strict": 2,

    // JSDoc rules:
    'jsdoc/require-param-description': 'warn',
    'jsdoc/require-returns-description': 'warn',
    'jsdoc/check-types': 'warn', // Checks types in JSDoc match TS types
    'jsdoc/require-jsdoc': 'off', // Don't require JSDoc for everything (can enable for specific functions/classes if desired)
    'jsdoc/tag-lines': ['warn', 'any', { startLines: 1 }], // Add spacing around tags

  },

  // Settings shared across rules/plugins.
  settings: {
    // Configure eslint-plugin-import resolver for TypeScript paths/aliases.
    'import/resolver': {
      typescript: {
        project: './tsconfig.json', // Point to your tsconfig
      },
      node: true, // Add node resolver as fallback
    },
    // Configure eslint-plugin-jsdoc for TypeScript mode.
    jsdoc: {
      mode: 'typescript', // Important for understanding TS syntax in JSDoc
    },
  },

  // Overrides allow applying different rules to specific file patterns.
  overrides: [
    {
      // Relax rules specifically for test files
      files: ['*.test.ts', '*.spec.ts', '**/tests/**/*.ts', '**/__mocks__/**/*.ts'],
      env: {
        // Add test environment globals if not using eslint-plugin-vitest-globals
        // 'jest/globals': true, // Or specific test runner env
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off', // Allow 'any' more freely in tests
        '@typescript-eslint/no-unsafe-assignment': 'off', // Allow assigning 'any' in tests
        '@typescript-eslint/no-unsafe-member-access': 'off', // Allow 'any' member access
        '@typescript-eslint/no-unsafe-call': 'off', // Allow calling 'any'
        '@typescript-eslint/no-non-null-assertion': 'off', // Allow non-null assertions '!' in tests
        'security/detect-object-injection': 'off', // Often needed for mock data/stubs
        // Add other test-specific overrides if needed
      },
    },
    {
      // Allow CommonJS for configuration files if needed (though this file IS CJS)
      files: ['.eslintrc.cjs', '*.config.js', '*.config.cjs'],
      env: {
        node: true,
        commonjs: true, // Allow CommonJS syntax like 'require' and 'module.exports'
      },
      parserOptions: {
        sourceType: 'script', // Treat as script, not module
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      }
    }
  ],

  // Files and directories to explicitly ignore during linting.
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    'docs/', // Ignore generated documentation
    '.husky/', // Ignore husky internal files
    '.turbo/', // Ignore turbo repo cache
    '*.log',
    '*.tgz',
    '.env', '.env.*', '!.env.example', // Ignore env files, except example
    'prisma/generated/', // Ignore Prisma generated client if output elsewhere
    '*.d.ts', // Ignore TypeScript definition files
    // Ignore self (already present)
    // '.eslintrc.cjs',
    // Ignore specific config files if they don't conform or cause issues
    'vitest.config.ts',
    'commitlint.config.js', // Or .cjs
    'prettier.config.js', // Or .cjs / .json etc.
  ],
};