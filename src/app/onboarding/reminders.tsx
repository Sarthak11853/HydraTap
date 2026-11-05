import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';

import { OnboardingFrame } from '../../components/OnboardingFrame';
import { ReminderEditor } from '../../components/ReminderEditor';
import { Card } from '../../components/ui';
import { generateKey } from '../../domain/tag';
import { requestPermission } from '../../notifications/reminders';
import { useApp } from '../../state/AppStore';

export default function RemindersStep() {
  const { settings, updateSettings } = useApp();
  const [reminders, setReminders] = useState({ ...settings.reminders, enabled: true });
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      let next = reminders;
      if (reminders.enabled) {
        const granted = await requestPermission();
        if (!granted) {
          next = { ...reminders, enabled: false };
          Alert.alert('Notifications are off', 'You can enable reminders later in Settings after allowing notifications.');
        }
      }
      await updateSettings({
        reminders: next,
        shortcutKey: settings.shortcutKey || generateKey(),
        onboarded: true,
      });
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingFrame
      step={5}
      title="Gentle reminders"
      subtitle="Get a soft nudge through the day. HydraTap stops reminding you once your goal is reached."
      primary={{ title: 'Start hydrating', onPress: finish, loading: saving }}
    >
      <Card style={{ paddingVertical: 8 }}>
        <ReminderEditor value={reminders} onChange={setReminders} />
      </Card>
    </OnboardingFrame>
  );
}
