import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y.js'

test('Releases mostra a prévia com os PRs mergeados desde a última release', async ({ page }) => {
  await page.goto('/releases')
  await expect(page.getByRole('heading', { level: 2, name: 'Releases' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '3 ticket(s) em 3 PR(s)' }).first()).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'LAB-901 filtro por time no Fluxo' }).first(),
  ).toBeVisible()
  await expectNoSeriousViolations(page)
})
