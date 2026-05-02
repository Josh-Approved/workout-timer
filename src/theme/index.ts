import { useColorScheme } from 'react-native';
import { Colors, colorsFor, Mode } from './tokens';

export { typography, fontFamilies } from './typography';
export type { TypographyRole, FontFamily } from './typography';
export { useAppFonts } from './useAppFonts';

export {
  palette,
  lightColors,
  darkColors,
  colorsFor,
  space,
  radius,
  fontFamily,
  type,
  weight,
  tracking,
  target,
  hairline,
} from './tokens';
export type { Mode, Colors } from './tokens';

export function useTheme(): { mode: Mode; c: Colors } {
  const scheme = useColorScheme();
  const mode: Mode = scheme === 'dark' ? 'dark' : 'light';
  return { mode, c: colorsFor(mode) };
}
