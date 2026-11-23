import { expect, test } from '@playwright/test';

const uuid = '11111111-1111-4111-8111-111111111111';

test('registro de garantía queda asociado al activo y permite editarse', async ({ page }) => {
  const llamadas = [];
  const garantia = {
    id: 'g1', activo_id: uuid, proveedor: 'Proveedor Equipo',
    vigencia_inicio: '2026-01-01', vigencia_fin: '2026-12-10',
    condiciones: 'Cobertura completa', documento_id: null
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const responder = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true' },
      body: JSON.stringify(body)
    });
    if (request.method() === 'OPTIONS') return responder({});
    if (url.pathname.endsWith('/auth/refresh')) return responder({ access_token: 'test', user: { id: uuid, email: 'ti@example.test', roles: ['encargado'] } });
    if (url.pathname === '/api/v1/activos') return responder({ items: [{ id: uuid, codigo_interno: 'TI-COM-00001', marca: 'Dell', modelo: 'Latitude', serial: 'SERIAL-1' }], total: 1, offset: 0, limit: 100 });
    if (url.pathname === '/api/v1/documentos') return responder({ items: [], total: 0, offset: 0, limit: 100 });
    if (url.pathname === '/api/v1/garantias' && request.method() === 'GET') return responder({ items: [garantia], total: 1, offset: 0, limit: 20 });
    if (url.pathname === '/api/v1/garantias' && request.method() === 'POST') {
      llamadas.push({ method: 'POST', body: request.postDataJSON() });
      return responder(garantia, 201);
    }
    if (url.pathname === '/api/v1/garantias/g1' && request.method() === 'GET') return responder(garantia);
    if (url.pathname === '/api/v1/garantias/g1' && request.method() === 'PUT') {
      llamadas.push({ method: 'PUT', body: request.postDataJSON() });
      return responder({ ...garantia, ...request.postDataJSON() });
    }
    return responder({ detail: `Ruta inesperada ${url.pathname}` }, 404);
  });

  await page.goto('/garantias');
  await expect(page.getByText('Proveedor Equipo')).toBeVisible();
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Proveedor', { exact: true }).fill('Proveedor editado');
  await page.getByRole('button', { name: 'Guardar garantía' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Garantía guardada' })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar garantía' }).click();
  await page.getByLabel('Activo', { exact: true }).selectOption(uuid);
  await page.getByLabel('Proveedor', { exact: true }).fill('Extensión');
  await page.getByLabel('Vigencia desde').fill('2026-01-01');
  await page.getByLabel('Vigencia hasta').fill('2027-01-01');
  await page.getByRole('button', { name: 'Guardar garantía' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Garantía guardada' })).toBeVisible();
  expect(llamadas[0]).toMatchObject({ method: 'PUT', body: { proveedor: 'Proveedor editado' } });
  expect(llamadas[1]).toMatchObject({ method: 'POST', body: { activo_id: uuid, proveedor: 'Extensión' } });
});
