/**
 * VariableManager — shared base for job-variable and task-variable management.
 *
 * mode="controlled"   Variables live in the parent (PendingVariable[]). Changes
 *                     surface via onChange. Supports readOnly chip display.
 * mode="uncontrolled" Variables fetched from task_variables and saved directly
 *                     to the DB. taskId required.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import type { JobVariableType, TaskVariable } from '../types';

// ── Public types ────────────────────────────────────────────────

/** Pending (unsaved) variable — used in controlled mode */
export interface PendingVariable {
  variable_type_id: string;
  variable_name: string;
  unit_hint?: string;
  value: string;
}

type ControlledProps = {
  mode: 'controlled';
  tradeCategory?: string;
  variables?: PendingVariable[];
  onChange?: (variables: PendingVariable[]) => void;
  readOnly?: boolean;
};

type UncontrolledProps = {
  mode: 'uncontrolled';
  taskId: string;
  tradeCategory?: string;
};

export type VariableManagerProps = ControlledProps | UncontrolledProps;

// ── Helper: convert DB rows to PendingVariable array ────────────

export function jobVariablesToPending(
  rows: { variable_type_id: string; value: string; job_variable_types?: JobVariableType }[]
): PendingVariable[] {
  return rows.map((r) => ({
    variable_type_id: r.variable_type_id,
    variable_name: r.job_variable_types?.name ?? r.variable_type_id,
    unit_hint: r.job_variable_types?.unit_hint,
    value: r.value,
  }));
}

// ── Normalized shape for the variable list ──────────────────────

interface DisplayVar {
  key: string;
  removeId: string;       // type_id for controlled, DB row id for uncontrolled
  typeObj: JobVariableType;
  name: string;
  value: string;
  unit_hint?: string;
}

// ── Component ───────────────────────────────────────────────────

export default function VariableManager(props: VariableManagerProps) {
  const { mode, tradeCategory } = props;
  const taskId = mode === 'uncontrolled' ? props.taskId : undefined;

  const [types, setTypes] = useState<JobVariableType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<TaskVariable[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingType, setEditingType] = useState<JobVariableType | null>(null);
  const [valueInput, setValueInput] = useState('');
  const [savingValue, setSavingValue] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeUnitHint, setNewTypeUnitHint] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [creatingType, setCreatingType] = useState(false);

  useEffect(() => { loadTypes(); }, [tradeCategory]);
  useEffect(() => { if (taskId !== undefined) loadSaved(); }, [taskId]);

  async function loadTypes() {
    setLoading(true);
    const { data } = await supabase
      .from('job_variable_types')
      .select('*')
      .order('name');
    if (data) {
      const filtered = tradeCategory
        ? data.filter(
            (t: JobVariableType) => t.category === tradeCategory || t.category == null
          )
        : data;
      setTypes(filtered);
    }
    setLoading(false);
  }

  async function loadSaved() {
    setLoadingSaved(true);
    const { data } = await supabase
      .from('task_variables')
      .select('*, job_variable_types(*)')
      .eq('task_id', taskId)
      .order('created_at');
    if (data) setSaved(data);
    setLoadingSaved(false);
  }

  // ── Derive display variables ────────────────────────────────

  const pendingVars: PendingVariable[] =
    mode === 'controlled' ? (props.variables ?? []) : [];

  const displayVars: DisplayVar[] =
    mode === 'controlled'
      ? pendingVars.map((v) => ({
          key: v.variable_type_id,
          removeId: v.variable_type_id,
          typeObj:
            types.find((t) => t.id === v.variable_type_id) ?? {
              id: v.variable_type_id,
              name: v.variable_name,
              unit_hint: v.unit_hint,
              common_values: [],
              is_global: false,
              created_at: '',
            },
          name: v.variable_name,
          value: v.value,
          unit_hint: v.unit_hint,
        }))
      : saved.map((v) => ({
          key: v.id,
          removeId: v.id,
          typeObj:
            v.job_variable_types ?? {
              id: v.variable_type_id,
              name: v.variable_type_id,
              common_values: [],
              is_global: false,
              created_at: '',
            },
          name: v.job_variable_types?.name ?? v.variable_type_id,
          value: v.value,
          unit_hint: v.job_variable_types?.unit_hint,
        }));

  const usedTypeIds = new Set(displayVars.map((v) => v.typeObj.id));
  const unusedTypes = types.filter((t) => !usedTypeIds.has(t.id));

  // ── Interactions ────────────────────────────────────────────

  function openValueInput(type: JobVariableType) {
    setEditingType(type);
    const existingValue =
      mode === 'controlled'
        ? pendingVars.find((v) => v.variable_type_id === type.id)?.value ?? ''
        : saved.find((v) => v.variable_type_id === type.id)?.value ?? '';
    setValueInput(existingValue);
    setPickerOpen(false);
  }

  async function saveValue() {
    if (!editingType || !valueInput.trim()) return;

    if (mode === 'controlled') {
      const updated = pendingVars.filter(
        (v) => v.variable_type_id !== editingType.id
      );
      updated.push({
        variable_type_id: editingType.id,
        variable_name: editingType.name,
        unit_hint: editingType.unit_hint,
        value: valueInput.trim(),
      });
      props.onChange?.(updated);
    } else {
      setSavingValue(true);
      const existing = saved.find((v) => v.variable_type_id === editingType.id);
      if (existing) {
        await supabase
          .from('task_variables')
          .update({ value: valueInput.trim() })
          .eq('id', existing.id);
      } else {
        await supabase.from('task_variables').insert({
          task_id: taskId,
          variable_type_id: editingType.id,
          value: valueInput.trim(),
        });
      }
      setSavingValue(false);
      loadSaved();
    }

    setEditingType(null);
    setValueInput('');
  }

  async function removeVariable(removeId: string) {
    if (mode === 'controlled') {
      props.onChange?.(
        pendingVars.filter((v) => v.variable_type_id !== removeId)
      );
    } else {
      await supabase.from('task_variables').delete().eq('id', removeId);
      loadSaved();
    }
  }

  async function createVariableType() {
    if (!newTypeName.trim()) return;
    setCreatingType(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreatingType(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) {
      Alert.alert('Error', 'Could not find your company.');
      setCreatingType(false);
      return;
    }

    const { data: newType, error } = await supabase
      .from('job_variable_types')
      .insert({
        name: newTypeName.trim(),
        description: newTypeDesc.trim() || null,
        unit_hint: newTypeUnitHint.trim() || null,
        category: tradeCategory ?? null,
        common_values: [],
        is_global: false,
        company_id: profile.company_id,
        created_by: user.id,
      })
      .select()
      .single();

    setCreatingType(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    await loadTypes();
    setCreateOpen(false);
    setNewTypeName('');
    setNewTypeUnitHint('');
    setNewTypeDesc('');

    if (newType) openValueInput(newType as JobVariableType);
  }

  // ── Read-only display (controlled mode only) ────────────────

  if (mode === 'controlled' && props.readOnly) {
    if (pendingVars.length === 0) return null;
    return (
      <View style={styles.chipRow}>
        {pendingVars.map((v) => (
          <View key={v.variable_type_id} style={styles.chip}>
            <Text style={styles.chipLabel}>{v.variable_name}:</Text>
            <Text style={styles.chipValue}>{v.value}</Text>
            {v.unit_hint ? (
              <Text style={styles.chipUnit}> {v.unit_hint}</Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────

  const isLoading = loading || loadingSaved;
  const addLabel =
    mode === 'controlled' ? '+ Add job variable' : '+ Add variable';

  return (
    <View>
      {/* Variable list */}
      {displayVars.length > 0 && (
        <View style={styles.varList}>
          {displayVars.map((v) => (
            <View key={v.key} style={styles.varRow}>
              <View style={styles.varLeft}>
                <Text style={styles.varName}>{v.name}</Text>
                <Text style={styles.varValue}>
                  {v.value}{v.unit_hint ? ` ${v.unit_hint}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openValueInput(v.typeObj)}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeVariable(v.removeId)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add button */}
      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.addBtnText}>{addLabel}</Text>
        </TouchableOpacity>
      )}

      {/* Variable TYPE picker modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose a variable</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.pickerList}
            keyboardShouldPersistTaps="handled"
          >
            {unusedTypes.length === 0 && (
              <Text style={styles.emptyText}>
                All available variables have been added.
              </Text>
            )}

            {unusedTypes.map((item, idx) => (
              <View key={item.id}>
                {idx > 0 && <View style={styles.separator} />}
                <TouchableOpacity
                  style={styles.typeRow}
                  onPress={() => openValueInput(item)}
                >
                  <View style={styles.typeLeft}>
                    <Text style={styles.typeName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.typeDesc}>{item.description}</Text>
                    ) : null}
                    {item.category ? (
                      <Text style={styles.typeCategory}>{item.category}</Text>
                    ) : null}
                    {!item.is_global && (
                      <Text style={styles.typeCustomBadge}>Custom</Text>
                    )}
                  </View>
                  <Text style={styles.typeArrow}>›</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.separator} />
            <TouchableOpacity
              style={styles.createNewBtn}
              onPress={() => {
                setPickerOpen(false);
                setCreateOpen(true);
              }}
            >
              <Text style={styles.createNewBtnText}>+ Create new variable type</Text>
              <Text style={styles.createNewSubtext}>
                Saved to your company and available to your whole team
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* VALUE input modal */}
      <Modal
        visible={!!editingType}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingType(null)}
      >
        {editingType && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingType.name}</Text>
              <TouchableOpacity onPress={() => setEditingType(null)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.valueSheet}
              keyboardShouldPersistTaps="handled"
            >
              {editingType.description ? (
                <Text style={styles.typeDesc}>{editingType.description}</Text>
              ) : null}

              <Text style={styles.label}>
                Value{editingType.unit_hint ? ` (${editingType.unit_hint})` : ''}
              </Text>
              <TextInput
                style={styles.input}
                value={valueInput}
                onChangeText={setValueInput}
                placeholder={editingType.common_values?.[0] ?? 'Enter a value…'}
                placeholderTextColor={Colors.textMuted}
                autoFocus
                autoCapitalize="none"
              />

              {editingType.common_values?.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>
                    Common values
                  </Text>
                  <View style={styles.chipRow}>
                    {editingType.common_values.map((cv) => (
                      <TouchableOpacity
                        key={cv}
                        style={[
                          styles.commonChip,
                          valueInput === cv && styles.commonChipSelected,
                        ]}
                        onPress={() => setValueInput(cv)}
                      >
                        <Text
                          style={[
                            styles.commonChipText,
                            valueInput === cv && styles.commonChipTextSelected,
                          ]}
                        >
                          {cv}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!valueInput.trim() || savingValue) && styles.saveBtnDisabled,
                ]}
                onPress={saveValue}
                disabled={!valueInput.trim() || savingValue}
              >
                <Text style={styles.saveBtnText}>
                  {savingValue ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* CREATE NEW VARIABLE TYPE modal */}
      <Modal
        visible={createOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New variable type</Text>
            <TouchableOpacity onPress={() => setCreateOpen(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.valueSheet}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.createInfoText}>
              This variable type will be saved to your company and available to
              everyone on your team — on any task or job.
            </Text>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={newTypeName}
              onChangeText={setNewTypeName}
              placeholder="e.g. Bolt pattern, Pipe schedule, Panel brand"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

            <Text style={styles.label}>Unit hint (optional)</Text>
            <TextInput
              style={styles.input}
              value={newTypeUnitHint}
              onChangeText={setNewTypeUnitHint}
              placeholder="e.g. AWG, inches, tons"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={newTypeDesc}
              onChangeText={setNewTypeDesc}
              placeholder="Brief description shown in the picker"
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!newTypeName.trim() || creatingType) && styles.saveBtnDisabled,
              ]}
              onPress={createVariableType}
              disabled={!newTypeName.trim() || creatingType}
            >
              <Text style={styles.saveBtnText}>
                {creatingType ? 'Creating…' : 'Create & add value'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Chip display (read-only)
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: { color: Colors.textMuted, fontSize: 12, marginRight: 4 },
  chipValue: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
  chipUnit: { color: Colors.textMuted, fontSize: 11 },

  // Variable list (edit mode)
  varList: { gap: 8, marginBottom: 8 },
  varRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  varLeft: { flex: 1 },
  varName: { color: Colors.textSecondary, fontSize: 12 },
  varValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 2 },
  editBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  removeBtn: { padding: 4 },
  removeBtnText: { color: Colors.textMuted, fontSize: 16 },

  // Add button
  addBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },

  // Modal chrome
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  modalClose: { color: Colors.primary, fontSize: 16, fontWeight: '600' },

  // Type picker list
  pickerList: { padding: 16, paddingBottom: 48 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  typeLeft: { flex: 1 },
  typeName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  typeDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  typeCategory: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  typeCustomBadge: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  typeArrow: { color: Colors.textMuted, fontSize: 20, marginLeft: 8 },
  separator: { height: 1, backgroundColor: Colors.border },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Create new variable type button
  createNewBtn: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  createNewBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  createNewSubtext: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },
  createInfoText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
    backgroundColor: Colors.bgInput,
    borderRadius: 8,
    padding: 12,
  },

  // Value input sheet
  valueSheet: { padding: 20, gap: 12 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    padding: 16,
    color: Colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Common value chips
  commonChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.bgInput,
  },
  commonChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  commonChipText: { color: Colors.textSecondary, fontSize: 13 },
  commonChipTextSelected: { color: '#fff', fontWeight: '600' },

  // Save button
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
