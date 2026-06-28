import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistoryStore } from '../../state/historyStore'
import { strings } from '../strings'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HistoryScreen() {
  const navigate = useNavigate()
  const records = useHistoryStore((s) => s.records)
  const deleteRecord = useHistoryStore((s) => s.deleteRecord)
  const clearAll = useHistoryStore((s) => s.clearAll)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const sorted = [...records].sort(
    (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime(),
  )

  const handleRowClick = (idx: number) => {
    const record = sorted[idx]
    if (!record) return
    navigate('/analysis', { state: { fromHistory: record } })
  }

  return (
    <main className="min-h-screen p-4 flex flex-col items-center gap-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="text-accent hover:underline text-sm"
        >
          &larr; {strings.game.home}
        </button>
        <h1 className="text-lg font-bold text-text">{strings.history.title}</h1>
        {sorted.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-red-400 hover:text-red-300 text-xs font-medium"
          >
            {strings.history.clearAll}
          </button>
        )}
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-board rounded-2xl p-6 mx-4 max-w-sm w-full flex flex-col items-center gap-4 shadow-2xl">
            <p className="text-sm text-text text-center">
              {strings.history.clearConfirm}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-board/60 text-text font-medium hover:bg-board/40 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll()
                  setShowClearConfirm(false)
                }}
                className="flex-1 py-2 rounded-xl bg-red-900/40 text-red-400 font-medium hover:bg-red-900/60 text-sm"
              >
                {strings.history.clearAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-12 text-center">
          <p className="text-muted text-sm">{strings.history.empty}</p>
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="text-accent hover:underline text-sm"
          >
            &larr; {strings.game.home}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 w-full">
          {sorted.map((record, i) => {
            const resultColor =
              record.result === 'win'
                ? 'text-green-400'
                : record.result === 'loss'
                  ? 'text-red-400'
                  : 'text-yellow-400'

            return (
              <div
                key={record.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-board/30 hover:bg-board/50 cursor-pointer transition-colors"
              >
                <button
                  type="button"
                  onClick={() => handleRowClick(i)}
                  className="flex-1 flex items-center gap-3 min-w-0"
                >
                  <span className="text-xs text-muted shrink-0 w-14">
                    {formatDate(record.dateISO)}
                  </span>
                  <span className="text-xs text-muted/70 shrink-0 w-14">
                    {record.mode === 'vs-bot' ? 'vs Bot' : 'vs Player'}
                  </span>
                  <span className="text-sm text-text truncate shrink min-w-0">
                    {record.opponentLabel}
                  </span>
                  <span
                    className={
                      'text-xs font-bold px-1.5 py-0.5 rounded ' + resultColor
                    }
                  >
                    {record.result === 'win'
                      ? strings.history.win
                      : record.result === 'loss'
                        ? strings.history.loss
                        : strings.history.draw}
                  </span>
                  <span className="text-xs text-muted shrink-0">
                    {record.finalScore.player}&ndash;
                    {record.finalScore.opponent}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteRecord(record.id)
                  }}
                  className="text-muted/50 hover:text-red-400 text-xs shrink-0 px-1"
                  title={strings.history.delete}
                >
                  &times;
                </button>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
