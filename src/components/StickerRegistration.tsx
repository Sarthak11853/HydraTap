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

import { generateKey, maskTagId } from '../domain/tag';
import type { StickerInfo } from '../domain/types';
import { LINK_VERSION } from '../domain/types';
import { cancelRead, NfcCancelledError, openNfcSettings, readTag, stickerLink } from '../nfc/nfcService';
import { useNfcStatus } from '../nfc/useTapToLog';
import { useApp } from '../state/AppStore';
import { colors, radius, spacing, type } from '../theme';
import { Icon } from './Icon';
import { Button, Card, ToggleRow } from './ui';

type Phase = 'idle' | 'scanning' | 'needsLauncher' | 'done';

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
 * Register / replace the NFC sticker. Calls `onRegistered` after a successful
 * save; the parent decides where to go next.
 *
 * `mode="launcher"` (Android) skips registration and only writes the HydraTap
 * launch link onto the already-registered sticker, enabling closed-app logging.
 */
export function StickerRegistration({
  onRegistered,
  replacing = false,
  compact = false,
  mode = 'register',
}: {
  onRegistered?: (sticker: StickerInfo) => void;
  replacing?: boolean;
  compact?: boolean;
  mode?: 'register' | 'launcher';
}) {
  const { settings, updateSettings } = useApp();
  const nfcStatus = useNfcStatus();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [writeLauncher, setWriteLauncher] = useState(Platform.OS === 'android');
  const [result, setResult] = useState<{ sticker: StickerInfo; sameAsBefore: boolean } | null>(null);
  const launcherOnly = mode === 'launcher';

  useEffect(() => {
    if (nfcStatus === 'unsupported' && !settings.allowManualLogging) {
      updateSettings({ allowManualLogging: true }).catch(() => undefined);
    }
  }, [nfcStatus, settings.allowManualLogging, updateSettings]);

  /** The secret-key link written to the sticker (key created on first use). */
  const linkForSticker = async (): Promise<string> => {
    let key = settings.shortcutKey;
    if (!key) {
      key = generateKey();
      await updateSettings({ shortcutKey: key });
    }
    return stickerLink(key);
  };

  /** Writes the launch link onto the given (already registered) sticker. */
  const writeLink = async (sticker: StickerInfo) => {
    setError(null);
    setPhase('scanning');
    try {
      const link = await linkForSticker();
      const r = await readTag({ alertMessage: 'Hold your phone on the sticker', writeLink: link, expectUid: sticker.uid });
      if (!r.linkOk) {
        setError(r.linkError ?? 'The HydraTap link could not be written.');
        setPhase('needsLauncher');
        return;
      }
      const next = { ...sticker, launcherWritten: true, linkVersion: LINK_VERSION };
      await updateSettings({ sticker: next });
      setResult({ sticker: next, sameAsBefore: true });
      setPhase('done');
    } catch (e) {
      setPhase(launcherOnly ? 'idle' : 'needsLauncher');
      if (!(e instanceof NfcCancelledError)) setError(String((e as Error)?.message ?? e));
    }
  };

  const scan = async () => {
    if (launcherOnly && settings.sticker) return writeLink(settings.sticker);
    setError(null);
    setPhase('scanning');
    try {
      const wantLink = Platform.OS === 'android' && writeLauncher;
      const r = await readTag({
        alertMessage: 'Hold your iPhone near the sticker you want to register',
        writeLink: wantLink ? await linkForSticker() : undefined,
        validate: async () => ({ ok: true, message: 'Sticker registered ✓' }),
      });
      const sticker: StickerInfo = {
        uid: r.uid,
        registeredAt: Date.now(),
        launcherWritten: r.linkOk,
        linkVersion: r.linkOk ? LINK_VERSION : undefined,
      };
      const sameAsBefore = settings.sticker?.uid === r.uid;
      await updateSettings({ sticker });
      setResult({ sticker, sameAsBefore });
      onRegistered?.(sticker);
      if (wantLink && !r.linkOk) {
        // Registered, but closed-app tapping isn't set up yet: offer a retry.
        setError(r.linkError ?? 'The HydraTap link could not be written.');
        setPhase('needsLauncher');
      } else {
        setPhase('done');
      }
    } catch (e) {
      setPhase('idle');
      if (!(e instanceof NfcCancelledError)) setError(String((e as Error)?.message ?? e));
    }
  };

  // Leaving the screen mid-scan must cancel the pending read; otherwise it would keep
  // swallowing taps (and block Home-screen logging) until the next sticker tap.
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

  const cancel = async () => {
    await cancelRead();
  };

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
          {launcherOnly
            ? 'Closed-app tapping is on!'
            : result.sameAsBefore
              ? 'Sticker re-registered'
              : replacing
                ? 'Sticker replaced!'
                : 'Sticker registered!'}
        </Text>
        <Text style={[type.caption, styles.centerText]}>ID {maskTagId(result.sticker.uid)}</Text>
        {Platform.OS === 'android' && result.sticker.launcherWritten && (
          <Text style={[type.caption, styles.centerText, { marginTop: spacing.sm }]}>
            Tap-to-log now works even when HydraTap is closed (phone unlocked).
          </Text>
        )}
      </View>
    );
  }

  if (phase === 'needsLauncher' && result) {
    return (
      <View>
        <View style={styles.center}>
          <NfcPulse active={false} success />
          <Text style={[type.title, styles.centerText]}>Sticker registered</Text>
          <Text style={[type.caption, styles.centerText]}>ID {maskTagId(result.sticker.uid)}</Text>
        </View>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={type.heading}>One more step for closed-app tapping</Text>
          <Text style={[type.body, styles.muted]}>
            {error ?? 'The HydraTap link could not be written.'} Until then, taps only log while HydraTap is open.
          </Text>
        </Card>
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Button title="Try writing again" icon="nfc" onPress={() => writeLink(result.sticker)} />
          <Button title="Skip — only log while the app is open" variant="ghost" onPress={() => setPhase('done')} />
        </View>
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
            : launcherOnly
              ? 'Enable closed-app tapping'
              : replacing
                ? 'Scan your new sticker'
                : 'Register your sticker'}
        </Text>
        <Text style={[type.body, styles.muted, styles.centerText]}>
          {phase === 'scanning'
            ? Platform.OS === 'android' && (writeLauncher || launcherOnly)
              ? 'Hold the back of your phone still on the sticker for about 2 seconds while HydraTap writes to it.'
              : 'Hold the back of your phone against the sticker until it vibrates.'
            : launcherOnly
              ? 'HydraTap writes a small link onto your registered sticker so Android opens HydraTap when you tap it, even when the app is closed. Tap “Scan sticker” and hold your phone still on it.'
              : Platform.OS === 'ios'
              ? 'Stick it on your bottle, tap “Scan sticker”, then hold the top of your iPhone near it.'
              : 'Stick it on your bottle, tap “Scan sticker”, then hold the back of your phone near it.'}
        </Text>
      </View>

      {!compact && !launcherOnly && Platform.OS === 'android' && phase === 'idle' && (
        <Card style={{ marginTop: spacing.lg, paddingVertical: spacing.xs }}>
          <ToggleRow
            icon="sparkle"
            title="Log even when the app is closed"
            subtitle="Writes a small HydraTap link onto the sticker (replaces existing sticker content)."
            value={writeLauncher}
            onChange={setWriteLauncher}
          />
        </Card>
      )}

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
          <Button title="Cancel" variant="secondary" onPress={cancel} />
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
