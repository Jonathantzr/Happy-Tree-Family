// components/Avatar.js
// Round picture of a person: their photo if one is given (uri), otherwise a
// gold circle with the first letter of their name inside.

import React from 'react';
import { View, Text, Image } from 'react-native';
import { colors, fontWeight } from '../lib/theme';

export default function Avatar({ name, size = 48, uri }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }}
        accessibilityIgnoresInvertColors
      />
    );
  }

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
