import type { RuleConfig } from './types'

export const KALAH_STANDARD: RuleConfig = {
  pitsPerSide: 6,
  stonesPerPit: 4,
  extraTurnEnabled: true,
  captureRule: 'kalah-standard',
  sowing: 'skip-source',
  endSweep: 'to-side-owner',
}

export const MANGALA_STANDARD: RuleConfig = {
  pitsPerSide: 6,
  stonesPerPit: 4,
  extraTurnEnabled: true,
  sowing: 'include-source',
  captureRule: 'mangala',
  endSweep: 'to-emptied-player',
}
