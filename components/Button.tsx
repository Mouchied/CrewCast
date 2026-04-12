import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
  type TouchableOpacityProps,
} from 'react-native';
import { Colors } from '../constants/Colors';

type Variant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      disabled={isDisabled}
      activeOpacity={0.75}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? Colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  disabled: { opacity: 0.6 },

  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  destructive: { backgroundColor: Colors.danger },

  label: { fontWeight: '700', fontSize: 16 },
  primaryLabel: { color: '#fff' },
  secondaryLabel: { color: Colors.primary },
  destructiveLabel: { color: '#fff' },
});
