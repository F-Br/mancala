type HapticEvent = 'capture' | 'extra-turn' | 'game-end'

const PATTERNS: Record<HapticEvent, number[]> = {
  capture: [50, 30, 50],
  'extra-turn': [30, 20, 30, 20, 30],
  'game-end': [100, 50, 100, 50, 200],
}

export function triggerHaptic(event: HapticEvent, enabled: boolean): void {
  if (!enabled) return
  if (!navigator.vibrate) return
  const pattern = PATTERNS[event]
  navigator.vibrate(pattern)
}
