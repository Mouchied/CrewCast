const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isNonRetryable(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('jwt') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('permission denied') ||
    lower.includes('row level security')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs an async function with exponential backoff retry on failure.
 * Skips retries for auth/permission errors that won't self-resolve.
 * Throws on final failure so callers can catch and surface the error.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isNonRetryable(msg)) break;
    }
  }

  throw lastError;
}

/**
 * Wraps a Supabase-style query (returns { data, error }) with retry logic.
 * On persistent error after retries, returns { data: null, error }.
 */
export async function withRetryQuery<T>(
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>
): Promise<{ data: T | null; error: string | null }> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    try {
      const result = await fn();
      if (result.error) {
        lastError = result.error.message;
        if (isNonRetryable(result.error.message)) break;
        continue;
      }
      return { data: result.data, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error';
    }
  }

  return { data: null, error: lastError ?? 'Unknown error' };
}
