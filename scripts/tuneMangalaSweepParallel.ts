/**
 * Parallel Mangala evaluation weight sweep.
 *
 * Runs a greedy 5-phase parameter sweep at production budget (default 4000 ms/move)
 * using N concurrent child-process workers. Each worker runs a self-play match
 * of candidate weights vs the current WEIGHTS_BY_GAME.mangala baseline.
 *
 * Usage:
 *   npx tsx scripts/tuneMangalaSweepParallel.ts --workers 4 --games 14 --budget 4000
 *
 * Options:
 *   --workers <N>            Number of concurrent workers (default: 4)
 *   --games <N>              Games per config (default: 14)
 *   --budget <ms>            Sweep time budget per move (default: 4000)
 *   --final-budget <ms>      Cross-budget validation budgets (default: "3500,5000")
 */

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EvalWeights } from '../src/bots/evaluation'
import { WEIGHTS_BY_GAME } from '../src/bots/evaluation'

const RULES_ID = 'mangala'
const BASELINE: EvalWeights = { ...WEIGHTS_BY_GAME.mangala }
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_FILE = `tune-mangala-results-${TIMESTAMP}.txt`
const JSONL_FILE = `tune-mangala-results-${TIMESTAMP}.jsonl`
const WORKER_SCRIPT = resolve(import.meta.dirname ?? __dirname, 'tuneMangalaWorker.ts')

const WORKER_TIMEOUT_MS = 6 * 60 * 60 * 1000

function log(line: string): void {
  const ts = new Date().toISOString().slice(11, 19)
  const prefixed = `[${ts}] ${line}`
  console.log(prefixed)
  appendFileSync(LOG_FILE, prefixed + '\n')
}

function jsonl(entry: Record<string, unknown>): void {
  appendFileSync(JSONL_FILE, JSON.stringify(entry) + '\n')
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

function w(overrides: Partial<EvalWeights>): EvalWeights {
  return { ...BASELINE, ...overrides }
}

function spawnWorker(config: WorkerConfig): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(config)
    const child = spawn('npx', ['tsx', WORKER_SCRIPT, '--config', json], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: WORKER_TIMEOUT_MS,
    })

    let stdout = ''
    let stderr = ''

    child.stdout!.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr!.on('data', (data: Buffer) => {
      const text = data.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker for "${config.name}" exited with code ${code}${stderr ? ': ' + stderr.slice(-300) : ''}`))
        return
      }
      try {
        const trimmed = stdout.trim()
        const result = JSON.parse(trimmed) as WorkerResult
        if (!result.success) {
          reject(new Error(`Worker for "${config.name}" failed: ${result.error ?? 'unknown'}`))
          return
        }
        resolve(result)
      } catch {
        reject(new Error(`Worker for "${config.name}": failed to parse output: ${stdout.slice(-300)}`))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Worker for "${config.name}" spawn error: ${err.message}`))
    })
  })
}

async function runBatch(
  configs: WorkerConfig[],
  workerCount: number,
  phaseName: string,
): Promise<ExperimentResult[]> {
  const results: ExperimentResult[] = []

  for (let i = 0; i < configs.length; i += workerCount) {
    const batch = configs.slice(i, i + workerCount)
    const batchLabel = `batch ${Math.floor(i / workerCount) + 1}/${Math.ceil(configs.length / workerCount)}`
    log(`  ${phaseName}: running ${batchLabel} (${batch.length} configs in parallel)`)

    const settled = await Promise.allSettled(batch.map((cfg) => spawnWorker(cfg)))

    for (let j = 0; j < settled.length; j++) {
      const s = settled[j]!
      if (s.status === 'fulfilled') {
        const r = s.value
        results.push({
          name: r.name,
          winsA: r.winsA,
          draws: r.draws,
          winsB: r.winsB,
          totalGames: r.totalGames,
          winRateA: r.winRateA,
          scorePctA: r.scorePctA,
          elapsedS: r.elapsedS,
          weights: r.weights,
        })
      } else {
        log(`  ${phaseName}: ${s.reason}`)
      }
    }
  }

  return results
}

async function runPhase(
  phaseName: string,
  configs: { name: string; weights: EvalWeights; games: number }[],
  timeBudgetMs: number,
  workerCount: number,
): Promise<ExperimentResult[]> {
  log(
    `\n${'='.repeat(70)}\n` +
    `Phase: ${phaseName} (${configs.length} configs, ${configs[0]?.games ?? '?'} games each, ${timeBudgetMs}ms/move, ${workerCount} workers)\n` +
    `${'='.repeat(70)}`,
  )

  const results = await runBatch(
    configs.map((c) => ({ name: c.name, weights: c.weights, games: c.games, budget: timeBudgetMs })),
    workerCount,
    phaseName,
  )

  for (const r of results) {
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
    log(
      `  ${r.name}: ${r.winsA}W/${r.draws}D/${r.winsB}L = ` +
      `${(r.scorePctA * 100).toFixed(1)}% score (${r.elapsedS.toFixed(0)}s)`,
    )
  }

  results.sort((a, b) => b.scorePctA - a.scorePctA)

  log(`\n--- ${phaseName} Summary ---`)
  for (const r of results) {
    log(`  ${(r.scorePctA * 100).toFixed(1)}%  ${r.name}`)
  }

  return results
}

function estimateTime(games: number, budget: number): string {
  const avgMoves = 35
  const secsPerGame = (avgMoves * budget * 2) / 1000
  const totalSecs = games * secsPerGame
  if (totalSecs < 60) return `${totalSecs.toFixed(0)}s`
  if (totalSecs < 3600) return `${(totalSecs / 60).toFixed(1)}m`
  return `${(totalSecs / 3600).toFixed(1)}h`
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  let workerCount = 4
  let baseGames = 14
  let sweepBudget = 4000
  let finalValidationBudgets = [3500, 5000]

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workers' && args[i + 1]) workerCount = parseInt(args[++i]!, 10)
    else if (args[i] === '--games' && args[i + 1]) baseGames = parseInt(args[++i]!, 10)
    else if (args[i] === '--budget' && args[i + 1]) sweepBudget = parseInt(args[++i]!, 10)
    else if (args[i] === '--final-budget' && args[i + 1])
      finalValidationBudgets = args[++i]!.split(',').map(Number)
  }

  log(`Mangala Evaluation Tuning — Parallel Sweep`)
  log(`Game: ${RULES_ID}`)
  log(`Baseline: ${JSON.stringify(BASELINE)}`)
  log(`Workers: ${workerCount}`)
  log(`Sweep: ${baseGames} games/config, ${sweepBudget}ms/move`)
  log(`Final validation budgets: ${finalValidationBudgets.join(', ')}ms/move`)
  log(`Started at ${new Date().toISOString()}`)
  log(`Log: ${LOG_FILE}`)
  log(`JSONL: ${JSONL_FILE}`)

  const totalConfigs = 7 + 6 + 6 + 5
  const totalGames = totalConfigs * baseGames
  log(`\nEstimated sweep time: ${estimateTime(totalGames, sweepBudget)} (${totalGames} games at ${sweepBudget}ms/move, assuming ~35 moves/game)`)
  log(`With ${workerCount} workers, wall-clock will be significantly less (phases parallelized within each phase).`)

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: pitStones profiles — the key Mangala-specific parameter.
  // The reversed end-sweep (to-emptied-player) means stones in pits
  // are a LIABILITY when the game ends. Negative weights should
  // encourage timely pit-emptying. At deeper search the bot can
  // better time this, so more aggressive negatives may work.
  // ═══════════════════════════════════════════════════════════════════
  const pitProfiles: { name: string; pits: number[] }[] = [
    { name: 'pits=zero', pits: [0, 0, 0, 0, 0, 0] },
    { name: 'flat-neg(-0.03)', pits: [-0.03, -0.03, -0.03, -0.03, -0.03, -0.03] },
    { name: 'flat-neg(-0.06)', pits: [-0.06, -0.06, -0.06, -0.06, -0.06, -0.06] },
    { name: 'flat-neg(-0.09)', pits: [-0.09, -0.09, -0.09, -0.09, -0.09, -0.09] },
    { name: 'grad-inner-neg', pits: [-0.09, -0.07, -0.05, -0.03, -0.01, 0] },
    { name: 'grad-outer-neg', pits: [0, -0.01, -0.03, -0.05, -0.07, -0.09] },
    { name: 'center-heavy-neg', pits: [-0.03, -0.06, -0.09, -0.06, -0.03, 0] },
  ]

  const phase1 = await runPhase(
    'P1-pitStones',
    pitProfiles.map((p) => ({
      name: p.name,
      weights: w({ pitStones: p.pits }),
      games: baseGames,
    })),
    sweepBudget,
    workerCount,
  )

  phase1.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestPits = phase1[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 2: ownCapturePerStone sweep
  // Mangala has two capture types: Kalah-style (land on own empty pit)
  // and even-capture (sow last stone on opponent side, capture
  // adjacent pit). These are important tactical resources.
  // ═══════════════════════════════════════════════════════════════════
  const capSweeps = [0.2, 0.4, 0.6, 0.8, 1.0, 1.5]

  const phase2 = await runPhase(
    'P2-ownCapturePerStone',
    capSweeps.map((v) => ({
      name: `ownCapture=${v} (pits=${bestPits.name})`,
      weights: w({
        pitStones: bestPits.weights.pitStones,
        ownCapturePerStone: v,
      }),
      games: baseGames,
    })),
    sweepBudget,
    workerCount,
  )

  phase2.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestCap = phase2[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 3: mobility sweep
  // Mobility (legal move count difference) is important for Mangala
  // because having options lets you control end-game timing and
  // avoid being forced into positions that feed the opponent.
  // ═══════════════════════════════════════════════════════════════════
  const mobSweeps = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]

  const phase3 = await runPhase(
    'P3-mobility',
    mobSweeps.map((v) => ({
      name: `mobility=${v}`,
      weights: w({
        pitStones: bestCap.weights.pitStones,
        ownCapturePerStone: bestCap.weights.ownCapturePerStone,
        mobility: v,
      }),
      games: baseGames,
    })),
    sweepBudget,
    workerCount,
  )

  phase3.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestMob = phase3[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 4: emptyPitSetup sweep
  // Empty own pits threaten the opponent's stones (Kalah-style
  // capture setup). In Mangala the threat is slightly different
  // because captures can also happen on the opponent's side
  // (even-capture), but the positional threat still matters.
  // ═══════════════════════════════════════════════════════════════════
  const epsSweeps = [0.0, 0.1, 0.2, 0.3, 0.4]

  const phase4 = await runPhase(
    'P4-emptyPitSetup',
    epsSweeps.map((v) => ({
      name: `emptyPitSetup=${v}`,
      weights: w({
        pitStones: bestMob.weights.pitStones,
        ownCapturePerStone: bestMob.weights.ownCapturePerStone,
        mobility: bestMob.weights.mobility,
        emptyPitSetup: v,
      }),
      games: baseGames,
    })),
    sweepBudget,
    workerCount,
  )

  phase4.sort((a, b) => b.scorePctA - a.scorePctA)
  const bestEPS = phase4[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 5: Final combined validation (30 games at sweep budget)
  // ═══════════════════════════════════════════════════════════════════
  const bestWeights = bestEPS.weights

  log(`\n${'='.repeat(70)}`)
  log(`Phase: P5-final-combined — best config at ${sweepBudget}ms/move, 30 games`)
  log(`${'='.repeat(70)}\n`)
  log(`Best weights from sweep: ${JSON.stringify(bestWeights, null, 2)}`)

  const phase5 = await runPhase(
    'P5-final-combined',
    [{ name: 'FINAL-BEST', weights: bestWeights, games: 30 }],
    sweepBudget,
    1,
  )

  const final = phase5[0]!

  // ═══════════════════════════════════════════════════════════════════
  // Phase 6: Cross-budget validation
  // Test the best config at both 3500ms (Expert bot budget) and
  // 5000ms (analysis worker budget) to ensure the weights transfer
  // across time controls.
  // ═══════════════════════════════════════════════════════════════════
  const validationGames = 20

  for (const valBudget of finalValidationBudgets) {
    log(`\n${'='.repeat(70)}`)
    log(`Phase: P6-validate-${valBudget}ms — cross-budget validation, ${validationGames} games`)
    log(`${'='.repeat(70)}\n`)

    const phase6 = await runPhase(
      `P6-validate-${valBudget}ms`,
      [{ name: `FINAL-validate-${valBudget}ms`, weights: bestWeights, games: validationGames }],
      valBudget,
      1,
    )

    const r = phase6[0]
    if (r) {
      const entry = {
        timestamp: new Date().toISOString(),
        phase: `P6-validate-${valBudget}ms`,
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
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Grand summary
  // ═══════════════════════════════════════════════════════════════════
  log(`\n${'='.repeat(70)}`)
  log(`GRAND SUMMARY`)
  log(`${'='.repeat(70)}\n`)
  log(`Game: Mangala`)
  log(`Baseline: ${JSON.stringify(BASELINE)}`)
  log(`Sweep: ${baseGames} games/config, ${sweepBudget}ms/move`)
  log(`Final config: ${JSON.stringify(bestWeights, null, 2)}`)

  const allResults = [
    ...phase1, ...phase2, ...phase3, ...phase4, ...phase5,
  ]
  allResults.sort((a, b) => b.scorePctA - a.scorePctA)

  log('\nRank | Score% | Win%  | W/D/L         | Phase | Name')
  log('-----|--------|-------|---------------|-------|------')
  for (let i = 0; i < Math.min(allResults.length, 30); i++) {
    const r = allResults[i]!
    const phaseLabel =
      r === phase1.find((x) => x.name === r.name) ? 'P1' :
      r === phase2.find((x) => x.name === r.name) ? 'P2' :
      r === phase3.find((x) => x.name === r.name) ? 'P3' :
      r === phase4.find((x) => x.name === r.name) ? 'P4' :
      'P5'
    log(
      `${String(i + 1).padStart(3)}  | ${(r.scorePctA * 100).toFixed(1).padStart(5)}% | ${(r.winRateA * 100).toFixed(1).padStart(4)}% | ` +
      `${String(r.winsA).padStart(2)}/${String(r.draws).padStart(1)}/${String(r.winsB).padStart(2)}        | ${phaseLabel}    | ${r.name}`,
    )
  }

  log(`\nFinal best weights for Mangala:`)
  log(JSON.stringify(bestWeights, null, 2))

  const improved = final.scorePctA > 0.50
  if (improved) {
    log(`\nRESULT: Tuned weights BEAT the baseline at ${sweepBudget}ms/move.`)
    log(`Update WEIGHTS_BY_GAME.mangala in src/bots/evaluation.ts with the config above.`)
  } else {
    log(`\nRESULT: Tuned weights DID NOT beat the baseline at ${sweepBudget}ms/move.`)
    log(`Keep the placeholder WEIGHTS_BY_GAME.mangala unchanged.`)
  }

  log(`\nFull results in ${JSONL_FILE} and ${LOG_FILE}`)
  log(`Finished at ${new Date().toISOString()}`)
}

main().catch((err) => {
  console.error(err)
  try { log(`ERROR: ${err}`) } catch { /* ignore */ }
  process.exit(1)
})
