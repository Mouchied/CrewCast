/**
 * Unit tests for useTaskAdd hook.
 *
 * useTaskAdd manages the "add new task" form state and DB insert.
 * Tests verify:
 * - Initial empty state.
 * - Validation: name is required.
 * - On success: form clears, modal closes, onSaved fires.
 * - sequence_order is set to tasks.length.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useTaskAdd } from '../../../hooks/useTaskAdd';
import type { Task } from '../../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsert = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => mockInsert()),
    })),
  },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-x',
    job_id: 'job-1',
    name: 'Existing task',
    status: 'active',
    sequence_order: 0,
    ...overrides,
  };
}

function makeHook(tasks: Task[] = [], onSaved = jest.fn()) {
  return renderHook(() => useTaskAdd('job-1', tasks, onSaved));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useTaskAdd', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('initial state', () => {
    it('starts with all fields empty and modal closed', () => {
      const { result } = makeHook();
      expect(result.current.showAddTask).toBe(false);
      expect(result.current.newTaskName).toBe('');
      expect(result.current.newTaskHours).toBe('');
      expect(result.current.newTaskUnit).toBe('');
      expect(result.current.newTaskTotalUnits).toBe('');
      expect(result.current.newTaskStartingUnits).toBe('');
      expect(result.current.addTaskError).toBe('');
    });
  });

  describe('addTask validation', () => {
    it('sets error when name is empty', async () => {
      const { result } = makeHook();
      await act(async () => { await result.current.addTask(); });
      expect(result.current.addTaskError).toMatch(/task name/i);
    });

    it('sets error when name is whitespace only', async () => {
      const { result } = makeHook();
      act(() => { result.current.setNewTaskName('   '); });
      await act(async () => { await result.current.addTask(); });
      expect(result.current.addTaskError).toMatch(/task name/i);
    });

    it('does not call DB when validation fails', async () => {
      const { result } = makeHook();
      await act(async () => { await result.current.addTask(); });
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('addTask success', () => {
    it('calls onSaved and resets form on success', async () => {
      mockInsert.mockResolvedValue({ error: null });
      const onSaved = jest.fn();
      const { result } = makeHook([], onSaved);

      act(() => {
        result.current.setNewTaskName('Run conduit');
        result.current.setNewTaskUnit('feet');
        result.current.setNewTaskTotalUnits('150');
      });

      await act(async () => { await result.current.addTask(); });

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

      expect(result.current.newTaskName).toBe('');
      expect(result.current.newTaskUnit).toBe('');
      expect(result.current.newTaskTotalUnits).toBe('');
      expect(result.current.showAddTask).toBe(false);
      expect(result.current.addTaskError).toBe('');
    });

    it('sets sequence_order to tasks.length', async () => {
      mockInsert.mockResolvedValue({ error: null });
      const existingTasks = [makeTask({ sequence_order: 0 }), makeTask({ sequence_order: 1 })];
      const { result } = makeHook(existingTasks);

      const { supabase } = require('../../../lib/supabase');
      const insertSpy = jest.fn(() => mockInsert());
      supabase.from.mockReturnValue({ insert: insertSpy });

      act(() => { result.current.setNewTaskName('Third task'); });
      await act(async () => { await result.current.addTask(); });

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sequence_order: 2 })
      );
    });

    it('trims whitespace from name before inserting', async () => {
      mockInsert.mockResolvedValue({ error: null });
      const { result } = makeHook();
      const { supabase } = require('../../../lib/supabase');
      const insertSpy = jest.fn(() => mockInsert());
      supabase.from.mockReturnValue({ insert: insertSpy });

      act(() => { result.current.setNewTaskName('  Pull wire  '); });
      await act(async () => { await result.current.addTask(); });

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pull wire' })
      );
    });
  });
});
