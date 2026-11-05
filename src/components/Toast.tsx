import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing, type } from '../theme';
import { Icon, IconName } from './Icon';

type Tone = 'success' | 'info' | 'warning' | 'error';

interface ToastData {
  id: number;
  title: string;
  message?: string;
  tone: Tone;
}

const ToastCtx = createContext<(t: Omit<ToastData, 'id'>) => void>(() => {});

const toneStyle: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
  success: { bg: colors.successSoft, fg: '#0F766E', icon: 'check' },
  info: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'drop' },
  warning: { bg: colors.warningSoft, fg: '#B45309', icon: 'info' },
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'info' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((t: Omit<ToastData, 'id'>) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    const fb =
      t.tone === 'success'
        ? Haptics.NotificationFeedbackType.Success
        : t.tone === 'error'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Warning;
    if (t.tone !== 'info') Haptics.notificationAsync(fb).catch(() => undefined);
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <View pointerEvents="none" style={[styles.host, { top: insets.top + spacing.sm }]}>
        {toast && (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.springify().damping(18)}
            exiting={FadeOutUp.duration(200)}
            style={[styles.toast, { backgroundColor: toneStyle[toast.tone].bg }]}
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
          >
            <View style={[styles.iconWrap, { backgroundColor: '#FFFFFFAA' }]}>
              <Icon name={toneStyle[toast.tone].icon} size={18} color={toneStyle[toast.tone].fg} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: toneStyle[toast.tone].fg }]}>{toast.title}</Text>
              {toast.message ? (
                <Text style={[type.caption, { color: toneStyle[toast.tone].fg, opacity: 0.85 }]}>{toast.message}</Text>
              ) : null}
            </View>
          </Animated.View>
        )}
      </View>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    ...shadow,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
