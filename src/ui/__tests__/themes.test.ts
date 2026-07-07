import { describe, it, expect } from 'vitest'
import { themes, themeKeys } from '../theme/themes'

const hex6 = /^#[0-9A-Fa-f]{6}$/

describe('theme result colors', () => {
  for (const key of themeKeys) {
    it(`${key} has valid win/loss/draw hex values`, () => {
      const t = themes[key]
      expect(t.win).toMatch(hex6)
      expect(t.loss).toMatch(hex6)
      expect(t.draw).toMatch(hex6)
    })
  }
})
