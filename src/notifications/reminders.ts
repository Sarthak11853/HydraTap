import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import { formatVolume, remainingMl } from '../domain/format';
import { planReminders, reminderMessage } from '../domain/reminders';
import type { ReminderSettings } from '../domain/types';

/**
 * Local water reminders.
 *
 * Reminders are scheduled as one-shot, OS-managed notifications in a rolling window
 * (see domain/reminders.ts), so they fire with the app closed and need no background
 * task. Android channel sounds are immutable once created, hence the versioned id.
 */
export const REMINDER_CHANNEL_ID = 'hydration-reminders-v1';
const SOUND = 'water_drop.wav';
const REMINDER_TAG = 'hydratap-reminder';

let configured = false;

export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Water reminders',
      description: 'Gentle reminders to drink water',
      importance: AndroidImportance.DEFAULT,
      sound: SOUND,
      vibrationPattern: [0, 120, 80, 120],
      lightColor: '#22D3EE',
      enableVibrate: true,
    }).catch(() => undefined);
  }
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return res.granted;
}

async function cancelReminders() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((n) => n.content.data?.kind === REMINDER_TAG)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

let queue: Promise<void> = Promise.resolve();

/**
 * Re-plans the rolling reminder window. Serialised so overlapping calls
 * (e.g. a log and an app-foreground event) can't interleave.
 */
export function syncReminders(input: {
  settings: ReminderSettings;
  todayTotalMl: number;
  goalMl: number;
  lastIntakeAt: number | null;
}): Promise<void> {
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      await cancelReminders();
      if (!input.settings.enabled) return;
      const { granted } = await Notifications.getPermissionsAsync();
      if (!granted) return;

      const plan = planReminders({ now: Date.now(), ...input });
      const remaining = formatVolume(remainingMl(input.todayTotalMl, input.goalMl));
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        const { title, body } = reminderMessage(i, p.isToday, remaining);
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: SOUND,
            data: { kind: REMINDER_TAG },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: p.at,
            channelId: REMINDER_CHANNEL_ID,
          },
        });
      }
    });
  return queue;
}

export async function sendTestReminder(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to hydrate',
      body: 'This is how your HydraTap reminders will look and sound 💧',
      sound: SOUND,
      data: { kind: 'test' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

export async function cancelAllReminders(): Promise<void> {
  await cancelReminders();
}
