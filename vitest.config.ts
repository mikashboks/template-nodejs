import { defineConfig } from 'vitest/config';
import path from 'path'; // Import path module

export default defineConfig({
  test: {
    globals: true, // Use global APIs (describe, it, expect, etc.)
    environment: 'node', // Set the test environment to Node.js
    setupFiles: ['./test/setup.ts'], // Optional: run setup files before tests
    testTimeout: 10000, // Set timeout for CI environments
    coverage: {
      provider: 'v8', // Specify coverage provider ('v8' or 'istanbul')
      reporter: ['text', 'json', 'html', 'lcov'], // Output formats for coverage reports
      reportsDirectory: './coverage', // Directory where reports are saved
      include: ['src/**/*.{ts,js}'], // Files to include in coverage analysis
      exclude: [
        // Files/patterns to exclude from coverage
        'src/index.ts',
        'src/utils/logger.ts', // Often exclude logger setup
        '**/*.d.ts',
        'dist/**',
        'node_modules/**',
        'test/**',
      ],
      all: true, // Include uncovered files in the report
    },
  },
  resolve: {
    alias: {
      // Setup aliases to match tsconfig paths (if you use them)
      '@': path.resolve(__dirname, './src'),
    },
  },
});
