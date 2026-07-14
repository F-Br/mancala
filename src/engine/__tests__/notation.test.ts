import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  applyMove,
  gameToText,
  parseGameText,
  MANGALA_STANDARD,
} from '../index'

describe('notation — game identity', () => {
  it('Mangala game round-trips with correct game id', () => {
    let state = createInitialState(MANGALA_STANDARD, 'bottom')
    // Play a scripted Mangala game from initial state.
    // Move 1: pit 2 (bottom), extra turn (2→bottom store → extra turn)
    state = applyMove(state, 2, MANGALA_STANDARD)
    // Move 2: pit 3 (bottom, still bottom's turn after extra)
    state = applyMove(state, 3, MANGALA_STANDARD)
    // Move 3: pit 10 (top, pit D)
    state = applyMove(state, 10, MANGALA_STANDARD)
    // Move 4: pit 0 (bottom)
    state = applyMove(state, 0, MANGALA_STANDARD)
    // Move 5: pit 7 (top, A)
    state = applyMove(state, 7, MANGALA_STANDARD)

    const text = gameToText(state, 'mangala')
    const parsed = parseGameText(text)

    expect(parsed.game).toBe('mangala')
    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
    expect(parsed.state.status).toBe(state.status)
    expect(parsed.state.winner).toBe(state.winner)
    expect(parsed.state.moveHistory).toHaveLength(state.moveHistory.length)
  })

  it('legacy four-part header parses as Kalah', () => {
    const legacyText = '[4,4,4,4,4,4,0,4,4,4,4,4,4,0|b|i|n]\nc\n'
    const parsed = parseGameText(legacyText)

    expect(parsed.game).toBe('kalah')
    // After move c (pit 2), the board should match a Kalah sowing from pit 2
    const kalahState = applyMove(createInitialState(), 2)
    expect(parsed.state.board).toEqual(kalahState.board)
  })

  it('Kalah round-trip still works', () => {
    let state = createInitialState()
    state = applyMove(state, 0)
    state = applyMove(state, 7)
    state = applyMove(state, 5)
    state = applyMove(state, 12)

    const text = gameToText(state, 'kalah')
    const parsed = parseGameText(text)

    expect(parsed.game).toBe('kalah')
    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
    expect(parsed.state.status).toBe(state.status)
    expect(parsed.state.winner).toBe(state.winner)
    expect(parsed.state.moveHistory).toHaveLength(4)
  })

  it('Mangala serialized text starts with mangala token', () => {
    const state = createInitialState(MANGALA_STANDARD, 'bottom')
    const text = gameToText(state, 'mangala')
    expect(text).toContain('[mangala|')
  })

  it('Kalah serialized text starts with kalah token', () => {
    const state = createInitialState()
    const text = gameToText(state, 'kalah')
    expect(text).toContain('[kalah|')
  })

  it('parseGameText defaults game to kalah for empty string', () => {
    const parsed = parseGameText('')
    expect(parsed.game).toBe('kalah')
  })

  it('parseGameText defaults game to kalah for garbage header', () => {
    const parsed = parseGameText('not a header')
    expect(parsed.game).toBe('kalah')
  })
})
