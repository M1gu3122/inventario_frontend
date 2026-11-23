import { expect, test } from '@playwright/test';

async function preparar(page, rol = 'encargado') {
  const llamadas = [];
  const documento = {
    id: 'doc-1', tipo: 'factura', fuente: 'sharepoint', clave_fuente: 'drive/item',
    enlace: 'https://tenant.sharepoint.com/documentos/factura.pdf', nombre: 'factura.pdf',
    mime_type: 'application/pdf', sha256: 'a'.repeat(64), tamanio_bytes: 2048,
    estado: 'error', intentos: 2, error: 'Tiempo de espera del proveedor', paginas: null,
    campos_documento: {}, registrado_por: 'usuario-1', procesando_en: null,
    procesado_en: null, creado_en: '2026-11-22T12:00:00Z',
    actualizado_en: '2026-11-22T12:00:00Z', propuestas: [{
      id: 'prop-1', estado: 'pendiente', datos: { serial: 'SN-100' },
      confianzas_campos: { serial: 0.72 }, creado_en: '2026-11-22T12:00:00Z'
    }]
  };
  const cumplir = (route, status, body) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true' },
    body: JSON.stringify(body)
  });
  await page.route('**/api/v1/**', async (route) => {
    const solicitud = route.request();
    const url = new URL(solicitud.url());
    const ruta = url.pathname;
    const metodo = solicitud.method();
    if (metodo === 'OPTIONS') return cumplir(route, 200, {});
    llamadas.push({ ruta, metodo, consulta: url.search, datos: solicitud.postDataJSON() });
    if (ruta === '/api/v1/auth/refresh') return cumplir(route, 200, {
      access_token: 'e2e', user: { id: 'usuario-1', email: 'operador@example.test', roles: [rol] }
    });
    if (ruta === '/api/v1/documentos' && metodo === 'GET') {
      return cumplir(route, 200, { items: [documento], total: 1, offset: 0, limit: 20 });
    }
    if (ruta === '/api/v1/documentos/configuracion') {
      return cumplir(route, 200, { local: true, sharepoint: false, azure: false, paddle: false });
    }
    if (ruta === '/api/v1/documentos' && metodo === 'POST') {
      return cumplir(route, 202, { id: 'doc-1', creado: true });
    }
    if (ruta === '/api/v1/documentos/doc-1/reprocesar' && metodo === 'POST') {
      documento.estado = 'pendiente';
      documento.error = null;
      return cumplir(route, 202, documento);
    }
    if (ruta === '/api/v1/documentos/doc-1' && metodo === 'GET') return cumplir(route, 200, documento);
    return cumplir(route, 404, { detail: 'Ruta no prevista en la prueba' });
  });
  await page.goto('/documentos');
  return { llamadas };
}

test('encargado consulta documentos, abre detalle y ve confianza sin acción de reproceso', async ({ page }) => {
  const { llamadas } = await preparar(page);
  await expect(page.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver detalle de factura.pdf' }).click();
  await expect(page.getByRole('heading', { name: 'factura.pdf' })).toBeVisible();
  await expect(page.getByText('SN-100')).toBeVisible();
  await expect(page.getByText('72%')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reprocesar OCR' })).toHaveCount(0);
  await page.getByLabel('Tipo de documento').selectOption('factura');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  expect(llamadas.some(({ ruta, consulta }) => ruta === '/api/v1/documentos' && consulta.includes('tipo=factura'))).toBeTruthy();
});

test('admin puede solicitar reproceso de un documento fallido', async ({ page }) => {
  const { llamadas } = await preparar(page, 'admin');
  await page.getByRole('button', { name: 'Ver detalle de factura.pdf' }).click();
  await page.getByRole('button', { name: 'Reprocesar OCR' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'volvió a la cola' })).toBeVisible();
  await expect(page.getByText('Pendiente', { exact: true }).last()).toBeVisible();
  expect(llamadas.some(({ ruta, metodo }) => ruta.endsWith('/reprocesar') && metodo === 'POST')).toBeTruthy();
});

test('admin registra una referencia local sin subir archivos', async ({ page }) => {
  const { llamadas } = await preparar(page, 'admin');
  await page.getByText('Fuentes y registro documental', { exact: true }).click();
  await page.getByLabel('Ruta relativa').fill('acta.pdf');
  await page.locator('#tipo-registro').selectOption('acta');
  await page.getByRole('button', { name: 'Registrar referencia' }).click();
  await expect(page.getByText('Referencia registrada y añadida a la cola.')).toBeVisible();
  expect(llamadas.find(({ ruta, metodo }) => ruta === '/api/v1/documentos' && metodo === 'POST').datos)
    .toEqual({ fuente: 'local', clave: 'acta.pdf', tipo: 'acta' });
});

test('tecnico no consulta documentos ni los ve en la navegación', async ({ page }) => {
  const { llamadas } = await preparar(page, 'tecnico');
  await expect(page.getByText('La consulta de documentos requiere rol admin o encargado.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Documentos', exact: true })).toHaveCount(0);
  expect(llamadas.some(({ ruta }) => ruta === '/api/v1/documentos')).toBeFalsy();
});
