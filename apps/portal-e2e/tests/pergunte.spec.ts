import { expect, test } from '@playwright/test'
import { expectNoSeriousViolations } from './a11y.js'

test('Pergunte responde em modo busca com trechos do handbook', async ({ page }) => {
  await page.goto('/pergunte')
  await expect(page.getByRole('heading', { level: 2, name: 'Pergunte ao handbook' })).toBeVisible()
  await expectNoSeriousViolations(page)

  await page.getByRole('textbox', { name: 'Sua pergunta' }).fill('Como funciona o review de PR?')
  await page.getByRole('button', { name: 'Enviar pergunta' }).click()
  await expect(page.getByTitle('Trechos do handbook encontrados pela busca')).toBeVisible()
  await expectNoSeriousViolations(page)
})
