import type { GameState, RuleConfig, GameId } from '../engine'
import {
  getOffsets,
  getTotalSize,
  extractPits,
  encodeProven,
  createTablebaseProbe,
  createTablebaseBestMove,
} from '../engine'
import type { TablebaseProbe } from './search'

export const TB_K = 12
const IDB_NAME = 'mancala-tablebase'
const IDB_STORE = 'tables'

function idbKey(game: GameId): string {
  return `tb-k${TB_K}-${game}-v1`
}

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'
  } catch {
    return false
  }
}

function openIDB(): Promise<IDBDatabase> {
  if (!hasIDB()) return Promise.reject(new Error('IndexedDB not available'))
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IDB blocked'))
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  return Promise.race([promise, timer])
}

export function loadTablebaseFromIDB(game: GameId): Promise<Int8Array | null> {
  if (!hasIDB()) return Promise.resolve(null)
  const key = idbKey(game)
  return withTimeout(
    openIDB()
      .then((db) => {
        return new Promise<Int8Array | null>((resolve, reject) => {
          try {
            const tx = db.transaction(IDB_STORE, 'readonly')
            const store = tx.objectStore(IDB_STORE)
            const req = store.get(key)
            req.onsuccess = () => {
              const val = req.result
              if (val instanceof Int8Array) {
                resolve(val)
              } else if (val && val.buffer instanceof ArrayBuffer) {
                resolve(new Int8Array(val.buffer))
              } else {
                resolve(null)
              }
            }
            req.onerror = () => reject(req.error)
          } catch (e) {
            reject(e)
          }
        })
      })
      .catch(() => null),
    3000,
    null,
  )
}

export function saveTablebaseToIDB(table: Int8Array, game: GameId): Promise<void> {
  if (!hasIDB()) return Promise.resolve()
  const key = idbKey(game)
  return withTimeout(
    openIDB()
      .then((db) => {
        return new Promise<void>((resolve, reject) => {
          try {
            const tx = db.transaction(IDB_STORE, 'readwrite')
            const store = tx.objectStore(IDB_STORE)
            store.put(table, key)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          } catch (e) {
            reject(e)
          }
        })
      })
      .catch(() => {}),
    3000,
    undefined,
  )
}

export function buildProbes(table: Int8Array, rules: RuleConfig): {
  probe: TablebaseProbe
  tbBestMove: (state: GameState) => number | undefined
} {
  const offsets = getOffsets(TB_K)

  const probeFn = createTablebaseProbe(table, offsets, TB_K)

  const probe: TablebaseProbe = (state: GameState): number | undefined => {
    if (state.status !== 'in-progress') return undefined
    const pits = extractPits(state.board)
    const tb = probeFn(pits, state.currentPlayer)
    if (tb === undefined) return undefined

    const ownStore = state.currentPlayer === 'bottom' ? 6 : 13
    const oppStore = state.currentPlayer === 'bottom' ? 13 : 6
    const sd = (state.board[ownStore] ?? 0) - (state.board[oppStore] ?? 0)
    return encodeProven(sd + tb)
  }

  const tbBestMove = createTablebaseBestMove(table, offsets, TB_K, rules)

  return { probe, tbBestMove }
}

export { getTotalSize }
