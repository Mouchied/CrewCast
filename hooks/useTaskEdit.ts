import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Task } from '../types';
import { showToast } from '../lib/toast';
import { ConfirmOptions } from '../components/ConfirmDialog';

export function useTaskEdit(
  id: string | undefined,
  onSaved: () => void,
  requestConfirm: (opts: ConfirmOptions) => void,
) {
  const [showEditTask, setShowEditTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskName, setEditTaskName] = useState('');
  const [editTaskHours, setEditTaskHours] = useState('');
  const [editTaskUnit, setEditTaskUnit] = useState('');
  const [editTaskTotalUnits, setEditTaskTotalUnits] = useState('');
  const [editTaskStartingUnits, setEditTaskStartingUnits] = useState('');
  const [editTaskError, setEditTaskError] = useState('');

  function openEditTask(task: Task) {
    setEditingTask(task);
    setEditTaskName(task.name);
    setEditTaskHours(task.estimated_hours != null ? String(task.estimated_hours) : '');
    setEditTaskUnit(task.unit ?? '');
    setEditTaskTotalUnits(task.total_units != null ? String(task.total_units) : '');
    setEditTaskStartingUnits(
      task.starting_units_completed != null && task.starting_units_completed !== 0
        ? String(task.starting_units_completed)
        : ''
    );
    setShowEditTask(true);
  }

  async function saveEditTask() {
    if (!editingTask || !editTaskName.trim()) {
      setEditTaskError('Missing: task name is required'); return;
    }
    const { error } = await supabase.from('tasks').update({
      name: editTaskName.trim(),
      estimated_hours: editTaskHours ? Number(editTaskHours) : null,
      unit: editTaskUnit.trim() || null,
      total_units: editTaskTotalUnits ? Number(editTaskTotalUnits) : null,
      ...(editTaskStartingUnits ? { starting_units_completed: Number(editTaskStartingUnits) } : {}),
    }).eq('id', editingTask.id);
    if (!error) {
      setEditTaskError('');
      setShowEditTask(false);
      setEditingTask(null);
      onSaved();
    } else {
      showToast('error', error.message);
    }
  }

  function deleteTask(task: Task) {
    requestConfirm({
      title: 'Delete task?',
      message: `"${task.name}" will be removed. Any logs tagged to this task will be unlinked.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await supabase.from('daily_logs').update({ task_id: null }).eq('task_id', task.id);
        const { data, error } = await supabase.from('tasks').delete().eq('id', task.id).select('id');
        if (error) showToast('error', error.message);
        else if (!data?.length) showToast('error', 'Permission denied — could not delete task.');
        else onSaved();
      },
    });
  }

  return {
    showEditTask, setShowEditTask,
    editingTask,
    editTaskName, setEditTaskName,
    editTaskHours, setEditTaskHours,
    editTaskUnit, setEditTaskUnit,
    editTaskTotalUnits, setEditTaskTotalUnits,
    editTaskStartingUnits, setEditTaskStartingUnits,
    editTaskError, setEditTaskError,
    openEditTask, saveEditTask, deleteTask,
  };
}

export type TaskEditHook = ReturnType<typeof useTaskEdit>;
