import { Modal, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Button } from '../Button';
import { Input } from '../Input';
import type { JobEditHook } from '../../hooks/useJobEdit';

type Props = { hook: JobEditHook; jobUnit?: string };

export function EditJobModal({ hook, jobUnit }: Props) {
  const unit = jobUnit || 'items';
  const {
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
    saveEditJob,
  } = hook;

  return (
    <Modal
      visible={showEditJob}
      transparent
      animationType="slide"
      onRequestClose={() => setShowEditJob(false)}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Edit Job</Text>

          <Input label="Job name *" value={editName} onChangeText={setEditName} placeholder="Job name" />
          <Input
            label={`Total ${unit} *`}
            value={editTotalUnits}
            onChangeText={setEditTotalUnits}
            placeholder="e.g. 316"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>The total count of what you're building or installing — e.g. 316 panels, 500 ft of pipe, 24 homes. Every daily log tracks units completed against this number.</Text>

          <Input label="Default crew size" value={editCrewSize} onChangeText={setEditCrewSize} placeholder="e.g. 4" keyboardType="numeric" />
          <Input
            label="Bid man-hours"
            value={editBidHours}
            onChangeText={setEditBidHours}
            placeholder="e.g. 1584"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>Total labor hours in your bid/contract for this job.</Text>

          <Input
            label="Hours already used (starting offset)"
            value={editStartingHours}
            onChangeText={setEditStartingHours}
            placeholder="e.g. 320"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>Man-hours already burned before you started tracking in CrewCast. Used for accurate burn rate from day one.</Text>

          <Input
            label={`${unit.charAt(0).toUpperCase() + unit.slice(1)} already completed (starting offset)`}
            value={editStartingUnits}
            onChangeText={setEditStartingUnits}
            placeholder="e.g. 212"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>{unit.charAt(0).toUpperCase() + unit.slice(1)} done before you started logging. Progress bar and ETA will start from here.</Text>

          <Input label="Bid crew size" value={editBidCrewSize} onChangeText={setEditBidCrewSize} placeholder="e.g. 4" keyboardType="numeric" />
          <Input label="Start date" value={editStartDate} onChangeText={setEditStartDate} placeholder="YYYY-MM-DD" />
          <Input label="Target end date" value={editTargetEndDate} onChangeText={setEditTargetEndDate} placeholder="YYYY-MM-DD" />
          <Input label="Location name" value={editLocationName} onChangeText={setEditLocationName} placeholder="e.g. Midland, TX" />
          <Input label="Notes" value={editNotes} onChangeText={setEditNotes} placeholder="Any notes…" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />

          {!!editJobError && <Text style={styles.error}>{editJobError}</Text>}
          <View style={styles.btns}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => { setShowEditJob(false); setEditJobError(''); }}
              style={{ flex: 1 }}
            />
            <Button label="Save Changes" onPress={saveEditJob} loading={editSaving} style={{ flex: 1 }} />
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 10, marginTop: 80,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  hint: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: -4 },
  btns: { flexDirection: 'row', gap: 12 },
  error: {
    color: '#ef4444', fontSize: 13, fontWeight: '600',
    backgroundColor: '#ef444422', borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: '#ef4444',
  },
});
