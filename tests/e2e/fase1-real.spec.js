import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const realApi = process.env.E2E_REAL_API === '1' && Boolean(process.env.E2E_PASSWORD);

async function iniciarSesion(page, correo) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu espacio de inventario' })).toBeVisible();
}

test.describe('Integración real de Fase 1', () => {
  test.skip(!realApi, 'Requiere E2E_REAL_API=1 y una contraseña de seed local.');

  test('CSV, licencias y consultas de auditoría/reportes usan la API real', async ({ page }) => {
    const identificador = randomUUID();
    const serial = `E2E-${identificador}`;
    const producto = `Suite E2E ${identificador}`;

    await iniciarSesion(page, 'encargado@inventario.local');

    await page.goto('/importacion');
    const contenido = [
      'categoria_codigo,ubicacion_codigo,marca,modelo,serial',
      `COM,DEMO,Dell,Integracion,${serial}`
    ].join('\n');
    await page.getByLabel('Archivo CSV').setInputFiles({
      name: 'inventario-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(contenido)
    });
    await page.getByRole('button', { name: '2. Validar sin importar' }).click();
    await expect(page.getByRole('status').filter({ hasText: '1 filas | 1 válidas' })).toBeVisible();
    await page.getByRole('button', { name: '3. Importar definitivamente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Importación completada: 1 creados' })).toBeVisible();

    await page.goto('/licencias');
    await page.getByRole('button', { name: 'Nueva licencia' }).click();
    await page.getByLabel('Producto', { exact: true }).fill(producto);
    await page.getByLabel('Proveedor', { exact: true }).fill('Prueba local');
    await page.getByLabel('Asientos totales').fill('3');
    await page.getByLabel('Costo (COP)').fill('125000');
    const inicio = new Date();
    const fin = new Date(inicio.getTime() + 365 * 24 * 60 * 60 * 1000);
    await page.getByLabel('Vigencia desde').fill(inicio.toISOString().slice(0, 10));
    await page.getByLabel('Vigencia hasta').fill(fin.toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Guardar licencia' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Licencia guardada.' })).toBeVisible();

    await page.getByRole('button', { name: `Asignaciones de ${producto}` }).click();
    await page.getByRole('button', { name: 'Consultar titulares' }).click();
    const titularSelect = page.getByLabel('Seleccionar titular del directorio');
    await expect(titularSelect).toBeVisible();
    const opciones = (await titularSelect.locator('option').allTextContents())
      .map((opcion) => opcion.trim())
      .filter((opcion) => opcion && opcion !== 'Selecciona un titular');
    expect(opciones.length).toBeGreaterThan(0);
    await titularSelect.selectOption({ label: opciones[0] });
    await page.getByLabel('Asientos a asignar').fill('2');
    await page.getByRole('button', { name: 'Asignar asientos', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Asientos asignados.' })).toBeVisible();

    await page.getByRole('button', { name: /^Liberar asignación / }).click();
    await page.getByLabel('Motivo obligatorio').fill('Verificación E2E local');
    await page.getByRole('button', { name: 'Confirmar liberación' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Asignación liberada.' })).toBeVisible();
    await page.getByLabel('Solo asignaciones activas (desmarca para ver historial)').uncheck();
    await expect(page.getByRole('row').filter({ hasText: 'Verificación E2E local' })).toBeVisible();

    const auditorContext = await page.context().browser().newContext();
    try {
      const auditor = await auditorContext.newPage();
      await iniciarSesion(auditor, 'auditor@inventario.local');
      const logs = auditor.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/v1/auditoria/logs'
      );
      await auditor.goto('/auditoria');
      expect((await logs).status()).toBe(200);

      const kpis = auditor.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/v1/auditoria/reportes/kpis'
      );
      await auditor.goto('/');
      expect((await kpis).status()).toBe(200);

      const reporte = auditor.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/v1/auditoria/reportes/inventario'
      );
      await auditor.goto('/reportes');
      expect((await reporte).status()).toBe(200);
      await expect(auditor.getByRole('heading', { name: 'Reportes' })).toBeVisible();
      await expect(auditor.getByRole('alert')).toHaveCount(0);
    } finally {
      await auditorContext.close();
    }
  });
});
