import { evaluateExpert, WEIGHTS_BY_GAME } from '../src/bots/evaluation'
import type { EvalWeights, EvaluationFn } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { GameState } from '../src/engine'
import { MANGALA_STANDARD } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'
import type { BotPlayer } from '../src/bots/selfplayRunner'
import { writeFileSync, appendFileSync } from 'node:fs'

const RULES = MANGALA_STANDARD
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_FILE = `tune-mangala-results-${TIMESTAMP}.txt`
const JSONL_FILE = `tune-mangala-results-${TIMESTAMP}.jsonl`

function log(line: string): void {
  console.log(line)
  appendFileSync(LOG_FILE, line + '\n')
}

function jsonl(entry: Record<string, unknown>): void {
  appendFileSync(JSONL_FILE, JSON.stringify(entry) + '\n')
}

const BASELINE = { ...WEIGHTS_BY_GAME.mangala }

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

async function testWeights(
  name: string,
  weights: EvalWeights,
  games: number,
  timeBudgetMs: number,
): Promise<{
  name: string; winsA: number; draws: number; winsB: number
  totalGames: number; winRateA: number; scorePctA: number
  elapsedS: number; weights: EvalWeights
}> {
  const baselineEval = createBaselineEval()
  const newEval = createWeightedEval(weights)

  const botA = createBot(newEval, timeBudgetMs)
  const botB = createBot(baselineEval, timeBudgetMs)

  const start = Date.now()
  const result = runMatch(botA, botB, games, (msg) => {
    console.log(`    ${msg}`)
  }, RULES)
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
  return { ...BASELINE, ...overrides }
}

interface ExperimentResult {
  name: string
  winsA: number; draws: number; winsB: number
  totalGames: number; winRateA: number; scorePctA: number
  elapsedS: number; weights: EvalWeights
}

async function runPhase(
  phaseName: string,
  configs: { name: string; weights: EvalWeights; games: number }[],
  timeBudgetMs = 300,
): Promise<ExperimentResult[]> {
  log(`\n${'='.repeat(70)}`)
  log(`Phase: ${phaseName} (${configs.length} configs, ${configs[0]?.games ?? '?'} games each, ${timeBudgetMs}ms/move)`)
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
      winsA: r.winsA, draws: r.draws, winsB: r.winsB,
      totalGames: r.totalGames, winRateA: r.winRateA,
      scorePctA: r.scorePctA, elapsedS: r.elapsedS,
      weights: r.weights,
    }
    jsonl(entry)
    log(`  Done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${r.winsA}W/${r.draws}D/${r.winsB}L (${(r.scorePctA * 100).toFixed(1)}%)\n`)
  }

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
  const sweepMs = parseInt(args[1] ?? '300', 10)
  const finalValidationMs = parseInt(args[2] ?? '3000', 10)

  log(`Mangala evaluation tuning sweep`)
  log(`Baseline: ${JSON.stringify(BASELINE)}`)
  log(`Sweep: ${baseGames} games/config, ${sweepMs}ms/move`)
  log(`Final validation: ${3000}ms/move`)
  log(`Started at ${new Date().toISOString()}`)
  log(`Log: ${LOG_FILE}`)
  log(`JSONL: ${JSONL_FILE}\n`)

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: pitStones — the key Mangala-specific parameter.
  // In Mangala the reversed end-sweep means you want to shed stones;
  // positive pit weights from Kalah are strategically backwards.
  // Test negative, zero, and positive profiles.
  // ═══════════════════════════════════════════════════════════════════
  const pitProfiles: { name: string; pits: number[] }[] = [
    { name: 'flat-neg(-0.03)', pits: [-0.03, -0.03, -0.03, -0.03, -0.03, -0.03] },
    { name: 'flat-neg(-0.05)', pits: [-0.05, -0.05, -0.05, -0.05, -0.05, -0.05] },
    { name: 'flat-neg(-0.08)', pits: [-0.08, -0.08, -0.08, -0.08, -0.08, -0.08] },
    { name: 'grad-neg(-0.01→-0.06)', pits: [-0.01, -0.02, -0.03, -0.04, -0.05, -0.06] },
    { name: 'zero', pits: [0, 0, 0, 0, 0, 0] },
    { name: 'flat-pos(0.03)', pits: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03] },
  ]

  const phase1 = await runPhase(
    'P1-pitStones',
    pitProfiles.map((p) => ({
      name: `pits=${p.name}`,
      weights: w({ pitStones: p.pits }),
      games: baseGames,
    })),
    sweepMs,
  )

  phase1.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestPits = phase1[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 2: extraTurnMove sweep
  // In Mangala extra turns are powerful — they accelerate end-game
  // and give more chances to trigger captures / sweeps.
  // ═══════════════════════════════════════════════════════════════════
  const etSweeps = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
  const phase2 = await runPhase(
    'P2-extraTurnMove',
    etSweeps.map((v) => ({
      name: `extraTurn=${v} (pits=${JSON.stringify(bestPits.weights.pitStones)})`,
      weights: w({
        pitStones: bestPits.weights.pitStones,
        extraTurnMove: v,
      }),
      games: baseGames,
    })),
    sweepMs,
  )

  phase2.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestET = phase2[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 3: ownCapturePerStone sweep
  // Capture is important in Mangala (even-capture on opponent side,
  // Kalah-style capture on own empty pit). But the reversed sweep
  // changes how valuable captured stones are.
  // ═══════════════════════════════════════════════════════════════════
  const capSweeps = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]
  const phase3 = await runPhase(
    'P3-ownCapturePerStone',
    capSweeps.map((v) => ({
      name: `ownCapture=${v} (pits+et from P1+P2)`,
      weights: w({
        pitStones: bestET.weights.pitStones,
        extraTurnMove: bestET.weights.extraTurnMove,
        ownCapturePerStone: v,
      }),
      games: baseGames,
    })),
    sweepMs,
  )

  phase3.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestCap = phase3[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 4: oppCaptureThreat sweep
  // Detecting and avoiding opponent captures is important.
  // ═══════════════════════════════════════════════════════════════════
  const oppSweeps = [0.0, 0.1, 0.2, 0.3, 0.4]
  const phase4 = await runPhase(
    'P4-oppCaptureThreat',
    oppSweeps.map((v) => ({
      name: `oppThreat=${v}`,
      weights: w({
        pitStones: bestCap.weights.pitStones,
        extraTurnMove: bestCap.weights.extraTurnMove,
        ownCapturePerStone: bestCap.weights.ownCapturePerStone,
        oppCaptureThreatPerStone: v,
      }),
      games: baseGames,
    })),
    sweepMs,
  )

  phase4.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestOpp = phase4[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 5: mobility sweep
  // ═══════════════════════════════════════════════════════════════════
  const mobSweeps = [0.1, 0.3, 0.5, 0.7]
  const phase5 = await runPhase(
    'P5-mobility',
    mobSweeps.map((v) => ({
      name: `mobility=${v}`,
      weights: w({
        ...bestOpp.weights,
        mobility: v,
      }),
      games: baseGames,
    })),
    sweepMs,
  )

  phase5.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestMob = phase5[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 6: Final verification at 3000ms/move (Expert production budget)
  // This is the real test: do the tuned weights actually help the
  // Expert bot at its actual time control?
  // ═══════════════════════════════════════════════════════════════════
  log(`\n${'='.repeat(70)}`)
  log(`Phase: P6-final — ${finalValidationMs}ms/move validation`)
  log(`${'='.repeat(70)}\n`)

  const bestWeights = bestMob.weights
  log(`Best weights from sweep: ${JSON.stringify(bestWeights, null, 2)}\n`)

  log(`--- P6a: Best vs Baseline at ${finalValidationMs}ms/move (20 games) ---`)
  const validationGames = 20
  const final = await testWeights(
    'FINAL-vs-Baseline',
    bestWeights,
    validationGames,
    finalValidationMs,
  )

  const finalEntry = {
    timestamp: new Date().toISOString(),
    phase: 'P6-final',
    name: 'FINAL-vs-Baseline',
    winsA: final.winsA, draws: final.draws, winsB: final.winsB,
    totalGames: final.totalGames, winRateA: final.winRateA,
    scorePctA: final.scorePctA, elapsedS: final.elapsedS,
    weights: final.weights,
  }
  jsonl(finalEntry)

  // ═══════════════════════════════════════════════════════════════════
  // Grand summary
  // ═══════════════════════════════════════════════════════════════════
  log(`\n${'='.repeat(70)}`)
  log(`GRAND SUMMARY`)
  log(`${'='.repeat(70)}\n`)
  log(`Game: Mangala`)
  log(`Sweep: ${baseGames} games/config, ${sweepMs}ms/move`)
  log(`Validation: ${validationGames} games, ${finalValidationMs}ms/move`)
  log(`Baseline: ${JSON.stringify(BASELINE)}`)
  log(``)

  const allResults = [...phase1, ...phase2, ...phase3, ...phase4, ...phase5, final]
  allResults.sort((a, b) => b.scorePctA - a.scorePctA)

  log('Phase     | Score% | Win%  | W/D/L            | Name')
  log('----------|--------|-------|------------------|------')
  for (let i = 0; i < allResults.length; i++) {
    const r = allResults[i]!
    const phaseLabel = i === 0 ? 'FINAL' : `P${1 + Math.min(i - 1, 4)}`
    log(
      `${phaseLabel.padEnd(9)} | ${(r.scorePctA * 100).toFixed(1).padStart(5)}% | ${(r.winRateA * 100).toFixed(1).padStart(4)}% | ${String(r.winsA).padStart(2)}/${String(r.draws).padStart(2)}/${String(r.winsB).padStart(2)} | ${r.name}`,
    )
  }

  log(``)
  log(`Final best config: ${JSON.stringify(bestWeights, null, 2)}`)
  log(``)

  const improved = final.scorePctA > 0.50
  if (improved) {
    log(`RESULT: Tuned weights BEAT the baseline at ${finalValidationMs}ms/move.`)
    log(`Copy the above config into WEIGHTS_BY_GAME.mangala in src/bots/evaluation.ts.`)
  } else {
    log(`RESULT: Tuned weights DID NOT beat the baseline at ${finalValidationMs}ms/move.`)
    log(`Keep the placeholder WEIGHTS_BY_GAME.mangala unchanged.`)
  }

  log(`\nFull results in ${JSONL_FILE} and ${LOG_FILE}`)
  log(`Finished at ${new Date().toISOString()}`)
}

main().catch((err) => {
  console.error(err)
  log(`ERROR: ${err}`)
  process.exit(1)
})
