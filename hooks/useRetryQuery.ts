import { useState, useCallback } from 'react';
import { withRetryQuery } from '../lib/withRetry';

type QueryFn<T> = () => Promise<{ data: T | null; error: { message: string } | null }>;

type RetryQueryResult<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  run: () => Promise<void>;
};

/**
 * Wraps a Supabase query with exponential backoff retry logic.
 * Retries up to 3 times on transient errors, doubling delay each attempt.
 * Auth/permission errors are not retried.
 */
export function useRetryQuery<T>(queryFn: QueryFn<T>): RetryQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await withRetryQuery(queryFn);
    setData(result.data);
    setError(result.error);
    setLoading(false);
  }, [queryFn]);

  return { data, error, loading, run };
}
