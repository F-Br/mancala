let audioCtx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

export function playNote(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainValue: number = 0.2,
  startTime?: number,
): void {
  if (gainValue < 0.001) return
  const t = startTime ?? ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, t)
  gain.gain.setValueAtTime(gainValue, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(duration, 0.02))
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + Math.max(duration, 0.02))
}
