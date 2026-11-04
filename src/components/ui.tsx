import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, radius, shadow, spacing, type } from '../theme';
import { Icon, IconName } from './Icon';

export const tapFeedback = () => Haptics.selectionAsync().catch(() => undefined);

/* ---------------- Background ---------------- */

export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E3F4FF" />
            <Stop offset="0.45" stopColor="#F4FBFF" />
            <Stop offset="1" stopColor="#FFFFFF" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
      </Svg>
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
  edges = ['top'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <View style={styles.flex}>
      <Backdrop />
      <SafeAreaView style={styles.flex} edges={edges}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.screenContent, contentStyle]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.screenContent, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

/* ---------------- Card ---------------- */

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children.toUpperCase()}</Text>;
}

/* ---------------- Buttons ---------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.primaryDark;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ---------------- Chips ---------------- */

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  format = (v) => String(v),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={String(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              tapFeedback();
              onChange(opt);
            }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{format(opt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Stepper ---------------- */

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
  large,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
  large?: boolean;
}) {
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) {
      tapFeedback();
      onChange(next);
    }
  };
  return (
    <View style={styles.stepper}>
      <RoundButton icon="minus" onPress={() => set(value - step)} disabled={value <= min} label="Decrease" />
      <Text style={[large ? styles.stepperValueLarge : styles.stepperValue]} accessibilityLiveRegion="polite">
        {format(value)}
      </Text>
      <RoundButton icon="plus" onPress={() => set(value + step)} disabled={value >= max} label="Increase" />
    </View>
  );
}

function RoundButton({
  icon,
  onPress,
  disabled,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.round, disabled && { opacity: 0.35 }, pressed && { backgroundColor: colors.primarySoft }]}
    >
      <Icon name={icon} size={20} color={colors.primaryDark} strokeWidth={2.4} />
    </Pressable>
  );
}

/* ---------------- Rows ---------------- */

export function Row({
  icon,
  title,
  subtitle,
  value,
  onPress,
  right,
  danger,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const content = (
    <>
      {icon && (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : colors.primaryDark} />
        </View>
      )}
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Icon name="chevron" size={18} color={colors.textFaint} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      {content}
    </Pressable>
  );
}

export function ToggleRow(props: { icon?: IconName; title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row
      icon={props.icon}
      title={props.title}
      subtitle={props.subtitle}
      right={
        <Switch
          value={props.value}
          onValueChange={(v) => {
            tapFeedback();
            props.onChange(v);
          }}
          trackColor={{ true: colors.primary, false: '#D5E3EE' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D5E3EE"
        />
      }
    />
  );
}

export const Divider = () => <View style={styles.divider} />;

/* ---------------- Bottom sheet ---------------- */

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }]}>
          <View style={styles.sheetHandle} />
          <Text style={[type.title, { marginBottom: spacing.lg }]}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContent: { paddingHorizontal: spacing.xl - 4, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  sectionTitle: { ...type.micro, marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonPrimary: { backgroundColor: colors.primary, ...shadow },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonDanger: { backgroundColor: colors.dangerSoft },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },
  chipTextActive: { color: colors.onPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  stepperValue: { ...type.number, flex: 1, textAlign: 'center' },
  stepperValueLarge: { ...type.number, fontSize: 40, letterSpacing: -1, flex: 1, textAlign: 'center' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowValue: { ...type.body, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 48 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(11, 37, 69, 0.28)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
});
