import type { GameId, RuleConfig } from '../src/engine'
import { KALAH_STANDARD, MANGALA_STANDARD, getRulesForGame } from '../src/engine'
import { evaluateExpert, WEIGHTS_BY_GAME } from '../src/bots/evaluation'
import type { EvalWeights } from '../src/bots/evaluation'
import type { EvaluationFn } from '../src/bots/evaluation'
import { pickMoveExpert } from '../src/bots/search'
import type { GameState } from '../src/engine'
import { runMatch } from '../src/bots/selfplayRunner'
import type { BotPlayer } from '../src/bots/selfplayRunner'

function createWeightedEval(weights: EvalWeights): EvaluationFn {
  return (state, rules) => evaluateExpert(state, rules, weights)
}

function createBot(evalFn: EvaluationFn, rules: RuleConfig, timeBudgetMs = 150): BotPlayer {
  return {
    pickMove: (state: GameState) => {
      const result = pickMoveExpert(state, rules, timeBudgetMs, undefined, true, evalFn)
      return result.pv[0] ?? -1
    },
  }
}

async function testWeights(
  name: string,
  candidateWeights: EvalWeights,
  baselineWeights: EvalWeights,
  rules: RuleConfig,
  games: number,
  timeBudgetMs: number,
): Promise<{ report: string; winRateA: number }> {
  const baselineEval = createWeightedEval(baselineWeights)
  const newEval = createWeightedEval(candidateWeights)

  const botA = createBot(newEval, rules, timeBudgetMs)
  const botB = createBot(baselineEval, rules, timeBudgetMs)

  const start = Date.now()
  const result = runMatch(botA, botB, games, (msg) => console.log(`  ${msg}`), rules)
  const elapsed = (Date.now() - start) / 1000

  const report = `${name}: ${result.winsA}W / ${result.draws}D / ${result.winsB}L = ${(result.winRateA * 100).toFixed(1)}% win rate, ${(result.scorePctA * 100).toFixed(1)}% score, ${elapsed.toFixed(1)}s`
  return { report, winRateA: result.winRateA }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  let game: GameId = 'kalah'
  let games = 60
  let timeBudgetMs = 150

  // First pass: extract --game flag
  const positionalArgs: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--game' && args[i + 1]) {
      game = args[i + 1]! as GameId
      i++
    } else {
      positionalArgs.push(args[i]!)
    }
  }

  if (positionalArgs[0]) games = parseInt(positionalArgs[0], 10)
  if (positionalArgs[1]) timeBudgetMs = parseInt(positionalArgs[1], 10)

  const rules = getRulesForGame(game)
  const currentBest = { ...WEIGHTS_BY_GAME[game] }
  const baseline = { ...currentBest }

  console.log(`Tuning ${game.toUpperCase()} evaluation weights`)
  console.log(`${games} games per candidate, ${timeBudgetMs}ms per move`)
  console.log(`Baseline: ${JSON.stringify(baseline)}`)
  console.log()

  const results: string[] = []

  // Round 1: try three candidate directions
  const candidates: Array<{ name: string; weights: EvalWeights }> = []

  if (game === 'mangala') {
    // (i) Small negative per-pit stone weights — reversed sweep plausibly rewards shedding stones
    const negPitStones: EvalWeights = {
      ...baseline,
      pitStones: [-0.03, -0.03, -0.03, -0.03, -0.03, -0.03],
    }
    candidates.push({ name: 'NegPitStones', weights: negPitStones })

    // (ii) Raising the extra-turn-move weight — tempo compounds when emptying is good
    const extraTurnBoost: EvalWeights = {
      ...baseline,
      extraTurnMove: 0.4,
    }
    candidates.push({ name: 'ExtraTurnBoost', weights: extraTurnBoost })

    // (iii) Doubling/halving the two capture weights
    const doubledCapture: EvalWeights = {
      ...baseline,
      ownCapturePerStone: baseline.ownCapturePerStone * 2,
      oppCaptureThreatPerStone: baseline.oppCaptureThreatPerStone * 2,
    }
    candidates.push({ name: 'DoubledCapture', weights: doubledCapture })

    const halvedCapture: EvalWeights = {
      ...baseline,
      ownCapturePerStone: baseline.ownCapturePerStone / 2,
      oppCaptureThreatPerStone: baseline.oppCaptureThreatPerStone / 2,
    }
    candidates.push({ name: 'HalvedCapture', weights: halvedCapture })
  } else {
    // Kalah: original test directions
    const doubledWeights: EvalWeights = {
      ...baseline,
      ownCapturePerStone: baseline.ownCapturePerStone * 2,
      oppCaptureThreatPerStone: baseline.oppCaptureThreatPerStone * 2,
    }
    candidates.push({ name: 'DoubledCapture', weights: doubledWeights })

    const halvedWeights: EvalWeights = {
      ...baseline,
      ownCapturePerStone: baseline.ownCapturePerStone / 2,
      oppCaptureThreatPerStone: baseline.oppCaptureThreatPerStone / 2,
    }
    candidates.push({ name: 'HalvedCapture', weights: halvedWeights })
  }

  // Also test baseline vs baseline
  candidates.push({ name: 'Baseline', weights: { ...baseline } })

  // Round 1
  console.log('=== Round 1 ===')
  for (const c of candidates) {
    const { report, winRateA } = await testWeights(
      `${c.name} vs Baseline`,
      c.weights,
      currentBest,
      rules,
      games,
      timeBudgetMs,
    )
    console.log(report)
    results.push(report)

    // Adopt if score > 55%
    if (c.name !== 'Baseline' && winRateA >= 0.55) {
      console.log(`  => ADOPTED (${(winRateA * 100).toFixed(1)}% >= 55%)`)
      Object.assign(currentBest, c.weights)
      results.push(`  ADOPTED ${c.name}`)
    }
    console.log()
  }

  // Rounds 2-3: iterate from current best
  for (let round = 2; round <= 3; round++) {
    console.log(`=== Round ${round} (best so far: ${JSON.stringify(currentBest)}) ===`)

    const nextCandidates: Array<{ name: string; weights: EvalWeights }> = []

    if (game === 'mangala') {
      // Try combined improvements
      const combinedNegPitExtra: EvalWeights = {
        ...currentBest,
        pitStones: [-0.03, -0.03, -0.03, -0.03, -0.03, -0.03],
        extraTurnMove: 0.4,
      }
      nextCandidates.push({ name: `R${round}_NegPit+Extra`, weights: combinedNegPitExtra })

      const combinedNegPitCapture: EvalWeights = {
        ...currentBest,
        pitStones: [-0.03, -0.03, -0.03, -0.03, -0.03, -0.03],
        ownCapturePerStone: currentBest.ownCapturePerStone * (round === 2 ? 1.5 : 0.5),
      }
      nextCandidates.push({ name: `R${round}_NegPit+Capture`, weights: combinedNegPitCapture })

      const combinedExtraCapture: EvalWeights = {
        ...currentBest,
        extraTurnMove: (currentBest.extraTurnMove ?? 0) + 0.3,
        ownCapturePerStone: currentBest.ownCapturePerStone * (round === 2 ? 0.5 : 2.0),
      }
      nextCandidates.push({ name: `R${round}_Extra+Capture`, weights: combinedExtraCapture })
    }

    let anyAdopted = false
    for (const c of nextCandidates) {
      const { report, winRateA } = await testWeights(
        `${c.name} vs CurrentBest`,
        c.weights,
        currentBest,
        rules,
        games,
        timeBudgetMs,
      )
      console.log(report)
      results.push(report)

      if (winRateA >= 0.55) {
        console.log(`  => ADOPTED (${(winRateA * 100).toFixed(1)}% >= 55%)`)
        Object.assign(currentBest, c.weights)
        results.push(`  ADOPTED ${c.name}`)
        anyAdopted = true
      }
      console.log()
    }

    if (!anyAdopted) {
      console.log(`  No candidate adopted in round ${round}; stopping.`)
      break
    }
  }

  // Summary
  console.log('=== TUNING SUMMARY ===')
  console.log(`Game: ${game}`)
  console.log(`Games per candidate: ${games}`)
  console.log(`Time per move: ${timeBudgetMs}ms`)
  console.log(`Baseline: ${JSON.stringify(baseline)}`)
  console.log(`Final:    ${JSON.stringify(currentBest)}`)
  const changed = JSON.stringify(baseline) !== JSON.stringify(currentBest)
  console.log(changed ? 'Weights were updated.' : 'Baseline kept (no candidate improved significantly).')
  console.log()
  console.log('All results:')
  for (const r of results) {
    console.log(r)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
