import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y.js'

test('Qualidade > Scorecard lista os repositórios com nota', async ({ page }) => {
  await page.goto('/qualidade/scorecard')
  await expect(page.getByRole('heading', { level: 2, name: 'Scorecard' })).toBeVisible()
  await expect(page.getByRole('table').first()).toBeVisible()
  await expectNoSeriousViolations(page)
})

test('Qualidade > Documentação agrupa o handbook por dono', async ({ page }) => {
  await page.goto('/qualidade/documentacao')
  await expect(page.getByRole('heading', { level: 2, name: 'Documentação' })).toBeVisible()
  await expectNoSeriousViolations(page)
})
