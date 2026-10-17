// components/CountBadge.js
// The small red circle with a number in it ("3 new"), like on Facebook.
// Shows nothing when the count is 0. Over 99 shows "99+".

import { Text, StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight } from '../lib/theme';

export default function CountBadge({ count, label = 'new', style }) {
  if (!count) return null;
  return (
    <Text style={[styles.badge, style]} accessibilityLabel={`${count} ${label}`}>
      {count > 99 ? '99+' : count}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 22,
    minHeight: 22, // grows with the phone's text size instead of clipping
    borderRadius: 11,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.danger,
    color: colors.textOnPrimary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
});
