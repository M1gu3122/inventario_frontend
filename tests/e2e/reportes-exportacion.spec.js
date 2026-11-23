import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const uuid = '11111111-1111-4111-8111-111111111111';

test('exporta CSV y prepara PDF con todas las páginas del reporte filtrado', async ({ page }) => {
  const consultas = [];
  await page.addInitScript(() => {
    window.print = () => window.dispatchEvent(new Event('afterprint'));
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const responder = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true' },
      body: JSON.stringify(body)
    });
    if (request.method() === 'OPTIONS') return responder({});
    if (url.pathname.endsWith('/auth/refresh')) return responder({ access_token: 'test', user: { id: uuid, email: 'auditor@example.test', roles: ['auditor'] } });
    if (url.pathname === '/api/v1/auditoria/reportes/inventario') {
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 20);
      consultas.push({ offset, limit });
      const inicio = offset;
      const fin = Math.min(offset + limit, 101);
      const items = Array.from({ length: fin - inicio }, (_, indice) => ({ codigo_interno: inicio + indice === 0 ? '=1+1' : `TI-COM-${inicio + indice}`, serial: `SERIAL-${inicio + indice}` }));
      return responder({ items, total: 101, offset, limit });
    }
    return responder({ detail: `Ruta inesperada ${url.pathname}` }, 404);
  });

  await page.goto('/reportes');
  await expect(page.getByRole('status').filter({ hasText: '101 resultados' })).toBeVisible();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const archivo = await descarga;
  const contenido = await readFile(await archivo.path(), 'utf8');
  expect(contenido).toContain("'=1+1");
  await expect(page.getByRole('status').filter({ hasText: 'CSV exportado: 101 resultados' })).toBeVisible();
  expect(consultas.some(({ offset, limit }) => offset === 100 && limit === 100)).toBe(true);

  await page.getByRole('button', { name: 'Imprimir / guardar PDF' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'listo para imprimir o guardar como PDF' })).toBeVisible();
});
