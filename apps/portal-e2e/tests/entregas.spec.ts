import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y.js'

const pages = [
  { path: '/entregas/review?conjunto=demo', title: 'Review' },
  { path: '/entregas/fluxo', title: 'Fluxo' },
  { path: '/entregas/dora', title: 'DORA' },
]

for (const { path, title } of pages) {
  test(`Entregas > ${title} carrega com os dados das fixtures`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
    await expect(page.locator('.recharts-surface').first()).toBeVisible()
    await expectNoSeriousViolations(page)
  })
}
