import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { _registerToastListener } from '../lib/toast';
import { Colors } from '../constants/Colors';

type ToastState = {
  type: 'success' | 'error' | 'info';
  message: string;
} | null;

export function Toast() {
  const [toast, setToast] = useState<ToastState>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    _registerToastListener(({ type, message }) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animRef.current) animRef.current.stop();

      setToast({ type, message });
      opacity.setValue(0);

      animRef.current = Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]);
      animRef.current.start();

      timerRef.current = setTimeout(() => setToast(null), 3200);
    });
  }, []);

  if (!toast) return null;

  const bgColor =
    toast.type === 'error' ? Colors.danger :
    toast.type === 'success' ? Colors.success :
    Colors.info;

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor: bgColor }]}>
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    borderRadius: 12,
    padding: 14,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
