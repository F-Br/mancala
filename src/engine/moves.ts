import type { GameState, Move, RuleConfig, Side } from './types'
import { BOTTOM_STORE, TOP_STORE, BOARD_LENGTH } from './types'
import { KALAH_STANDARD } from './rules'
import { cloneState } from './state'

function getOwnStore(player: Side): number {
  return player === 'bottom' ? BOTTOM_STORE : TOP_STORE
}

function getOpponentStore(player: Side): number {
  return player === 'bottom' ? TOP_STORE : BOTTOM_STORE
}

function isOwnPit(pitIndex: number, player: Side, pitsPerSide: number): boolean {
  if (player === 'bottom') {
    return pitIndex >= 0 && pitIndex < pitsPerSide
  }
  return pitIndex > pitsPerSide && pitIndex < pitsPerSide * 2 + 1
}

function oppositePit(pitIndex: number, pitsPerSide: number): number {
  return pitsPerSide * 2 - pitIndex
}

function getPlayerSideStart(player: Side, pitsPerSide: number): number {
  return player === 'bottom' ? 0 : pitsPerSide + 1
}

function getPlayerSideEnd(player: Side, pitsPerSide: number): number {
  return player === 'bottom' ? pitsPerSide - 1 : pitsPerSide * 2
}

function isSideEmpty(board: number[], player: Side, pitsPerSide: number): boolean {
  const start = getPlayerSideStart(player, pitsPerSide)
  const end = getPlayerSideEnd(player, pitsPerSide)
  for (let i = start; i <= end; i++) {
    if (board[i]! > 0) return false
  }
  return true
}

function applyFinalSweep(board: number[], pitsPerSide: number): void {
  const bottomEmpty = isSideEmpty(board, 'bottom', pitsPerSide)
  const topEmpty = isSideEmpty(board, 'top', pitsPerSide)

  if (bottomEmpty && !topEmpty) {
    for (let i = pitsPerSide + 1; i <= pitsPerSide * 2; i++) {
      board[pitsPerSide * 2 + 1]! += board[i]!
      board[i] = 0
    }
  } else if (topEmpty && !bottomEmpty) {
    for (let i = 0; i < pitsPerSide; i++) {
      board[pitsPerSide]! += board[i]!
      board[i] = 0
    }
  }
}

function determineWinner(board: number[]): 'draw' | Side {
  const bs = board[BOTTOM_STORE]!
  const ts = board[TOP_STORE]!
  if (bs > ts) return 'bottom'
  if (ts > bs) return 'top'
  return 'draw'
}

function computeMoveDetails(
  board: number[],
  pitIndex: number,
  currentPlayer: Side,
  rules: RuleConfig,
): { newBoard: number[]; move: Move } {
  const { pitsPerSide } = rules
  const totalPositions = BOARD_LENGTH
  const ownStore = getOwnStore(currentPlayer)
  const opponentStore = getOpponentStore(currentPlayer)

  const newBoard = [...board]
  // stones is guaranteed > 0 because pitIndex is a legal move
  const stones = newBoard[pitIndex]!
  newBoard[pitIndex] = 0

  let currentPos = pitIndex
  const sowedTo: number[] = []

  for (let i = 0; i < stones; i++) {
    do {
      currentPos = (currentPos + 1) % totalPositions
    } while (currentPos === opponentStore)
    newBoard[currentPos]!++
    sowedTo.push(currentPos)
  }

  const lastPos = sowedTo[sowedTo.length - 1]!
  let captured: Move['captured'] = null
  let wasExtraTurn = false

  if (lastPos === ownStore) {
    wasExtraTurn = rules.extraTurnEnabled
  } else if (
    rules.captureRule === 'kalah-standard' &&
    isOwnPit(lastPos, currentPlayer, pitsPerSide) &&
    /*
     * Capture eligibility: the pit must have been empty just before the
     * last stone landed.  This is equivalent to checking that exactly one
     * stone from this entire sowing ended up in the pit — which must be
     * the last one.  This correctly allows capture on the source pit
     * (picked up then only the last stone lands back) and prevents it
     * when earlier wrap-around stones already landed there.
     */
    newBoard[lastPos] === 1
  ) {
    const oppIdx = oppositePit(lastPos, pitsPerSide)
    const oppositeStones = newBoard[oppIdx]!
    if (oppositeStones > 0) {
      const capturedCount = 1 + oppositeStones
      newBoard[ownStore]! += capturedCount
      newBoard[lastPos]! -= 1
      newBoard[oppIdx] = 0
      captured = { fromPit: oppIdx, count: capturedCount }
    }
  }

  return {
    newBoard,
    move: {
      pitIndex,
      sowedTo,
      captured,
      wasExtraTurn,
      player: currentPlayer,
    },
  }
}

export function legalMoves(state: GameState, rules: RuleConfig = KALAH_STANDARD): number[] {
  if (state.status === 'finished') return []

  const { pitsPerSide } = rules
  const start = getPlayerSideStart(state.currentPlayer, pitsPerSide)
  const end = getPlayerSideEnd(state.currentPlayer, pitsPerSide)

  const moves: number[] = []
  for (let i = start; i <= end; i++) {
    if (state.board[i]! > 0) {
      moves.push(i)
    }
  }
  return moves
}

export function applyMove(
  state: GameState,
  pitIndex: number,
  rules: RuleConfig = KALAH_STANDARD,
): GameState {
  if (state.status === 'finished') {
    return cloneState(state)
  }

  const legal = legalMoves(state, rules)
  if (!legal.includes(pitIndex)) {
    return cloneState(state)
  }

  const { newBoard, move } = computeMoveDetails(state.board, pitIndex, state.currentPlayer, rules)

  let nextPlayer: Side
  if (move.wasExtraTurn) {
    nextPlayer = state.currentPlayer
  } else {
    nextPlayer = state.currentPlayer === 'bottom' ? 'top' : 'bottom'
  }

  let status: GameState['status'] = 'in-progress'
  let winner: GameState['winner'] = null

  if (
    isSideEmpty(newBoard, 'bottom', rules.pitsPerSide) ||
    isSideEmpty(newBoard, 'top', rules.pitsPerSide)
  ) {
    applyFinalSweep(newBoard, rules.pitsPerSide)
    status = 'finished'
    winner = determineWinner(newBoard)
  }

  return {
    board: newBoard,
    currentPlayer: nextPlayer,
    status,
    winner,
    moveHistory: [...state.moveHistory, move],
  }
}
