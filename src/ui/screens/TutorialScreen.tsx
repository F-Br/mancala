import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore } from '../../state/settingsStore'
import { strings } from '../strings'

interface BoardDiagramProps {
  pits: number[]
  stores: [number, number]
  highlightPits?: number[]
  highlightStore?: 'top' | 'bottom'
  arrows?: { from: number; to: number }[]
}

function BoardDiagram({ pits, stores, highlightPits = [], highlightStore }: BoardDiagramProps) {
  const topPits = pits.slice(0, 6)
  const botPits = pits.slice(6, 12)

  const pClass = (idx: number, isStore: boolean) => {
    const hl = isStore
      ? highlightStore &&
        ((highlightStore === 'bottom' && idx === 0) || (highlightStore === 'top' && idx === 1))
      : highlightPits.includes(idx)
    return (
      'flex items-center justify-center border rounded text-xs font-mono w-7 h-7 md:w-8 md:h-8 ' +
      (hl ? 'border-accent bg-accent/15 text-accent' : 'border-board/50 bg-pit/60 text-text')
    )
  }

  return (
    <div className="flex flex-col items-center gap-1 scale-75 md:scale-100 origin-top">
      <div className="flex items-center gap-1">
        <div className={pClass(0, true) + ' w-7 h-14 md:w-8 md:h-16'}>{stores[0]}</div>
        <div className="flex flex-col gap-0.5">
          <div className="flex gap-0.5">
            {topPits.map((v, i) => (
              <div key={i} className={pClass(i, false)}>
                {v}
              </div>
            ))}
          </div>
          <div className="flex gap-0.5">
            {botPits.map((v, i) => (
              <div key={i + 6} className={pClass(i + 6, false)}>
                {v}
              </div>
            ))}
          </div>
        </div>
        <div className={pClass(1, true) + ' w-7 h-14 md:w-8 md:h-16'}>{stores[1]}</div>
      </div>
    </div>
  )
}

const panelDiagrams: ((active: boolean) => React.ReactNode)[] = [
  () => <BoardDiagram pits={[4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]} stores={[0, 0]} />,
  () => {
    const pits = [0, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    return (
      <div className="flex flex-col items-center gap-1">
        <BoardDiagram pits={pits} stores={[0, 0]} highlightPits={[6]} />
        <div className="flex gap-0.5 text-[10px] text-muted">
          {[9, 8, 7, 6].map((v) => (
            <span key={v} className="text-accent font-mono">
              &darr;
            </span>
          ))}
        </div>
      </div>
    )
  },
  () => {
    const pits = [0, 0, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4]
    return <BoardDiagram pits={pits} stores={[1, 0]} highlightPits={[6]} highlightStore="bottom" />
  },
  () => {
    const pits = [0, 0, 0, 1, 4, 5, 4, 3, 4, 4, 4, 4]
    return <BoardDiagram pits={pits} stores={[4, 0]} highlightPits={[3, 8]} />
  },
  () => <BoardDiagram pits={[0, 0, 0, 0, 0, 0, 3, 2, 1, 4, 0, 0]} stores={[18, 6]} />,
  () => (
    <BoardDiagram
      pits={[0, 6, 0, 3, 1, 4, 0, 2, 4, 4, 0, 0]}
      stores={[10, 8]}
      highlightPits={[1, 7, 6]}
    />
  ),
]

export function TutorialScreen() {
  const navigate = useNavigate()
  const [panel, setPanel] = useState(0)
  const setTutorialSeen = useSettingsStore((s) => s.setTutorialSeen)

  const panels = strings.tutorial.panels

  const handleDone = () => {
    setTutorialSeen(true)
    navigate('/home')
  }

  const handleSkip = () => {
    setTutorialSeen(true)
    navigate('/home')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={panel}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-6 max-w-sm w-full"
        >
          <div className="bg-board/40 rounded-2xl p-6 flex flex-col items-center gap-4 w-full">
            <div className="flex items-center justify-center min-h-[140px] w-full">
              {panelDiagrams[panel]?.(true)}
            </div>

            <h2 className="text-lg font-bold text-text text-center">{panels[panel]!.title}</h2>

            <p className="text-sm text-muted text-center leading-relaxed">{panels[panel]!.text}</p>
          </div>

          <div className="flex items-center justify-center gap-2">
            {panels.map((_, i) => (
              <div
                key={i}
                className={
                  'w-2 h-2 rounded-full transition-colors ' +
                  (i === panel ? 'bg-accent' : 'bg-board/50')
                }
              />
            ))}
          </div>

          <div className="flex gap-3 w-full max-w-sm">
            {panel > 0 && (
              <button
                type="button"
                onClick={() => setPanel((p) => p - 1)}
                className="flex-1 py-2 rounded-xl border border-board/60 text-text font-medium hover:bg-board/40 text-sm"
              >
                {strings.tutorial.prev}
              </button>
            )}
            {panel < panels.length - 1 ? (
              <button
                type="button"
                onClick={() => setPanel((p) => p + 1)}
                className="flex-1 py-2 rounded-xl bg-accent text-bg font-semibold hover:brightness-110 text-sm"
              >
                {strings.tutorial.next}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDone}
                className="flex-1 py-2 rounded-xl bg-accent text-bg font-semibold hover:brightness-110 text-sm"
              >
                {strings.tutorial.done}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        onClick={handleSkip}
        className="mt-6 text-xs text-muted hover:text-text underline"
      >
        {strings.tutorial.skip}
      </button>
    </main>
  )
}
