import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { maskTagId } from '../domain/tag';
import type { StickerInfo } from '../domain/types';
import { cancelRead, NfcCancelledError, openNfcSettings, readTag } from '../nfc/nfcService';
import { useNfcStatus } from '../nfc/useTapToLog';
import { useApp } from '../state/AppStore';
import { colors, radius, spacing, type } from '../theme';
import { Icon } from './Icon';
import { Button, Card } from './ui';

type Phase = 'idle' | 'scanning' | 'done';

export function NfcPulse({ active, success }: { active: boolean; success?: boolean }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (active && !reduce) t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    else t.value = withTiming(0, { duration: 200 });
  }, [active, reduce, t]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.6 }], opacity: active ? 0.5 * (1 - t.value) : 0 }));
  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, ring]} />
      <View style={[styles.pulseCore, success && { backgroundColor: colors.success }]}>
        {success ? (
          <Animated.View entering={ZoomIn.springify()}>
            <Icon name="check" size={44} color="#fff" strokeWidth={3} />
          </Animated.View>
        ) : (
          <Icon name="nfc" size={44} color="#fff" strokeWidth={2.2} />
        )}
      </View>
    </View>
  );
}

/**
 * Register / replace the NFC sticker. Only its built-in ID is read (one quick tap);
 * nothing is ever written to the sticker. Calls `onRegistered` after saving.
 */
export function StickerRegistration({
  onRegistered,
  replacing = false,
}: {
  onRegistered?: (sticker: StickerInfo) => void;
  replacing?: boolean;
}) {
  const { settings, updateSettings } = useApp();
  const nfcStatus = useNfcStatus();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sticker: StickerInfo; sameAsBefore: boolean } | null>(null);

  useEffect(() => {
    if (nfcStatus === 'unsupported' && !settings.allowManualLogging) {
      updateSettings({ allowManualLogging: true }).catch(() => undefined);
    }
  }, [nfcStatus, settings.allowManualLogging, updateSettings]);

  const scan = async () => {
    setError(null);
    setPhase('scanning');
    try {
      const r = await readTag({
        alertMessage: 'Hold your iPhone near the sticker you want to register',
        validate: async () => ({ ok: true, message: 'Sticker registered ✓' }),
      });
      const sticker: StickerInfo = { uid: r.uid, registeredAt: Date.now() };
      const sameAsBefore = settings.sticker?.uid === r.uid;
      await updateSettings({ sticker });
      setResult({ sticker, sameAsBefore });
      setPhase('done');
      onRegistered?.(sticker);
    } catch (e) {
      setPhase('idle');
      if (!(e instanceof NfcCancelledError)) setError(String((e as Error)?.message ?? e));
    }
  };

  // Leaving the screen mid-scan must cancel the pending read; otherwise it would keep
  // swallowing taps until the next sticker tap.
  const scanningRef = useRef(false);
  useEffect(() => {
    scanningRef.current = phase === 'scanning';
  }, [phase]);
  useEffect(
    () => () => {
      if (scanningRef.current) void cancelRead();
    },
    [],
  );

  if (nfcStatus === 'unsupported') {
    return (
      <Card>
        <Text style={type.heading}>NFC isn’t available</Text>
        <Text style={[type.body, styles.muted]}>
          This device has no NFC reader (or it’s a simulator). You can still use HydraTap with manual logging — it’s
          been enabled for you.
        </Text>
      </Card>
    );
  }

  if (phase === 'done' && result) {
    return (
      <View style={styles.center}>
        <NfcPulse active={false} success />
        <Text style={[type.title, styles.centerText]}>
          {result.sameAsBefore ? 'Sticker re-registered' : replacing ? 'Sticker replaced!' : 'Sticker registered!'}
        </Text>
        <Text style={[type.caption, styles.centerText]}>ID {maskTagId(result.sticker.uid)}</Text>
        {Platform.OS === 'android' && (
          <Text style={[type.caption, styles.centerText, { marginTop: spacing.sm }]}>
            Nothing was written to your sticker. Taps also log in the background when HydraTap is closed.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.center}>
        <NfcPulse active={phase === 'scanning'} />
        <Text style={[type.heading, styles.centerText]}>
          {phase === 'scanning'
            ? Platform.OS === 'android'
              ? 'Ready to scan'
              : 'Scanning…'
            : replacing
              ? 'Scan your new sticker'
              : 'Register your sticker'}
        </Text>
        <Text style={[type.body, styles.muted, styles.centerText]}>
          {phase === 'scanning'
            ? 'Tap the back of your phone on the sticker.'
            : Platform.OS === 'ios'
              ? 'Stick it on your bottle, tap “Scan sticker”, then hold the top of your iPhone near it.'
              : 'Stick it on your bottle, tap “Scan sticker”, then tap the back of your phone on it. HydraTap only reads its ID — nothing is written.'}
        </Text>
      </View>

      {error && (
        <View style={styles.error}>
          <Icon name="info" size={18} color={colors.danger} />
          <Text style={[type.caption, { color: colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      )}

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        {nfcStatus === 'disabled' && Platform.OS === 'android' ? (
          <Button title="Turn on NFC" icon="nfc" onPress={openNfcSettings} />
        ) : phase === 'scanning' && Platform.OS === 'android' ? (
          <Button title="Cancel" variant="secondary" onPress={() => cancelRead()} />
        ) : (
          <Button title="Scan sticker" icon="nfc" onPress={scan} loading={phase === 'scanning'} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: spacing.md },
  centerText: { textAlign: 'center', marginTop: spacing.sm },
  muted: { color: colors.textMuted, marginTop: spacing.sm, lineHeight: 21 },
  pulseWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  pulseRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: colors.cyan },
  pulseCore: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: '#BDEBFF',
  },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
});
