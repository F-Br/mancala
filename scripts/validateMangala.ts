import { evaluateExpert, WEIGHTS_BY_GAME, evaluateExpertLegacy } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { EvaluationFn } from '../src/bots/evaluation'
import type { GameState } from '../src/engine'
import { MANGALA_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'

const RULES = MANGALA_STANDARD

function createLegacyEval(): EvaluationFn {
  return (state, rules) => evaluateExpertLegacy(state, rules)
}

function createWeightedEval(): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, WEIGHTS_BY_GAME.mangala)
}

async function main(): Promise<void> {
  const games = parseInt(process.argv[2] ?? '10', 10)
  const timeBudgetMs = parseInt(process.argv[3] ?? '3000', 10)

  console.log(`Mangala ${timeBudgetMs}ms/move validation: ${games} games`)
  console.log(`Started: ${new Date().toISOString()}\n`)
  console.log(`Weights: ${JSON.stringify(WEIGHTS_BY_GAME.mangala)}\n`)

  const legacyEval = createLegacyEval()
  const newEval = createWeightedEval()

  const newBot = {
    pickMove: (state: GameState) => {
      const r = pickMoveExpert(state, RULES, timeBudgetMs, undefined, true, newEval)
      return r.pv[0] ?? -1
    },
  }
  const legacyBot = {
    pickMove: (state: GameState) => {
      const r = pickMoveExpert(state, RULES, timeBudgetMs, undefined, true, legacyEval)
      return r.pv[0] ?? -1
    },
  }

  const start = Date.now()
  const result = runMatch(newBot, legacyBot, games, (msg) => console.log(msg), RULES)
  const elapsed = (Date.now() - start) / 1000

  console.log()
  console.log(`New weights vs Legacy at ${timeBudgetMs}ms/move:`)
  console.log(`  ${result.winsA}W / ${result.draws}D / ${result.winsB}L`)
  console.log(`  Win rate: ${(result.winRateA * 100).toFixed(1)}%`)
  console.log(`  Score:    ${(result.scorePctA * 100).toFixed(1)}%`)
  console.log(`  Elapsed:  ${(elapsed / 60).toFixed(1)} min`)
  console.log(`  Finished: ${new Date().toISOString()}`)

  const log = {
    timestamp: new Date().toISOString(),
    game: 'mangala',
    games,
    timeBudgetMs,
    weights: WEIGHTS_BY_GAME.mangala,
    winsA: result.winsA,
    draws: result.draws,
    winsB: result.winsB,
    totalGames: result.totalGames,
    winRateA: result.winRateA,
    scorePctA: result.scorePctA,
    elapsedS: elapsed,
  }
  console.log(JSON.stringify(log, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
