/**
 * Single-config Mangala tuning worker.
 *
 * Spawned by tuneMangalaSweepParallel.ts. Accepts a --config JSON arg,
 * runs a self-play match (candidate weights vs baseline), and writes
 * the result as a single JSON line to stdout.
 *
 * Usage:
 *   npx tsx scripts/tuneMangalaWorker.ts --config '{"name":"test","weights":{...},"games":14,"budget":4000}'
 */

import { evaluateExpert, WEIGHTS_BY_GAME } from '../src/bots/evaluation'
import type { EvalWeights, EvaluationFn } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { GameState } from '../src/engine'
import { MANGALA_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'
import type { BotPlayer } from '../src/bots/selfplayRunner'

const RULES = MANGALA_STANDARD
const BASELINE: EvalWeights = { ...WEIGHTS_BY_GAME.mangala }

interface WorkerConfig {
  name: string
  weights: EvalWeights
  games: number
  budget: number
}

interface WorkerResult {
  name: string
  winsA: number
  draws: number
  winsB: number
  totalGames: number
  winRateA: number
  scorePctA: number
  elapsedS: number
  weights: EvalWeights
  success: boolean
  error?: string
}

function createBaselineEval(): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, BASELINE)
}

function createWeightedEval(weights: EvalWeights): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, weights)
}

function createBot(evalFn: EvaluationFn, timeBudgetMs: number): BotPlayer {
  return {
    pickMove: (state: GameState) => {
      const result = pickMoveExpert(state, RULES, timeBudgetMs, undefined, true, evalFn)
      return result.pv[0] ?? -1
    },
  }
}

async function main(): Promise<void> {
  const configIdx = process.argv.indexOf('--config')
  if (configIdx === -1 || configIdx + 1 >= process.argv.length) {
    const err: WorkerResult = { name: '', winsA: 0, draws: 0, winsB: 0, totalGames: 0, winRateA: 0, scorePctA: 0, elapsedS: 0, weights: BASELINE, success: false, error: 'Missing --config argument' }
    process.stdout.write(JSON.stringify(err))
    process.exit(1)
  }

  let config: WorkerConfig
  try {
    config = JSON.parse(process.argv[configIdx + 1]!)
  } catch {
    const err: WorkerResult = { name: '', winsA: 0, draws: 0, winsB: 0, totalGames: 0, winRateA: 0, scorePctA: 0, elapsedS: 0, weights: BASELINE, success: false, error: 'Invalid JSON in --config' }
    process.stdout.write(JSON.stringify(err))
    process.exit(1)
  }

  const { name, weights, games, budget } = config

  if (!name || !weights || !games || !budget) {
    const err: WorkerResult = { name: name ?? '', winsA: 0, draws: 0, winsB: 0, totalGames: 0, winRateA: 0, scorePctA: 0, elapsedS: 0, weights: BASELINE, success: false, error: 'Missing required fields in config' }
    process.stdout.write(JSON.stringify(err))
    process.exit(1)
  }

  const baselineEval = createBaselineEval()
  const newEval = createWeightedEval(weights)

  const botA = createBot(newEval, budget)
  const botB = createBot(baselineEval, budget)

  const start = Date.now()
  const result = runMatch(botA, botB, games, (msg) => {
    process.stderr.write(`  [${name}] ${msg}\n`)
  }, RULES)
  const elapsedS = (Date.now() - start) / 1000

  const output: WorkerResult = {
    name,
    winsA: result.winsA,
    draws: result.draws,
    winsB: result.winsB,
    totalGames: result.totalGames,
    winRateA: result.winRateA,
    scorePctA: result.scorePctA,
    elapsedS,
    weights,
    success: true,
  }

  process.stdout.write(JSON.stringify(output))
  process.exit(0)
}

main().catch((err) => {
  const output: WorkerResult = {
    name: '',
    winsA: 0, draws: 0, winsB: 0, totalGames: 0, winRateA: 0, scorePctA: 0, elapsedS: 0,
    weights: BASELINE,
    success: false,
    error: err instanceof Error ? err.message : String(err),
  }
  process.stderr.write(`[ERROR] ${err}\n`)
  process.stdout.write(JSON.stringify(output))
  process.exit(1)
})
