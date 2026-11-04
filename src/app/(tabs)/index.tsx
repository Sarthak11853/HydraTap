import { router } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon, IconName } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { sourceIcon } from '../../components/sources';
import { Button, Card, Screen } from '../../components/ui';
import { WaterBottle } from '../../components/WaterBottle';
import { formatClock, formatLongDate, greetingFor } from '../../domain/dates';
import { formatVolume, progressFraction, progressPercent, remainingMl } from '../../domain/format';
import { openNfcSettings } from '../../nfc/nfcService';
import { useNfcStatus, useScanToLog } from '../../nfc/useTapToLog';
import { useApp } from '../../state/AppStore';
import { colors, radius, spacing, type } from '../../theme';

export default function Home() {
  const { settings, today, logManual } = useApp();
  const nfcStatus = useNfcStatus();
  const { scan, scanning } = useScanToLog();
  const notify = useToast();

  const goal = settings.goalMl;
  const fraction = progressFraction(today.totalMl, goal);
  const percent = progressPercent(today.totalMl, goal);
  const remaining = remainingMl(today.totalMl, goal);
  const reached = today.totalMl >= goal;
  const now = new Date();
  const greeting = greetingFor(now);

  const showManual = settings.allowManualLogging || nfcStatus === 'unsupported';

  return (
    <Screen>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{formatLongDate(now)}</Text>
          <Text style={[type.heading, { color: colors.textMuted, marginTop: spacing.sm, fontWeight: '500' }]}>
            {greeting}
            {settings.name ? ',' : ''}
          </Text>
          {settings.name ? (
            <Text style={type.hero} numberOfLines={1} adjustsFontSizeToFit>
              {settings.name}
            </Text>
          ) : null}
        </View>
        <StatusChip />
      </Animated.View>

      <View style={styles.bottleArea}>
        <WaterBottle
          progress={fraction}
          goalReached={reached}
          width={176}
          label={`${percent}%`}
          sublabel={reached ? 'goal reached' : 'of daily goal'}
        />
      </View>

      {reached && (
        <Animated.View entering={FadeInDown.springify()} style={styles.goalBanner}>
          <Icon name="sparkle" size={18} color="#0F766E" />
          <Text style={[type.bodyStrong, { color: '#0F766E' }]}>Daily goal achieved — well done!</Text>
        </Animated.View>
      )}

      <View style={styles.stats}>
        <Stat label="Consumed" value={formatVolume(today.totalMl)} hint={`of ${formatVolume(goal)}`} />
        <Stat label="Remaining" value={formatVolume(remaining)} hint={remaining === 0 ? 'all done' : `${Math.ceil(remaining / settings.scanAmountMl)} taps`} />
        <Stat label="Progress" value={`${percent}%`} hint={`${today.entries.length} drink${today.entries.length === 1 ? '' : 's'}`} />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        {!settings.sticker && nfcStatus !== 'unsupported' ? (
          <ActionBlock
            icon="nfc"
            title="Register your sticker"
            text="Pair an NFC sticker on your bottle to log water with a tap."
            button={<Button title="Register sticker" icon="nfc" onPress={() => router.push('/sticker')} />}
          />
        ) : nfcStatus === 'disabled' && Platform.OS === 'android' ? (
          <ActionBlock
            icon="nfc"
            title="NFC is turned off"
            text="Turn on NFC to log water by tapping your sticker."
            button={<Button title="Open NFC settings" onPress={openNfcSettings} />}
          />
        ) : nfcStatus === 'unsupported' ? (
          <ActionBlock icon="info" title="No NFC on this device" text="Log your drinks manually below." />
        ) : Platform.OS === 'ios' ? (
          <ActionBlock
            icon="nfc"
            title={`Tap to log ${formatVolume(settings.scanAmountMl)}`}
            text="Tap the button, then hold the top of your iPhone near your bottle's sticker."
            button={<Button title="Scan sticker" icon="nfc" onPress={scan} loading={scanning} />}
          />
        ) : (
          <ActionBlock
            icon="nfc"
            title="Ready — tap your bottle"
            text={`Hold your phone against the sticker to log ${formatVolume(settings.scanAmountMl)}.${settings.sticker?.launcherWritten ? ' Works even when HydraTap is closed (phone unlocked).' : ''}`}
            live
            button={
              settings.sticker && !settings.sticker.launcherWritten ? (
                <Button
                  title="Enable tapping when the app is closed"
                  icon="sparkle"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/sticker', params: { mode: 'launcher' } })}
                />
              ) : undefined
            }
          />
        )}
        {showManual && (
          <Button
            title={`Add ${formatVolume(settings.scanAmountMl)} manually`}
            icon="plus"
            variant="secondary"
            onPress={async () => {
              const wasReached = reached;
              const entry = await logManual();
              const total = today.totalMl + entry.amountMl;
              notify(
                !wasReached && total >= goal
                  ? { tone: 'success', title: 'Daily goal reached! 🎉', message: 'Beautifully hydrated today.' }
                  : { tone: 'success', title: `+${formatVolume(entry.amountMl)} added 💧`, message: total < goal ? `${formatVolume(goal - total)} to go today` : undefined },
              );
            }}
            style={{ marginTop: spacing.md }}
          />
        )}
      </Card>

      {today.entries.length > 0 && (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[type.heading, { marginBottom: spacing.sm }]}>Today’s sips</Text>
          {today.entries.slice(0, 4).map((e) => (
            <View key={e.id} style={styles.entry}>
              <View style={styles.entryIcon}>
                <Icon name={sourceIcon[e.source]} size={16} color={colors.primaryDark} />
              </View>
              <Text style={[type.body, { flex: 1 }]}>{formatClock(e.createdAt)}</Text>
              <Text style={type.bodyStrong}>+{formatVolume(e.amountMl)}</Text>
            </View>
          ))}
          {today.entries.length > 4 && (
            <Button title="See full history" variant="ghost" onPress={() => router.push('/history')} />
          )}
        </Card>
      )}
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}, ${hint}`}>
      <Text style={type.micro}>{label.toUpperCase()}</Text>
      <Text style={[type.number, { fontSize: 19, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[type.caption, { fontSize: 12 }]} numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
}

function ActionBlock({ icon, title, text, button, live }: { icon: IconName; title: string; text: string; button?: React.ReactNode; live?: boolean }) {
  return (
    <View>
      <View style={styles.actionRow}>
        <View style={[styles.actionIcon, live && { backgroundColor: colors.cyanSoft }]}>
          <Icon name={icon} size={22} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{title}</Text>
          <Text style={[type.caption, { marginTop: 2, lineHeight: 18 }]}>{text}</Text>
        </View>
      </View>
      {button ? <View style={{ marginTop: spacing.md }}>{button}</View> : null}
    </View>
  );
}

function StatusChip() {
  const nfcStatus = useNfcStatus();
  const { settings } = useApp();
  const ok = nfcStatus === 'ready' && !!settings.sticker;
  return (
    <View style={[styles.chip, ok ? styles.chipOk : styles.chipOff]} accessibilityLabel={ok ? 'Sticker paired' : 'Sticker not ready'}>
      <View style={[styles.chipDot, { backgroundColor: ok ? colors.success : colors.textFaint }]} />
      <Text style={[type.caption, { fontSize: 12, color: ok ? '#0F766E' : colors.textMuted }]}>{ok ? 'Paired' : 'Not ready'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bottleArea: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  goalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  entryIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  chipOk: { backgroundColor: colors.successSoft },
  chipOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
});
