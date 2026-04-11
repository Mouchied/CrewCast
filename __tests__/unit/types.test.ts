/**
 * Unit tests for pure helper functions in types/index.ts
 *
 * These are the safest tests to run: no network, no DB, no mocks needed.
 * They verify that the display logic for PaceStatus and forecast sentences
 * matches the product spec.
 */

import {
  getPaceColor,
  getPaceLabel,
  getForecastSentence,
  type Job,
  type JobSnapshot,
  type PaceStatus,
} from '../../types';

// ─── getPaceColor ────────────────────────────────────────────────────────────

describe('getPaceColor', () => {
  it('returns green for on_track', () => {
    expect(getPaceColor('on_track')).toBe('#22c55e');
  });

  it('returns amber for at_risk', () => {
    expect(getPaceColor('at_risk')).toBe('#f59e0b');
  });

  it('returns red for behind', () => {
    expect(getPaceColor('behind')).toBe('#ef4444');
  });

  it('returns slate for no_target', () => {
    expect(getPaceColor('no_target')).toBe('#64748b');
  });

  it('returns slate for pending', () => {
    expect(getPaceColor('pending')).toBe('#64748b');
  });

  it('returns slate for undefined', () => {
    expect(getPaceColor(undefined)).toBe('#64748b');
  });
});

// ─── getPaceLabel ────────────────────────────────────────────────────────────

describe('getPaceLabel', () => {
  const cases: Array<[PaceStatus | undefined, string]> = [
    ['on_track', 'On Track'],
    ['at_risk', 'At Risk'],
    ['behind', 'Behind'],
    ['no_target', 'No Target'],
    ['pending', 'Pending'],
    [undefined, 'Pending'],
  ];

  test.each(cases)('getPaceLabel(%s) === %s', (status, expected) => {
    expect(getPaceLabel(status)).toBe(expected);
  });
});

// ─── getForecastSentence ─────────────────────────────────────────────────────

function makeJob(overrides: {
  target_end_date?: string;
  snap?: Partial<JobSnapshot>;
}): Job {
  const snap: JobSnapshot = {
    job_id: 'job-1',
    units_completed: 50,
    units_remaining: 50,
    avg_units_per_day: 10,
    last_7_day_avg: 10,
    estimated_finish_date: '2026-03-15',
    days_ahead_behind: 0,
    total_days_logged: 5,
    pace_status: 'on_track',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides.snap,
  };

  return {
    id: 'job-1',
    company_id: 'co-1',
    created_by: 'user-1',
    name: 'Solar install',
    total_units: 100,
    unit: 'panels',
    start_date: '2026-03-01',
    target_end_date: overrides.target_end_date,
    status: 'active',
    country: 'US',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    job_snapshots: snap,
  } as Job;
}

describe('getForecastSentence', () => {
  it('returns null when no snapshot', () => {
    const job = makeJob({});
    job.job_snapshots = undefined;
    expect(getForecastSentence(job)).toBeNull();
  });

  it('returns null when no logs yet (total_days_logged === 0)', () => {
    const job = makeJob({ snap: { total_days_logged: 0 } });
    expect(getForecastSentence(job)).toBeNull();
  });

  it('returns null when estimated_finish_date is missing', () => {
    const job = makeJob({ snap: { estimated_finish_date: undefined } });
    expect(getForecastSentence(job)).toBeNull();
  });

  it('returns simple ETA when no target date', () => {
    const job = makeJob({});
    // target_end_date omitted → no bid comparison
    const sentence = getForecastSentence(job);
    expect(sentence).toContain('At current pace, you finish');
    // Should not mention "behind" or "ahead" without a target
    expect(sentence).not.toContain('behind');
    expect(sentence).not.toContain('ahead');
  });

  it('correctly reports "ahead" when days_ahead_behind is positive', () => {
    const job = makeJob({
      target_end_date: '2026-03-11',
      snap: { days_ahead_behind: 4, estimated_finish_date: '2026-03-15' },
    });
    const sentence = getForecastSentence(job);
    expect(sentence).toContain('4 days ahead');
    expect(sentence).toContain('March 15');
    expect(sentence).toContain('March 11');
  });

  it('correctly reports "behind" when days_ahead_behind is negative', () => {
    const job = makeJob({
      target_end_date: '2026-03-11',
      snap: { days_ahead_behind: -4, estimated_finish_date: '2026-03-15' },
    });
    const sentence = getForecastSentence(job);
    expect(sentence).toContain('4 days behind');
    expect(sentence).toContain('March 15');
    expect(sentence).toContain('March 11');
  });

  it('uses singular "day" when diff is exactly 1', () => {
    const job = makeJob({
      target_end_date: '2026-03-12',
      snap: { days_ahead_behind: 1 },
    });
    expect(getForecastSentence(job)).toContain('1 day ahead');
  });

  it('uses singular "day" when diff is exactly -1', () => {
    const job = makeJob({
      target_end_date: '2026-03-14',
      snap: { days_ahead_behind: -1 },
    });
    expect(getForecastSentence(job)).toContain('1 day behind');
  });

  it('reports "on pace" when days_ahead_behind is 0 and target exists', () => {
    const job = makeJob({
      target_end_date: '2026-03-15',
      snap: { days_ahead_behind: 0 },
    });
    const sentence = getForecastSentence(job);
    expect(sentence).toContain('on pace');
  });
});
