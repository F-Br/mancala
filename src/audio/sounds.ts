import { getAudioContext, playNote } from './synth'

const PLACEMENT_PITCHES = [440, 523, 659, 784]

export function playPlacement(stoneIndex: number): void {
  const ctx = getAudioContext()
  const pitch = PLACEMENT_PITCHES[stoneIndex % PLACEMENT_PITCHES.length]!
  playNote(ctx, pitch, 0.08, 'sine', 0.18)
}

export function playSwoosh(): void {
  const ctx = getAudioContext()
  playNote(ctx, 220, 0.3, 'triangle', 0.12)
}

export function playCapture(): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  playNote(ctx, 523, 0.25, 'triangle', 0.22, now)
  playNote(ctx, 659, 0.25, 'triangle', 0.18, now + 0.02)
  playNote(ctx, 784, 0.25, 'triangle', 0.14, now + 0.04)
}

export function playExtraTurn(): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  playNote(ctx, 523, 0.12, 'sine', 0.18, now)
  playNote(ctx, 784, 0.15, 'sine', 0.18, now + 0.1)
}

export function playGameEndWin(): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  playNote(ctx, 523, 0.15, 'triangle', 0.22, now)
  playNote(ctx, 659, 0.2, 'triangle', 0.18, now + 0.12)
  playNote(ctx, 784, 0.3, 'triangle', 0.18, now + 0.25)
}

export function playGameEndLoss(): void {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  playNote(ctx, 392, 0.2, 'sine', 0.18, now)
  playNote(ctx, 330, 0.3, 'sine', 0.18, now + 0.15)
}

export function playGameEndDraw(): void {
  const ctx = getAudioContext()
  playNote(ctx, 440, 0.4, 'triangle', 0.18)
}
