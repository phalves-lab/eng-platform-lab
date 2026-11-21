import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y.js'

test('Minha página mostra o resumo da pessoa no conjunto demo', async ({ page }) => {
  await page.goto('/?conjunto=demo')
  await expect(page.getByRole('heading', { level: 2, name: /^Olá, / })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumo' })).toBeVisible()
  await expect(page.getByText('Para eu revisar').first()).toBeVisible()
  await expectNoSeriousViolations(page)
})
