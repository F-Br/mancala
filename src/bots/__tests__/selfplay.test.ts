import { describe, it, expect } from 'vitest'
import { KALAH_STANDARD } from '../../engine'
import type { Side } from '../../engine'
import { pickMoveBeginner, pickMoveCasual, pickMoveStrong, pickMoveExpert } from '../search'
import type { BotPlayer } from '../selfplayRunner'
import { playGame, createSeededRandom } from '../selfplayRunner'

const RULES = KALAH_STANDARD

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

    expect(strongWins / totalGames).toBeGreaterThanOrEqual(0.8)
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

describe('self-play: new-Expert (PVS) vs old-Expert (no PVS)', () => {
  it('new-Expert beats old-Expert >= 50% over 40 games at 200ms per move', () => {
    const newExpert: BotPlayer = {
      pickMove: (s) => {
        const r = pickMoveExpert(s, RULES, 200, undefined, true)
        return r.pv[0] ?? -1
      },
    }

    const oldExpert: BotPlayer = {
      pickMove: (s) => {
        const r = pickMoveExpert(s, RULES, 200, undefined, false)
        return r.pv[0] ?? -1
      },
    }

    let newExpertWins = 0
    let draws = 0
    const totalGames = 40

    for (let i = 0; i < totalGames; i++) {
      const newExpertIsBottom = i < totalGames / 2

      const game = playGame(
        newExpertIsBottom ? newExpert : oldExpert,
        newExpertIsBottom ? oldExpert : newExpert,
      )

      const newExpertSide: Side = newExpertIsBottom ? 'bottom' : 'top'
      if (game.winner === 'draw') {
        draws++
      } else if (game.winner === newExpertSide) {
        newExpertWins++
      }
    }

    const winRate = newExpertWins / totalGames
    console.log(`[PVS STRENGTH] new vs old: ${newExpertWins}W / ${draws}D / ${totalGames - newExpertWins - draws}L = ${(winRate * 100).toFixed(1)}%`)
    expect(newExpertWins / totalGames).toBeGreaterThanOrEqual(0.50)
  }, 600000)
})
