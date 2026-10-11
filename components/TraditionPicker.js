// components/TraditionPicker.js
// "Family traditions" — optional, and folded away until opened, so a family
// that has no use for it (most families outside Asia) never has to look at
// it. Tick any that apply (mixed families can tick more than one), or none.
// "Something else?" lets a family name one that isn't listed — that is their
// request to the developers to add it.
// Used when a family is created (HomeScreen) and in Family settings.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';
import { TRADITIONS } from '../lib/traditions';
import TextField from './TextField';

export default function TraditionPicker({ value, onChange, other, onOtherChange, disabled = false, startOpen = false, style }) {
  const [open, setOpen] = useState(startOpen || value.length > 0 || !!(other || '').trim());
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  const picked = TRADITIONS.filter((t) => value.includes(t.key)).map((t) => t.label);
  if ((other || '').trim()) picked.push(other.trim());

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Family traditions (optional)</Text>
          <Text style={styles.headerText}>{picked.length ? picked.join(', ') : 'None — a plain family tree'}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Some families have traditions the app can help with. Tick any that apply — or none. This only changes what the app shows for this
            family, and can be changed later.
          </Text>
          {TRADITIONS.map((t) => {
            const on = value.includes(t.key);
            return (
              <Pressable
                key={t.key}
                style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && !disabled && styles.pressed]}
                onPress={() => toggle(t.key)}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled }}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.primary : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.label}</Text>
                  <Text style={styles.rowText}>{t.adds}</Text>
                </View>
              </Pressable>
            );
          })}
          {onOtherChange ? (
            <TextField
              label="Something else? (optional)"
              placeholder="Tell us which, and we'll look at adding it"
              value={other}
              onChangeText={onOtherChange}
              editable={!disabled}
              autoCapitalize="sentences"
              returnKeyType="done"
              style={{ marginBottom: 0 }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  pressed: { opacity: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget + 8, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm },
  headerTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  headerText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  body: { paddingHorizontal: spacing.sm + 4, paddingBottom: spacing.sm + 4 },
  hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: touchTarget + 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  rowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  rowText: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginTop: 1 },
});
