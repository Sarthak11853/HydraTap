import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { NfcDiagnostics } from '../../components/NfcDiagnostics';
import { ReminderEditor } from '../../components/ReminderEditor';
import { Button, Card, ChipGroup, Divider, Row, Screen, SectionTitle, Sheet, Stepper, ToggleRow } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { dayKey, formatDayLabel } from '../../domain/dates';
import { formatVolume } from '../../domain/format';
import { maskTagId } from '../../domain/tag';
import type { ReminderSettings } from '../../domain/types';
import { LIMITS } from '../../domain/types';
import { useNfcStatus } from '../../nfc/useTapToLog';
import { getPermissionStatus, requestPermission, sendTestReminder } from '../../notifications/reminders';
import { useApp } from '../../state/AppStore';
import { colors, radius, spacing, type } from '../../theme';

type SheetKind = null | 'name' | 'goal' | 'amount';

const GOAL_PRESETS = [1500, 2000, 2500, 3000, 3500] as const;
const AMOUNT_PRESETS = [150, 200, 250, 330, 500, 750, 1000] as const;

export default function SettingsScreen() {
  const { settings, updateSettings, resetApp } = useApp();
  const nfcStatus = useNfcStatus();
  const notify = useToast();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [draftName, setDraftName] = useState(settings.name);
  const [draftNum, setDraftNum] = useState(0);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    getPermissionStatus().then(setPermission).catch(() => undefined);
  }, [settings.reminders.enabled]);

  const open = (kind: SheetKind) => {
    if (kind === 'name') setDraftName(settings.name);
    if (kind === 'goal') setDraftNum(settings.goalMl);
    if (kind === 'amount') setDraftNum(settings.scanAmountMl);
    setSheet(kind);
  };

  const save = async () => {
    if (sheet === 'name' && draftName.trim()) await updateSettings({ name: draftName.trim() });
    if (sheet === 'goal') await updateSettings({ goalMl: draftNum });
    if (sheet === 'amount') await updateSettings({ scanAmountMl: draftNum });
    setSheet(null);
    notify({ tone: 'success', title: 'Saved', message: sheet === 'name' ? undefined : 'Applies from now on. Past entries are unchanged.' });
  };

  const changeReminders = async (next: ReminderSettings) => {
    if (next.enabled && !settings.reminders.enabled) {
      const granted = await requestPermission();
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) {
        Alert.alert('Notifications are blocked', 'Allow notifications for HydraTap in system settings to receive reminders.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
    }
    await updateSettings({ reminders: next });
  };

  const removeSticker = () =>
    Alert.alert('Remove sticker?', 'Taps will no longer log water until you register a sticker again. Your history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await updateSettings({ sticker: null });
          notify({ tone: 'info', title: 'Sticker removed' });
        },
      },
    ]);

  const confirmReset = () =>
    Alert.alert('Erase all data?', 'This deletes your profile, sticker and entire water history from this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase everything', style: 'destructive', onPress: () => resetApp() },
    ]);

  const sticker = settings.sticker;
  const dayLabel = sticker ? formatDayLabel(dayKey(sticker.registeredAt)) : '';
  const registeredOn = dayLabel === 'Today' || dayLabel === 'Yesterday' ? dayLabel.toLowerCase() : dayLabel;

  return (
    <Screen>
      <Text style={type.hero}>Settings</Text>

      <SectionTitle>Profile</SectionTitle>
      <Card style={styles.group}>
        <Row icon="user" title="Name" value={settings.name || 'Add name'} onPress={() => open('name')} />
      </Card>

      <SectionTitle>Hydration</SectionTitle>
      <Card style={styles.group}>
        <Row icon="target" title="Daily goal" value={formatVolume(settings.goalMl)} onPress={() => open('goal')} />
        <Divider />
        <Row icon="glass" title="Water per tap" value={formatVolume(settings.scanAmountMl)} onPress={() => open('amount')} />
        <Divider />
        <ToggleRow
          icon="plus"
          title="Manual logging"
          subtitle="Show an “Add manually” button on Home"
          value={settings.allowManualLogging || nfcStatus === 'unsupported'}
          onChange={(v) => updateSettings({ allowManualLogging: v })}
        />
      </Card>

      <SectionTitle>NFC sticker</SectionTitle>
      <Card style={styles.group}>
        {sticker ? (
          <>
            <Row icon="nfc" title="Registered sticker" subtitle={`ID ${maskTagId(sticker.uid)} · since ${registeredOn}`} />
            {Platform.OS === 'android' && (
              <>
                <Divider />
                <Row
                  icon="sparkle"
                  title="Logs when the app is closed"
                  subtitle="Tap with the screen on: the drink is logged in the background with a small alert. Nothing is written to the sticker."
                />
              </>
            )}
            {Platform.OS === 'ios' && (
              <>
                <Divider />
                <Row
                  icon="shortcut"
                  title="Tap without opening the app"
                  subtitle="Set up an iOS Shortcuts automation"
                  onPress={() => router.push('/ios-shortcut')}
                />
              </>
            )}
            <View style={styles.buttonRow}>
              <Button title="Replace" icon="nfc" variant="secondary" onPress={() => router.push('/sticker')} style={{ flex: 1 }} />
              <Button title="Remove" variant="danger" onPress={removeSticker} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <Row
              icon="nfc"
              title="No sticker registered"
              subtitle={nfcStatus === 'unsupported' ? 'This device has no NFC reader.' : 'Pair a sticker to log water with a tap.'}
            />
            {nfcStatus !== 'unsupported' && (
              <Button title="Register sticker" icon="nfc" onPress={() => router.push('/sticker')} style={{ marginBottom: spacing.md }} />
            )}
          </>
        )}
      </Card>

      {nfcStatus !== 'unsupported' && (
        <>
          <SectionTitle>Tap check</SectionTitle>
          <Card>
            <NfcDiagnostics />
          </Card>
        </>
      )}

      <SectionTitle>Reminders</SectionTitle>
      <Card style={[styles.group, { paddingBottom: spacing.lg }]}>
        <ReminderEditor value={settings.reminders} onChange={changeReminders} />
        {settings.reminders.enabled && permission !== 'granted' && (
          <Text style={[type.caption, { color: colors.danger, marginTop: spacing.md }]}>
            Notifications are not allowed for HydraTap, so reminders can’t be delivered.
          </Text>
        )}
        {settings.reminders.enabled && (
          <Button
            title="Send a test reminder"
            icon="bell"
            variant="secondary"
            style={{ marginTop: spacing.lg }}
            onPress={async () => {
              await sendTestReminder();
              notify({ tone: 'info', title: 'Test reminder in 3 seconds', message: 'Lock your phone to see it.' });
            }}
          />
        )}
      </Card>

      <SectionTitle>How tapping works</SectionTitle>
      <Card>
        <Text style={[type.caption, styles.info]}>
          {Platform.OS === 'ios'
            ? `• iPhone: tap “Scan sticker” on Home and hold the top of your phone near the sticker. iOS requires this for apps to read a sticker’s ID.\n• For tapping without opening the app, use a Shortcuts automation (above). It runs while your iPhone is unlocked.\n• Only your registered sticker is accepted. A second tap within ${LIMITS.scanCooldownMs / 1000} seconds is ignored.`
            : `• App open: just hold your phone to the sticker.\n• App closed or in the background: the drink is logged in the background with a small alert — HydraTap doesn’t open. Nothing is written to your sticker. This needs a blank sticker: if a sticker holds other data (like a website link), Android opens that instead.\n• Screen off: Android never reads NFC with the screen off — press the power button first.\n• Lock screen: works only if your phone lets NFC run while locked. Turn off “Require device unlock for NFC” (Settings → Connected devices → Connection preferences → NFC; on Samsung: Connections → NFC). Some phones don’t offer it.\n• Only your registered sticker counts. A second tap within ${LIMITS.scanCooldownMs / 1000} seconds is ignored.`}
        </Text>
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card style={styles.group}>
        <Row icon="drop" title="HydraTap" value={`v${Constants.expoConfig?.version ?? '1.0.0'}`} />
        <Divider />
        <Row icon="info" title="Private by design" subtitle="Works offline. No account, no servers — everything stays on this phone." />
        <Divider />
        <Row icon="trash" title="Erase all data" danger onPress={confirmReset} />
      </Card>

      <Sheet visible={sheet === 'name'} onClose={() => setSheet(null)} title="Your name">
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.textFaint}
          autoFocus
          maxLength={40}
          onSubmitEditing={save}
        />
        <Button title="Save" onPress={save} disabled={!draftName.trim()} style={{ marginTop: spacing.lg }} />
      </Sheet>

      <Sheet visible={sheet === 'goal' || sheet === 'amount'} onClose={() => setSheet(null)} title={sheet === 'goal' ? 'Daily goal' : 'Water per tap'}>
        <Stepper
          large
          value={draftNum}
          onChange={setDraftNum}
          step={sheet === 'goal' ? LIMITS.goal.step : LIMITS.scan.step}
          min={sheet === 'goal' ? LIMITS.goal.min : LIMITS.scan.min}
          max={sheet === 'goal' ? LIMITS.goal.max : LIMITS.scan.max}
          format={formatVolume}
        />
        <View style={{ marginTop: spacing.lg }}>
          {sheet === 'goal' ? (
            <ChipGroup options={GOAL_PRESETS} value={draftNum as (typeof GOAL_PRESETS)[number]} onChange={setDraftNum} format={formatVolume} />
          ) : (
            <ChipGroup options={AMOUNT_PRESETS} value={draftNum as (typeof AMOUNT_PRESETS)[number]} onChange={setDraftNum} format={formatVolume} />
          )}
        </View>
        <Text style={[type.caption, { marginTop: spacing.lg }]}>Changes apply from now on. Past entries keep their original values.</Text>
        <Button title="Save" onPress={save} style={{ marginTop: spacing.lg }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { paddingVertical: spacing.xs },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  info: { lineHeight: 20 },
  input: {
    ...type.title,
    fontWeight: '600',
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
