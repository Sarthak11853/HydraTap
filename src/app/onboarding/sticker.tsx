import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView } from 'react-native';

import { OnboardingFrame } from '../../components/OnboardingFrame';
import { StickerRegistration } from '../../components/StickerRegistration';
import { useNfcStatus } from '../../nfc/useTapToLog';
import { useApp } from '../../state/AppStore';

export default function StickerStep() {
  const { settings } = useApp();
  const nfcStatus = useNfcStatus();
  const [registered, setRegistered] = useState(false);
  const next = () => router.push('/onboarding/reminders');

  return (
    <OnboardingFrame
      step={4}
      title="Pair your NFC sticker"
      subtitle="HydraTap only counts taps from the sticker you register here — any other tag is ignored."
      primary={registered || nfcStatus === 'unsupported' ? { title: 'Continue', onPress: next } : undefined}
      secondary={!registered && nfcStatus !== 'unsupported' ? { title: settings.sticker ? 'Keep current sticker' : 'Skip for now', onPress: next } : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <StickerRegistration onRegistered={() => setRegistered(true)} replacing={!!settings.sticker} />
      </ScrollView>
    </OnboardingFrame>
  );
}
