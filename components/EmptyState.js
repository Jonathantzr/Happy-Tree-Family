// components/EmptyState.js
// Friendly "nothing here yet" block: an icon, a title and a short hint.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight } from '../lib/theme';

export default function EmptyState({ icon = 'leaf-outline', title, message, style }) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.circle}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  circle: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium, textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },
});
