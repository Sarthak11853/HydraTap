import { router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '../theme';
import { Icon } from './Icon';
import { Backdrop, Button } from './ui';

export const ONBOARDING_STEPS = 5;

export function OnboardingFrame({
  step,
  title,
  subtitle,
  children,
  primary,
  secondary,
  canGoBack = true,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  primary?: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean };
  secondary?: { title: string; onPress: () => void };
  canGoBack?: boolean;
}) {
  return (
    <View style={styles.flex}>
      <Backdrop />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {/* Android draws edge-to-edge, so the window no longer resizes for the keyboard; pad on both platforms. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <View style={styles.header}>
            {canGoBack && router.canGoBack() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()} style={styles.back}>
                <View style={{ transform: [{ rotate: '180deg' }] }}>
                  <Icon name="chevron" size={22} color={colors.primaryDark} />
                </View>
              </Pressable>
            ) : (
              <View style={styles.back} />
            )}
            <View style={styles.dots} accessibilityLabel={`Step ${step} of ${ONBOARDING_STEPS}`}>
              {Array.from({ length: ONBOARDING_STEPS }, (_, i) => (
                <View key={i} style={[styles.dot, i + 1 === step && styles.dotActive, i + 1 < step && styles.dotDone]} />
              ))}
            </View>
            <View style={styles.back} />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Text style={type.hero}>{title}</Text>
            {subtitle ? <Text style={[type.body, styles.subtitle]}>{subtitle}</Text> : null}
            <View style={styles.content}>{children}</View>
          </ScrollView>

          <View style={styles.footer}>
            {primary && <Button {...primary} />}
            {secondary && <Button variant="ghost" {...secondary} />}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  dotDone: { backgroundColor: colors.waterLight },
  body: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  subtitle: { color: colors.textMuted, marginTop: spacing.sm, lineHeight: 22 },
  content: { marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.xs },
});
