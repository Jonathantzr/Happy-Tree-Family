// components/CharacterFinder.js
// For people without a Chinese keyboard: type how a character sounds
// ("zhi"), then tap the right one from the choices. Folded away until opened.
// onPick(character) is called with the tapped character; suggestFrom is an
// optional English name whose parts ("Tan", "Zhi", "Ren") become shortcuts.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';
import { findCharacters, soundsIn } from '../lib/characterSounds';
import TextField from './TextField';

export default function CharacterFinder({ onPick, suggestFrom, style }) {
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState('');

  const shortcuts = soundsIn(suggestFrom);
  const choices = findCharacters(sound);
  const typed = sound.trim();

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="search-outline" size={18} color={colors.primary} />
        <Text style={styles.headerText}>No Chinese keyboard? Find a character by its sound</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {shortcuts.length ? (
            <View style={styles.shortcutRow}>
              {shortcuts.map((word) => (
                <Pressable
                  key={word}
                  style={({ pressed }) => [styles.shortcut, word === typed && styles.shortcutOn, pressed && styles.pressed]}
                  onPress={() => setSound(word)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.shortcutText, word === typed && styles.shortcutTextOn]}>{word}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextField
            placeholder="Type how it sounds, e.g. ming"
            value={sound}
            onChangeText={setSound}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ marginBottom: spacing.sm }}
          />
          {choices.length ? (
            <>
              <Text style={styles.hint}>Tap the one that looks right. Not sure? Ask an elder before saving.</Text>
              <View style={styles.grid}>
                {choices.map((char) => (
                  <Pressable
                    key={char}
                    style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                    onPress={() => {
                      onPick(char);
                      setSound(''); // ready for the next sound
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${char}`}
                  >
                    <Text style={styles.choiceText}>{char}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : typed ? (
            <Text style={styles.hint}>
              Nothing found for "{typed}". Try the Mandarin spelling (pinyin) of one sound at a time — or leave the Chinese out for now.
            </Text>
          ) : (
            <Text style={styles.hint}>One sound at a time: "wen", then "ming". The same sound has many characters, so you pick.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  pressed: { opacity: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.xs },
  headerText: { flex: 1, color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  body: { paddingHorizontal: spacing.sm + 4, paddingBottom: spacing.sm + 4 },
  shortcutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  shortcut: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  shortcutOn: { backgroundColor: colors.primary },
  shortcutText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  shortcutTextOn: { color: colors.textOnPrimary },
  hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minWidth: touchTarget, minHeight: touchTarget, paddingHorizontal: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  choiceText: { color: colors.text, fontSize: fontSize.xl },
});
