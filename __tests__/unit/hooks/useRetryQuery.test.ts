/**
 * Unit tests for useRetryQuery hook.
 *
 * useRetryQuery wraps a Supabase-style query function with exponential
 * backoff retry. Tests verify:
 * - Initial state: data=null, error=null, loading=false.
 * - Successful query sets data and clears error.
 * - Transient errors are retried; final error surfaces via error field.
 * - Auth/permission errors are NOT retried (non-retryable fast-fail).
 * - Loading flag is true during query execution.
 *
 * withRetryQuery uses setTimeout for backoff delays — we use fake timers
 * to advance time without waiting.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useRetryQuery } from '../../../hooks/useRetryQuery';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRetryQuery', () => {
  describe('initial state', () => {
    it('starts with data=null, error=null, loading=false', () => {
      const queryFn = jest.fn();
      const { result } = renderHook(() => useRetryQuery(queryFn));

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });

  describe('successful query', () => {
    it('sets data and clears error on success', async () => {
      const queryFn = jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });
      const { result } = renderHook(() => useRetryQuery(queryFn));

      await act(async () => {
        result.current.run();
        jest.runAllTimers();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toEqual([{ id: '1' }]);
      expect(result.current.error).toBeNull();
    });

    it('sets loading=true during execution and false after', async () => {
      let resolveQuery!: (v: any) => void;
      const queryFn = jest.fn(
        () => new Promise<any>(r => { resolveQuery = r; })
      );

      const { result } = renderHook(() => useRetryQuery(queryFn));

      act(() => { result.current.run(); });
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveQuery({ data: 'done', error: null });
        jest.runAllTimers();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('error handling', () => {
    it('surfaces error message after all retries are exhausted', async () => {
      const queryFn = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const { result } = renderHook(() => useRetryQuery(queryFn));

      // Run the query, then advance all timers (retry delays) and flush promises
      act(() => { result.current.run(); });
      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Network error');
      expect(result.current.data).toBeNull();
    });

    it('does NOT retry permission/auth errors', async () => {
      const queryFn = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'permission denied for table jobs' },
      });

      const { result } = renderHook(() => useRetryQuery(queryFn));

      await act(async () => {
        result.current.run();
        jest.runAllTimers();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      // Only called once — no retries for permission errors
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(result.current.error).toMatch(/permission denied/i);
    });

    it('succeeds on second attempt after one transient failure', async () => {
      const queryFn = jest
        .fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
        .mockResolvedValueOnce({ data: [{ id: '42' }], error: null });

      const { result } = renderHook(() => useRetryQuery(queryFn));

      await act(async () => {
        result.current.run();
        jest.advanceTimersByTime(10000);
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toEqual([{ id: '42' }]);
      expect(result.current.error).toBeNull();
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });
});
