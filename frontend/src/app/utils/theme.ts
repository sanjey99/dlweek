import { Theme } from '../types';

export const getTheme = (isDark: boolean): Theme => ({
  bg: isDark ? '#0A0A0A' : '#F5F5F5',
  surface: isDark ? '#171717' : '#FFFFFF',
  surfaceElevated: isDark ? '#1E1E1E' : '#FAFAFA',
  border: isDark ? '#2A2A2A' : '#E2E2E2',
  textPrimary: isDark ? '#F5F5F5' : '#0A0A0A',
  textSecondary: isDark ? '#8A8A8A' : '#5A5A5A',
  textTertiary: isDark ? '#4A4A4A' : '#ADADAD',
  rowHover: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
  tableHeaderBg: isDark ? '#111111' : '#F8F8F8',
});

export const COLORS = {
  red: '#E5484D',
  amber: '#FFB224',
  green: '#30A46C',
  redMuted: 'rgba(229, 72, 77, 0.12)',
  amberMuted: 'rgba(255, 178, 36, 0.12)',
  greenMuted: 'rgba(48, 164, 108, 0.12)',
  redText: '#FF6166',
  amberText: '#FFB224',
  greenText: '#3CB371',
} as const;
