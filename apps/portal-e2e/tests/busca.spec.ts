import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y.js'

test('Ctrl K abre a busca e leva ao padrão escolhido', async ({ page }) => {
  await page.goto('/padroes')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expectNoSeriousViolations(page)

  await dialog.getByRole('combobox').fill('review')
  const firstStandard = dialog.getByRole('group', { name: 'Padrões' }).getByRole('option').first()
  await expect(firstStandard).toBeVisible()
  await firstStandard.click()
  await expect(page).toHaveURL(/\/padroes\/[^/]+$/)
})
