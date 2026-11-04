import { Platform, TextStyle } from 'react-native';

/** Soothing light-blue / white / cyan palette. */
export const colors = {
  background: '#F2FAFF',
  backgroundDeep: '#E3F4FF',
  surface: '#FFFFFF',
  surfaceTint: '#F5FBFF',
  border: '#DCEEFA',

  primary: '#0EA5E9',
  primaryDark: '#0369A1',
  primarySoft: '#E0F2FE',
  cyan: '#22D3EE',
  cyanSoft: '#CFFAFE',
  aqua: '#67E8F9',

  water: '#38BDF8',
  waterDeep: '#0284C7',
  waterLight: '#7DD3FC',
  waterGoal: '#06B6D4',

  success: '#14B8A6',
  successSoft: '#CCFBF1',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#E11D48',
  dangerSoft: '#FFE4E6',

  text: '#0B2545',
  textMuted: '#5B7A99',
  textFaint: '#94AFC6',
  onPrimary: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

const family = Platform.select({ ios: 'System', default: undefined });

export const type = {
  hero: { fontFamily: family, fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: colors.text },
  title: { fontFamily: family, fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  heading: { fontFamily: family, fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontFamily: family, fontSize: 15, fontWeight: '400', color: colors.text },
  bodyStrong: { fontFamily: family, fontSize: 15, fontWeight: '600', color: colors.text },
  caption: { fontFamily: family, fontSize: 13, fontWeight: '500', color: colors.textMuted },
  micro: { fontFamily: family, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: colors.textFaint },
  number: {
    fontFamily: family,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export const shadow = Platform.select({
  ios: {
    shadowColor: '#0369A1',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  default: { elevation: 2 },
});
