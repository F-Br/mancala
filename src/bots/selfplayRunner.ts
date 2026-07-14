import { createInitialState, applyMove } from '../engine'
import { KALAH_STANDARD } from '../engine'
import type { GameState, Side, RuleConfig } from '../engine'

export type RandomFn = () => number

export function createSeededRandom(seed: number): RandomFn {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

export interface BotPlayer {
  pickMove: (state: GameState) => number
}

export const RULES = KALAH_STANDARD

export function playGame(
  bottomPlayer: BotPlayer,
  topPlayer: BotPlayer,
  rules: RuleConfig = KALAH_STANDARD,
): GameState {
  let state = createInitialState(rules, 'bottom')
  let moveCount = 0
  const maxMoves = 200

  while (state.status !== 'finished' && moveCount < maxMoves) {
    const bot = state.currentPlayer === 'bottom' ? bottomPlayer : topPlayer
    const move = bot.pickMove(state)
    if (move < 0) break
    state = applyMove(state, move, rules)
    moveCount++
  }

  return state
}

export interface MatchResult {
  winsA: number
  winsB: number
  draws: number
  totalGames: number
  winRateA: number
  scorePctA: number
}

export function runMatch(
  botA: BotPlayer,
  botB: BotPlayer,
  totalGames: number,
  log?: (msg: string) => void,
  rules: RuleConfig = KALAH_STANDARD,
): MatchResult {
  let winsA = 0
  let winsB = 0
  let draws = 0

  for (let i = 0; i < totalGames; i++) {
    const botAIsBottom = i < totalGames / 2

    const game = playGame(
      botAIsBottom ? botA : botB,
      botAIsBottom ? botB : botA,
      rules,
    )

    const botASide: Side = botAIsBottom ? 'bottom' : 'top'

    if (game.winner === 'draw') {
      draws++
    } else if (game.winner === botASide) {
      winsA++
    } else {
      winsB++
    }

    if (log && (i + 1) % 10 === 0) {
      log(`  Game ${i + 1}/${totalGames}: A=${winsA} B=${winsB} D=${draws}`)
    }
  }

  const winRateA = winsA / totalGames
  const scorePctA = (winsA + draws * 0.5) / totalGames

  return { winsA, winsB, draws, totalGames, winRateA, scorePctA }
}
