// components/DateField.js
// A tap-to-pick date box. Android shows its usual calendar popup; iPhone
// shows a scroll-wheel picker right under the box with a Done button.
// `value` is a JS Date or null; `onChange` gets the new Date (or null when cleared).

import React, { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';
import { formatDateDisplay } from '../lib/personHelpers';

const EARLIEST = new Date(1500, 0, 1);

export default function DateField({ label, placeholder, value, onChange }) {
  const [open, setOpen] = useState(false);

  function handlePick(event, selectedDate) {
    if (Platform.OS !== 'ios') setOpen(false); // Android's popup closes itself
    if (event.type === 'set' && selectedDate) onChange(selectedDate);
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, open && styles.boxOpen]}>
        <Pressable style={styles.main} onPress={() => setOpen(!open)} accessibilityRole="button">
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.text, !value && styles.placeholder]}>
            {value ? formatDateDisplay(value) : placeholder}
          </Text>
        </Pressable>
        {value ? (
          <Pressable
            style={styles.clear}
            onPress={() => {
              setOpen(false);
              onChange(null);
            }}
            accessibilityLabel="Clear date"
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {open && (
        <View style={Platform.OS === 'ios' ? styles.iosPicker : null}>
          <DateTimePicker
            value={value || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            {...(Platform.OS === 'ios' ? { themeVariant: 'light', textColor: colors.text } : null)}
            maximumDate={new Date()}
            minimumDate={EARLIEST}
            onChange={handlePick}
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              style={styles.done}
              onPress={() => {
                if (!value) onChange(new Date()); // wheel was left on today's date
                setOpen(false);
              }}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

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
  boxOpen: { borderColor: colors.primary },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  text: { flex: 1, color: colors.text, fontSize: fontSize.md },
  placeholder: { color: colors.placeholder },
  clear: { width: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  iosPicker: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  done: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  doneText: { color: colors.primary, fontSize: fontSize.md, fontWeight: fontWeight.medium },
});
