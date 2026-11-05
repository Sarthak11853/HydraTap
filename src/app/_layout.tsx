import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '../components/Toast';
import { StickerTapLoggingProvider } from '../nfc/useTapToLog';
import { AppStoreProvider, useApp } from '../state/AppStore';
import { colors, spacing, type } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <ToastProvider>
          <StickerTapLoggingProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </StickerTapLoggingProvider>
        </ToastProvider>
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready, error, settings } = useApp();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  if (error) {
    return (
      <View style={styles.error}>
        <Text style={type.title}>Something went wrong</Text>
        <Text style={[type.body, { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' }]}>
          HydraTap couldn’t open its local database. Please restart the app.{'\n'}
          {error}
        </Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={settings.onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sticker" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ios-shortcut" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!settings.onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
});
