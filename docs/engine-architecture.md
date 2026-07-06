# Mancala Engine Architecture (current state)

> Generated from commit `7686275` (HEAD), 2026-07-06.
> Describes the code exactly as it exists; does not prescribe changes.

---

## 1. Game Rules

**File:** `src/engine/types.ts`, `src/engine/rules.ts`, `src/engine/moves.ts`

The engine implements **Kalah(6,4) tournament rules**. The `RuleConfig` interface (`types.ts:3`) supports parameterization (`pitsPerSide`, `stonesPerPit`, `extraTurnEnabled`, `captureRule`), but only the default `KALAH_STANDARD` is instantiated throughout the app.

### Board layout (`types.ts:28-31`)
- 14 slots (`BOARD_LENGTH = 14`).
- Indices 0–5: bottom player pits, index 6: bottom store.
- Indices 7–12: top player pits, index 13: top store.
- Constants `BOTTOM_STORE = 6`, `TOP_STORE = 13`.

### Sowing (`moves.ts:67-134`, function `computeMoveDetails`)
1. Pick up all stones from `pitIndex`; set `newBoard[pitIndex] = 0`.
2. Distribute one stone per pit, wrapping around `BOARD_LENGTH`, **skipping the opponent's store** (`getOpponentStore`), in a `do { currentPos = (currentPos + 1) % totalPositions } while (currentPos === opponentStore)` loop.

### Extra turn (`moves.ts:98-99`)
- If the **last stone** falls in the player's own store, `wasExtraTurn = true`. The caller (`applyMove`, line 168–173) keeps `currentPlayer` unchanged for the next state.

### Capture (`moves.ts:100-122`)
- **Condition:** `captureRule === 'kalah-standard'`, last stone landed in an own pit that was **empty before** the stone fell (checked as `newBoard[lastPos] === 1`), and the opposite pit is non-empty.
- **Action:** take the opponent's stones + the capturing stone; add all to the player's store.

### Game end (`moves.ts:178-185`)
- After each move, check `isSideEmpty`. If **either** side's pits are all empty:
  - Call `applyFinalSweep` to move remaining opponent stones to their store.
  - Set `status = 'finished'`; determine winner by comparing store totals (or `'draw'`).

### Legality (`moves.ts:136-150`)
- `legalMoves` returns pit indices 0–5 (bottom) or 7–12 (top) where `state.board[i] > 0`.
- Returns `[]` if `state.status === 'finished'`.

---

## 2. Evaluation Functions

**File:** `src/bots/evaluation.ts`

Three named evaluators, all sharing `terminalScore` and `WIN_SCORE = 10000`, `MAX_PLY = 1000`.

| Function | Terms (formula applied when NOT terminal) | Weights |
|---|---|---|
| `evaluateSimple` (line 78) | `storeDifference(state)` | 1.0 |
| `evaluateStrong` (line 84) | `storeDifference + mobilityScore + stonesInOwnPits + hasCaptureMove` | 1.0, 0.3, 0.08, 3.0 |
| `evaluateExpert` (line 94) | same as strong + `emptyPitSetupScore` | 1.0, 0.3, 0.08, 4.0, 0.2 |

**Term details:**

- `storeDifference` (line 14): `(ownStore − oppStore)` — raw count of already-captured stones.
- `mobilityScore` (line 30): `countLegalMoves(own) − countLegalMoves(opp)` — a count, not a fraction.
- `stonesInOwnPits` (line 37): sum of stones remaining in the player's pits.
- `hasCaptureMove` (line 47): boolean, checked by simulating every legal move to see if any produces a `captured` object.
- `emptyPitSetupScore` (line 57): for each empty own pit, adds `oppStones * 0.6`, capped at 10.

**Mate-distance adjustment** (`adjustTerminalScore`, line 219):
- `WIN_SCORE − ply` for wins, `-WIN_SCORE + ply` for losses. Makes the engine prefer shorter wins and longer losses.

**Sign convention:** all evaluators return a positive score favourable to `state.currentPlayer`.

---

## 3. Search Variants

**File:** `src/bots/search.ts`

### 3a. `minimax` (line 227)
- Plain negamax (no alpha-beta), synchronous, no TT.
- Used by `pickMoveCasual` at fixed depth 4.

### 3b. `minimaxWithAB` (line 283)
- Negamax with alpha-beta pruning.
- Used by `pickMoveStrong` (through `iterativeDeepening`, no TT).

### 3c. `minimaxWithABTT` (line 344)
- Negamax with alpha-beta pruning **and** a transposition table.
- Used by `pickMoveExpert` and by the analysis worker.

**Move ordering** (function `orderMoves`, line 126):
1. TT best move: +10000 score.
2. Exact-store (stone count precisely reaches own store): +50.
3. Capture moves (child has captured): +100.
4. Extra-turn moves (not exact-store): +25.
5. Base: stone count in the pit.

### HOW EXTRA TURNS ARE HANDLED IN THE RECURSION

This is the same across ALL three search functions (lines 261–268, 320–325, 411–416):

```
const isExtra = childMove?.wasExtraTurn && extraTurnChain < MAX_EXTRA_TURN_CHAIN
const nextDepth = isExtra ? depth : depth - 1
const nextChain = isExtra ? extraTurnChain + 1 : 0
```

- **Extra-turn moves do NOT decrement the search depth** (until the chain counter `extraTurnChain` reaches `MAX_EXTRA_TURN_CHAIN = 30`).
- **Extra-turn scores are NOT negated** (the node is `maximizing-only` for the same player).
- **No change to alpha/beta window** on extra turns (same `alpha, beta` passed as-in).
- The chain cap of 30 is a safety valve: if 30 consecutive extra turns occur, depth finally decrements.

### Mate-distance handling
- Terminal positions call `evalFn` (which returns ±WIN_SCORE or 0), then `adjustTerminalScore` subtracts/adds `ply` to produce `WIN_SCORE − ply` or `-WIN_SCORE + ply`.

### Aspiration windows
- Present **only** in `iterativeDeepening` (line 451), **not** in the internal search functions.
- Width: `ASPIRATION_WINDOW = 5.0` (line 451).
- On fail-low or fail-high, the search is re-run with `(-Infinity, +Infinity)` (lines 488–495).
- Aspiration is disabled when the previous score is in the mate band (`isInMateBand`, line 453–455).

### Pruning summary
| Search | Alpha-Beta | TT | Quiescence | Aspiration |
|---|---|---|---|---|
| `minimax` | No | No | Yes (called at leaves) | No |
| `minimaxWithAB` | Yes | No | Yes | No |
| `minimaxWithABTT` | Yes | Yes | Yes | No |

---

## 4. Transposition Table

**File:** `src/bots/search.ts` (class `TranspositionTable`, line 87)

### Key structure
- **Two independent Zobrist tables** constructed from different seeds (`0x9e3779b9` and `0x6d2b79f5`).
- Each table: 14 positions × 81 stone counts (0–80), plus 2 side-to-move keys.
- **Primary hash** (`computeHash`, line 71): XOR of piece-table entries for all non-zero pits + side key.
- **Lock** (`computeLock`, line 75): XOR of a second, independent table (same algorithm, different seed).
- Both hash and lock are 32-bit unsigned integers.

### Collision protection
- `get(hash, lock)` (line 98): returns `undefined` if `entry.lock !== lock`. A matching primary hash with a mismatched lock counts as a miss.
- This is a **verification lock**, not a full position equality check. A carefully crafted collision (same hash + same lock for different positions) would still cause an incorrect hit, but the probability is negligible (~2^-64).

### Replacement policy (line 104–108)
- **Depth-preference:** a new entry replaces an existing entry only if `entry.depth >= existing.depth`.

### Storage
- `Map<number, TTEntry>` — unbounded in size. No eviction, no maximum size.

### TT effect on PV
- When a TT entry tightens alpha/beta and `alpha >= beta` (lines 383–385), the function returns `{ score: entry.score, pv: [entry.bestMove] }` — effectively truncating the PV to a single move for that subtree.
- No entries are skipped: the code explicitly avoids an exact-hit early return to prevent losing the full PV, but the alpha/beta pruning escape (line 383) still returns a 1-move PV.

---

## 5. Quiescence Search

**File:** `src/bots/search.ts` (function `quiesce`, line 156)

- **Maximum depth:** `MAX_QDEPTH = 5` (line 154).
- **Only explores capture moves.** The main loop (`for (const pit of moves)`) skips moves that do not produce a `captured` result.
- **Stand-pat pruning:** if `standPat >= beta`, returns beta immediately.
- **Early exit optimization (line 183–192):** if the current player has **no empty pits**, no capture is possible anywhere → returns `standPat` immediately without trying any moves.
- **Move ordering:** none (intentionally, per commit `9693e5f`).
- **Extra-turn handling:** if a capture move also yields an extra turn, the same player continues with the same alpha/beta window (negating the opponent-relative sign is done in the negamax context where `quiesce` is called — but inside `quiesce` itself, the logic for extra-turn is: pass same alpha/beta, do NOT negate the score).
- The quiescence result PV is always `[]` (empty) unless the quiescence path explores a cascade of capture moves, in which case `bestPV` captures the chain.

---

## 6. Iterative Deepening

**File:** `src/bots/search.ts` (function `iterativeDeepening`, line 457)

### Algorithm
Synchronous loop `for (let depth = 1; ; depth++)`:

1. **Time check #1** (line 471): at the top of the loop, `if (performance.now() - startTime >= timeBudgetMs) break`.
2. **Aspiration window:** if `prevScore` is set and NOT in mate band, use `±ASPIRATION_WINDOW`; otherwise `-Infinity/+Infinity`.
3. Call the search function at the current depth.
4. If aspiration was used and the result failed low/high, re-search with `(-Infinity, +Infinity)` (lines 488–495).
5. **Time check #2** (line 472): after the `CancelSignal` check that follows the search result.
6. **Mate-distance termination** (line 500): `if (bestResult.score > WIN_SCORE - MAX_PLY) break` — stops deepening once a forced mate is found.
7. **Time check #3** (line 501): after the mate check, before the loop increment — `if (performance.now() - startTime >= timeBudgetMs) break`.

### Early-exit conditions
1. `cancelSignal.cancelled` — exits immediately.
2. `performance.now() - startTime >= timeBudgetMs` — checked at THREE points:
   - Before starting a new depth iteration (line 471).
   - After checking cancellation post-search (line 472–473: `if (cancelSignal?.cancelled) break`).
   - **After** persisting the current result and before looping to the next depth (line 501).
3. Mate band detection (line 500).

### Critical gap: no intra-iteration time check
The time budget is NOT enforced during a call to the search function itself. A single call to `minimaxWithABTT(state, depth, ...)` can exceed the time budget by an arbitrary amount if the tree is large. The time check only fires BETWEEN completed depth iterations.

---

## 7. Bot Difficulty Levels

**File:** `src/bots/search.ts`, `src/bots/worker.ts`

| Level | Function | Search | Depth | Eval | TT | Time Budget |
|---|---|---|---|---|---|---|
| Beginner | `pickMoveBeginner` (line 511) | Random (prefers extra-turn moves) | N/A | N/A | No | Instant |
| Casual | `pickMoveCasual` (line 534) | `minimax` | Fixed 4 | `evaluateSimple` | No | N/A (synchronous) |
| Strong | `pickMoveStrong` (line 542) | `iterativeDeepening` → `minimaxWithAB` | Increasing | `evaluateStrong` | No | **1500 ms** (default) |
| Expert | `pickMoveExpert` (line 551) | `iterativeDeepening` → `minimaxWithABTT` | Increasing | `evaluateExpert` | Yes (fresh per call) | **3000 ms** (default) |

The casual bot is the only synchronous non-iterative bot. Strong and casual levels are also synchronously depth-limited (depth 4 for casual). Strong and expert run via `iterativeDeepening`; their budgets are overrideable.

**In the worker** (`worker.ts`, function `runAsyncSearch`, line 85): Strong and Expert are run via a `setTimeout`-based loop that matches the behavior of `iterativeDeepening` but yields to the event loop between depths. The worker uses quiescence depth 1 (line 147/150 in worker.ts: `minimaxWithAB(..., 1)` / `minimaxWithABTT(..., 1)`).

---

## 8. Analysis Worker & `runBatchAnalysis`

### 8a. Analysis Worker (`src/bots/analysisWorker.ts`)

The `AnalysisWorkerHandler` class owns:
- A `sharedTT: TranspositionTable` that persists across all per-position analyses (line 10).
- A `runExpertSearch` method (line 53) that runs iterative deepening with:
  - `evaluateExpert` evaluation.
  - The shared TT.
  - Per-position budget from `msg.timeBudgetMs`.
  - No aspiration windows (always `-Infinity, +Infinity` passed to `minimaxWithABTT` — the analysis worker does NOT use the `iterativeDeepening` function; it has its own loop, line 109–143).
  - Quiescence depth 1 (line 131: `minimaxWithABTT(..., 1)`).
  - The loop yields via `setTimeout(iterate, 0)`.

**Time budget enforcement** (analysisWorker.ts, lines 110–117):
```
if (cancelSignal.cancelled) { sendBestResult(); return }
if (performance.now() - startTime >= budget) { sendBestResult(); return }
```
Checked BEFORE each depth call. Same limitation: a long-running depth call blocks the budget check.

**On completion** (`sendBestResult`, lines 68–107):
1. If `bestResult.pv` is empty, picks a random legal move as fallback.
2. If the position search completed and `bestResult.pv.length > 0`, calls `extractPrincipalVariation(state, rules, tt, evalFn, 100, cancelSignal)` — per-step budget of 100 ms — to overwrite `bestResult.pv` with the re-search-extracted PV.
3. Posts the `AnalysisResponse` message with `principalVariation`, `rootScores`, `depthReached`, `pitIndex`, `evalScore`.

### 8b. `runBatchAnalysis` (`src/ui/screens/ReviewScreen.tsx`, line 144)

1. Called automatically on mount if `cache` (from store) is null (line 240–242).
2. **Per-position budget:** `5000` ms (line 171: `requestAnalysis(pos.state, 5000)`).
3. **Sequential** — each position is analyzed one at a time in a `for` loop (line 153).
4. **Progress tracking:** computes average time per position, estimates remaining seconds.
5. For each position:
   - Calls `requestAnalysis` which posts to the analysis worker and returns a promise.
   - `await` the result.
   - Extracts `rootScores` from the analysis response.
   - **Played-move score** (`playedEval`):
     - If the played move equals the best move → `playedEval = result.evalScore`.
     - Otherwise:
       - First try: `rootScores[playedMove.pitIndex]` (line 193–194).
       - Fallback: apply the played move locally, call `evaluateExpert` on the child, negate if the move was NOT an extra turn (line 197–204).
   - Pushes an `AnalysisCacheEntry` into `entries[]`.
6. After the loop completes, stores in both `localCache` state and `setAnalysisCache` (Zustand).
7. Also calls `updateAnalysisInHistory` to persist analysis to the history store.

### 8c. Analysis Client (`src/bots/analysisClient.ts`)
- Singleton `AnalysisWorker` instantiated via Vite's `?worker` import.
- `requestAnalysis(state, timeBudgetMs)` returns `{ promise, cancel }`. The cancel function sends a cancel message to the worker.
- One request at a time per position; `AnalysisHandle` promises are resolved individually.

---

## 9. Principal Variation

### 9a. Internal PV during search

In `minimaxWithABTT` (and other search functions), the PV is built by concatenation:
```
bestPV = [pit, ...result.pv]
```
where `result` is the recursive call's response. This builds the PV from the leaf toward the root.

**PV truncation from TT pruning:** When a TT entry tightens `alpha >= beta` (search.ts:383–385), the function returns `{ score: entry.score, pv: [entry.bestMove] }` — collapsing that subtree's PV to a single move. This is the primary mechanism by which internal PVs can be shorter than the nominal depth.

### 9b. Re-search PV extractor (`extractPrincipalVariation`, search.ts line 570)

- Input: a game state, the TT, evalFn, `perStepBudgetMs` (100ms default in the analysis worker call).
- Algorithm:
  1. `for (let ply = 0; ply < maxPlies; ply++)`:
     - Run `iterativeDeepening(current, perStepBudgetMs, ...)` with the warm TT.
     - Take `result.pv[0]` as the best move at this step.
     - Push to PV, apply move, continue.
  2. Stop on terminal state, empty best move, or cancel.
  3. Returns `{ pv: number[], players: Side[] }`.
- Uses the search's own TT — since the analysis worker shares the TT across positions, later steps and later positions benefit.
- Quiescence depth 1 is passed to `iterativeDeepening` inside the extractor (line 594).

### 9c. "See what should have happened" — full trace

1. **User clicks** the button at `ReviewScreen.tsx:723` (label: `strings.review.seeWhatHappened`).
2. This calls `handlePVPlayback` (line 309).
3. `pvMoves` is derived from `currentEntry?.pv ?? []` (line 284).
4. `currentEntry` comes from the analysis cache, populated by `runBatchAnalysis` → analysis worker response → `result.principalVariation`.
5. The analysis worker's `principalVariation` is the output of `extractPrincipalVariation(state, rules, tt, evalFn, 100)` called in `sendBestResult` (analysisWorker.ts:82–92).
6. `handlePVPlayback` constructs `pvStates` by applying each pit from `pvMoves` sequentially (line 286–295), then steps through them at 1200ms intervals.
7. The board display shows `pvStates[pvStep]` while `showPV` is true.

**The displayed PV goes through two layers:**
- **Layer 1** (internal): minimaxWithABTT builds an internal PV as `[pit, ...childPV]`.
- **Layer 2** (re-search): `sendBestResult` discards the internal PV and calls `extractPrincipalVariation` which re-searches step-by-step to build a new PV.
  - If `extractPrincipalVariation` returns a non-empty PV, it overwrites `bestResult.pv`.
  - If `extractPrincipalVariation` returns empty (cancelled or all moves exhausted), the internal PV from the last completed depth is preserved.

---

## 10. Move Classification

**File:** `src/ui/classification.ts`

### Thresholds and logic

- **Input:** `bestEval` (the engine's top move score), `playedEval` (the human's move score).
- **Pre-check in caller** (`ReviewScreen.tsx`, `MoveListPanel`): if `playedMove.pitIndex === entry.bestPitIndex`, label is `'best'`. Otherwise call `classifyEvalDrop`.

### `classifyEvalDrop` (line 80)

Two-phase classification:

**Phase 1 — Categorize each score:**
```
evalToCategory(score):
  ≥  WIN_SCORE - MAX_PLY  → 'WIN'   (score ≥ 9000)
  ≤ -(WIN_SCORE - MAX_PLY) → 'LOSS'  (score ≤ -9000)
  === 0                   → 'DRAW'
  else                    → 'ONGOING'
```

**Phase 2 — Decision table:**

| bestCat vs playedCat | Result |
|---|---|
| **Same category** | |
| Both WIN, LOSS, or DRAW | `'good'` (mate distance difference ignored) |
| Both ONGOING | Stone delta: ≤0.3→`'excellent'`, ≤1.0→`'good'`, ≤2.0→`'inaccuracy'`, ≤4.0→`'mistake'`, >4.0→`'blunder'` |
| **Different category** | |
| WIN → DRAW | `'blunder'` |
| WIN → LOSS | `'blunder'` |
| DRAW → LOSS | `'blunder'` |
| All other transitions (ONGOING→LOSS, DRAW→ONGOING, WIN→ONGOING, etc.) | Stone delta thresholds (same as above) |

**Note:** There is a subtle asymmetry in outcome-aware classification. When bestEval is WIN and playedEval is ONGOING (the player moved from a winning line to an unclear position), the fallback stone-delta classification is applied. In practice, the delta will often be large (e.g., -9000), so it classifies as `'blunder'` from the numeric threshold, but not from the explicit outcome-transition rule.

### Classification color display
`classificationColors` (defined in `src/ui/theme/themes.ts:44`): six hardcoded hex colours (`#2ECC71`, `#3498DB`, `#9B59B6`, `#F39C12`, `#E67E22`, `#C0392B`).

---

## 11. Persistence (localStorage keys and shapes)

| Key | Store | Shape |
|---|---|---|
| `mancala-settings` | `useSettingsStore` | `{ theme, soundEnabled, hapticsEnabled, animationSpeed, liveHintsEnabled, tutorialSeen, showPitCounts }` |
| `mancala-current-game` | `useGameStore` | `{ gameState (serialized via zustand persist), rules, firstPlayer, savedMeta, analysisCache }` |
| `mancala-history` | `useHistoryStore` | `{ records: GameRecord[] }` where `GameRecord` includes `{ id, mode, botLevel?, playerSide, opponentLabel, result, finalScore, gameText, analysisResult?, dateISO }` |
| `mancala-theme` | `useTheme` (src/ui/theme/useTheme.ts) | Theme key string (`'warm-earth'`, `'dark-museum'`, or `'modern-desert'`) |

All use `zustand/middleware/persist` with `JSON.stringify`/`JSON.parse` except `useTheme`, which stores a raw string.

The `analysisCache` in the game store is an array of `AnalysisCacheEntry` objects: `{ bestPitIndex: number, bestEval: number, pv: number[], depth: number, playedEval: number, rootScores: Record<number, number> }`. It is persisted as part of `mancala-current-game`.

---

## KNOWN ISSUES (observed)

### Issue A: Analysis takes ~5 minutes per position; page never finishes

**Most likely cause:** Commit `7686275` (`feat: aspiration windows, extra-turn search depth, outcome-aware classification`) is responsible. The change that made extra-turn moves NOT decrement search depth (`nextDepth = isExtra ? depth : depth - 1`, search.ts:263) radically expands the search tree. In Kalah, it is common for a player to chain 2–4 extra turns in a row, and each extra turn branches over the remaining legal moves at the same depth. The recursion fans out combinatorially instead of linearly deepening.

**Time budget enforcement gap:** The `runExpertSearch` function in `analysisWorker.ts` checks `performance.now() - startTime >= budget` only BEFORE calling `minimaxWithABTT` for a depth iteration (lines 110–117). The check at line 114 (in the `iterate` closure) fires once per depth. If a single call to `minimaxWithABTT(state, depth=5 or higher, ...)` takes 5 minutes due to the extra-turn depth explosion, **no budget check fires during that call**. The `CancelSignal` is checked at the start of each recursive node (line 358), but the cancel flag is only set by an external `cancel` message — not by the time budget. The `setTimeout(iterate, 0)` on line 141 only schedules the NEXT iteration; the current one runs to completion synchronously within the worker.

**Additionally:** The analysis worker does NOT use the `iterativeDeepening` function (which has 3 time-check points). It has its own loop (`iterate` closure) with only 2 checks: one before the search call, one after. The post-search check at line 133 would NOT fire until the search call completes.

**Why 88df880 was fast:** In commit `88df880`, extra turns DID decrement depth (`nextDepth = depth - 1` unconditionally, or the `isExtra` branch didn't exist). Each extra turn consumed a ply of search budget, keeping the tree size bounded.

### Issue B: "See what should have happened" sometimes shows only 1 move

**Root cause (traceable through code at 88df880 and HEAD):** The PV displayed to the user passes through two layers, and both can collapse:

1. **Layer 1 — Internal PV truncation in `minimaxWithABTT`** (search.ts, lines 383–385):
   ```
   if (alpha >= beta) {
     return { score: entry.score, pv: [entry.bestMove] }
   }
   ```
   When a TT entry tightens the alpha/beta window such that `alpha >= beta`, the function prunes and returns a PV with only 1 move. This can happen at any node in the tree, and the truncated PV propagates upward. Even though commit `4708b90` removed an earlier exact-hit early return that was causing PV truncation, this alpha/beta pruning escape path still returns a single-move PV.

2. **Layer 2 — Re-search extractor (`extractPrincipalVariation`)**: Called with `perStepBudgetMs = 100` (analysisWorker.ts:87). At each step, `iterativeDeepening(current, 100, ...)` runs with a 100ms budget. If the iterative deepening only completes 1–2 depths before timing out, or if the game ends on the next move, the per-step search returns a PV with only 1 move. Since the extractor takes `result.pv[0]` and then re-searches from the resulting position, a single collapsed step doesn't prevent further moves — but if the very first step produces a 1-move PV and the resulting child position is terminal (game over), the overall PV is just 1 move.

3. **Structural explanation for the 1-move collapse:** When `extractPrincipalVariation` calls `iterativeDeepening` at each ply, the internal search at the first ply may return a PV like `[3]` (one move). If applying that move ends the game (opponent's side becomes empty → final sweep → terminal), the loop at line 586 (`if (current.status === 'finished') break`) exits. The resulting PV is `[3]` — one move. This is legitimate: the game ended. But the user may not realize and expects a longer hypothetical line. There is no code path that says "the game ends here, but let me show what could have happened if it hadn't." The extraction stops at the first terminal state.

4. **No alternative PV source is wired:** The display (`ReviewScreen.tsx:284`) reads `currentEntry?.pv ?? []`. The analysis worker sets `bestResult.pv` to `extracted.pv` if extraction succeeds (line 91), or keeps the internal PV from the last completed depth iteration if extraction fails. There is no fallback to re-search with a larger per-step budget, no iterative deepening at the display layer, and no attempt to continue the PV past a terminal state. The display is purely consumption of whatever the worker sent.
