import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatMinutes } from '../domain/dates';
import { reminderSlots } from '../domain/reminders';
import type { ReminderSettings } from '../domain/types';
import { LIMITS } from '../domain/types';
import { colors, spacing, type } from '../theme';
import { ChipGroup, Divider, Stepper, ToggleRow } from './ui';

const intervalLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${(m / 60).toFixed(1)} h`);

/** Reminder enable / interval / window editor. Keeps start < end. */
export function ReminderEditor({
  value,
  onChange,
}: {
  value: ReminderSettings;
  onChange: (next: ReminderSettings) => void;
}) {
  const count = reminderSlots(value).length;
  const set = (patch: Partial<ReminderSettings>) => onChange({ ...value, ...patch });

  return (
    <View>
      <ToggleRow
        icon="bell"
        title="Water reminders"
        subtitle={value.enabled ? `${count} reminder${count === 1 ? '' : 's'} a day · paused once you hit your goal` : 'Off'}
        value={value.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      {value.enabled && (
        <>
          <Divider />
          <Text style={[type.caption, styles.label]}>Remind me every</Text>
          <ChipGroup options={LIMITS.reminderIntervals} value={value.intervalMin as (typeof LIMITS.reminderIntervals)[number]} onChange={(intervalMin) => set({ intervalMin })} format={intervalLabel} />

          <Text style={[type.caption, styles.label]}>From</Text>
          <Stepper
            value={value.startMin}
            onChange={(startMin) => set({ startMin, endMin: Math.max(value.endMin, startMin + 30) })}
            step={30}
            min={0}
            max={23 * 60}
            format={(m) => formatMinutes(m)}
          />
          <Text style={[type.caption, styles.label]}>Until</Text>
          <Stepper
            value={value.endMin}
            onChange={(endMin) => set({ endMin, startMin: Math.min(value.startMin, endMin - 30) })}
            step={30}
            min={30}
            max={23 * 60 + 30}
            format={(m) => formatMinutes(m)}
          />
          <Text style={[type.caption, { color: colors.textFaint, marginTop: spacing.md }]}>
            Reminders are delivered by your phone even when HydraTap is closed. A reminder is skipped if you drank
            recently.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
});
