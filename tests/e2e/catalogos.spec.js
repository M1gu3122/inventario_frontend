import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function entrar(page, correo) {
  if (!process.env.E2E_PASSWORD) throw new Error('Definir E2E_PASSWORD para la API de demostración real.');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu espacio de inventario' })).toBeVisible();
}

async function guardar(page, recurso, boton, metodo = 'POST') {
  const respuesta = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith(`/api/v1/${recurso}`) && r.request().method() === metodo);
  await page.getByRole('button', { name: boton, exact: true }).click();
  const resultado = await respuesta;
  expect(resultado.status(), `Respuesta ${metodo} ${recurso}`).toBe(metodo === 'POST' ? 201 : 200);
  return resultado.json();
}

test('administrador crea jerarquía, empleado y categoría y conserva datos al editar', async ({ page }) => {
  const codigo = randomUUID().replaceAll('-', '').replace(/[0-9]/g, (n) => String.fromCharCode(65 + Number(n))).toUpperCase();
  const sede = `Sede E2E ${codigo}`;
  const area = `Área E2E ${codigo}`;
  const ubicacion = `Ubicación E2E ${codigo}`;
  const empleado = `Empleado E2E ${codigo}`;
  const categoria = `Categoría E2E ${codigo}`;
  await entrar(page, 'admin@inventario.local');
  await page.getByRole('link', { name: 'Ubicaciones', exact: true }).click();
  await page.getByLabel('Código', { exact: true }).fill(codigo);
  await page.getByLabel('Nombre', { exact: true }).fill(sede);
  await page.getByLabel('Dirección (opcional)').fill('Dirección de prueba');
  const sedeApi = await guardar(page, 'sedes', 'Guardar registro');
  await expect(page.getByRole('row').filter({ hasText: sede })).toBeVisible();

  await page.getByRole('button', { name: 'Áreas', exact: true }).click();
  await page.getByLabel('Código', { exact: true }).fill(codigo);
  await page.getByLabel('Nombre', { exact: true }).fill(area);
  await page.getByLabel('Sede', { exact: true }).selectOption(sedeApi.id);
  const areaApi = await guardar(page, 'areas', 'Guardar registro');
  await expect(page.getByRole('row').filter({ hasText: area })).toBeVisible();

  await page.getByRole('button', { name: 'Ubicaciones', exact: true }).click();
  await page.getByLabel('Código', { exact: true }).fill(codigo);
  await page.getByLabel('Nombre', { exact: true }).fill(ubicacion);
  await page.getByLabel('Área', { exact: true }).selectOption(areaApi.id);
  const ubicacionApi = await guardar(page, 'ubicaciones', 'Guardar registro');
  await expect(page.getByRole('row').filter({ hasText: ubicacion })).toBeVisible();

  await page.getByRole('link', { name: 'Empleados', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill(empleado);
  await page.getByLabel('Documento', { exact: true }).fill(codigo);
  await page.getByLabel('Ubicación', { exact: true }).selectOption(ubicacionApi.id);
  await page.getByLabel('Cargo', { exact: true }).fill('Soporte de prueba');
  const empleadoApi = await guardar(page, 'empleados', 'Guardar empleado');
  expect(empleadoApi.correo).toBeNull();
  await expect(page.getByRole('row').filter({ hasText: empleado })).toBeVisible();
  await page.getByRole('button', { name: `Editar ${empleado}`, exact: true }).click();
  await expect(page.getByLabel('Cargo', { exact: true })).toHaveValue('Soporte de prueba');
  await page.getByLabel('Cargo', { exact: true }).fill('Cargo actualizado');
  await guardar(page, 'empleados', 'Guardar empleado', 'PUT');
  await expect(page.getByRole('row').filter({ hasText: empleado })).toContainText('Cargo actualizado');

  await page.getByRole('link', { name: 'Categorías', exact: true }).click();
  await page.getByLabel('Código de categoría', { exact: true }).fill(codigo);
  await page.getByLabel('Nombre', { exact: true }).fill(categoria);
  await page.getByRole('button', { name: 'Añadir campo', exact: true }).click();
  await page.getByLabel('Nombre del campo', { exact: true }).fill('ram_gb');
  await page.getByLabel('Tipo de dato', { exact: true }).selectOption('numero');
  const categoriaApi = await guardar(page, 'categorias', 'Guardar categoría');
  expect(categoriaApi.esquema_campos).toEqual({ ram_gb: { tipo: 'numero', requerido: false } });
  await expect(page.getByRole('row').filter({ hasText: categoria })).toContainText('ram_gb');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: categoria })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('administrador crea y desactiva un usuario con roles acumulados', async ({ page }) => {
  const identificador = randomUUID();
  const nombre = `Usuario E2E ${identificador}`;
  await entrar(page, 'admin@inventario.local');
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill(nombre);
  await page.getByLabel('Correo de acceso', { exact: true }).fill(`e2e-${identificador}@example.com`);
  await page.getByLabel('Contraseña inicial', { exact: true }).fill(randomUUID());
  await page.getByRole('checkbox', { name: 'Técnico', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Auditor', exact: true }).check();
  const creado = await guardar(page, 'usuarios', 'Guardar usuario');
  expect(creado.roles).toEqual(['tecnico', 'auditor']);
  expect(creado).not.toHaveProperty('password');
  await page.getByRole('button', { name: `Editar ${nombre}`, exact: true }).click();
  await expect(page.getByLabel('Correo de acceso', { exact: true })).toHaveValue(creado.correo);
  await page.getByLabel('Estado de la cuenta', { exact: true }).selectOption({ label: 'Inactivo' });
  const actualizado = await guardar(page, 'usuarios', 'Guardar usuario', 'PUT');
  expect(actualizado.activo).toBe(false);
  await expect(page.getByRole('row').filter({ hasText: nombre })).toContainText('Inactivo');
});

test('auditor consulta catálogos y no tiene controles de administración', async ({ page }) => {
  await entrar(page, 'auditor@inventario.local');
  await expect(page.getByRole('link', { name: 'Usuarios', exact: true })).toHaveCount(0);
  for (const ruta of ['/ubicaciones', '/empleados', '/categorias']) {
    await page.goto(ruta);
    await expect(page.getByRole('button', { name: 'Consultar', exact: true })).toBeEnabled();
    await expect(page.locator('form.editor')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
  }
  await page.goto('/usuarios');
  await expect(page.getByRole('alert')).toContainText('administrador');
});
