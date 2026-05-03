import { Platform, StyleSheet } from 'react-native';

export type Mode = 'light' | 'dark';

export const palette = {
  ink1000: '#0E0E0F',
  ink900: '#1A1A1C',
  ink700: '#3D3D42',
  ink500: '#6B6B72',
  ink300: '#9A9AA0',
  ink200: '#C8C8CC',
  ink100: '#E5E5E2',
  ink50: '#F2F2EE',
  paper: '#FAFAF7',
  white: '#FFFFFF',

  green700: '#166534',
  green600: '#1F8A4C',
  green500: '#2EA866',
  green100: '#DCFCE7',

  amber600: '#B45309',
  red600: '#B91C1C',
  slate600: '#475569',

  darkBg: '#0B0B0C',
  darkBgElevated: '#131315',
  darkBgSubtle: '#1A1A1C',
  darkFg: '#F5F5F2',
  darkFgMuted: '#A0A0A6',
  darkFgSubtle: '#6B6B72',
  darkHairline: '#26262A',
  darkHairlineStrong: '#3D3D42',
} as const;

export interface Colors {
  bg: string;
  bgElevated: string;
  bgSubtle: string;
  bgScrim: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  fgOnInk: string;
  fgOnAccent: string;
  hairline: string;
  hairlineStrong: string;
  accent: string;
  accentBg: string;
  success: string;
  warning: string;
  danger: string;
  inkButton: string;
  inkButtonText: string;
  focusRing: string;
}

export const lightColors: Colors = {
  bg: palette.paper,
  bgElevated: palette.white,
  bgSubtle: palette.ink50,
  bgScrim: 'rgba(14,14,15,0.5)',
  fg: palette.ink1000,
  fgMuted: palette.ink500,
  fgSubtle: palette.ink300,
  fgOnInk: palette.paper,
  fgOnAccent: palette.paper,
  hairline: palette.ink100,
  hairlineStrong: palette.ink200,
  accent: palette.green600,
  accentBg: palette.green100,
  success: palette.green600,
  warning: palette.amber600,
  danger: palette.red600,
  inkButton: palette.ink1000,
  inkButtonText: palette.paper,
  focusRing: palette.green600,
};

export const darkColors: Colors = {
  bg: palette.darkBg,
  bgElevated: palette.darkBgElevated,
  bgSubtle: palette.darkBgSubtle,
  bgScrim: 'rgba(0,0,0,0.6)',
  fg: palette.darkFg,
  fgMuted: palette.darkFgMuted,
  fgSubtle: palette.darkFgSubtle,
  fgOnInk: palette.darkFg,
  fgOnAccent: '#FFFFFF',
  hairline: palette.darkHairline,
  hairlineStrong: palette.darkHairlineStrong,
  accent: palette.green500,
  accentBg: 'rgba(46,168,102,0.15)',
  success: palette.green500,
  warning: palette.amber600,
  danger: palette.red600,
  inkButton: palette.darkFg,
  inkButtonText: palette.darkBg,
  focusRing: palette.green500,
};

export const colorsFor = (mode: Mode): Colors =>
  mode === 'dark' ? darkColors : lightColors;

export const space = {
  s0: 0,
  s1: 2,
  s2: 4,
  s3: 8,
  s4: 12,
  s5: 16,
  s6: 24,
  s7: 32,
  s8: 48,
  s9: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontFamily = {
  sans: Platform.select({
    ios: 'IBMPlexSans-Regular',
    android: 'IBMPlexSans-Regular',
    default: 'IBMPlexSans-Regular',
  }) as string,
  sansMedium: 'IBMPlexSans-Medium',
  sansSemibold: 'IBMPlexSans-SemiBold',
  mono: 'IBMPlexMono-Regular',
  monoMedium: 'IBMPlexMono-Medium',
} as const;

export const type = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  md: { fontSize: 20, lineHeight: 28 },
  lg: { fontSize: 24, lineHeight: 32 },
  xl: { fontSize: 32, lineHeight: 40 },
  xxl: { fontSize: 40, lineHeight: 48 },
} as const;

export const weight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
};

export const tracking = {
  tight: -0.4,
  normal: 0,
  wide: 0.4,
  mark: -0.6,
} as const;

export const target = {
  min: 44,
} as const;

export const hairline = StyleSheet.hairlineWidth;
