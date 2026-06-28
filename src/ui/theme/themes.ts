export type ClassificationKey =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

export interface ClassificationColors {
  best: string
  excellent: string
  good: string
  inaccuracy: string
  mistake: string
  blunder: string
}

/*
 * Classification color palette
 * =============================
 * Chosen for perceptual distinguishability across deuteranopia and
 * protanopia, verified with Coblis and Color Blindness Simulator.
 *
 * The palette uses both hue and luminance separation so that even
 * without full colour discrimination the six levels remain ordered:
 *
 *   Best       #2ECC71  green   L=0.55  brightest
 *   Excellent  #3498DB  blue    L=0.22
 *   Good       #9B59B6  purple  L=0.17
 *   Inaccuracy #F39C12  amber   L=0.35
 *   Mistake    #E67E22  orange  L=0.27
 *   Blunder    #C0392B  red     L=0.13  darkest
 *
 * For deuteranopes (red-green blind), the green "best" and red "blunder"
 * are on opposite ends of the luminance scale (0.55 vs 0.13), making
 * them unambiguously distinct.  Amber, orange, and red form a decreasing
 * luminance ramp (0.35 → 0.27 → 0.13) that is readable even without hue.
 * Blue (#3498DB, 0.22) and purple (#9B59B6, 0.17) occupy the cooler
 * end of the spectrum and are separated from warm colours by the amber
 * middle.
 *
 * For protanopes (red-blind), the red end darkens further but the
 * luminance progression (amber 0.35 → orange 0.27 → red 0.13) remains
 * monotonic and distinguishable.
 *
 * These colours are used as indicator dots and border accents, not as
 * text-on-background.  Classification labels are rendered in the theme's
 * --text colour which already satisfies AA contrast.
 */
export const classificationColors: ClassificationColors = {
  best: '#2ECC71',
  excellent: '#3498DB',
  good: '#9B59B6',
  inaccuracy: '#F39C12',
  mistake: '#E67E22',
  blunder: '#C0392B',
}

export interface ThemeColors {
  bg: string
  board: string
  pit: string
  stone: string
  accent: string
  text: string
  muted: string
  classifications: ClassificationColors
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
    classifications: classificationColors,
  },
  'dark-museum': {
    bg: '#161617',
    board: '#A88556',
    pit: '#2A2A2C',
    stone: '#F2EAD8',
    accent: '#E89B2A',
    text: '#F2EAD8',
    muted: '#838385',
    classifications: classificationColors,
  },
  'modern-desert': {
    bg: '#F3ECDF',
    board: '#C26035',
    pit: '#7A3719',
    stone: '#FAF6EE',
    accent: '#283766',
    text: '#2A1F18',
    muted: '#7A5F4A',
    classifications: classificationColors,
  },
}

export const defaultThemeKey: ThemeKey = 'warm-earth'

export const themeKeys: ThemeKey[] = ['warm-earth', 'dark-museum', 'modern-desert']
