// components/Screen.js
// Shared wrapper every screen should use. Handles:
// - keeping content clear of the notch/status bar/Android nav buttons
// - keyboard behaviour (so whatever you're typing stays visible)
// - a consistent background color
// Use this once per screen instead of copy-pasting this logic everywhere.

import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';

export default function Screen({
  children,
  scroll = true,
  keyboardAvoiding = true,
  backgroundColor = colors.background,
  contentContainerStyle,
  style,
}) {
  const insets = useSafeAreaInsets();

  const inner = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        { paddingBottom: 40 + insets.bottom, paddingHorizontal: 16 },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom }, contentContainerStyle]}>
      {children}
    </View>
  );

  const withKeyboard = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    inner
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor }, style]}>
      {withKeyboard}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});