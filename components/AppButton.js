// components/AppButton.js
// The one button used across the app, so every button looks and feels the
// same on iPhone and Android (the built-in <Button> looks different on each).
//
// variant: 'primary' (solid green), 'secondary' (outlined), 'ghost' (text only),
//          'danger' (solid red), 'dangerOutline' (red outline)

import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';

const VARIANTS = {
  primary: { bg: colors.primary, border: colors.primary, text: colors.textOnPrimary },
  secondary: { bg: colors.surface, border: colors.primary, text: colors.primary },
  ghost: { bg: 'transparent', border: 'transparent', text: colors.primary },
  danger: { bg: colors.danger, border: colors.danger, text: colors.textOnPrimary },
  dangerOutline: { bg: colors.surface, border: colors.danger, text: colors.danger },
};

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  icon, // optional Ionicons name shown before the title
  loading = false,
  disabled = false,
  compact = false, // smaller side padding, for buttons sitting side by side
  style,
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const off = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && styles.pressed,
        off && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={18} color={v.text} /> : null}
          <Text style={[styles.text, { color: v.text }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: spacing.md },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  text: { fontSize: fontSize.md, fontWeight: fontWeight.medium, textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
