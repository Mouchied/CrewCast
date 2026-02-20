/**
 * JobVariables — universal job variable picker and display
 *
 * Two modes:
 *  - edit: shows variable types filtered by trade category + lets user
 *    add/edit values, plus an "Add custom variable" escape hatch
 *  - display: shows saved variables as read-only chips
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import type { JobVariableType, JobVariable } from '../types';

// ── Types ─────────────────────────────────────────────────────

/** A pending variable (not yet saved) used while creating/editing a job */
export interface PendingVariable {
  variable_type_id: string;
  variable_name: string;   // denorm for display
  unit_hint?: string;
  value: string;
}

interface Props {
  /** Narrows the variable catalog to this trade (matches task_types.category) */
  tradeCategory?: string;
  /** Controlled: current variable values (display mode) or pending values (edit mode) */
  variables?: PendingVariable[];
  /** Called whenever the list changes (edit mode only) */
  onChange?: (variables: PendingVariable[]) => void;
  /** Read-only: renders chips, no editing */
  readOnly?: boolean;
}

// ── Main component ────────────────────────────────────────────

export default function JobVariables({
  tradeCategory,
  variables = [],
  onChange,
  readOnly = false,
}: Props) {
  const [types, setTypes] = useState<JobVariableType[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingType, setEditingType] = useState<JobVariableType | null>(null);
  const [valueInput, setValueInput] = useState('');

  // Load variable type catalog
  useEffect(() => {
    (async () => {
      let query = supabase
        .from('job_variable_types')
        .select('*')
        .order('name');

      // Show global + company types; filter by category if provided
      // (category = null in DB means the type applies to all trades)
      const { data } = await query;
      if (data) {
        const filtered = tradeCategory
          ? data.filter(
              (t: JobVariableType) =>
                t.category === tradeCategory || t.category == null
            )
          : data;
        setTypes(filtered);
      }
      setLoading(false);
    })();
  }, [tradeCategory]);

  // Types not yet added to this job
  const unusedTypes = types.filter(
    (t) => !variables.some((v) => v.variable_type_id === t.id)
  );

  function openPicker(type: JobVariableType) {
    setEditingType(type);
    const existing = variables.find((v) => v.variable_type_id === type.id);
    setValueInput(existing?.value ?? '');
    setPickerOpen(false); // close list picker
  }

  function saveValue() {
    if (!editingType || !valueInput.trim()) return;

    const updated = variables.filter(
      (v) => v.variable_type_id !== editingType.id
    );
    updated.push({
      variable_type_id: editingType.id,
      variable_name: editingType.name,
      unit_hint: editingType.unit_hint,
      value: valueInput.trim(),
    });
    onChange?.(updated);
    setEditingType(null);
    setValueInput('');
  }

  function removeVariable(typeId: string) {
    onChange?.(variables.filter((v) => v.variable_type_id !== typeId));
  }

  // ── Read-only display ─────────────────────────────────────

  if (readOnly) {
    if (variables.length === 0) return null;
    return (
      <View style={styles.chipRow}>
        {variables.map((v) => (
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

  // ── Edit mode ─────────────────────────────────────────────

  return (
    <View>
      {/* Added variables */}
      {variables.length > 0 && (
        <View style={styles.addedList}>
          {variables.map((v) => (
            <View key={v.variable_type_id} style={styles.addedRow}>
              <View style={styles.addedLeft}>
                <Text style={styles.addedName}>{v.variable_name}</Text>
                <Text style={styles.addedValue}>
                  {v.value}
                  {v.unit_hint ? ` ${v.unit_hint}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() =>
                  openPicker(
                    types.find((t) => t.id === v.variable_type_id) ?? {
                      id: v.variable_type_id,
                      name: v.variable_name,
                      unit_hint: v.unit_hint,
                      common_values: [],
                      is_global: false,
                      created_at: '',
                    }
                  )
                }
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeVariable(v.variable_type_id)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add variable button */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.addBtnText}>+ Add job variable</Text>
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

          {unusedTypes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                All available variables have been added.
              </Text>
            </View>
          ) : (
            <FlatList
              data={unusedTypes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.typeRow}
                  onPress={() => openPicker(item)}
                >
                  <View style={styles.typeLeft}>
                    <Text style={styles.typeName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.typeDesc}>{item.description}</Text>
                    ) : null}
                    {item.category ? (
                      <Text style={styles.typeCategory}>{item.category}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.typeArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
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
                Value
                {editingType.unit_hint
                  ? ` (${editingType.unit_hint})`
                  : ''}
              </Text>
              <TextInput
                style={styles.input}
                value={valueInput}
                onChangeText={setValueInput}
                placeholder={
                  editingType.common_values[0] ?? 'Enter a value…'
                }
                placeholderTextColor={Colors.textMuted}
                autoFocus
                autoCapitalize="none"
              />

              {/* Common value autocomplete chips */}
              {editingType.common_values.length > 0 && (
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
                  !valueInput.trim() && styles.saveBtnDisabled,
                ]}
                onPress={saveValue}
                disabled={!valueInput.trim()}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ── Helper: convert DB rows to PendingVariable array ──────────

/** Convert saved JobVariable rows (with joined type) to PendingVariable[] */
export function jobVariablesToPending(rows: JobVariable[]): PendingVariable[] {
  return rows.map((r) => ({
    variable_type_id: r.variable_type_id,
    variable_name: r.job_variable_types?.name ?? r.variable_type_id,
    unit_hint: r.job_variable_types?.unit_hint,
    value: r.value,
  }));
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

  // Added variables list (edit mode)
  addedList: { gap: 8, marginBottom: 8 },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  addedLeft: { flex: 1 },
  addedName: { color: Colors.textSecondary, fontSize: 12 },
  addedValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 2 },
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
  typeArrow: { color: Colors.textMuted, fontSize: 20, marginLeft: 8 },
  separator: { height: 1, backgroundColor: Colors.border },

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
  commonChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
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

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', fontSize: 14 },
});

