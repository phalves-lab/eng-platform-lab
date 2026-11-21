import AxeBuilder from '@axe-core/playwright'
import { type Page, expect } from '@playwright/test'

const BLOCKING = new Set(['serious', 'critical'])

/** Runs axe with the WCAG 2.1 A and AA rules and fails on serious or critical violations. */
export const expectNoSeriousViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const blocking = results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      nodes: violation.nodes
        .slice(0, 5)
        .map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
    }))
  expect(blocking).toEqual([])
}
