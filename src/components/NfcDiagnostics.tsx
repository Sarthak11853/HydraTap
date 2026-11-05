import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { formatClock } from '../domain/dates';
import { maskTagId } from '../domain/tag';
import {
  cancelRead,
  getLastTap,
  NfcCancelledError,
  readTag,
  stickerLink,
  subscribeTaps,
  TapOutcome,
  TapRecord,
} from '../nfc/nfcService';
import { useNfcStatus } from '../nfc/useTapToLog';
import { useApp } from '../state/AppStore';
import { colors, radius, spacing, type } from '../theme';
import { Button } from './ui';

const OUTCOME: Record<TapOutcome, { text: string; ok: boolean }> = {
  logged: { text: 'Logged ✓', ok: true },
  duplicate: { text: 'Ignored — tapped again within 8 s', ok: true },
  'unknown-tag': { text: 'Ignored — not your registered sticker', ok: false },
  'no-sticker': { text: 'Ignored — no sticker registered', ok: false },
  'no-id': { text: 'Tag had no readable ID', ok: false },
  'old-link': { text: 'Sticker has the old link — write the new one', ok: false },
  'bad-key': { text: 'Sticker link doesn’t match — write it again', ok: false },
  error: { text: 'Error while saving', ok: false },
};

const VIA: Record<TapRecord['via'], string> = {
  open: 'app open',
  closed: 'app opened by the sticker',
  scan: 'Scan button',
};

const STATUS_TEXT = { ready: 'On', disabled: 'Off — turn on NFC', unsupported: 'Not available', unknown: 'Checking…' } as const;

/** Shows what HydraTap saw on the last tap and can inspect the sticker (Android). */
export function NfcDiagnostics() {
  const { settings } = useApp();
  const nfcStatus = useNfcStatus();
  const [last, setLast] = useState<TapRecord | null>(getLastTap());
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ same: boolean; uid: string; link: boolean } | { error: string } | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => subscribeTaps(setLast), []);
  useEffect(
    () => () => {
      if (checkingRef.current) void cancelRead();
    },
    [],
  );

  const runCheck = async () => {
    setCheck(null);
    setChecking(true);
    checkingRef.current = true;
    try {
      const r = await readTag({ alertMessage: 'Hold your phone on the sticker', checkLink: stickerLink(settings.shortcutKey) });
      setCheck({ same: r.uid === settings.sticker?.uid, uid: r.uid, link: r.linkOk });
    } catch (e) {
      if (!(e instanceof NfcCancelledError)) setCheck({ error: String((e as Error)?.message ?? e) });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  return (
    <View>
      <Line label="NFC" value={STATUS_TEXT[nfcStatus]} ok={nfcStatus === 'ready'} />
      <Line
        label="Last tap"
        value={
          last
            ? `${formatClock(last.at)} · ${last.uid ? maskTagId(last.uid) : last.via === 'closed' ? 'sticker link' : 'no ID'} · ${VIA[last.via]}`
            : 'None since the app started'
        }
      />
      {last && <Line label="Result" value={OUTCOME[last.outcome].text} ok={OUTCOME[last.outcome].ok} />}

      {Platform.OS === 'android' && settings.sticker && (
        <>
          {check && 'error' in check && <Text style={[type.caption, styles.bad, { marginTop: spacing.sm }]}>{check.error}</Text>}
          {check && !('error' in check) && (
            <View style={styles.result}>
              <Line label="Sticker" value={check.same ? 'Your registered sticker ✓' : `Different sticker (${maskTagId(check.uid)})`} ok={check.same} />
              <Line
                label="HydraTap link"
                value={check.link ? 'On the sticker ✓ — closed-app tapping ready' : 'Missing — closed-app tapping won’t work'}
                ok={check.link}
              />
              {check.same && !check.link && (
                <Button
                  title="Write the link now"
                  icon="sparkle"
                  onPress={() => router.push({ pathname: '/sticker', params: { mode: 'launcher' } })}
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </View>
          )}
          {checking ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Text style={[type.caption, { textAlign: 'center' }]}>Hold your phone still on the sticker…</Text>
              <Button title="Cancel" variant="secondary" onPress={() => cancelRead()} />
            </View>
          ) : (
            <Button title="Check my sticker" icon="nfc" variant="secondary" onPress={runCheck} style={{ marginTop: spacing.md }} />
          )}
        </>
      )}
    </View>
  );
}

function Line({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[type.caption, styles.label]}>{label}</Text>
      <Text style={[type.caption, styles.value, ok === true && styles.good, ok === false && styles.bad]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: 6 },
  label: { width: 96, color: colors.textFaint },
  value: { flex: 1, color: colors.text },
  good: { color: '#0F766E', fontWeight: '600' },
  bad: { color: colors.danger, fontWeight: '600' },
  result: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTint },
});
