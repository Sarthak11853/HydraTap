import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { OnboardingFrame } from '../../components/OnboardingFrame';
import { Card, ChipGroup, Stepper } from '../../components/ui';
import { formatVolume } from '../../domain/format';
import { LIMITS } from '../../domain/types';
import { useApp } from '../../state/AppStore';
import { colors, spacing, type } from '../../theme';

const PRESETS = [1500, 2000, 2500, 3000, 3500] as const;

export default function GoalStep() {
  const { settings, updateSettings } = useApp();
  const [goal, setGoal] = useState(settings.goalMl);

  return (
    <OnboardingFrame
      step={2}
      title={settings.name ? `Nice to meet you, ${settings.name}!` : 'Your daily goal'}
      subtitle="How much water would you like to drink each day? Most adults aim for 2–3 litres. You can change this any time."
      primary={{
        title: 'Continue',
        onPress: async () => {
          await updateSettings({ goalMl: goal });
          router.push('/onboarding/amount');
        },
      }}
    >
      <Card>
        <Text style={[type.caption, { textAlign: 'center' }]}>Daily goal</Text>
        <View style={{ marginVertical: spacing.lg }}>
          <Stepper large value={goal} onChange={setGoal} step={LIMITS.goal.step} min={LIMITS.goal.min} max={LIMITS.goal.max} format={formatVolume} />
        </View>
        <ChipGroup options={PRESETS} value={goal as (typeof PRESETS)[number]} onChange={setGoal} format={formatVolume} />
      </Card>
      <Text style={[type.caption, { color: colors.textFaint, marginTop: spacing.lg, textAlign: 'center' }]}>
        Needs vary with climate, activity and health. Ask a professional if unsure.
      </Text>
    </OnboardingFrame>
  );
}
