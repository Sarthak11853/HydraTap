import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { OnboardingFrame } from '../../components/OnboardingFrame';
import { Card, ChipGroup, Stepper } from '../../components/ui';
import { formatVolume } from '../../domain/format';
import { LIMITS } from '../../domain/types';
import { useApp } from '../../state/AppStore';
import { colors, spacing, type } from '../../theme';

const PRESETS = [150, 200, 250, 330, 500, 750, 1000] as const;

export default function AmountStep() {
  const { settings, updateSettings } = useApp();
  const [amount, setAmount] = useState(settings.scanAmountMl);
  const taps = Math.ceil(settings.goalMl / amount);

  return (
    <OnboardingFrame
      step={3}
      title="Water per tap"
      subtitle="How much do you drink each time you tap the sticker? Usually the size of your glass or bottle."
      primary={{
        title: 'Continue',
        onPress: async () => {
          await updateSettings({ scanAmountMl: amount });
          router.push('/onboarding/sticker');
        },
      }}
    >
      <Card>
        <Text style={[type.caption, { textAlign: 'center' }]}>Each tap logs</Text>
        <View style={{ marginVertical: spacing.lg }}>
          <Stepper large value={amount} onChange={setAmount} step={LIMITS.scan.step} min={LIMITS.scan.min} max={LIMITS.scan.max} format={formatVolume} />
        </View>
        <ChipGroup options={PRESETS} value={amount as (typeof PRESETS)[number]} onChange={setAmount} format={formatVolume} />
      </Card>
      <Text style={[type.body, { color: colors.textMuted, marginTop: spacing.lg, textAlign: 'center' }]}>
        About <Text style={{ fontWeight: '700', color: colors.primaryDark }}>{taps} taps</Text> to reach {formatVolume(settings.goalMl)}
      </Text>
    </OnboardingFrame>
  );
}
