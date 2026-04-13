/**
 * Unit tests for useTaskEdit hook.
 *
 * useTaskEdit manages task editing state: loading a task into form fields,
 * validating, saving to Supabase, and confirming deletion.
 *
 * Supabase is mocked so these are pure state-machine tests.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useTaskEdit } from '../../../hooks/useTaskEdit';
import type { Task } from '../../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => ({
      update: jest.fn(() => ({
        eq: jest.fn(() => mockUpdate()),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => mockDelete()),
        })),
      })),
    })),
  },
}));

jest.mock('../../../lib/toast', () => ({
  showToast: jest.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    job_id: 'job-1',
    name: 'Install conduit',
    estimated_hours: 8,
    unit: 'feet',
    total_units: 200,
    starting_units_completed: 0,
    status: 'active',
    sequence_order: 0,
    ...overrides,
  };
}

function makeHook(onSaved = jest.fn(), requestConfirm = jest.fn()) {
  return renderHook(() => useTaskEdit('job-1', onSaved, requestConfirm));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useTaskEdit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with showEditTask=false and no editingTask', () => {
      const { result } = makeHook();
      expect(result.current.showEditTask).toBe(false);
      expect(result.current.editingTask).toBeNull();
    });

    it('starts with empty form fields', () => {
      const { result } = makeHook();
      expect(result.current.editTaskName).toBe('');
      expect(result.current.editTaskHours).toBe('');
      expect(result.current.editTaskUnit).toBe('');
      expect(result.current.editTaskTotalUnits).toBe('');
      expect(result.current.editTaskStartingUnits).toBe('');
    });
  });

  describe('openEditTask', () => {
    it('loads all task fields into form state', () => {
      const { result } = makeHook();
      const task = makeTask({ estimated_hours: 4, unit: 'panels', total_units: 50, starting_units_completed: 10 });

      act(() => { result.current.openEditTask(task); });

      expect(result.current.showEditTask).toBe(true);
      expect(result.current.editingTask).toBe(task);
      expect(result.current.editTaskName).toBe('Install conduit');
      expect(result.current.editTaskHours).toBe('4');
      expect(result.current.editTaskUnit).toBe('panels');
      expect(result.current.editTaskTotalUnits).toBe('50');
      expect(result.current.editTaskStartingUnits).toBe('10');
    });

    it('leaves starting_units empty when it is 0', () => {
      const { result } = makeHook();
      act(() => { result.current.openEditTask(makeTask({ starting_units_completed: 0 })); });
      expect(result.current.editTaskStartingUnits).toBe('');
    });

    it('leaves optional fields empty when they are null', () => {
      const { result } = makeHook();
      act(() => {
        result.current.openEditTask(makeTask({ estimated_hours: undefined, unit: undefined, total_units: undefined }));
      });
      expect(result.current.editTaskHours).toBe('');
      expect(result.current.editTaskUnit).toBe('');
      expect(result.current.editTaskTotalUnits).toBe('');
    });
  });

  describe('saveEditTask', () => {
    it('sets error and returns early when task name is blank', async () => {
      const onSaved = jest.fn();
      const { result } = makeHook(onSaved);

      act(() => { result.current.openEditTask(makeTask()); });
      act(() => { result.current.setEditTaskName('   '); }); // whitespace only

      await act(async () => { await result.current.saveEditTask(); });

      expect(result.current.editTaskError).toMatch(/task name/i);
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('sets error when no editingTask is loaded', async () => {
      const { result } = makeHook();
      await act(async () => { await result.current.saveEditTask(); });
      expect(result.current.editTaskError).toMatch(/task name/i);
    });

    it('calls onSaved and closes modal on successful save', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      const onSaved = jest.fn();
      const { result } = makeHook(onSaved);

      act(() => { result.current.openEditTask(makeTask()); });

      await act(async () => { await result.current.saveEditTask(); });

      await waitFor(() => expect(result.current.showEditTask).toBe(false));
      expect(result.current.editingTask).toBeNull();
      expect(result.current.editTaskError).toBe('');
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('shows toast and keeps modal open on DB error', async () => {
      mockUpdate.mockResolvedValue({ error: { message: 'DB write failed' } });
      const { showToast } = require('../../../lib/toast');
      const { result } = makeHook();

      act(() => { result.current.openEditTask(makeTask()); });
      await act(async () => { await result.current.saveEditTask(); });

      expect(result.current.showEditTask).toBe(true);
      expect(showToast).toHaveBeenCalledWith('error', 'DB write failed');
    });
  });

  describe('deleteTask', () => {
    it('calls requestConfirm with the task name in the message', () => {
      const requestConfirm = jest.fn();
      const { result } = makeHook(jest.fn(), requestConfirm);
      const task = makeTask({ name: 'Pull wire' });

      act(() => { result.current.deleteTask(task); });

      expect(requestConfirm).toHaveBeenCalledTimes(1);
      const opts = requestConfirm.mock.calls[0][0];
      expect(opts.title).toBe('Delete task?');
      expect(opts.message).toContain('"Pull wire"');
      expect(opts.confirmLabel).toBe('Delete');
    });

    it('calls onSaved after successful deletion', async () => {
      const requestConfirm = jest.fn();
      mockDelete.mockResolvedValue({ data: [{ id: 'task-1' }], error: null });

      // Also mock the daily_logs update
      const { supabase } = require('../../../lib/supabase');
      const mockLogsUpdate = jest.fn().mockResolvedValue({ error: null });
      supabase.from.mockImplementation((table: string) => {
        if (table === 'daily_logs') {
          return { update: jest.fn(() => ({ eq: mockLogsUpdate })) };
        }
        return {
          delete: jest.fn(() => ({
            eq: jest.fn(() => ({ select: jest.fn(() => mockDelete()) })),
          })),
        };
      });

      const onSaved = jest.fn();
      const { result } = makeHook(onSaved, requestConfirm);

      act(() => { result.current.deleteTask(makeTask()); });

      // Execute the onConfirm callback that was passed to requestConfirm
      const { onConfirm } = requestConfirm.mock.calls[0][0];
      await act(async () => { await onConfirm(); });

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });
  });
});
