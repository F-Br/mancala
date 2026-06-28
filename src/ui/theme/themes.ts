export interface ThemeColors {
  bg: string
  board: string
  pit: string
  stone: string
  accent: string
  text: string
  muted: string
}

export type ThemeKey = 'warm-earth' | 'dark-museum' | 'modern-desert'

export type Themes = Record<ThemeKey, ThemeColors>

export const themes: Themes = {
  'warm-earth': {
    bg: '#1A0F0A',
    board: '#6B3424',
    pit: '#3A1F14',
    stone: '#F0DEC4',
    accent: '#00E4C0',
    text: '#F0DEC4',
    muted: '#8C7A66',
  },
  'dark-museum': {
    bg: '#161617',
    board: '#A88556',
    pit: '#2A2A2C',
    stone: '#F2EAD8',
    accent: '#E89B2A',
    text: '#F2EAD8',
    muted: '#7A7A7C',
  },
  'modern-desert': {
    bg: '#F3ECDF',
    board: '#C26035',
    pit: '#7A3719',
    stone: '#FAF6EE',
    accent: '#283766',
    text: '#2A1F18',
    muted: '#8A6F5A',
  },
}

export const defaultThemeKey: ThemeKey = 'warm-earth'

export const themeKeys: ThemeKey[] = ['warm-earth', 'dark-museum', 'modern-desert']
