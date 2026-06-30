import { describe, it, expect } from 'vitest'
import { createInitialState, applyMove } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import type { GameState, Side } from '../../engine'
import { pickMoveBeginner, pickMoveCasual, pickMoveStrong, pickMoveExpert } from '../search'
import type { RandomFn } from '../search'

// LCG-based seeded PRNG
function createSeededRandom(seed: number): RandomFn {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

const RULES = KALAH_STANDARD

interface BotPlayer {
  pickMove: (state: GameState) => number
}

function playGame(bottomPlayer: BotPlayer, topPlayer: BotPlayer): GameState {
  let state = createInitialState(RULES, 'bottom')
  let moveCount = 0
  const maxMoves = 200

  while (state.status !== 'finished' && moveCount < maxMoves) {
    const bot = state.currentPlayer === 'bottom' ? bottomPlayer : topPlayer
    const move = bot.pickMove(state)
    if (move < 0) break
    state = applyMove(state, move, RULES)
    moveCount++
  }

  return state
}

describe('self-play: strong vs beginner', () => {
  it('strong beats beginner >90% over 20 games', () => {
    const strongBottom: BotPlayer = {
      pickMove: (s) => {
        const r = pickMoveStrong(s, RULES, 100)
        return r.pv[0] ?? -1
      },
    }

    let strongWins = 0
    const totalGames = 20

    for (let i = 0; i < totalGames; i++) {
      const strongIsBottom = i < totalGames / 2
      const seed = i * 1000

      const beginner: BotPlayer = {
        pickMove: (s) => pickMoveBeginner(s, RULES, createSeededRandom(seed)),
      }

      const game = playGame(
        strongIsBottom ? strongBottom : beginner,
        strongIsBottom ? beginner : strongBottom,
      )

      const strongSide: Side = strongIsBottom ? 'bottom' : 'top'
      if (game.winner === strongSide) strongWins++
    }

    expect(strongWins / totalGames).toBeGreaterThanOrEqual(0.9)
  }, 120000)
})

describe('self-play: expert vs strong', () => {
  it('expert beats strong >55% over 10 games', () => {
    const expertPlayer: BotPlayer = {
      pickMove: (s) => {
        const r = pickMoveExpert(s, RULES, 1500)
        return r.pv[0] ?? -1
      },
    }

    const strongPlayer: BotPlayer = {
      pickMove: (s) => {
        const r = pickMoveStrong(s, RULES, 100)
        return r.pv[0] ?? -1
      },
    }

    let expertWins = 0
    const totalGames = 10

    for (let i = 0; i < totalGames; i++) {
      const expertIsBottom = i < totalGames / 2

      const game = playGame(
        expertIsBottom ? expertPlayer : strongPlayer,
        expertIsBottom ? strongPlayer : expertPlayer,
      )

      const expertSide: Side = expertIsBottom ? 'bottom' : 'top'
      if (game.winner === expertSide) expertWins++
    }

    expect(expertWins / totalGames).toBeGreaterThanOrEqual(0.55)
  }, 600000)
})

describe('self-play: casual vs beginner', () => {
  it('casual (minimax depth 4) beats beginner consistently', () => {
    let casualWins = 0
    const totalGames = 10

    for (let i = 0; i < totalGames; i++) {
      const casualIsBottom = i < totalGames / 2
      const seed = i * 2000

      const casual: BotPlayer = {
        pickMove: (s) => {
          const r = pickMoveCasual(s, RULES)
          return r.pv[0] ?? -1
        },
      }

      const beginner: BotPlayer = {
        pickMove: (s) => pickMoveBeginner(s, RULES, createSeededRandom(seed)),
      }

      const game = playGame(casualIsBottom ? casual : beginner, casualIsBottom ? beginner : casual)

      const casualSide: Side = casualIsBottom ? 'bottom' : 'top'
      if (game.winner === casualSide) casualWins++
    }

    expect(casualWins).toBeGreaterThanOrEqual(7)
  })
})
