import { ZodSchema } from 'zod';
import { z, ZodError } from 'zod';

export function validateWithZod<S extends any, D>(
  schema: ZodSchema<S>,
  data: D,
): ValidationResult {
  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  } else {
    return {
      valid: false,
      errors: result.error,
    };
  }
}

export type ValidationResult =
  | { valid: true; data?: any }
  | {
      valid: false;
      message?: string;
      errors: string[] | z.ZodIssue[] | ZodError;
    };
