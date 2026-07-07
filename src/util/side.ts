import type { Side } from '../engine'

export function resolveSidePreference(pref: Side | 'random', rng: () => number = Math.random): Side {
  if (pref !== 'random') return pref
  return rng() < 0.5 ? 'bottom' : 'top'
}

export function coerceLegacySide(s: Side | 'random'): Side {
  return s === 'random' ? 'bottom' : s
}
