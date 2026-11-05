import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '../theme';

export function ModalHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Text style={type.heading}>{title}</Text>
      <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
        <Text style={[type.bodyStrong, { color: colors.primary }]}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
});
