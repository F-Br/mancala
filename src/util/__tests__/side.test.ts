import { describe, it, expect, vi } from 'vitest'
import { resolveSidePreference, coerceLegacySide } from '../side'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'

describe('resolveSidePreference', () => {
  it('returns bottom when rng is < 0.5', () => {
    const result = resolveSidePreference('random', () => 0.2)
    expect(result).toBe('bottom')
  })

  it('returns top when rng is >= 0.5', () => {
    const result = resolveSidePreference('random', () => 0.8)
    expect(result).toBe('top')
  })

  it('passes through concrete input bottom', () => {
    const result = resolveSidePreference('bottom', () => 0.8)
    expect(result).toBe('bottom')
  })

  it('passes through concrete input top', () => {
    const result = resolveSidePreference('top', () => 0.2)
    expect(result).toBe('top')
  })
})

describe('coerceLegacySide', () => {
  it("maps 'random' to 'bottom'", () => {
    expect(coerceLegacySide('random')).toBe('bottom')
  })

  it('passes through concrete sides', () => {
    expect(coerceLegacySide('bottom')).toBe('bottom')
    expect(coerceLegacySide('top')).toBe('top')
  })
})

describe('store-level side resolution', () => {
  it('resolves random to bottom when rng is 0.1', () => {
    useModeStore.setState({ mode: 'vs-bot', botLevel: 'beginner', playerSide: 'random' })
    vi.spyOn(Math, 'random').mockReturnValue(0.1)

    useGameStore.getState().reset('bottom')
    useGameStore.getState().setSavedMeta({
      mode: 'vs-bot',
      botLevel: 'beginner',
      playerSide: resolveSidePreference('random', Math.random),
    })

    const meta = useGameStore.getState().savedMeta
    expect(meta?.playerSide).toBe('bottom')
    vi.restoreAllMocks()
  })

  it('resolves random to top when rng is 0.9', () => {
    useModeStore.setState({ mode: 'vs-bot', botLevel: 'casual', playerSide: 'random' })
    vi.spyOn(Math, 'random').mockReturnValue(0.9)

    useGameStore.getState().reset('bottom')
    useGameStore.getState().setSavedMeta({
      mode: 'vs-bot',
      botLevel: 'casual',
      playerSide: resolveSidePreference('random', Math.random),
    })

    const meta = useGameStore.getState().savedMeta
    expect(meta?.playerSide).toBe('top')
    vi.restoreAllMocks()
  })

  it('sets firstPlayer to bottom when resolved side is top (bot starts)', () => {
    useModeStore.setState({ mode: 'vs-bot', botLevel: 'beginner', playerSide: 'top' })
    vi.spyOn(Math, 'random').mockReturnValue(0.9)

    useGameStore.getState().reset('bottom')
    const firstPlayer = useGameStore.getState().firstPlayer
    expect(firstPlayer).toBe('bottom')
    vi.restoreAllMocks()
  })
})
