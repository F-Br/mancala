import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useSettingsStore } from '../../state/settingsStore'
import type { GameRecord } from '../../state/historyStore'
import type { GameId } from '../../engine'
import { ThemeProvider } from '../theme'
import { HomeScreen } from '../screens/HomeScreen'
import { strings } from '../strings'

describe('Home screen game picker', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({ ...useSettingsStore.getState(), selectedGame: 'kalah' })
  })

  it('toggles selectedGame in the settings store', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <HomeScreen />
        </ThemeProvider>
      </MemoryRouter>,
    )

    const kalahBtn = screen.getByRole('radio', { name: 'Kalah' })
    const mangalaBtn = screen.getByRole('radio', { name: 'Mangala' })

    expect(kalahBtn).toBeInTheDocument()
    expect(mangalaBtn).toBeInTheDocument()
    expect(kalahBtn).toHaveAttribute('aria-checked', 'true')
    expect(mangalaBtn).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(mangalaBtn)
    expect(useSettingsStore.getState().selectedGame).toBe('mangala')

    fireEvent.click(kalahBtn)
    expect(useSettingsStore.getState().selectedGame).toBe('kalah')
  })

  it('has radiogroup with aria-checked', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <HomeScreen />
        </ThemeProvider>
      </MemoryRouter>,
    )

    const radiogroup = screen.getByRole('radiogroup', { name: 'Select game' })
    expect(radiogroup).toBeInTheDocument()

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
  })
})

describe('strings.tutorials', () => {
  it('has entries for both game ids', () => {
    const tutorials = strings.tutorials
    expect(tutorials.kalah).toBeDefined()
    expect(tutorials.mangala).toBeDefined()
  })

  it('mangala has five non-empty steps', () => {
    const panels = strings.tutorials.mangala.panels
    expect(panels).toHaveLength(5)
    for (const panel of panels) {
      expect(panel.title).toBeTruthy()
      expect(panel.text).toBeTruthy()
    }
  })

  it('kalah panels are preserved', () => {
    const panels = strings.tutorials.kalah.panels
    expect(panels).toHaveLength(6)
    for (const panel of panels) {
      expect(panel.title).toBeTruthy()
      expect(panel.text).toBeTruthy()
    }
  })

  it('mangala step titles match expected', () => {
    const panels = strings.tutorials.mangala.panels
    const titles = panels.map((p) => p.title)
    expect(titles).toEqual([
      'Sowing Stones',
      'Extra Turns',
      'Even Captures',
      'Empty-Pit Captures',
      'Ending the Game',
    ])
  })
})

describe('stats record filter by game id', () => {
  function filterRecordsByGame(records: GameRecord[], gameId: 'kalah' | 'mangala'): GameRecord[] {
    return records.filter((r) => (r.game ?? 'kalah') === gameId)
  }

  function makeRecord(overrides: Partial<GameRecord> = {}): GameRecord {
    return {
      id: 'test-id',
      mode: 'vs-bot',
      botLevel: 'beginner',
      playerSide: 'bottom',
      opponentLabel: 'Bot',
      result: 'win',
      finalScore: { player: 24, opponent: 12 },
      gameText: 'test',
      dateISO: '2025-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('returns all records when no game field present (defaults to kalah)', () => {
    const r1 = makeRecord()
    const r2 = makeRecord()
    delete (r2 as { game?: GameId }).game
    const r3 = makeRecord({ game: 'kalah' })
    const filtered = filterRecordsByGame([r1, r2, r3], 'kalah')
    expect(filtered).toHaveLength(3)
  })

  it('returns only mangala records when filtering for mangala', () => {
    const records = [
      makeRecord({ id: '1', game: 'kalah' }),
      makeRecord({ id: '2', game: 'mangala' }),
      makeRecord({ id: '3', game: 'mangala' }),
      makeRecord({ id: '4' }),
    ]
    const filtered = filterRecordsByGame(records, 'mangala')
    expect(filtered).toHaveLength(2)
    expect(filtered.map((r) => r.id)).toEqual(['2', '3'])
  })

  it('returns only kalah records when filtering for kalah (undefined defaults to kalah)', () => {
    const records = [
      makeRecord({ id: '1', game: 'kalah' }),
      makeRecord({ id: '2', game: 'mangala' }),
      makeRecord({ id: '3' }),
    ]
    const filtered = filterRecordsByGame(records, 'kalah')
    expect(filtered).toHaveLength(2)
    expect(filtered.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('returns empty array when no records match', () => {
    const records = [makeRecord({ id: '1', game: 'kalah' })]
    const filtered = filterRecordsByGame(records, 'mangala')
    expect(filtered).toHaveLength(0)
  })
})
