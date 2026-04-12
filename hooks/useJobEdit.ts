import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { Job } from '../types';

export function useJobEdit(id: string | undefined, job: Job | null, onSaved: () => void) {
  const [showEditJob, setShowEditJob] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTotalUnits, setEditTotalUnits] = useState('');
  const [editCrewSize, setEditCrewSize] = useState('');
  const [editBidHours, setEditBidHours] = useState('');
  const [editBidCrewSize, setEditBidCrewSize] = useState('');
  const [editStartingUnits, setEditStartingUnits] = useState('');
  const [editStartingHours, setEditStartingHours] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editTargetEndDate, setEditTargetEndDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editJobError, setEditJobError] = useState('');

  function openEditJob() {
    if (!job) return;
    setEditName(job.name);
    setEditTotalUnits(String(job.total_units));
    setEditCrewSize(job.crew_size != null ? String(job.crew_size) : '');
    setEditBidHours(job.bid_hours != null ? String(job.bid_hours) : '');
    setEditBidCrewSize(job.bid_crew_size != null ? String(job.bid_crew_size) : '');
    setEditStartingUnits(job.starting_units_completed != null ? String(job.starting_units_completed) : '');
    setEditStartingHours(job.starting_hours_used != null ? String(job.starting_hours_used) : '');
    setEditStartDate(job.start_date ?? '');
    setEditTargetEndDate(job.target_end_date ?? '');
    setEditNotes(job.notes ?? '');
    setEditLocationName(job.location_name ?? '');
    setShowEditJob(true);
  }

  async function saveEditJob() {
    if (!editName.trim()) { setEditJobError('Missing: job name is required'); return; }
    if (!editTotalUnits || isNaN(Number(editTotalUnits))) {
      setEditJobError('Missing: total units is required (must be a number)'); return;
    }
    setEditJobError('');
    setEditSaving(true);
    const { error } = await supabase.from('jobs').update({
      name: editName.trim(),
      total_units: Number(editTotalUnits),
      crew_size: editCrewSize ? Number(editCrewSize) : null,
      bid_hours: editBidHours ? Number(editBidHours) : null,
      bid_crew_size: editBidCrewSize ? Number(editBidCrewSize) : null,
      starting_units_completed: editStartingUnits ? Number(editStartingUnits) : 0,
      starting_hours_used: editStartingHours ? Number(editStartingHours) : 0,
      start_date: editStartDate || null,
      target_end_date: editTargetEndDate || null,
      notes: editNotes || null,
      location_name: editLocationName || null,
    }).eq('id', id);
    setEditSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowEditJob(false);
    onSaved();
  }

  return {
    showEditJob, setShowEditJob,
    editName, setEditName,
    editTotalUnits, setEditTotalUnits,
    editCrewSize, setEditCrewSize,
    editBidHours, setEditBidHours,
    editBidCrewSize, setEditBidCrewSize,
    editStartingUnits, setEditStartingUnits,
    editStartingHours, setEditStartingHours,
    editStartDate, setEditStartDate,
    editTargetEndDate, setEditTargetEndDate,
    editNotes, setEditNotes,
    editLocationName, setEditLocationName,
    editSaving, editJobError, setEditJobError,
    openEditJob, saveEditJob,
  };
}

export type JobEditHook = ReturnType<typeof useJobEdit>;
