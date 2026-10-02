// components/TextField.js
// A text box with an optional label above it. Same look everywhere, with
// colours set explicitly so it stays readable in dark mode.

import React, { forwardRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';

const TextField = forwardRef(function TextField(
  { label, multiline, style, right, onFocus, onBlur, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, focused && styles.boxFocused]}>
        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.multiline]}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primary}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            if (onBlur) onBlur(e);
          }}
          {...inputProps}
        />
        {right}
      </View>
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs + 2 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  boxFocused: { borderColor: colors.primary },
  input: { flex: 1, color: colors.text, fontSize: fontSize.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  multiline: { minHeight: 120, paddingTop: spacing.md - 4 },
});
