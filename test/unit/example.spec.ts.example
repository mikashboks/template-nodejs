import { describe, it, expect, vi } from 'vitest';
import { exampleService } from '../../src/services/example.service'; // Adjust path as needed

// Example: Mocking a dependency (like the logger)
vi.mock('../../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Example Service Unit Test', () => {
  it('should return the expected string from exampleService', () => {
    const result = exampleService();
    expect(result).toBe('Data processed by Example Service');
  });

  it('should perform a basic calculation correctly', () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
