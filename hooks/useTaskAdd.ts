import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Task } from '../types';

export function useTaskAdd(id: string | undefined, tasks: Task[], onSaved: () => void) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('');
  const [newTaskUnit, setNewTaskUnit] = useState('');
  const [newTaskTotalUnits, setNewTaskTotalUnits] = useState('');
  const [newTaskStartingUnits, setNewTaskStartingUnits] = useState('');
  const [addTaskError, setAddTaskError] = useState('');

  async function addTask() {
    if (!newTaskName.trim()) { setAddTaskError('Missing: task name is required'); return; }
    const { error } = await supabase.from('tasks').insert({
      job_id: id,
      name: newTaskName.trim(),
      estimated_hours: newTaskHours ? Number(newTaskHours) : null,
      unit: newTaskUnit.trim() || null,
      total_units: newTaskTotalUnits ? Number(newTaskTotalUnits) : null,
      ...(newTaskStartingUnits ? { starting_units_completed: Number(newTaskStartingUnits) } : {}),
      sequence_order: tasks.length,
    });
    if (!error) {
      setNewTaskName('');
      setNewTaskHours('');
      setNewTaskUnit('');
      setNewTaskTotalUnits('');
      setNewTaskStartingUnits('');
      setAddTaskError('');
      setShowAddTask(false);
      onSaved();
    }
  }

  return {
    showAddTask, setShowAddTask,
    newTaskName, setNewTaskName,
    newTaskHours, setNewTaskHours,
    newTaskUnit, setNewTaskUnit,
    newTaskTotalUnits, setNewTaskTotalUnits,
    newTaskStartingUnits, setNewTaskStartingUnits,
    addTaskError, setAddTaskError,
    addTask,
  };
}

export type TaskAddHook = ReturnType<typeof useTaskAdd>;
