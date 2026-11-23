import { test, expect } from '@playwright/test';

test('login real, recarga de sesion y logout', async ({ page }) => {
  if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) throw new Error('Definir E2E_EMAIL y E2E_PASSWORD de la API real para verificar la integracion.');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD);
  const login = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  const tokenLogin = (await (await login).json()).access_token;
  await expect(page.getByRole('heading', { name: 'Tu espacio de inventario' })).toBeVisible();
  const cookieInicial = (await page.context().cookies()).find((c) => c.name === 'refresh_token');
  expect(cookieInicial?.httpOnly).toBe(true);
  expect(cookieInicial?.path).toBe('/api/v1/auth');
  expect(cookieInicial?.sameSite).toBe('Lax');
  const refresh = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh') && r.request().method() === 'POST');
  await page.reload();
  const tokenRenovado = (await (await refresh).json()).access_token;
  await expect(page.getByRole('heading', { name: 'Tu espacio de inventario' })).toBeVisible();
  const cookieRenovada = (await page.context().cookies()).find((c) => c.name === 'refresh_token');
  expect(Boolean(cookieRenovada && cookieInicial && cookieRenovada.value !== cookieInicial.value)).toBe(true);
  const almacenamiento = await page.evaluate((tokens) => {
    const clavesPermitidas = ['sveltekit:snapshot', 'sveltekit:navigation-snapshot', 'sveltekit:history-info', 'sveltekit:metadata'];
    const valores = [...Object.values(localStorage), ...Object.values(sessionStorage)];
    return {
      local: localStorage.length,
      clavesAjenas: Object.keys(sessionStorage).filter((clave) => !clavesPermitidas.includes(clave)),
      contieneCredenciales: tokens.some((token) => token && valores.some((valor) => valor.includes(token)))
    };
  }, [tokenLogin, tokenRenovado, cookieInicial?.value, cookieRenovada?.value, process.env.E2E_PASSWORD]);
  expect(almacenamiento).toEqual({ local: 0, clavesAjenas: [], contieneCredenciales: false });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === 'refresh_token')).toBe(false);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('credenciales incorrectas muestran el rechazo de la API', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('cuenta-inexistente@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
