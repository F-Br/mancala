import { evaluateExpert, DEFAULT_WEIGHTS, evaluateExpertLegacy } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { EvaluationFn } from '../src/bots/evaluation'
import type { GameState } from '../src/engine'
import { KALAH_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'

const RULES = KALAH_STANDARD
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')

function createLegacyEval(): EvaluationFn {
  return (state, rules) => evaluateExpertLegacy(state, rules)
}

function createWeightedEval(): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, DEFAULT_WEIGHTS)
}

async function main(): Promise<void> {
  const games = parseInt(process.argv[2] ?? '10', 10)
  const timeBudgetMs = parseInt(process.argv[3] ?? '5000', 10)

  console.log(`5s validation: ${games} games, ${timeBudgetMs}ms/move`)
  console.log(`Started: ${new Date().toISOString()}\n`)

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

  console.log(`Config: ${JSON.stringify(DEFAULT_WEIGHTS)}\n`)

  const start = Date.now()
  const result = runMatch(newBot, legacyBot, games, (msg) => console.log(msg))
  const elapsed = (Date.now() - start) / 1000

  console.log()
  console.log(`New weights vs Legacy at 5s/move:`)
  console.log(`  ${result.winsA}W / ${result.draws}D / ${result.winsB}L`)
  console.log(`  Win rate: ${(result.winRateA * 100).toFixed(1)}%`)
  console.log(`  Score:    ${(result.scorePctA * 100).toFixed(1)}%`)
  console.log(`  Elapsed:  ${(elapsed / 60).toFixed(1)} min`)
  console.log(`  Finished: ${new Date().toISOString()}`)

  const log = {
    timestamp: new Date().toISOString(),
    games,
    timeBudgetMs,
    weights: DEFAULT_WEIGHTS,
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
