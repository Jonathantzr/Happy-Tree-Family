// components/Screen.js
// Shared wrapper every screen should use. Handles:
// - keeping content clear of the notch/status bar/Android nav buttons
// - keyboard behaviour (so whatever you're typing stays visible)
// - a consistent background color
// Use this once per screen instead of copy-pasting this logic everywhere.

import React, { useContext } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderHeightContext } from '@react-navigation/elements';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../lib/theme';

export default function Screen({
  children,
  scroll = true,
  keyboardAvoiding = true,
  backgroundColor = colors.background,
  contentContainerStyle,
  style,
  safeTop = false, // only for screens with NO title bar — the title bar already clears the status bar
  scrollRef, // lets a screen scroll itself (e.g. down to a form)
  overlay, // anything that floats above the content, like a round + button
  refreshControl,
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) || 0;

  // Screens inside the bottom tabs sit above the tab bar, which already clears
  // the Android nav buttons / iPhone home indicator — don't add that space twice.
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const bottomInset = inTabs ? 0 : insets.bottom;

  const inner = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={[
        { paddingTop: spacing.md, paddingBottom: 40 + bottomInset, paddingHorizontal: spacing.md },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: spacing.md, paddingBottom: bottomInset }, contentContainerStyle]}>
      {children}
    </View>
  );

  const withKeyboard = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {inner}
      {overlay}
    </KeyboardAvoidingView>
  ) : (
    <>
      {inner}
      {overlay}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: safeTop ? insets.top : 0, backgroundColor }, style]}>
      {withKeyboard}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
