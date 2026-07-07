import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Board } from '../components/Board'
import type { GameState } from '../../engine'

function makeGameState(board: number[]): GameState {
  return {
    board,
    currentPlayer: 'bottom',
    status: 'in-progress',
    winner: null,
    moveHistory: [],
  }
}

describe('Board DOM order', () => {
  it('renders children in store, pit-grid, store order', () => {
    const gameState: GameState = makeGameState([
      4, 4, 4, 4, 4, 4, 0,
      4, 4, 4, 4, 4, 4, 0,
    ])

    const { container } = render(
      <Board
        gameState={gameState}
        viewFromBottom={true}
        clickablePits={[0, 1, 2, 3, 4, 5]}
        onPitClick={() => {}}
        pendingMove={null}
        prevBoard={null}
        effectiveSpeed={0}
        onAnimationComplete={() => {}}
      />,
    )

    const store6 = container.querySelector('[data-el="13"]')!
    const store13 = container.querySelector('[data-el="6"]')!
    const pits = container.querySelectorAll('[data-el]:not([data-el="6"]):not([data-el="13"])')

    expect(store6).not.toBeNull()
    expect(store13).not.toBeNull()
    expect(pits).toHaveLength(12)

    const innerWrapper = container.querySelector('.board-slab > div')!
    const children = Array.from(innerWrapper.children)

    expect(children).toHaveLength(3)

    const firstChild = children[0]!
    const middleChild = children[1]!
    const lastChild = children[2]!

    expect(firstChild.hasAttribute('data-el')).toBe(true)
    expect(lastChild.hasAttribute('data-el')).toBe(true)
    expect(middleChild.querySelectorAll('[data-el]')).toHaveLength(12)

    const firstStoreVal = firstChild.getAttribute('data-el')!
    const lastStoreVal = lastChild.getAttribute('data-el')!
    expect(['6', '13']).toContain(firstStoreVal)
    expect(['6', '13']).toContain(lastStoreVal)
    expect(firstStoreVal).not.toBe(lastStoreVal)
  })
})
