import { evaluateExpert, evaluateExpertLegacy } from '../src/bots/evaluation'
import type { EvalWeights } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { EvaluationFn } from '../src/bots/evaluation'
import type { GameState } from '../src/engine'
import { KALAH_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'

const RULES = KALAH_STANDARD

function createLegacyEval(): EvaluationFn {
  return (state, rules) => evaluateExpertLegacy(state, rules)
}

function createWeightedEval(w: EvalWeights): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, w)
}

async function testOne(name: string, weights: EvalWeights, games: number, timeMs: number): Promise<void> {
  const newEval = createWeightedEval(weights)
  const legacyEval = createLegacyEval()

  const newBot = {
    pickMove: (state: GameState) => {
      const r = pickMoveExpert(state, RULES, timeMs, undefined, true, newEval)
      return r.pv[0] ?? -1
    },
  }
  const legacyBot = {
    pickMove: (state: GameState) => {
      const r = pickMoveExpert(state, RULES, timeMs, undefined, true, legacyEval)
      return r.pv[0] ?? -1
    },
  }

  console.log(`[${name}] 5s/move, ${games} games`)
  console.log(`  weights: ${JSON.stringify(weights)}`)
  const start = Date.now()
  const r = runMatch(newBot, legacyBot, games, (m) => console.log(`    ${m}`))
  const elapsed = (Date.now() - start) / 1000
  console.log(`  ${r.winsA}W / ${r.draws}D / ${r.winsB}L = ${(r.scorePctA * 100).toFixed(1)}% score (${(elapsed / 60).toFixed(1)} min)\n`)
}

async function main(): Promise<void> {
  const games = parseInt(process.argv[2] ?? '10', 10)
  const timeMs = parseInt(process.argv[3] ?? '5000', 10)

  console.log(`5s transfer test — ${games} games/conf, ${timeMs}ms/move\n`)

  // Config 1: positional-only (pits + mobility, no tactical terms)
  const positionalOnly: EvalWeights = {
    storeDiff: 1.0,
    mobility: 0.5,
    pitStones: [0.06, 0.07, 0.08, 0.09, 0.10, 0.11],
    ownCapturePerStone: 0.6,
    oppCaptureThreatPerStone: 0,
    extraTurnMove: 0,
    emptyPitSetup: 0.2,
  }
  await testOne('positional+cap (no threat, no extra)', positionalOnly, games, timeMs)

  // Config 2: positional + capture only, legacy mobility
  const positionalLegacyMob: EvalWeights = {
    storeDiff: 1.0,
    mobility: 0.3,
    pitStones: [0.06, 0.07, 0.08, 0.09, 0.10, 0.11],
    ownCapturePerStone: 0.6,
    oppCaptureThreatPerStone: 0,
    extraTurnMove: 0,
    emptyPitSetup: 0.2,
  }
  await testOne('positional+cap+mob0.3 (no threat, no extra)', positionalLegacyMob, games, timeMs)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
