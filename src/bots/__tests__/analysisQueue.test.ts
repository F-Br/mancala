import { describe, it, expect } from 'vitest'
import { AnalysisWorkerHandler } from '../analysisWorker'
import type { AnalysisWorkerMessage, AnalysisRequest } from '../types'
import { midGameFixture1, midGameFixture2 } from './fixtures'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createHarness() {
  const messages: AnalysisWorkerMessage[] = []
  const handler = new AnalysisWorkerHandler(
    (msg) => { messages.push(msg as AnalysisWorkerMessage) },
    undefined,
    true,
  )

  function submit(state: AnalysisRequest['state'], timeBudgetMs: number, requestId: number): void {
    handler.handleMessage({ type: 'analyze', state, timeBudgetMs, requestId })
  }

  function cancel(requestId: number): void {
    handler.handleMessage({ type: 'cancel', requestId })
  }

  return { handler, messages, submit, cancel }
}

describe('analysis FIFO queue with scoped cancellation', () => {
  it('(a) B waits for A, A completes cleanly with PV > 1, then B completes', async () => {
    const { messages, submit } = createHarness()

    submit(midGameFixture1, 150, 1)
    submit(midGameFixture2, 150, 2)

    await wait(1200)

    const results = messages.filter((m) => m.type === 'result')
    const resultA = results.find((r) => r.requestId === 1)
    const resultB = results.find((r) => r.requestId === 2)

    expect(resultA).toBeDefined()
    const aIndex = results.indexOf(resultA!)
    expect(resultA!.cancelled).not.toBe(true)
    expect(resultA!.principalVariation.length).toBeGreaterThan(1)

    expect(resultB).toBeDefined()
    const bIndex = results.indexOf(resultB!)
    expect(aIndex).toBeLessThan(bIndex)
    expect(resultB!.cancelled).not.toBe(true)
  }, 5000)

  it('(b) cancel A mid-flight marks cancelled; B still completes cleanly', async () => {
    const { messages, submit, cancel } = createHarness()

    submit(midGameFixture1, 150, 1)
    submit(midGameFixture2, 150, 2)

    await wait(40)
    cancel(1)

    await wait(1200)

    const results = messages.filter((m) => m.type === 'result')
    const resultA = results.find((r) => r.requestId === 1)
    const resultB = results.find((r) => r.requestId === 2)

    expect(resultA).toBeDefined()
    expect(resultA!.cancelled).toBe(true)

    expect(resultB).toBeDefined()
    expect(resultB!.cancelled).not.toBe(true)
  }, 5000)

  it('(c) cancel queued B before it starts; A unaffected, B never produces result', async () => {
    const { messages, submit, cancel } = createHarness()

    submit(midGameFixture1, 150, 1)
    submit(midGameFixture2, 150, 2)

    await wait(20)
    cancel(2)

    await wait(1200)

    const resultA = messages.find((m) => m.type === 'result' && m.requestId === 1)
    const resultB = messages.find((m) => m.type === 'result' && m.requestId === 2)

    expect(resultA).toBeDefined()
    expect(resultA!.cancelled).not.toBe(true)

    expect(resultB).toBeUndefined()
  }, 5000)

  it('(d) cancel with bogus requestId does nothing', async () => {
    const { messages, submit, cancel } = createHarness()

    submit(midGameFixture1, 150, 1)
    cancel(999)

    await wait(600)

    const results = messages.filter((m) => m.type === 'result')
    const resultA = results.find((r) => r.requestId === 1)

    expect(resultA).toBeDefined()
    expect(resultA!.cancelled).not.toBe(true)
    expect(resultA!.principalVariation.length).toBeGreaterThan(0)
  }, 5000)
})
