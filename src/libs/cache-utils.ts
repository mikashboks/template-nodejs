// src/lib/cache.utils.ts
import { createHash } from 'crypto';
import stringify from 'safe-stable-stringify';
import { Decimal } from '@prisma/client/runtime/library';

// Define default prefixes or allow overriding via config if needed
const defaultPrefixes = {
  Decimal: '___de_',
  BigInt: '___bi_',
  Date: '___da_',
  Buffer: '___bu_',
  // Add others if needed (Uint8Array etc.) based on your data
};

// --- Key Generation ---
// Adapted from provided code
export function generatePrismaCacheKey(params: {
  model?: string;
  operation: string;
  queryArgs: any;
  namespace?: string; // Your project cache namespace
}): string {
  const argsString = stringify(params.queryArgs, (_, v) =>
    // Handle BigInt serialization for hashing
    typeof v === 'bigint' ? v.toString() : v
  );
  const hash = createHash('md5').update(argsString!).digest('hex');
  const modelOp = `${params.model ?? 'raw'}:${params.operation}`; // Use 'raw' for non-model operations if needed
  return `prisma:${params.namespace ? params.namespace + ':' : ''}${modelOp}@${hash}`;
}


// --- Serialization ---
// Adapted from provided code
export function serializePrismaData(data: any): string {
  function replacer(_key: string, value: any): any {
    if (Decimal.isDecimal(value)) {
      return `${defaultPrefixes.Decimal}${value.toString()}`;
    }
    if (typeof value === 'bigint') {
      return `${defaultPrefixes.BigInt}${value.toString()}`;
    }
    if (value instanceof Date) {
      return `${defaultPrefixes.Date}${value.toISOString()}`;
    }
    if (Buffer.isBuffer(value)) {
      // Choose a suitable encoding, e.g., base64
      return `${defaultPrefixes.Buffer}${value.toString('base64')}`;
    }
    // Add other types like Uint8Array if you use them
    return value;
  }
  // We wrap the data in an object to handle cases where the top-level result is null or undefined
  // This ensures JSON.parse works correctly during deserialization.
  return stringify({ data }, replacer)!;
}

// --- Deserialization ---
// Adapted from provided code
export function deserializePrismaData<T = any>(serializedData: string): T {
  function reviver(_key: string, value: any): any {
    if (typeof value !== 'string') {
      return value;
    }
    if (value.startsWith(defaultPrefixes.Decimal)) {
      return new Decimal(value.substring(defaultPrefixes.Decimal.length));
    }
    if (value.startsWith(defaultPrefixes.BigInt)) {
      return BigInt(value.substring(defaultPrefixes.BigInt.length));
    }
    if (value.startsWith(defaultPrefixes.Date)) {
      return new Date(value.substring(defaultPrefixes.Date.length));
    }
    if (value.startsWith(defaultPrefixes.Buffer)) {
      return Buffer.from(value.substring(defaultPrefixes.Buffer.length), 'base64');
    }
    // Add other types if needed
    return value;
  }
  // Parse the wrapper object and return the actual data
  const parsed = JSON.parse(serializedData, reviver);
  return parsed.data as T;
}
