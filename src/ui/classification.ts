import type { ClassificationKey } from './theme'
import { WIN_SCORE, MAX_PLY } from '../bots/evaluation'

/*
 * ── Outcome-Aware Move Classification ──────────────────────────────────────
 *
 * This function classifies a played move relative to the best engine move,
 * using outcome categories to avoid nonsensical classifications near the
 * terminal cliff (e.g. labelling both a -10000 and a -9998 loss as "Mistake").
 *
 * ── Outcome Categories ─────────────────────────────────────────────────────
 *
 * Each eval score is mapped to one of:
 *
 *   WIN     Score in the positive mate band:  score >= WIN_SCORE - MAX_PLY
 *           (i.e. a forced win reachable within the horizon).
 *   LOSS    Score in the negative mate band:  score <= -(WIN_SCORE - MAX_PLY)
 *           (i.e. a forced loss unavoidable within the horizon).
 *   DRAW    Proven terminal draw or exactly balanced terminal:  score ≈ 0
 *           In practice any 0-score position is treated as DRAW.
 *   ONGOING Everything else — the numeric stone-eval domain where material,
 *           mobility, and positional factors are the primary signal.
 *
 * ── Decision Table ─────────────────────────────────────────────────────────
 *
 * 1. bestEval and playedEval are the SAME category
 *    ┌────────────────┬──────────────────────────────────────────┐
 *    │ Both WIN       │ 'good' (winning is winning; mate distance │
 *    │                │  difference is irrelevant for quality)   │
 *    ├────────────────┼──────────────────────────────────────────┤
 *    │ Both LOSS      │ 'good' (losing is losing; mate distance  │
 *    │                │  difference is irrelevant for quality)   │
 *    ├────────────────┼──────────────────────────────────────────┤
 *    │ Both DRAW      │ 'good' (no meaningful shift from draw)   │
 *    ├────────────────┼──────────────────────────────────────────┤
 *    │ Both ONGOING   │ Stone-delta thresholds on                │
 *    │                │ drop = bestEval - playedEval:            │
 *    │                │   ≤0.3 → 'excellent'                     │
 *    │                │   ≤1.0 → 'good'                          │
 *    │                │   ≤2.0 → 'inaccuracy'                    │
 *    │                │   ≤4.0 → 'mistake'                       │
 *    │                │   >4.0 → 'blunder'                       │
 *    └────────────────┴──────────────────────────────────────────┘
 *
 * 2. bestEval and playedEval DIFFER in category
 *    ┌─────────────────┬─────────────────────────────────────────┐
 *    │ WIN → DRAW      │ 'blunder' (always flag)                 │
 *    │ WIN → LOSS      │ 'blunder' (always flag)                 │
 *    │ DRAW → LOSS     │ 'blunder' (always flag)                 │
 *    ├─────────────────┼─────────────────────────────────────────┤
 *    │ All other       │ Fall back to stone-delta thresholds on  │
 *    │ transitions     │ drop = bestEval - playedEval.           │
 *    │ (e.g. ONGOING   │ Examples: ONGOING→LOSS, DRAW→ONGOING,   │
 *    │  → LOSS)        │ WIN→ONGOING all use the numeric delta.  │
 *    └─────────────────┴─────────────────────────────────────────┘
 *
 * Note: The caller is expected to have already checked whether the played
 * move equals the best move (isBest) and returned 'best' before calling
 * this function.
 */

type OutcomeCategory = 'WIN' | 'LOSS' | 'DRAW' | 'ONGOING'

function evalToCategory(evalScore: number): OutcomeCategory {
  if (evalScore >= WIN_SCORE - MAX_PLY) return 'WIN'
  if (evalScore <= -(WIN_SCORE - MAX_PLY)) return 'LOSS'
  // Exact 0 from a proven terminal draw, or approx 0 from a dead-even eval
  if (evalScore === 0) return 'DRAW'
  return 'ONGOING'
}

function stoneDeltaClassification(drop: number): ClassificationKey {
  if (drop <= 0.3) return 'excellent'
  if (drop <= 1.0) return 'good'
  if (drop <= 2.0) return 'inaccuracy'
  if (drop <= 4.0) return 'mistake'
  return 'blunder'
}

export function classifyEvalDrop(bestEval: number, playedEval: number): ClassificationKey {
  const bestCat = evalToCategory(bestEval)
  const playedCat = evalToCategory(playedEval)

  if (bestCat === playedCat) {
    if (bestCat === 'WIN' || bestCat === 'LOSS' || bestCat === 'DRAW') {
      return 'good'
    }
    return stoneDeltaClassification(bestEval - playedEval)
  }

  if (bestCat === 'WIN' && (playedCat === 'DRAW' || playedCat === 'LOSS')) {
    return 'blunder'
  }
  if (bestCat === 'DRAW' && playedCat === 'LOSS') {
    return 'blunder'
  }

  return stoneDeltaClassification(bestEval - playedEval)
}
