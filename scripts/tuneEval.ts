import { evaluateExpert, DEFAULT_WEIGHTS, evaluateExpertLegacy } from '../src/bots/evaluation'
import type { EvalWeights } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { EvaluationFn } from '../src/bots/evaluation'
import type { GameState } from '../src/engine'
import { KALAH_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'
import type { BotPlayer } from '../src/bots/selfplayRunner'

const RULES = KALAH_STANDARD

function createLegacyEval(): EvaluationFn {
  return (state, rules) => evaluateExpertLegacy(state, rules)
}

function createWeightedEval(weights: EvalWeights): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, weights)
}

function createBot(evalFn: EvaluationFn, timeBudgetMs = 150): BotPlayer {
  return {
    pickMove: (state: GameState) => {
      const result = pickMoveExpert(state, RULES, timeBudgetMs, undefined, true, evalFn)
      return result.pv[0] ?? -1
    },
  }
}

async function testWeights(name: string, weights: EvalWeights, games: number, timeBudgetMs: number): Promise<string> {
  const legacyEval = createLegacyEval()
  const newEval = createWeightedEval(weights)

  const botA = createBot(newEval, timeBudgetMs)
  const botB = createBot(legacyEval, timeBudgetMs)

  const start = Date.now()
  const result = runMatch(botA, botB, games, (msg) => console.log(`  ${msg}`))
  const elapsed = (Date.now() - start) / 1000

  const report = `${name}: ${result.winsA}W / ${result.draws}D / ${result.winsB}L = ${(result.winRateA * 100).toFixed(1)}% win rate, ${(result.scorePctA * 100).toFixed(1)}% score, ${elapsed.toFixed(1)}s`
  return report
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const games = parseInt(args[0] ?? '60', 10)
  const timeBudgetMs = parseInt(args[1] ?? '150', 10)

  console.log(`Validation harness: ${games} games, ${timeBudgetMs}ms per move`)
  console.log()

  // Test doubling capture weights
  const doubledWeights: EvalWeights = {
    ...DEFAULT_WEIGHTS,
    ownCapturePerStone: DEFAULT_WEIGHTS.ownCapturePerStone * 2,
    oppCaptureThreatPerStone: DEFAULT_WEIGHTS.oppCaptureThreatPerStone * 2,
  }
  console.log('=== Doubled capture weights (ownCapture=1.2, oppThreat=0.7) ===')
  const doubledReport = await testWeights('Doubled', doubledWeights, games, timeBudgetMs)
  console.log(doubledReport)
  console.log()

  // Test halving capture weights
  const halvedWeights: EvalWeights = {
    ...DEFAULT_WEIGHTS,
    ownCapturePerStone: DEFAULT_WEIGHTS.ownCapturePerStone / 2,
    oppCaptureThreatPerStone: DEFAULT_WEIGHTS.oppCaptureThreatPerStone / 2,
  }
  console.log('=== Halved capture weights (ownCapture=0.3, oppThreat=0.175) ===')
  const halvedReport = await testWeights('Halved', halvedWeights, games, timeBudgetMs)
  console.log(halvedReport)
  console.log()

  // Test original DEFAULT
  console.log('=== Original DEFAULT_WEIGHTS ===')
  const originalReport = await testWeights('Original', DEFAULT_WEIGHTS, games, timeBudgetMs)
  console.log(originalReport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
