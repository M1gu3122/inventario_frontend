import { test, expect } from '@playwright/test';

test('acceso legible sin desbordamiento horizontal', async ({ page }, informacion) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: informacion.outputPath('login.png'), fullPage: true });
});
