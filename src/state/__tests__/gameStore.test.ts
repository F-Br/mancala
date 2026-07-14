import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '../../state/gameStore'
import { useSettingsStore } from '../../state/settingsStore'
import type { GameRecord } from '../../state/historyStore'
import { MANGALA_STANDARD, KALAH_STANDARD, getRulesForGame } from '../../engine'

function readGameFromRecord(record: GameRecord): string {
  return record.game ?? 'kalah'
}

describe('gameStore — game identity', () => {
  beforeEach(() => {
    localStorage.clear()
    useGameStore.setState({
      gameState: null,
      rules: KALAH_STANDARD,
      firstPlayer: 'bottom',
      savedMeta: null,
      analysisCache: null,
    })
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      selectedGame: 'kalah',
    })
  })

  it('reset with mangala gameId sets Mangala rules', () => {
    useGameStore.getState().reset('bottom', 'mangala')
    const store = useGameStore.getState()
    expect(store.rules).toEqual(MANGALA_STANDARD)
    expect(store.gameState).not.toBeNull()
    expect(store.gameState!.board[0]).toBe(4)
  })

  it('reset with kalah gameId sets Kalah rules', () => {
    useGameStore.getState().reset('bottom', 'kalah')
    const store = useGameStore.getState()
    expect(store.rules).toEqual(KALAH_STANDARD)
    expect(store.gameState).not.toBeNull()
  })

  it('reset without gameId keeps current rules', () => {
    useGameStore.setState({ rules: MANGALA_STANDARD })
    useGameStore.getState().reset('bottom')
    const store = useGameStore.getState()
    expect(store.rules).toEqual(MANGALA_STANDARD)
  })

  it('savedMeta.game defaults to undefined for legacy data', () => {
    useGameStore.getState().setSavedMeta({
      mode: 'vs-bot',
      botLevel: 'beginner',
      playerSide: 'bottom',
    })
    const meta = useGameStore.getState().savedMeta
    expect(meta?.game).toBeUndefined()
  })

  it('selectedGame from settings defaults to kalah', () => {
    const game = useSettingsStore.getState().selectedGame
    expect(game).toBe('kalah')
  })

  it('getRulesForGame returns correct rules', () => {
    expect(getRulesForGame('kalah')).toEqual(KALAH_STANDARD)
    expect(getRulesForGame('mangala')).toEqual(MANGALA_STANDARD)
  })
})

describe('historyStore — game identity', () => {
  it('GameRecord without game reads as kalah via default', () => {
    const record: GameRecord = {
      id: 'test-id',
      mode: 'vs-bot',
      playerSide: 'bottom',
      opponentLabel: 'Bot (beginner)',
      result: 'win',
      finalScore: { player: 25, opponent: 23 },
      gameText: '',
      dateISO: new Date().toISOString(),
    }
    // record.game is undefined (simulating legacy data)
    expect(record.game).toBeUndefined()
    expect(readGameFromRecord(record)).toBe('kalah')
  })
})
