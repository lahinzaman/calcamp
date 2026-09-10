export const THEMES = ['light', 'dark', 'gray'] as const;
export type ThemeMode = typeof THEMES[number];
export const palettes = {
  light: { background: '#F4F5F7', surface: '#FFFFFF', raised: '#E8EBEF', ink: '#171B23', border: '#CCD2DB', accent: '#C9D8FF', protein: '#557AE5', carbs: '#C78221', fat: '#9D62C5' },
  dark: { background: '#101115', surface: '#1A1C23', raised: '#282C37', ink: '#FFFFFF', border: '#454B5B', accent: '#35486D', protein: '#91ACFF', carbs: '#FFCB78', fat: '#DBAEFF' },
  gray: { background: '#30333B', surface: '#3C404A', raised: '#484D59', ink: '#FFFFFF', border: '#707888', accent: '#4C5C7C', protein: '#B6C8FF', carbs: '#FFDAA0', fat: '#E7C9FF' },
} as const;
