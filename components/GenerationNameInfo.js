// components/GenerationNameInfo.js
// "What is a generation name?" — a small link that opens a bottom sheet
// explaining the idea with a made-up family, and then with the reader's own
// name when the app can guess it (example = guessGenerationName() in
// lib/nameBook.js, or null).

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';
import AppButton from './AppButton';

// A name with one part picked out, e.g. Lee [Wen] Ming
function NameLine({ before, word, after, note }) {
  return (
    <View style={styles.nameLine}>
      <Text style={styles.nameText}>
        {before}
        <Text style={styles.nameMark}>{word}</Text>
        {after}
      </Text>
      {note ? <Text style={styles.nameNote}>{note}</Text> : null}
    </View>
  );
}

export default function GenerationNameInfo({ example, style }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // "Jon Tan Zhi Ren" with "Zhi" picked out
  let own = null;
  if (example) {
    const words = example.name.split(' ');
    const at = words.lastIndexOf(example.word);
    own = {
      before: at > 0 ? `${words.slice(0, at).join(' ')} ` : '',
      after: at < words.length - 1 ? ` ${words.slice(at + 1).join(' ')}` : '',
    };
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.link, pressed && styles.pressed, style]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.linkText}>What is a generation name?</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          {/* the dark area closes the sheet; it sits BEHIND the sheet rather than around it, so it can't swallow the scrolling */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.sheetContent}>
              <Text style={styles.title}>What is a generation name?</Text>
              <Text style={styles.text}>
                In many Chinese families, a name has three parts: the family name, a name shared by everyone in the same generation, and a
                name that is yours alone.
              </Text>

              <Text style={styles.subtitle}>An example family</Text>
              <View style={styles.box}>
                <NameLine before="Lee " word="Wen" after=" Ming" />
                <NameLine before="Lee " word="Wen" after=" Hua" note="his brother" />
                <NameLine before="Lee " word="Wen" after=" Jie" note="his cousin (dad's side)" />
              </View>
              <Text style={styles.text}>
                All three share <Text style={styles.bold}>Wen</Text>. That is their generation name. Their fathers all share a different
                one, and their children will share the next one. The family's name book lists them in order.
              </Text>

              {own ? (
                <>
                  <Text style={styles.subtitle}>Your name</Text>
                  <View style={styles.box}>
                    <NameLine before={own.before} word={example.word} after={own.after} />
                  </View>
                  <Text style={styles.text}>
                    {example.sure
                      ? `Your generation name looks like ${example.word} — others in your generation have it in their names too.`
                      : `Your generation name is probably ${example.word}. Check: do your brothers, sisters or cousins on your dad's side have it in their names too? If they share a different part, that part is the generation name.`}
                  </Text>
                </>
              ) : null}

              <Text style={styles.subtitle}>What to type</Text>
              <Text style={styles.text}>
                Only the shared part — one word for each generation, oldest first. Not anyone's full name.{'\n'}
                {example ? `For example: your dad's generation name, then ${example.word}, then your children's.` : "For example: your dad's generation name, then yours, then your children's."}
              </Text>
              <Text style={styles.text}>
                Don't know them all? Add the ones you know. Not every family has generation names, and in some only the sons do — if yours
                doesn't, you can skip this.
              </Text>
              <AppButton title="Got it" onPress={() => setOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: touchTarget, alignSelf: 'flex-start' },
  linkText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  scroll: { flexGrow: 0 },
  sheetContent: { padding: spacing.md, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  subtitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.sm, marginBottom: spacing.sm },
  text: { color: colors.text, fontSize: fontSize.sm, lineHeight: 21, marginBottom: spacing.md },
  bold: { fontWeight: fontWeight.bold, color: colors.primary },
  box: { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  nameLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  nameText: { color: colors.text, fontSize: fontSize.lg },
  nameMark: { color: colors.primary, fontWeight: fontWeight.bold, backgroundColor: colors.primarySoft },
  nameNote: { color: colors.textMuted, fontSize: fontSize.sm },
});
