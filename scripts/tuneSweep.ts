import { evaluateExpert, evaluateExpertLegacy } from '../src/bots/evaluation'
import type { EvalWeights } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { EvaluationFn } from '../src/bots/evaluation'
import type { GameState } from '../src/engine'
import { KALAH_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'
import type { BotPlayer } from '../src/bots/selfplayRunner'
import { writeFileSync, appendFileSync } from 'node:fs'

const RULES = KALAH_STANDARD
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_FILE = `tune-results-${TIMESTAMP}.txt`
const JSONL_FILE = `tune-results-${TIMESTAMP}.jsonl`

function log(line: string): void {
  console.log(line)
  appendFileSync(LOG_FILE, line + '\n')
}

function jsonl(entry: Record<string, unknown>): void {
  appendFileSync(JSONL_FILE, JSON.stringify(entry) + '\n')
}

function createLegacyEval(): EvaluationFn {
  return (state, rules) => evaluateExpertLegacy(state, rules)
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

async function testWeights(
  name: string,
  weights: EvalWeights,
  games: number,
  timeBudgetMs: number,
): Promise<{ name: string; winsA: number; draws: number; winsB: number; totalGames: number; winRateA: number; scorePctA: number; elapsedS: number; weights: EvalWeights }> {
  const legacyEval = createLegacyEval()
  const newEval = createWeightedEval(weights)

  const botA = createBot(newEval, timeBudgetMs)
  const botB = createBot(legacyEval, timeBudgetMs)

  const start = Date.now()
  const result = runMatch(botA, botB, games, (msg) => {
    console.log(`    ${msg}`)
  })
  const elapsedS = (Date.now() - start) / 1000

  const report = `  ${result.winsA}W / ${result.draws}D / ${result.winsB}L = ${(result.winRateA * 100).toFixed(1)}% win, ${(result.scorePctA * 100).toFixed(1)}% score (${elapsedS.toFixed(1)}s)`
  console.log(report + '\n')

  return {
    name,
    winsA: result.winsA,
    draws: result.draws,
    winsB: result.winsB,
    totalGames: result.totalGames,
    winRateA: result.winRateA,
    scorePctA: result.scorePctA,
    elapsedS,
    weights,
  }
}

function w(overrides: Partial<EvalWeights>): EvalWeights {
  return {
    storeDiff: 1.0,
    mobility: 0.3,
    pitStones: [0.06, 0.07, 0.08, 0.09, 0.10, 0.11],
    ownCapturePerStone: 0.6,
    oppCaptureThreatPerStone: 0,
    extraTurnMove: 0,
    emptyPitSetup: 0.2,
    ...overrides,
  }
}

interface ExperimentResult {
  name: string
  winsA: number
  draws: number
  winsB: number
  totalGames: number
  winRateA: number
  scorePctA: number
  elapsedS: number
  weights: EvalWeights
}

async function runPhase(
  phaseName: string,
  configs: { name: string; weights: EvalWeights; games: number }[],
  timeBudgetMs = 150,
): Promise<ExperimentResult[]> {
  log(`\n${'='.repeat(70)}`)
  log(`Phase: ${phaseName} (${configs.length} configs, ${configs[0]?.games ?? '?'} games each)`)
  log(`${'='.repeat(70)}\n`)

  const results: ExperimentResult[] = []
  for (const cfg of configs) {
    log(`[${phaseName}] Testing "${cfg.name}" with ${cfg.games} games...`)
    const start = Date.now()
    const r = await testWeights(cfg.name, cfg.weights, cfg.games, timeBudgetMs)
    results.push(r)

    const entry = {
      timestamp: new Date().toISOString(),
      phase: phaseName,
      name: r.name,
      winsA: r.winsA,
      draws: r.draws,
      winsB: r.winsB,
      totalGames: r.totalGames,
      winRateA: r.winRateA,
      scorePctA: r.scorePctA,
      elapsedS: r.elapsedS,
      weights: r.weights,
    }
    jsonl(entry)
    log(`  Done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${r.winsA}W/${r.draws}D/${r.winsB}L (${(r.scorePctA * 100).toFixed(1)}%)\n`)
  }

  // Print phase summary
  log(`--- ${phaseName} Summary ---`)
  results.sort((a, b) => b.scorePctA - a.scorePctA)
  for (const r of results) {
    log(`  ${r.name}: ${(r.scorePctA * 100).toFixed(1)}% score (${r.winsA}W/${r.draws}D/${r.winsB}L)`)
  }
  return results
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const baseGames = parseInt(args[0] ?? '40', 10)
  const timeBudgetMs = parseInt(args[1] ?? '150', 10)

  log(`Tuning sweep — ${baseGames} games/config, ${timeBudgetMs}ms/move`)
  log(`Started at ${new Date().toISOString()}`)
  log(`Log: ${LOG_FILE}`)
  log(`JSONL: ${JSONL_FILE}\n`)

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: ownCapturePerStone sweep
  // Base: positional pits, mobility=0.3, emptyPitSetup=0.2, oppThreat=0, extraTurn=0
  // ═══════════════════════════════════════════════════════════════════
  const capSweeps = [0.3, 0.5, 0.6, 0.8, 1.0, 1.5]
  const phase1 = await runPhase(
    'P1-ownCapturePerStone',
    capSweeps.map((v) => ({
      name: `ownCapture=${v}`,
      weights: w({ ownCapturePerStone: v }),
      games: baseGames,
    })),
    timeBudgetMs,
  )

  // Pick best capture weight
  phase1.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestCapture = phase1[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 2: extraTurnMove sweep
  // Use best capture from P1
  // ═══════════════════════════════════════════════════════════════════
  const etSweeps = [0.0, 0.3, 0.5, 0.7, 1.0]
  const phase2 = await runPhase(
    'P2-extraTurnMove',
    etSweeps.map((v) => ({
      name: `extraTurn=${v} (cap=${bestCapture.weights.ownCapturePerStone})`,
      weights: w({
        ownCapturePerStone: bestCapture.weights.ownCapturePerStone,
        extraTurnMove: v,
      }),
      games: baseGames,
    })),
    timeBudgetMs,
  )

  phase2.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestET = phase2[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 3: oppCaptureThreat sweep
  // Use best capture + best extraTurn from P1+P2
  // ═══════════════════════════════════════════════════════════════════
  const oppSweeps = [0.1, 0.2, 0.3, 0.5]
  const phase3 = await runPhase(
    'P3-oppCaptureThreat',
    oppSweeps.map((v) => ({
      name: `oppThreat=${v} (cap=${bestCapture.weights.ownCapturePerStone}, et=${bestET.weights.extraTurnMove})`,
      weights: w({
        ownCapturePerStone: bestCapture.weights.ownCapturePerStone,
        extraTurnMove: bestET.weights.extraTurnMove,
        oppCaptureThreatPerStone: v,
      }),
      games: baseGames,
    })),
    timeBudgetMs,
  )

  phase3.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestOpp = phase3[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 4: pitStones profiles
  // Use best from P1+P2+P3
  // ═══════════════════════════════════════════════════════════════════
  const pitProfiles: { name: string; pits: number[] }[] = [
    { name: 'flat-low(0.06)', pits: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06] },
    { name: 'spec-grad(0.06→0.11)', pits: [0.06, 0.07, 0.08, 0.09, 0.10, 0.11] },
    { name: 'steep-grad(0.04→0.14)', pits: [0.04, 0.06, 0.08, 0.10, 0.12, 0.14] },
    { name: 'steep-grad(0.03→0.15)', pits: [0.03, 0.05, 0.08, 0.11, 0.13, 0.15] },
  ]

  const phase4 = await runPhase(
    'P4-pitStones',
    pitProfiles.map((p) => ({
      name: `pits=${p.name} (cap=${bestOpp.weights.ownCapturePerStone}, et=${bestOpp.weights.extraTurnMove}, opp=${bestOpp.weights.oppCaptureThreatPerStone})`,
      weights: w({
        ownCapturePerStone: bestOpp.weights.ownCapturePerStone,
        extraTurnMove: bestOpp.weights.extraTurnMove,
        oppCaptureThreatPerStone: bestOpp.weights.oppCaptureThreatPerStone,
        pitStones: p.pits,
      }),
      games: baseGames,
    })),
    timeBudgetMs,
  )

  phase4.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestPits = phase4[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 5: mobility sweep
  // Use best from P1..P4
  // ═══════════════════════════════════════════════════════════════════
  const mobSweeps = [0.1, 0.2, 0.3, 0.4, 0.5]
  const phase5 = await runPhase(
    'P5-mobility',
    mobSweeps.map((v) => ({
      name: `mobility=${v}`,
      weights: w({
        ...bestPits.weights,
        mobility: v,
      }),
      games: baseGames,
    })),
    timeBudgetMs,
  )

  phase5.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestMob = phase5[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 6: final 100-game verification
  // ═══════════════════════════════════════════════════════════════════
  log(`\n${'='.repeat(70)}`)
  log(`Phase: P6-final-verification — best config at 100 games`)
  log(`${'='.repeat(70)}\n`)

  const bestWeights = bestMob.weights
  log(`Best weights so far: ${JSON.stringify(bestWeights, null, 2)}\n`)

  const final = await testWeights('FINAL-BEST', bestWeights, 100, timeBudgetMs)

  const finalEntry = {
    timestamp: new Date().toISOString(),
    phase: 'P6-final',
    name: 'FINAL-BEST',
    winsA: final.winsA,
    draws: final.draws,
    winsB: final.winsB,
    totalGames: final.totalGames,
    winRateA: final.winRateA,
    scorePctA: final.scorePctA,
    elapsedS: final.elapsedS,
    weights: final.weights,
  }
  jsonl(finalEntry)

  // ═══════════════════════════════════════════════════════════════════
  // Grand summary
  // ═══════════════════════════════════════════════════════════════════
  log(`\n${'='.repeat(70)}`)
  log(`GRAND SUMMARY`)
  log(`${'='.repeat(70)}\n`)

  const allResults = [...phase1, ...phase2, ...phase3, ...phase4, ...phase5, final]
  allResults.sort((a, b) => b.scorePctA - a.scorePctA)

  log('Rank | Score% | Win%  | W/D/L          | Name')
  log('-----|--------|-------|----------------|------')
  for (let i = 0; i < Math.min(allResults.length, 20); i++) {
    const r = allResults[i]!
    log(
      `${String(i + 1).padStart(3)}  | ${(r.scorePctA * 100).toFixed(1).padStart(5)}% | ${(r.winRateA * 100).toFixed(1).padStart(4)}% | ${String(r.winsA).padStart(2)}/${String(r.draws).padStart(1)}/${String(r.winsB).padStart(2)} | ${r.name}`,
    )
  }

  log(`\nFinal best config: ${JSON.stringify(bestWeights, null, 2)}`)
  log(`\nFull results in ${JSONL_FILE} and ${LOG_FILE}`)
  log(`Finished at ${new Date().toISOString()}`)
}

main().catch((err) => {
  console.error(err)
  log(`ERROR: ${err}`)
  process.exit(1)
})
