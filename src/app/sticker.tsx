import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '../components/ModalHeader';
import { StickerRegistration } from '../components/StickerRegistration';
import { Backdrop, Button } from '../components/ui';
import { useApp } from '../state/AppStore';
import { spacing } from '../theme';

/** Register a first sticker, or replace the current one. */
export default function StickerScreen() {
  const { settings } = useApp();
  const [replacing] = useState(!!settings.sticker);
  const [done, setDone] = useState(false);
  const title = replacing ? 'Replace sticker' : 'Register sticker';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ModalHeader title={title} />
        <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
          <StickerRegistration replacing={replacing} onRegistered={() => setDone(true)} />
          {done && <Button title="Done" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
