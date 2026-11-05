import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { OnboardingFrame } from '../../components/OnboardingFrame';
import { WaterBottle } from '../../components/WaterBottle';
import { useApp } from '../../state/AppStore';
import { colors, radius, spacing, type } from '../../theme';

export default function Welcome() {
  const { settings, updateSettings } = useApp();
  const [name, setName] = useState(settings.name);
  const trimmed = name.trim();

  const next = async () => {
    await updateSettings({ name: trimmed });
    router.push('/onboarding/goal');
  };

  return (
    <OnboardingFrame
      step={1}
      canGoBack={false}
      title="Welcome to HydraTap"
      subtitle="Tap your phone on your bottle's sticker and every sip is logged. Let's set things up — it takes a minute."
      primary={{ title: 'Continue', onPress: next, disabled: trimmed.length === 0 }}
    >
      <Text style={[type.caption, styles.label]}>What should we call you?</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoFocus
        maxLength={40}
        autoCapitalize="words"
        autoComplete="given-name"
        returnKeyType="next"
        onSubmitEditing={() => trimmed && next()}
        accessibilityLabel="Your name"
      />
      <View style={styles.hero}>
        <WaterBottle progress={0.55} goalReached={false} width={92} />
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing.xxl },
  label: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  input: {
    ...type.title,
    fontWeight: '600',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
