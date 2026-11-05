import React from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '../components/ModalHeader';
import { Backdrop, Button, Card } from '../components/ui';
import { stickerLink } from '../nfc/nfcService';
import { useApp } from '../state/AppStore';
import { colors, radius, spacing, type } from '../theme';

const STEPS = [
  'Open the Shortcuts app → Automation → New Automation (+).',
  'Choose “NFC”, tap Scan and hold your iPhone near your HydraTap sticker. Name it “HydraTap”.',
  'Select “Run Immediately” (turn off “Ask Before Running”) and tap Next.',
  'Create a new shortcut with the “Open URLs” action and paste the link below.',
  'Done! Tapping the sticker with your iPhone unlocked now opens HydraTap and logs your drink.',
];

/**
 * iOS cannot hand third-party apps a sticker's UID in the background, and Background
 * Tag Reading only supports Universal Links. Apple's own Shortcuts app can, however,
 * trigger on a specific NFC tag — so HydraTap exposes a secret deep link for it.
 */
export default function IosShortcutScreen() {
  const { settings } = useApp();
  const url = stickerLink(settings.shortcutKey);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ModalHeader title="Tap without opening the app" />
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0 }}>
          <Text style={[type.body, { color: colors.textMuted, lineHeight: 22 }]}>
            iOS only lets apps read NFC stickers while they show the scan sheet. Apple’s Shortcuts app can react to
            your sticker on its own — let it open HydraTap for you.
          </Text>

          <Card style={{ marginTop: spacing.lg }}>
            {STEPS.map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.num}>
                  <Text style={styles.numText}>{i + 1}</Text>
                </View>
                <Text style={[type.body, { flex: 1, lineHeight: 21 }]}>{s}</Text>
              </View>
            ))}
          </Card>

          <Text style={[type.micro, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>YOUR PERSONAL LINK</Text>
          <View style={styles.urlBox}>
            <Text selectable style={styles.url}>
              {url}
            </Text>
          </View>
          <Button title="Share / copy link" icon="shortcut" onPress={() => Share.share({ message: url })} style={{ marginTop: spacing.md }} />
          <Text style={[type.caption, { marginTop: spacing.md, lineHeight: 19 }]}>
            Notes: the automation identifies your sticker inside Shortcuts, and the link contains a private key so other
            links can’t add water. iOS may show a brief banner when the automation runs. Automations generally don’t
            run while the iPhone is locked. A second tap within a few seconds is ignored.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontWeight: '700', color: colors.primaryDark },
  urlBox: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  url: { fontFamily: 'Courier', fontSize: 14, color: colors.primaryDark },
});
