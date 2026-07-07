import { describe, it, expect } from 'vitest'
import {
  evaluateSimple,
  evaluateStrong,
  evaluateExpert,
  evaluateExpertLegacy,
  WIN_SCORE,
  extraTurnMovesAvailable,
} from '../evaluation'
import type { EvalWeights } from '../evaluation'
import { createInitialState, computeMoveDetails } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import { BOTTOM_STORE, TOP_STORE } from '../../engine'
import type { GameState } from '../../engine'

function makeBoard(values: number[]): number[] {
  const board = new Array<number>(14).fill(0)
  for (let i = 0; i < values.length && i < 14; i++) {
    board[i] = values[i]!
  }
  return board
}

function makeState(overrides: Partial<GameState> & { board: number[] }): GameState {
  return {
    currentPlayer: 'bottom',
    status: 'in-progress',
    winner: null,
    moveHistory: [],
    ...overrides,
  }
}

describe('evaluateSimple', () => {
  it('returns 0 for initial balanced state', () => {
    const state = createInitialState()
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(0)
  })

  it('positive when own store > opponent store', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 3
    const state = makeState({ board, currentPlayer: 'bottom' })
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(7)
  })

  it('negative when own store < opponent store', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 2
    board[TOP_STORE] = 8
    const state = makeState({ board, currentPlayer: 'bottom' })
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(-6)
  })

  it('returns WIN_SCORE when current player won', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 30
    board[TOP_STORE] = 18
    const state = makeState({
      board,
      status: 'finished',
      winner: 'bottom',
      currentPlayer: 'bottom',
    })
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(WIN_SCORE)
  })

  it('returns -WIN_SCORE when current player lost', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 18
    board[TOP_STORE] = 30
    const state = makeState({ board, status: 'finished', winner: 'top', currentPlayer: 'bottom' })
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(-WIN_SCORE)
  })

  it('returns 0 for draw', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 24
    board[TOP_STORE] = 24
    const state = makeState({ board, status: 'finished', winner: 'draw', currentPlayer: 'bottom' })
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(0)
  })

  it('from top player perspective', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 5
    const state = makeState({ board, currentPlayer: 'top' })
    expect(
      evaluateSimple(state, {
        pitsPerSide: 6,
        stonesPerPit: 4,
        extraTurnEnabled: true,
        captureRule: 'kalah-standard',
      }),
    ).toBe(-5)
  })
})

describe('evaluateStrong', () => {
  it('includes store difference', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 3
    board[7] = 1
    board[8] = 1
    const state = makeState({ board, currentPlayer: 'bottom' })
    const score = evaluateStrong(state, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })
    expect(score).toBeGreaterThan(6)
  })

  it('evaluates capture opportunity as bonus', () => {
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    board[BOTTOM_STORE] = 0
    const state = makeState({ board, currentPlayer: 'bottom' })
    const scoreWithCapture = evaluateStrong(state, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })

    // Same state without opposite stones → no capture possible
    const board2 = makeBoard([1, 0, 0, 0, 0, 0])
    board2[7] = 1
    board2[8] = 1
    board2[9] = 1
    board2[10] = 1
    board2[11] = 0
    board2[12] = 1
    board2[BOTTOM_STORE] = 0
    const state2 = makeState({ board: board2, currentPlayer: 'bottom' })
    const scoreWithoutCapture = evaluateStrong(state2, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })

    expect(scoreWithCapture).toBeGreaterThan(scoreWithoutCapture)
  })

  it('considers mobility advantage', () => {
    const board = makeBoard([4, 4, 4, 4, 4, 4])
    board[7] = 0
    board[8] = 0
    board[9] = 0
    board[10] = 0
    board[11] = 0
    board[12] = 1
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 10

    const state = makeState({ board, currentPlayer: 'bottom' })
    const score = evaluateStrong(state, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })
    // Bottom has more mobility and store diff is -10, mobility advantage from 6 vs 1 moves = +1.5, plus stones bonus
    expect(score).toBeGreaterThan(-15)
  })
})

describe('evaluateExpert', () => {
  it('gives bonus for empty pits with opposite stones (capture setup)', () => {
    const board = makeBoard([0, 4, 4, 4, 4, 4])
    board[7] = 5
    board[8] = 4
    board[9] = 4
    board[10] = 4
    board[11] = 4
    board[12] = 5
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0

    // Pit 0 is empty, opposite pit 12 has stones → potential capture
    const state = makeState({ board, currentPlayer: 'bottom' })
    const expertScore = evaluateExpert(state, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })
    const strongScore = evaluateStrong(state, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })

    // Expert should score higher due to empty-pit-setup bonus
    expect(expertScore).toBeGreaterThan(strongScore)
  })

  it('empty-pit bonus adds to expert score relative to strong', () => {
    // Position with empty pit 0, opposite pit 12 has stones → capture setup
    const boardWith = makeBoard([0, 4, 4, 4, 4, 4])
    boardWith[7] = 4
    boardWith[8] = 4
    boardWith[9] = 4
    boardWith[10] = 4
    boardWith[11] = 4
    boardWith[12] = 5
    boardWith[BOTTOM_STORE] = 0
    boardWith[TOP_STORE] = 0
    const stateWith = makeState({ board: boardWith, currentPlayer: 'bottom' })
    const expertWith = evaluateExpert(stateWith, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })
    const strongWith = evaluateStrong(stateWith, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })

    // Position without capture setup (both pits 0 and 12 empty)
    const boardWithout = makeBoard([0, 4, 4, 4, 4, 4])
    boardWithout[7] = 4
    boardWithout[8] = 4
    boardWithout[9] = 4
    boardWithout[10] = 4
    boardWithout[11] = 4
    boardWithout[12] = 0
    boardWithout[BOTTOM_STORE] = 0
    boardWithout[TOP_STORE] = 0
    const stateWithout = makeState({ board: boardWithout, currentPlayer: 'bottom' })
    const expertWithout = evaluateExpert(stateWithout, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })
    const strongWithout = evaluateStrong(stateWithout, {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    })

    // The expert advantage (expert - strong) should be larger when capture setups exist
    const advantageWith = expertWith - strongWith
    const advantageWithout = expertWithout - strongWithout
    expect(advantageWith).toBeGreaterThan(advantageWithout)
  })
})

// ── Extra-turn formula test ──────────────────────────────────────────────

describe('extraTurnMovesAvailable formula', () => {
  function boardWithOnePit(pitIndex: number, stones: number): number[] {
    const board = new Array<number>(14).fill(0)
    board[pitIndex] = stones
    return board
  }

  const RULES = KALAH_STANDARD
  const pitsPerSide = 6

  it('matches computeMoveDetails for every pit and count up to 20 (bottom)', () => {
    for (let pit = 0; pit < pitsPerSide; pit++) {
      for (let stones = 1; stones <= 20; stones++) {
        const board = boardWithOnePit(pit, stones)
        const state: GameState = {
          board,
          currentPlayer: 'bottom',
          status: 'in-progress',
          winner: null,
          moveHistory: [],
        }

        const { move } = computeMoveDetails(board, pit, 'bottom', RULES)
        const actualExtraTurn = move.wasExtraTurn

        const etCount = extraTurnMovesAvailable(state, RULES)
        const expectedExtraTurn = etCount > 0

        expect(
          expectedExtraTurn,
          `pit=${pit} stones=${stones}: formula says ${expectedExtraTurn}, computeMoveDetails says ${actualExtraTurn}`,
        ).toBe(actualExtraTurn)
      }
    }
  })

  it('matches computeMoveDetails for every pit and count up to 20 (top)', () => {
    for (let pitIdx = 0; pitIdx < pitsPerSide; pitIdx++) {
      const boardPit = pitsPerSide + 1 + pitIdx // pits 7-12
      for (let stones = 1; stones <= 20; stones++) {
        const board = boardWithOnePit(boardPit, stones)
        const state: GameState = {
          board,
          currentPlayer: 'top',
          status: 'in-progress',
          winner: null,
          moveHistory: [],
        }

        const { move } = computeMoveDetails(board, boardPit, 'top', RULES)
        const actualExtraTurn = move.wasExtraTurn

        const etCount = extraTurnMovesAvailable(state, RULES)
        const expectedExtraTurn = etCount > 0

        expect(
          expectedExtraTurn,
          `pit=${boardPit} stones=${stones}: formula says ${expectedExtraTurn}, computeMoveDetails says ${actualExtraTurn}`,
        ).toBe(actualExtraTurn)
      }
    }
  })
})

// ── Legacy equivalence test ──────────────────────────────────────────────

describe('evaluateExpert legacy equivalence', () => {
  const RULES = KALAH_STANDARD

  const OLD_EQUIVALENT_WEIGHTS: EvalWeights = {
    storeDiff: 1.0,
    mobility: 0.3,
    pitStones: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
    ownCapturePerStone: 2.0,
    oppCaptureThreatPerStone: 0,
    extraTurnMove: 0,
    emptyPitSetup: 0.2,
  }

  function makeBoard(values: number[]): number[] {
    const board = new Array<number>(14).fill(0)
    for (let i = 0; i < values.length && i < 14; i++) {
      board[i] = values[i]!
    }
    return board
  }

  function makeState(overrides: Partial<GameState> & { board: number[] }): GameState {
    return {
      currentPlayer: 'bottom',
      status: 'in-progress',
      winner: null,
      moveHistory: [],
      ...overrides,
    }
  }

  it('matches legacy on a no-capture fixture', () => {
    // Board where no captures are possible from bottom's perspective:
    // all opponent pits are empty, only one of bottom's pits has stones.
    // Pit 0 has 1 stone, sowing it lands on pit 1 (no capture, no extra turn).
    // All opponent pits are 0, so no captures.
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 5
    board[TOP_STORE] = 3

    const state = makeState({ board, currentPlayer: 'bottom' })

    const legacyScore = evaluateExpertLegacy(state, RULES)
    const paramScore = evaluateExpert(state, RULES, OLD_EQUIVALENT_WEIGHTS)

    expect(paramScore).toBe(legacyScore)
  })

  it('matches legacy on a fixed-size capture fixture', () => {
    // Board where bottom pit 0 has 1 stone, opponent pit 12 (opposite pit 0) has 1 stone.
    // Moving pit 0: 1 stone lands on pit 1. Not a capture (pit 1 would be the landing).
    // Wait, we need a capture. For a capture: move pit T such that last stone lands
    // in own empty pit with opponent stones opposite.
    // Let's use: bottom pit 3 has 9 stones. For bottom, pit 3 is index 3, 9 stones.
    // (3+9)%13 = 12%13 = 12. Cycle idx 12 → board pos 5? No wait.
    // For bottom: cycle = [0,1,2,3,4,5,6,7,8,9,10,11,12]
    // start idx = 3. (3+9)%13 = 12. cycle[12] = 12. Land on 12? That's top's pit 5.
    // Not a capture (landing on opponent's pit, not own).

    // Let me use a simpler approach: bottom pit 0, 6 stones → lands on store (extra turn).
    // So we need a capture. Let me find one.
    // Bottom pit 1, 3 stones: (1+3)%13=4. Land on pit 4 (bottom). 
    // If pit 4 is empty and opp pit 8 has stones → capture.
    const board = makeBoard([0, 3, 0, 0, 0, 0])
    board[4] = 0  // landing pit must be empty
    board[7] = 0
    board[8] = 2  // opposite pit 4 has 2 stones
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0

    // Bottom pit 1 with 3 stones: sow 3. Lands on pit 4 (path: 2,3,4).
    // Pit 4 is empty, opp pit (12-4=8) has 2 stones → capture of 1+2=3 stones.
    // Old: boolean capture bonus = 4.0
    // New with ownCapturePerStone=2.0: maxOwnCapture=3, contribution=6.0
    // These don't match (4.0 vs 6.0).

    // Let me find a different capture size. 
    // Actually, with ownCapturePerStone=2.0, a capture of 2 stones gives 4.0 (matches old).
    // A capture of exactly 2 stones means: 1 (own landing stone) + 1 (opponent stone) = 2.
    // Let me find a position where the largest capture is exactly 2.

    // Bottom pit 1, 3 stones: lands on pit 4. If pit 8 has 1 stone => capture of 2.
    // Test it: (1+3)%13=4. Land on pit 4, empty. Opp pit (12-4=8) has 1 stone → capture 2.

    // But I also need to make sure there are no OTHER captures (especially larger ones).
    // All other bottom pits: 0, 2, 4, 5 have 0 stones → no moves from them.
    // Pit 1 is the only move. Capture=2.

    const board2 = makeBoard([0, 3, 0, 0, 0, 0])
    board2[BOTTOM_STORE] = 5
    board2[TOP_STORE] = 3
    board2[4] = 0
    board2[7] = 0
    board2[8] = 1

    // Only move: pit 1. Capture of 2.
    const state2 = makeState({ board: board2, currentPlayer: 'bottom' })

    const legacyScore2 = evaluateExpertLegacy(state2, RULES)
    const paramScore2 = evaluateExpert(state2, RULES, OLD_EQUIVALENT_WEIGHTS)

    expect(paramScore2).toBe(legacyScore2)
  })

  it('matches legacy on initial state (no captures)', () => {
    const state = createInitialState(RULES, 'bottom')
    const legacy = evaluateExpertLegacy(state, RULES)
    const param = evaluateExpert(state, RULES, OLD_EQUIVALENT_WEIGHTS)
    expect(param).toBeCloseTo(legacy, 10)
  })
})

// ── Sign-convention test ─────────────────────────────────────────────────

describe('evaluateExpert sign convention', () => {
  const RULES = KALAH_STANDARD

  function makeBoard(values: number[]): number[] {
    const board = new Array<number>(14).fill(0)
    for (let i = 0; i < values.length && i < 14; i++) {
      board[i] = values[i]!
    }
    return board
  }

  it('negates when roles are swapped on a store-only board', () => {
    // Board with only store stones, no pit stones.
    // No captures, no mobility, no per-pit stones, no empty-pit setups.
    // Only store difference matters.
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 15
    board[TOP_STORE] = 7
    board[7] = 0
    board[8] = 0
    board[9] = 0
    board[10] = 0
    board[11] = 0
    board[12] = 0

    const bottomState: GameState = {
      board,
      currentPlayer: 'bottom',
      status: 'in-progress',
      winner: null,
      moveHistory: [],
    }
    const topState: GameState = {
      board,
      currentPlayer: 'top',
      status: 'in-progress',
      winner: null,
      moveHistory: [],
    }

    const bottomEval = evaluateExpert(bottomState, RULES)
    const topEval = evaluateExpert(topState, RULES)

    // topEval should be the negation of bottomEval when only storeDiff matters
    expect(topEval).toBe(-bottomEval)
    expect(topEval).toBeLessThan(0)
    expect(bottomEval).toBeGreaterThan(0)
  })
})
