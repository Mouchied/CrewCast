import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }: Props) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity style={styles.dialog} activeOpacity={1}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  message: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
