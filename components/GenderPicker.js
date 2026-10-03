// components/GenderPicker.js
// Three side-by-side buttons: Male / Female / Other. Tap again to clear.
// `value` is 'M' | 'F' | 'other' | null.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';

const OPTIONS = [
  { code: 'M', label: 'Male' },
  { code: 'F', label: 'Female' },
  { code: 'other', label: 'Other' },
];

export default function GenderPicker({ label = 'Gender', value, onChange }) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {OPTIONS.map((o) => {
          const on = value === o.code;
          return (
            <Pressable
              key={o.code}
              onPress={() => onChange(on ? null : o.code)}
              style={[styles.button, on && styles.buttonOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={on ? styles.textOn : styles.text}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs + 2 },
  row: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1, minHeight: touchTarget, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  buttonOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.text, fontSize: fontSize.sm },
  textOn: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
