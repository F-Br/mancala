import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createInitialState, applyMove, gameToText, cloneState, legalMoves } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import type { GameState, Side, RuleConfig } from '../../engine'
import { useGameStore } from '../gameStore'
import type { AnalysisCacheEntry } from '../gameStore'
import { useHistoryStore } from '../historyStore'
import { _setAnalyzeFn, _resetForTest, useAnalysisService, recordAnalysisStatus } from '../analysisService'
import type { CurrentJob } from '../analysisService'
import type { AnalysisResult } from '../../bots/analysisClient'

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../bots/analysisClient', () => ({
  requestAnalysis: vi.fn(),
  setOnTBProgress: vi.fn(),
  terminateAnalysisWorker: vi.fn(),
}))

// ── Helpers ─────────────────────────────────────────────────────────

function makeFakeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    pitIndex: 0,
    evalScore: 0,
    principalVariation: [0, 8],
    depthReached: 4,
    rootScores: {},
    reachedTerminal: false,
    ...overrides,
  }
}

function makeHealthyCache(length: number): AnalysisCacheEntry[] {
  const entries: AnalysisCacheEntry[] = []
  for (let i = 0; i < length; i++) {
    entries.push({
      bestPitIndex: i % 6,
      bestEval: 1,
      pv: [(i % 6), 8, 1],
      depth: 6,
      playedEval: 0.5,
      rootScores: {},
      reachedTerminal: false,
    })
  }
  return entries
}

function buildGameWithMoves(moves: number[]): { gameState: GameState; firstPlayer: Side } {
  let state = createInitialState(KALAH_STANDARD, 'bottom')
  for (const pit of moves) {
    if (state.status !== 'in-progress') break
    state = applyMove(state, pit, KALAH_STANDARD)
  }
  return { gameState: state, firstPlayer: 'bottom' as Side }
}

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  _resetForTest()
  useGameStore.setState({
    gameState: null,
    savedMeta: null,
    analysisCache: null,
  })
  useHistoryStore.setState({ records: [] })
  localStorage.clear()
})

// ── Tests ───────────────────────────────────────────────────────────

describe('analysisService', () => {
  // ── Idempotency ──────────────────────────────────────────────────

  it('two requestAnalysis calls with same gameText while first runs → one execution', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1, 9])
    const gameText = gameToText(gameState)

    let analyzeCalls = 0
    _setAnalyzeFn(async () => {
      analyzeCalls++
      await new Promise((r) => setTimeout(r, 10))
      return makeFakeResult()
    })

    const svc = useAnalysisService.getState()
    svc.requestAnalysis({ gameText, gameState, firstPlayer, rules: KALAH_STANDARD })

    await new Promise((r) => setTimeout(r, 2))
    svc.requestAnalysis({ gameText, gameState, firstPlayer, rules: KALAH_STANDARD })

    const moveCount = gameState.moveHistory.length

    await vi.waitFor(
      () => {
        const s = useAnalysisService.getState()
        expect(s.current).toBeNull()
        expect(s.queue).toHaveLength(0)
      },
      { timeout: 5000 },
    )

    const expectedCalls = moveCount
    expect(analyzeCalls).toBe(expectedCalls)
  })

  // ── Skip-if-analyzed ─────────────────────────────────────────────

  it('history record with healthy analysisResult → no execution', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1])
    const gameText = gameToText(gameState)

    useHistoryStore.getState().addRecord({
      id: 'test-skip',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText,
      analysisResult: makeHealthyCache(gameState.moveHistory.length),
      dateISO: new Date().toISOString(),
    })

    let analyzeCalls = 0
    _setAnalyzeFn(async () => {
      analyzeCalls++
      return makeFakeResult()
    })

    useAnalysisService.getState().requestAnalysis({
      gameText,
      gameState,
      firstPlayer,
      rules: KALAH_STANDARD,
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(analyzeCalls).toBe(0)
    expect(useAnalysisService.getState().current).toBeNull()
  })

  // ── Completion routing ───────────────────────────────────────────

  it('on completion: updateAnalysisInHistory receives entries', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1])
    const gameText = gameToText(gameState)

    useHistoryStore.getState().addRecord({
      id: 'test-complete',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText,
      dateISO: new Date().toISOString(),
    })

    _setAnalyzeFn(async () => makeFakeResult({ pitIndex: 5 }))

    useAnalysisService.getState().requestAnalysis({
      gameText,
      gameState,
      firstPlayer,
      rules: KALAH_STANDARD,
    })

    await vi.waitFor(
      () => {
        const s = useAnalysisService.getState()
        expect(s.current).toBeNull()
      },
      { timeout: 5000 },
    )

    const record = useHistoryStore.getState().records.find((r) => r.gameText === gameText)
    expect(record?.analysisResult).toBeDefined()
    expect(record!.analysisResult!.length).toBe(gameState.moveHistory.length)
    expect(record!.analysisResult![0]!.bestPitIndex).toBe(5)
  })

  it('setAnalysisCache NOT called when store-loaded game does not match', async () => {
    const job = buildGameWithMoves([2, 8])
    const jobText = gameToText(job.gameState)

    useHistoryStore.getState().addRecord({
      id: 'cache-nomatch',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: jobText,
      dateISO: new Date().toISOString(),
    })

    _setAnalyzeFn(async () => makeFakeResult({ pitIndex: 3 }))

    useGameStore.setState({ gameState: null, analysisCache: null })

    useAnalysisService.getState().requestAnalysis({
      gameText: jobText,
      gameState: job.gameState,
      firstPlayer: job.firstPlayer,
      rules: KALAH_STANDARD,
    })

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    expect(useGameStore.getState().analysisCache).toBeNull()
  })

  it('setAnalysisCache called when store-loaded game matches job (non-in-progress)', async () => {
    // Use a smaller rule config so the game finishes quickly.
    const smallRules: RuleConfig = {
      pitsPerSide: KALAH_STANDARD.pitsPerSide,
      stonesPerPit: 1,
      extraTurnEnabled: KALAH_STANDARD.extraTurnEnabled,
      captureRule: KALAH_STANDARD.captureRule,
    }

    let state = createInitialState(smallRules, 'bottom')
    let iter = 0
    while (state.status === 'in-progress' && iter < 500) {
      iter++
      const m = legalMoves(state, smallRules)
      if (m.length === 0) break
      state = applyMove(state, m[m.length - 1]!, smallRules)
    }
    expect(state.status).toBe('finished')

    const jobText = gameToText(state)

    useHistoryStore.getState().addRecord({
      id: 'cache-match-finished',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: state.board[6]!, opponent: state.board[13]! },
      gameText: jobText,
      dateISO: new Date().toISOString(),
    })

    _setAnalyzeFn(async () => makeFakeResult({ pitIndex: 3 }))

    useGameStore.setState({
      gameState: cloneState(state),
      firstPlayer: 'bottom' as Side,
    })
    expect(useGameStore.getState().analysisCache).toBeNull()

    useAnalysisService.getState().requestAnalysis({
      gameText: jobText,
      gameState: state,
      firstPlayer: 'bottom' as Side,
      rules: smallRules,
    })

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    expect(useGameStore.getState().analysisCache).not.toBeNull()
    expect(useGameStore.getState().analysisCache!.length).toBe(state.moveHistory.length)
  })

  // ── Preemption ───────────────────────────────────────────────────

  it('job Y running, foreground request for X → Y cancelled, X completes and persists, then Y re-runs', async () => {
    const yGame = buildGameWithMoves([2, 8, 1, 9, 4]) // 5 moves
    const yText = gameToText(yGame.gameState)

    const xGame = buildGameWithMoves([3]) // 1 move
    const xText = gameToText(xGame.gameState)

    useHistoryStore.getState().addRecord({
      id: 'preempt-y',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: yText,
      dateISO: new Date().toISOString(),
    })
    useHistoryStore.getState().addRecord({
      id: 'preempt-x',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: xText,
      dateISO: new Date().toISOString(),
    })

    let analyzeCalls = 0
    const completedOperations: string[] = []

    _setAnalyzeFn(async () => {
      const callId = ++analyzeCalls
      const current = useAnalysisService.getState().current
      await new Promise((r) => setTimeout(r, 10))
      completedOperations.push(current?.gameText ?? 'unknown')
      return makeFakeResult({ pitIndex: callId })
    })

    // Start Y (non-foreground)
    useAnalysisService.getState().requestAnalysis({
      gameText: yText,
      gameState: yGame.gameState,
      firstPlayer: yGame.firstPlayer,
      rules: KALAH_STANDARD,
    })

    // Give Y time to start its first analyze call
    await new Promise((r) => setTimeout(r, 3))

    // Preempt with X (foreground)
    useAnalysisService.getState().requestAnalysis(
      {
        gameText: xText,
        gameState: xGame.gameState,
        firstPlayer: xGame.firstPlayer,
        rules: KALAH_STANDARD,
      },
      { foreground: true },
    )

    await vi.waitFor(
      () => {
        const s = useAnalysisService.getState()
        expect(s.current).toBeNull()
        expect(s.queue).toHaveLength(0)
      },
      { timeout: 5000 },
    )

    const yRecord = useHistoryStore.getState().records.find((r) => r.gameText === yText)
    expect(yRecord?.analysisResult).toBeDefined()

    // Y's persisted result should have entries matching the full move count
    expect(yRecord!.analysisResult!.length).toBe(yGame.gameState.moveHistory.length)

    // The first entry should NOT be from the cancelled run (it should be from the retry)
    // BOTH entries in Y's result should have pitIndex from the retry (not 1 which was the cancelled run)
    for (const entry of yRecord!.analysisResult!) {
      expect(entry.bestPitIndex).not.toBe(1) // 1 was the first call from the cancelled run
    }

    const xRecord = useHistoryStore.getState().records.find((r) => r.gameText === xText)
    expect(xRecord?.analysisResult).toBeDefined()
    expect(xRecord!.analysisResult!.length).toBe(xGame.gameState.moveHistory.length)

    // Y ran its full complement of positions only on the retry (not counting the cancelled one)
    // Total analyzeCalls should be: yMoveCount (cancelled run partial) + xMoveCount + yMoveCount (retry)
    // The cancelled run may contribute 1 call if it was in the middle of one when cancelled
    const yMoveCount = yGame.gameState.moveHistory.length
    const xMoveCount = xGame.gameState.moveHistory.length
    expect(analyzeCalls).toBeGreaterThanOrEqual(yMoveCount + xMoveCount)
  })

  // ── Pause while game in progress ─────────────────────────────────

  it('pauses analysis when gameStore has in-progress state, resumes when finished', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1])
    const gameText = gameToText(gameState)
    const moveCount = gameState.moveHistory.length

    // Set the game store to an in-progress state
    const inProgress = createInitialState(KALAH_STANDARD, 'bottom')
    useGameStore.setState({
      gameState: inProgress,
      firstPlayer: 'bottom',
      analysisCache: null,
      savedMeta: null,
    })

    let analyzeCalls = 0
    let resumedAfterPause = false

    _setAnalyzeFn(async (_state, _budgetMs, _playedPitIndex) => {
      analyzeCalls++
      if (useGameStore.getState().gameState?.status !== 'in-progress') {
        resumedAfterPause = true
      }
      return makeFakeResult()
    })

    useAnalysisService.getState().requestAnalysis({
      gameText,
      gameState,
      firstPlayer,
      rules: KALAH_STANDARD,
    })

    // Wait a bit — analysis should be paused
    await new Promise((r) => setTimeout(r, 200))
    expect(analyzeCalls).toBe(0)

    // Unpause by setting game state to null
    useGameStore.setState({ gameState: null })

    await vi.waitFor(
      () => {
        expect(resumedAfterPause).toBe(true)
      },
      { timeout: 5000 },
    )

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    expect(analyzeCalls).toBe(moveCount)
  })

  // ── Survival semantics ────────────────────────────────────────────

  it('analysis completes and persists without any component involvement', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1, 9])
    const gameText = gameToText(gameState)

    useHistoryStore.getState().addRecord({
      id: 'survival',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText,
      dateISO: new Date().toISOString(),
    })

    _setAnalyzeFn(async () => makeFakeResult({ pitIndex: 7 }))

    useAnalysisService.getState().requestAnalysis({
      gameText,
      gameState,
      firstPlayer,
      rules: KALAH_STANDARD,
    })

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    const record = useHistoryStore.getState().records.find((r) => r.gameText === gameText)
    expect(record?.analysisResult).toBeDefined()
    expect(record!.analysisResult!.length).toBe(gameState.moveHistory.length)
    expect(record!.analysisResult![0]!.bestPitIndex).toBe(7)
  })

  // ── cancelAll ────────────────────────────────────────────────────

  it('cancelAll stops running job and clears queue', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1, 9, 4])
    const gameText = gameToText(gameState)

    let analyzeCalls = 0
    _setAnalyzeFn(async () => {
      analyzeCalls++
      await new Promise((r) => setTimeout(r, 50))
      return makeFakeResult()
    })

    useAnalysisService.getState().requestAnalysis({
      gameText,
      gameState,
      firstPlayer,
      rules: KALAH_STANDARD,
    })

    await new Promise((r) => setTimeout(r, 5))
    expect(useAnalysisService.getState().current).not.toBeNull()

    useAnalysisService.getState().cancelAll()

    await new Promise((r) => setTimeout(r, 100))

    expect(useAnalysisService.getState().current).toBeNull()
    expect(useAnalysisService.getState().queue).toHaveLength(0)
  })

  // ── Batch sequential processing ──────────────────────────────────

  it('processes queued jobs sequentially', async () => {
    const game1 = buildGameWithMoves([2])
    const game2 = buildGameWithMoves([3])

    const text1 = gameToText(game1.gameState)
    const text2 = gameToText(game2.gameState)

    useHistoryStore.getState().addRecord({
      id: 'seq-1',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: text1,
      dateISO: new Date().toISOString(),
    })
    useHistoryStore.getState().addRecord({
      id: 'seq-2',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: text2,
      dateISO: new Date().toISOString(),
    })

    const processedOrder: string[] = []
    _setAnalyzeFn(async () => {
      const current = useAnalysisService.getState().current
      processedOrder.push(current?.gameText ?? 'unknown')
      return makeFakeResult()
    })

    useAnalysisService.getState().requestAnalysis({
      gameText: text1,
      gameState: game1.gameState,
      firstPlayer: game1.firstPlayer,
      rules: KALAH_STANDARD,
    })
    useAnalysisService.getState().requestAnalysis({
      gameText: text2,
      gameState: game2.gameState,
      firstPlayer: game2.firstPlayer,
      rules: KALAH_STANDARD,
    })

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    expect(processedOrder.length).toBeGreaterThanOrEqual(2)
    const firstJob = [...new Set(processedOrder)][0]
    expect(firstJob).toBe(text1)

    const record1 = useHistoryStore.getState().records.find((r) => r.gameText === text1)
    const record2 = useHistoryStore.getState().records.find((r) => r.gameText === text2)
    expect(record1?.analysisResult).toBeDefined()
    expect(record2?.analysisResult).toBeDefined()
  })

  // ── Auto-analyze trigger ──────────────────────────────────────────

  it('background request (foreground: false) runs and persists results', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1, 9])
    const gameText = gameToText(gameState)

    useHistoryStore.getState().addRecord({
      id: 'bg-trigger',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText,
      dateISO: new Date().toISOString(),
    })

    _setAnalyzeFn(async () => makeFakeResult({ pitIndex: 3 }))

    useAnalysisService.getState().requestAnalysis(
      { gameText, gameState, firstPlayer, rules: KALAH_STANDARD },
      { foreground: false },
    )

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    const record = useHistoryStore.getState().records.find((r) => r.gameText === gameText)
    expect(record?.analysisResult).toBeDefined()
    expect(record!.analysisResult!.length).toBe(gameState.moveHistory.length)
  })

  // ── Overlay attach (Review Screen idempotent attach) ──────────────

  it('foreground request for same gameText while background runs → idempotent attach, no second execution', async () => {
    const { gameState, firstPlayer } = buildGameWithMoves([2, 8, 1, 9])
    const gameText = gameToText(gameState)
    const moveCount = gameState.moveHistory.length

    useHistoryStore.getState().addRecord({
      id: 'attach',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText,
      dateISO: new Date().toISOString(),
    })

    let analyzeCalls = 0
    _setAnalyzeFn(async () => {
      analyzeCalls++
      await new Promise((r) => setTimeout(r, 10))
      return makeFakeResult()
    })

    // Start background job
    useAnalysisService.getState().requestAnalysis(
      { gameText, gameState, firstPlayer, rules: KALAH_STANDARD },
      { foreground: false },
    )

    await new Promise((r) => setTimeout(r, 5))

    // Simulate Review Screen foreground request for same game
    useAnalysisService.getState().requestAnalysis(
      { gameText, gameState, firstPlayer, rules: KALAH_STANDARD },
      { foreground: true },
    )

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    // Only one execution — analyzeCalls equals moveCount, not 2x
    expect(analyzeCalls).toBe(moveCount)
  })

  // ── Priority: background does not preempt foreground ──────────────

  it('background trigger fires while foreground for different game runs → queues, does not preempt', async () => {
    const fgGame = buildGameWithMoves([2, 8, 1, 9, 4])
    const fgText = gameToText(fgGame.gameState)

    const bgGame = buildGameWithMoves([3])
    const bgText = gameToText(bgGame.gameState)

    useHistoryStore.getState().addRecord({
      id: 'prio-fg',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: fgText,
      dateISO: new Date().toISOString(),
    })
    useHistoryStore.getState().addRecord({
      id: 'prio-bg',
      mode: 'local-2p',
      playerSide: 'bottom',
      opponentLabel: 'P2',
      result: 'win',
      finalScore: { player: 24, opponent: 20 },
      gameText: bgText,
      dateISO: new Date().toISOString(),
    })

    const runOrder: string[] = []
    let fgAnalyzeCount = 0

    _setAnalyzeFn(async () => {
      const s = useAnalysisService.getState()
      const currentText = s.current?.gameText ?? 'unknown'
      runOrder.push(currentText)
      if (currentText === fgText) {
        fgAnalyzeCount++
        await new Promise((r) => setTimeout(r, 20))
      }
      return makeFakeResult()
    })

    // Start foreground job
    useAnalysisService.getState().requestAnalysis(
      { gameText: fgText, gameState: fgGame.gameState, firstPlayer: fgGame.firstPlayer, rules: KALAH_STANDARD },
      { foreground: true },
    )

    // Give fg time to start its first analyze call
    await new Promise((r) => setTimeout(r, 5))

    // Background job queued while foreground runs
    useAnalysisService.getState().requestAnalysis(
      { gameText: bgText, gameState: bgGame.gameState, firstPlayer: bgGame.firstPlayer, rules: KALAH_STANDARD },
      { foreground: false },
    )

    // Verify bg is in queue while fg is still running (delayed by 20ms per analyze call)
    expect(useAnalysisService.getState().queue).toContain(bgText)

    await vi.waitFor(
      () => {
        expect(useAnalysisService.getState().current).toBeNull()
      },
      { timeout: 5000 },
    )

    // Foreground completed first
    const fgFirstIndex = runOrder.indexOf(fgText)
    const bgFirstIndex = runOrder.indexOf(bgText)
    expect(fgFirstIndex).toBeGreaterThanOrEqual(0)
    expect(bgFirstIndex).toBeGreaterThan(fgFirstIndex) // bg runs after fg

    const bgRecord = useHistoryStore.getState().records.find((r) => r.gameText === bgText)
    expect(bgRecord?.analysisResult).toBeDefined()
  })

  // ── recordAnalysisStatus pure function ────────────────────────────

  describe('recordAnalysisStatus', () => {
    const fakeCurrent = (gameText: string): CurrentJob => ({
      gameText,
      progress: { current: 5, total: 20, remainingS: 30 },
      tbPhase: false,
    })

    it('returns "analyzing" when gameText matches current job', () => {
      expect(
        recordAnalysisStatus('game-x', { current: fakeCurrent('game-x'), queue: [] }, false),
      ).toBe('analyzing')
    })

    it('returns "queued" when gameText is in queue and not current', () => {
      expect(
        recordAnalysisStatus('game-x', { current: null, queue: ['game-x'] }, false),
      ).toBe('queued')
    })

    it('returns "done" when not in service but has analysis', () => {
      expect(
        recordAnalysisStatus('game-x', { current: null, queue: [] }, true),
      ).toBe('done')
    })

    it('returns "none" when not in service and no analysis', () => {
      expect(
        recordAnalysisStatus('game-x', { current: null, queue: [] }, false),
      ).toBe('none')
    })

    it('returns "analyzing" even when hasAnalysis is true (current jobs take priority)', () => {
      expect(
        recordAnalysisStatus('game-x', { current: fakeCurrent('game-x'), queue: [] }, true),
      ).toBe('analyzing')
    })

    it('returns "queued" even when hasAnalysis is true (queued takes priority)', () => {
      expect(
        recordAnalysisStatus('game-x', { current: null, queue: ['game-x'] }, true),
      ).toBe('queued')
    })
  })
})
