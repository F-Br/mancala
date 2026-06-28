import type { GameState } from '../../engine'

interface BoardProps {
  gameState: GameState
  viewFromBottom: boolean
  clickablePits: number[]
  onPitClick: (pitIndex: number) => void
}

function Pit({
  count,
  clickable,
  onClick,
}: {
  count: number
  clickable: boolean
  onClick: () => void
}) {
  const enabled = clickable && count > 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={
        'w-11 h-11 md:w-14 md:h-14 rounded-xl flex items-center justify-center ' +
        'text-lg font-bold border-2 ' +
        (enabled
          ? 'bg-pit border-board cursor-pointer hover:bg-board active:scale-95'
          : 'bg-pit/50 border-board/50 cursor-default opacity-60')
      }
    >
      {count}
    </button>
  )
}

export function Board({
  gameState,
  viewFromBottom,
  clickablePits,
  onPitClick,
}: BoardProps) {
  const board = gameState.board

  const topRowPits: number[] = viewFromBottom
    ? [12, 11, 10, 9, 8, 7]
    : [5, 4, 3, 2, 1, 0]

  const bottomRowPits: number[] = viewFromBottom
    ? [0, 1, 2, 3, 4, 5]
    : [7, 8, 9, 10, 11, 12]

  const leftStore: number = viewFromBottom ? 13 : 6
  const rightStore: number = viewFromBottom ? 6 : 13

  return (
    <div className="flex flex-col md:flex-row items-center gap-2 w-full max-w-xl mx-auto">
      <div
        className={
          'flex items-center justify-center bg-pit rounded-xl border-2 border-board ' +
          'h-16 w-full md:h-32 md:w-16'
        }
      >
        <span className="text-2xl font-bold">{board[leftStore]}</span>
      </div>

      <div className="flex flex-col gap-2 flex-1 w-full">
        <div className="flex gap-1.5 md:gap-2 justify-center">
          {topRowPits.map((pitIndex) => (
            <Pit
              key={pitIndex}
              count={board[pitIndex]!}
              clickable={clickablePits.includes(pitIndex)}
              onClick={() => onPitClick(pitIndex)}
            />
          ))}
        </div>

        <div className="flex gap-1.5 md:gap-2 justify-center">
          {bottomRowPits.map((pitIndex) => (
            <Pit
              key={pitIndex}
              count={board[pitIndex]!}
              clickable={clickablePits.includes(pitIndex)}
              onClick={() => onPitClick(pitIndex)}
            />
          ))}
        </div>
      </div>

      <div
        className={
          'flex items-center justify-center bg-pit rounded-xl border-2 border-board ' +
          'h-16 w-full md:h-32 md:w-16'
        }
      >
        <span className="text-2xl font-bold">{board[rightStore]}</span>
      </div>
    </div>
  )
}
