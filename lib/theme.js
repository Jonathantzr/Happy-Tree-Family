// lib/theme.js
// One shared style "rulebook" for the whole app.
// Every screen should pull colors/sizes from here instead of
// hard-coding its own — so everything looks consistent, and text
// never goes unreadable in dark mode (we always set our own colors,
// we never rely on the phone's dark/light setting).

export const colors = {
  background: '#F7F5F0',      // warm off-white app background
  surface: '#FFFFFF',         // cards, inputs
  surfaceAlt: '#EFEAE0',      // dividers, disabled state
  primary: '#2F5D4E',         // deep jade green — main brand color
  primaryDark: '#1E3F35',     // pressed/active state
  accent: '#C9A24B',          // warm gold — traditional touch, use sparingly
  text: '#1F2320',            // main text
  textMuted: '#6B6F6C',       // secondary text, hints
  textOnPrimary: '#FFFFFF',   // text sitting on top of primary color
  border: '#DCD6C9',
  danger: '#B3261E',
  success: '#2E7D32',
  overlay: 'rgba(0,0,0,0.4)',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 30 };
export const fontWeight = { regular: '400', medium: '600', bold: '700' };

// Minimum tappable size per the Device Compatibility rules.
export const touchTarget = 48;

const theme = { colors, spacing, radius, fontSize, fontWeight, touchTarget };
export default theme;