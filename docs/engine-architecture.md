# Mancala Engine Architecture (current state)

> Generated from commits `7686275` through current. Describes the code exactly as it exists; does not prescribe changes.

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
const isExtra = childMove?.wasExtraTurn && extraTurnChain < MAX_EXTRA_TURN_EXTENSION
const nextDepth = isExtra ? depth : depth - 1
const nextChain = isExtra ? extraTurnChain + 1 : 0
```

- **Extra-turn moves do NOT decrement the search depth** (until the chain counter `extraTurnChain` reaches `MAX_EXTRA_TURN_EXTENSION = 3`).
- **Extra-turn scores are NOT negated** (the node is `maximizing-only` for the same player).
- **No change to alpha/beta window** on extra turns (same `alpha, beta` passed as-in).
- The chain cap of 3 is a safety valve: if 3 consecutive extra turns occur, depth finally decrements. This bounds the extra-turn search explosion that would otherwise cause multi-minute hangs.

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

### Deadline enforcement

- **`SearchLimits.deadlineMs`** is set to `startTime + timeBudgetMs` and checked inside `minimaxWithABTT` at the node level (`checkInterval = 2048`). When the deadline passes, `limits.aborted` is set to `true`, and the function returns immediately.
- **The analysis worker's `runExpertSearch`** has its own `setTimeout`-based loop with budget checks before each depth iteration and cancellation support via `CancelSignal`.
- The `CancelSignal` is checked at the start of every search node, providing interrupt capability for cancellations across the full search tree.
- The `ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION = 3` cap prevents unbounded depth from extra-turn chains.

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

## 8. Analysis Worker & Batch Analysis

### 8a. Analysis Worker (`src/bots/analysisWorker.ts`)

The `AnalysisWorkerHandler` class owns:
- A `sharedTT: TranspositionTable` that persists across all per-position analyses — later positions benefit from TT entries accumulated during earlier ones.
- An optional K=12 endgame tablebase (see §12), with IndexedDB caching.
- A `runExpertSearch` method that runs a `setTimeout`-based iterative deepening loop with:
  - `evaluateExpert` evaluation.
  - The shared TT (pooled across all positions in a batch run).
  - Per-position budget from `msg.timeBudgetMs` (default: **3000 ms**, set by the `ANALYSIS_POSITION_BUDGET_MS` constant in `src/ui/batchAnalysis.ts`).
  - Deadline-based abort via `SearchLimits.deadlineMs` inside `minimaxWithABTT`.
  - Cancellation support via `CancelSignal`.
  - Tablebase probe integration when TB is ready.
  - No aspiration windows (always `-Infinity, +Infinity` passed to `minimaxWithABTT`).
  - Extra-turn cap of 3 (`ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION`).

**Time budget enforcement:** Two layers —
1. The `iterate` closure checks `performance.now() - startTime >= budget` before each depth iteration (line 363).
2. `SearchLimits.deadlineMs` is set and checked inside `minimaxWithABTT` at the node level every 2048 nodes, providing intra-iteration deadline enforcement that was previously absent.

**On completion** (`sendBestResult`):
1. If `bestResult.pv` is empty, picks a random legal move as fallback.
2. Calls `extractPrincipalVariation(state, rules, tt, evalFn, { cancelSignal }, tbBestMove)` to build a clean re-search-extracted PV. The extraction uses per-step budgets derived from the remaining main budget, producing high-quality PVs of 15–25 moves on typical midgame positions.
3. Runs **played-move verification** via `computeExactPlayedEval`: if the played move differs from the best move, it runs `iterativeDeepening` on the child position with `verificationBudget = max(300, timeBudgetMs * 0.35)`, applying sign negation for non-extra-turn moves to convert from opponent perspective back to parent perspective.
4. Posts the `AnalysisResponse` with `principalVariation`, `rootScores`, `depthReached`, `pitIndex`, `evalScore`, `reachedTerminal`, and `exactPlayedEval`.

**Budget per position (production, `ANALYSIS_POSITION_BUDGET_MS = 3000`):**
- **3000 ms** — main best-move search via iterative deepening.
- **max(1050, 300) ms** — played-move verification (35% of budget, min 300ms).
- **≤2500 ms** — PV extraction re-search (~25 steps × 100ms per step).
- **Total worst case:** ≈6850 ms per position. The tablebase at K=12 makes 3000ms sufficient for accurate analysis.

### 8b. Batch Analysis (`src/ui/batchAnalysis.ts`)

**`executeBatchAnalysis`** is the core loop, extracted from the component for testability. It:

1. Processes positions **sequentially** — the shared transposition table across consecutive positions is worth more than parallelism; later positions benefit from TT entries accumulated during earlier analyses.
2. Takes an injectable `analyze` function (`(state, budgetMs, playedPitIndex?) => Promise<AnalysisResult>`), making it testable with a raw `AnalysisWorkerHandler` without spawning web workers or rendering React.
3. Accepts `onProgress` callbacks and an optional cancellation `signal`.
4. Returns `BatchAnalysisEntry[]` with the full `AnalysisCacheEntry` plus `reachedTerminal` flags.
5. Uses `ANALYSIS_CEILING_MS_PER_POSITION = 7000` for initial time-remaining estimates until real wall-clock timings accumulate.

**Tablebase-loaded progress** is communicated from the worker to UI via `tbProgress` messages from the engine's `generateTablebase` function. The `analysisClient.ts` forwards these through a registered callback (`setOnTBProgress`), which the review screen uses to display "Preparing endgame tables…" on first-ever analysis.

### 8c. Analysis Client (`src/bots/analysisClient.ts`)
- Singleton `AnalysisWorker` instantiated via Vite's `?worker` import.
- `requestAnalysis(state, timeBudgetMs, playedPitIndex?)` returns `{ promise, cancel }`.
- `setOnTBProgress(cb)` registers a callback for tablebase generation progress messages.
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

- Input: a game state, the TT, evalFn, `perStepBudgetMs` derived from remaining main budget (not hardcoded 100ms), optional `tbBestMove` function.
- Algorithm:
  1. `for (let ply = 0; ply < maxPlies; ply++)`:
      - Run `iterativeDeepening(current, perStepBudgetMs, ...)` with the warm TT and tablebase probe.
      - Take `result.pv[0]` as the best move at this step.
      - Push to PV, apply move, continue.
  2. Stop on terminal state, empty best move, or cancel.
  3. Returns `{ pv: number[], players: Side[], finalState: GameState, reachedTerminal: boolean }`.

**`reachedTerminal` semantics:** This flag is `true` when the PV extraction loop terminates because the game ended (the final state in the line is a terminal position). When `false`, the line stopped for other reasons (budget, cancellation, or no legal moves from a non-terminal position). The UI uses this flag to conditionally display "Line plays to the end of the game."

**Tablebase integration:** When the tablebase is ready, the extractor passes `tbBestMove` to the re-search, enabling the PV to follow proven-optimal moves in endgame positions, producing longer and more accurate lines.

### 9c. "See what should have happened" — full trace

1. **User clicks** the button at `ReviewScreen.tsx` (label: `strings.review.seeWhatHappened`).
2. This calls `handlePVPlayback`.
3. `pvMoves` is derived from `currentEntry?.pv ?? []`.
4. `currentEntry` comes from the analysis cache, populated by `executeBatchAnalysis` → analysis worker response → `result.principalVariation`.
5. The analysis worker's `principalVariation` is the output of `extractPrincipalVariation` called in `sendBestResult`.
6. `handlePVPlayback` constructs `pvStates` by applying each pit from `pvMoves` sequentially, then steps through them at 1200ms intervals.
7. The board display shows `pvStates[pvStep]` while `showPV` is true.
8. If `reachedTerminal` is true on the cache entry, the caption text includes "Line plays to the end of the game."

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
- **Pre-check in caller** (`MoveListPanel`): if `playedMove.pitIndex === entry.bestPitIndex`, label is `'best'`. Otherwise call `classifyEvalDrop`.

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

### Played-move evaluation

The `playedEval` in `AnalysisCacheEntry` comes from one of three sources, in order of priority:
1. **Best-move match:** when `playedMove.pitIndex === bestMove.pitIndex`, `playedEval = result.evalScore`.
2. **Exact verification search:** when the played move differs from the best move, the worker runs `computeExactPlayedEval` — an iterative-deepening search on the child position with correct perspective conversion (negation for non-extra-turn moves). This provides the most accurate played-move evaluation.
3. **Fallback:** if verification fails, `playedEval = result.evalScore` (the best-move score, a coarse fallback).

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

The `analysisCache` in the game store is an array of `AnalysisCacheEntry` objects: `{ bestPitIndex: number, bestEval: number, pv: number[], depth: number, playedEval: number, rootScores: Record<number, number>, reachedTerminal: boolean }`. It is persisted as part of `mancala-current-game`.

---

## 12. Endgame Tablebase

**File:** `src/engine/tablebase.ts`

### Definition
A **combinatorial endgame tablebase** for Kalah(6,4) that pre-computes the proven score (store-difference advantage) for every possible distribution of stones into pits. The tablebase answers the question: "Given only the stones currently in pits (ignoring stores), who can force what final margin under optimal play?"

### Sizing
- The parameter K is the maximum total stones considered for the tablebase.
- Production uses **K = 12** (the initial 48 stones is too large; 12 covers all mid-to-late endgame positions).
- Number of entries: `2 × compositionsCount(12, 13) = 2 × C(12 + 13 - 1, 13 - 1) = 2 × C(24, 12) = 2 × 2,704,156 = 5,408,312`.
- Memory: one `Int8Array` of 5,408,312 bytes ≈ **5.2 MiB**.
- Each entry is a single signed byte: the proven score for the side-to-move (positive = good, negative = bad), or `NON_PROBEABLE = -128` for positions the tablebase cannot solve.

### Generation algorithm (level-stratified value iteration)
For each stone level `k = 0, 1, ..., K`:

1. **Pessimistic fixpoint:** Initialize all entries to `−k` (worst case for side-to-move). Iterate until convergence: for each position, pick the move that maximizes `ownStoreGain + tableScore(child)`.
2. **Optimistic fixpoint:** Initialize all entries to `+k` (best case for side-to-move). Iterate similarly.
3. **Dual-fixpoint verification:** If the pessimistic and optimistic scores agree for a given position, the tablebase stores the proven value. Otherwise, the position is marked `NON_PROBEABLE` (unsolvable at this K).

### Score encoding
- Raw tablebase scores range from `−K` to `+K` (pure store-difference, ignoring already-collected stones).
- `encodeProven(storeDifference + tbScore)` shifts the combined score into the mate-band range `±[WIN_SCORE − MAX_PLY, WIN_SCORE]` for full compatibility with the search engine's score conventions.

### IndexedDB caching
- On first use, the tablebase is generated in the analysis worker via `generateTablebase(K, KALAH_STANDARD, progressCallback)`.
- The `progressCallback` sends `tbProgress` messages (type, level, percent) to the client for UI display.
- After generation, the `Int8Array` is persisted to IndexedDB under key `tb-k12-kalah-standard-v1` in store `mancala-tablebase/tables`.
- On subsequent page loads, the cached table is loaded from IndexedDB (3-second timeout fallback to direct generation).

### Probe integration
- `createTablebaseProbe(table, offsets, maxK)` creates a fast probe function `(pits, side) => number | undefined`.
- The probe is wrapped at the worker level to add the current store-difference to the tablebase score.
- Both `minimaxWithABTT` and `iterativeDeepening` accept an optional `TablebaseProbe` parameter. When the probe returns a value for a given position, the search uses it as a proven terminal score, pruning the subtree entirely.

### Best-move selection
- `createTablebaseBestMove(table, offsets, maxK, rules)` creates a function `(state) => number | undefined` that picks the move leading to the highest combined (storeGain + childTBScore), considering extra-turn and normal-turn cases with correct sign conventions.

---

## KNOWN ISSUES (resolved)

The two previously documented issues have been resolved across the following commits:

1. **Analysis timeout (was ~5 min/pos):** Resolved by adding `SearchLimits.deadlineMs` enforcement inside `minimaxWithABTT` (intra-iteration abort at node level every 2048 nodes), capping extra-turn chains at `MAX_EXTRA_TURN_EXTENSION = 3`, and setting realistic production budgets of `ANALYSIS_POSITION_BUDGET_MS = 3000 ms`. The end-to-end test verifies bounded-time completion with a "never hangs" guarantee.

2. **Single-move PV display:** Resolved by replacing the hardcoded 100ms per-step budget in `extractPrincipalVariation` with a budget proportional to the remaining main budget, integrating the tablebase endpoint for endgame PV extension, and adding the `reachedTerminal` flag so the UI can distinguish "game ended" from "PV truncated."

---

## 13. Mangala Rules (Turkish variant)

**File:** `src/engine/rules.ts`, `src/engine/moves.ts`

The engine supports Mangala (Turkish Mancala) as a second game variant alongside Kalah. All four rule differences are `RuleConfig`-driven:

| Rule | Kalah | Mangala |
|---|---|---|
| `sowing` | `'skip-source'` | `'include-source'` |
| `captureRule` | `'kalah-standard'` | `'mangala'` |
| `endSweep` | `'to-side-owner'` | `'to-emptied-player'` |
| `extraTurnEnabled` | `true` | `true` |

### 13a. Include-source sowing (`moves.ts:105-114`)

When `sowing === 'include-source'` and the pit has ≥2 stones, the first stone is placed back into the source pit before the remaining stones are distributed. With 1 stone, the single stone is sown to the next position (same as skip-source). The source pit's final stone count is 1 (the returned stone) when the move produces no captures.

### 13b. Mangala capture (`moves.ts:131-151`)

When `captureRule === 'mangala'` and the last stone does NOT land in the player's store:

- **Own pit, exactly 1 stone:** Kalah-style capture — capture the opposite pit's stones plus the capturing stone.
- **Opponent's pit, even count:** capture those stones directly.
- **Opponent's pit, odd count:** no capture.
- **Own pit, >1 stone:** no capture (the just-sown stone adds to existing stones).

### 13c. Reversed end sweep (`moves.ts:52-63`)

When `endSweep === 'to-emptied-player'`, the player whose side is emptied collects the **opponent's** remaining pit stones. This is the reverse of Kalah, where each side keeps its own. If both sides are empty, no sweep occurs.

### 13d. Interaction with tablebase

The tablebase decomposability property holds for Mangala (store contents never influence legal play or stone flow), so the same `generateTablebase` function works with `MANGALA_STANDARD`. The `computeTBEntry` function in `tablebase.ts` handles include-source sowing, the dual capture modes, and reversed end-sweep identically to `applyMove` — both call the same `computeMoveDetails` + `applyFinalSweep` path.

### 13e. Per-game tablebase keys

IndexedDB tablebase cache keys are per-game:

| Game | Key |
|---|---|
| Kalah | `tb-k12-kalah-standard-v2` |
| Mangala | `tb-k12-mangala-standard-v2` |

The `TB_K = 12` parameter (5.4M entries, ~5.2 MiB) is shared across games.

### 13f. Per-game evaluation weights

Evaluation weights have per-game defaults in `WEIGHTS_BY_GAME` (`src/bots/evaluation.ts:179`):

| Weight | Kalah | Mangala (initial) |
|---|---|---|
| `storeDiff` | 1.0 | 1.0 |
| `mobility` | 0.5 | 0.5 |
| `pitStones` | [0.06, 0.07, 0.08, 0.09, 0.10, 0.11] | [0, 0, 0, 0, 0, 0] |
| `ownCapturePerStone` | 0.6 | 0.6 |
| `oppCaptureThreatPerStone` | 0 | 0 |
| `extraTurnMove` | 0 | 0 |
| `emptyPitSetup` | 0.2 | 0.2 |

Mangala's pit-stone weights are zeroed because the reversed end-sweep (the emptied player collects the opponent's remaining stones) makes Kalah's hoard-friendly positive pit weights strategically backwards. Mangala weights are tuned via `scripts/tuneEval.ts --game mangala` (see §13g).

### 13g. Mangala evaluation weight tuning results

Tuning follows the same two-tier methodology as Kalah: a 6-phase parameter sweep at a fast time control (`scripts/tuneMangalaSweep.ts`), followed by validation at Expert production budget (`scripts/validateMangala.ts`).

**Tier 1 — 300ms/move sweep (40 games per config vs baseline placeholder):**

Baseline: `WEIGHTS_BY_GAME.mangala` (storeDiff=1, mobility=0.5, pitStones=[0,0,0,0,0,0], ownCapture=0.6, extraTurn=0, oppThreat=0, emptyPitSetup=0.2)

| Phase | Best config | W / D / L | Score % |
|---|---|---|---|
| P1-pitStones | flat-neg(-0.08) | 21 / 19 / 0 | 76.3% |
| P2-extraTurnMove | extraTurn=0.4 | 36 / 4 / 0 | 95.0% |
| P3-ownCapturePerStone | ownCapture=0.8 | 38 / 2 / 0 | 97.5% |
| P4-oppCaptureThreat | oppThreat=0 (keep) | 38 / 0 / 2 | 95.0% |
| P5-mobility | mobility=0.5 (keep) | 37 / 3 / 0 | 96.3% |

Sweep-best config: `pitStones=[-0.08,...], ownCapturePerStone=0.8, extraTurnMove=0.4, mobility=0.5, oppCaptureThreatPerStone=0`

Sweep findings (all vs baseline):
- Positive pit stones (0.03) scored 23.8% — severely punished in Mangala
- Negative pit stones (-0.08) scored 76.3% — strongly favoured at shallow depth
- extraTurnMove peaked at 0.4 (95.0%); higher values declined (0.8: 43.8%)
- ownCapturePerStone peaked at 0.8 (97.5%); higher values declined (1.2: 46.3%)
- oppCaptureThreatPerStone uniformly hurt performance (best was 0)
- mobility peaked at 0.5 (96.3%), same as Kalah

**Tier 2 — 3000ms/move validation (Expert production budget):**

The sweep-best config was tested at 3000ms/move (20 games) vs the baseline placeholder:

`pitStones=[-0.08,...], ownCapture=0.8, extraTurn=0.4` vs baseline: **0W / 1D / 19L = 2.5% score**

Isolated 3000ms tests (8 games each vs baseline):

| Change | W / D / L | Score % |
|---|---|---|
| `pitStones=[-0.08]` only | 0 / 2 / 6 | 12.5% |
| `extraTurnMove=0.4` only | 2 / 2 / 4 | 37.5% |
| `ownCapturePerStone=0.8` only | 1 / 6 / 1 | 50.0% |
| `pits [-0.08] + extraTurn 0.4` | 0 / 4 / 4 | 25.0% |
| `pits [-0.08] + ownCapture 0.8` | 1 / 6 / 1 | 50.0% |

**Conclusion:** The 300ms sweep identified promising directions (negative pit stones, extra-turn weighting) that fail to transfer to 3000ms production depth. The deeper search punishes the aggressive stone-shedding strategy that shallow search favours. No candidate reliably beat the baseline at 3000ms. The placeholder `WEIGHTS_BY_GAME.mangala` is kept unchanged. Future tuning efforts should use ≥3000ms time controls or time-odds methodology to prevent shallow-depth overfitting.

### 13h. Game-tagged gameText headers

`gameToText` (`src/engine/notation.ts`) prefixes the game notation with a header line matching `^\[Game "([^"]*)"\]`. When the header is absent (legacy), the game defaults to Kalah. `parseGameText` accepts an optional `defaultGame` parameter for backward compatibility.
