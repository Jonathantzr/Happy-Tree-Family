// components/Avatar.js
// Round gold circle with the first letter of a name inside.

import React from 'react';
import { View, Text } from 'react-native';
import { colors, fontWeight } from '../lib/theme';

export default function Avatar({ name, size = 48 }) {
  const initial = (name || '').trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text allowFontScaling={false} style={{ color: colors.textOnPrimary, fontSize: size * 0.4, fontWeight: fontWeight.bold }}>
        {initial}
      </Text>
    </View>
  );
}
