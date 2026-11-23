import { expect, test } from '@playwright/test';

async function preparar(page, rol = 'encargado') {
  const llamadas = [];
  const categoria = { id: 'cat-1', codigo: 'CMP', nombre: 'Computadoras', activa: true, esquema_campos: { ram: { tipo: 'numero', requerido: true }, portable: { tipo: 'booleano', requerido: false }, garantia: { tipo: 'fecha', requerido: false }, nota: { tipo: 'texto', requerido: false } } };
  const base = (id) => ({ id, estado: 'pendiente', origen: 'manual', documento: null, confianzas_campos: {}, categoria_id: 'cat-1', datos: { ubicacion_id: 'ubi-1', marca: 'Dell', modelo: 'Latitude', serial: null, codigo_interno: null, codigo_externo: null, proveedor: null, numero_factura: null, valor_compra: null, fecha_adquisicion: null, observaciones: null, atributos: { ram: 16, portable: false, legado: { conservar: true } } }, revision_campos: {}, creado_por: 'autor', creado_en: '2026-11-22T12:00:00Z', actualizado_en: '2026-11-22T12:00:00Z' });
  const estado = { propuestas: [base('p-1'), { ...base('p-2'), estado: 'en_revision' }], falloLote: false, falloLista: false, falloGuardar: false, falloRefresco: false, candidatos: false };
  const cumplir = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' }, body: JSON.stringify(body) });
  await page.route('**/api/v1/**', async (route) => {
    const solicitud = route.request();
    const url = new URL(solicitud.url());
    const ruta = url.pathname;
    const metodo = solicitud.method();
    if (metodo === 'OPTIONS') return cumplir(route, 200, {});
    const cuerpo = solicitud.postData() ? solicitud.postDataJSON() : null;
    llamadas.push({ ruta, metodo, cuerpo, consulta: url.search });
    if (ruta === '/api/v1/auth/refresh') return cumplir(route, 200, { access_token: 'e2e', user: { id: 'autor', email: 'operador@example.test', roles: [rol] } });
    const pagina = (items) => ({ items, total: items.length, offset: 0, limit: 20 });
    if (ruta === '/api/v1/categorias') return cumplir(route, 200, pagina([categoria]));
    if (ruta === '/api/v1/ubicaciones') return cumplir(route, 200, pagina([{ id: 'ubi-1', codigo: 'LAB', nombre: 'Laboratorio', activa: true }]));
    if (ruta === '/api/v1/activos/a-1') return cumplir(route, 200, { id: 'a-1', codigo_interno: 'TI-CMP-00001', marca: 'Dell', modelo: 'Existente', serial: 'SN-1', estado: 'disponible', ubicacion_id: 'ubi-1' });
    if (ruta === '/api/v1/propuestas' && metodo === 'GET') {
      if (estado.falloLista) return cumplir(route, 503, { detail: 'Servidor temporalmente inaccesible' });
      const filtradas = estado.propuestas.filter((p) => !url.searchParams.get('estado') || p.estado === url.searchParams.get('estado'));
      const offset = Number(url.searchParams.get('offset'));
      return cumplir(route, 200, { items: filtradas.slice(offset, offset + 20), total: filtradas.length, offset, limit: 20 });
    }
    if (ruta === '/api/v1/propuestas' && metodo === 'POST') {
      const propuesta = { ...base('p-nueva'), ...cuerpo, revision_campos: {} };
      estado.propuestas.push(propuesta);
      return cumplir(route, 201, propuesta);
    }
    if (ruta === '/api/v1/propuestas/aprobar-lote') {
      if (estado.falloLote) return cumplir(route, 409, { detail: 'Falta revisión de serial en p-2' });
      for (const propuesta of estado.propuestas.filter((p) => cuerpo.propuesta_ids.includes(p.id))) { propuesta.estado = 'aprobada'; propuesta.lote_aprobacion_id = 'lote-1'; }
      return cumplir(route, 200, { lote_aprobacion_id: 'lote-1', items: estado.propuestas.filter((p) => cuerpo.propuesta_ids.includes(p.id)) });
    }
    const [, id, accion] = ruta.match(/^\/api\/v1\/propuestas\/([^/]+)(?:\/(.+))?$/) || [];
    const propuesta = estado.propuestas.find((p) => p.id === id);
    if (!propuesta) return cumplir(route, 404, { detail: 'Ruta no prevista en la prueba' });
    if (!accion && metodo === 'GET') {
      if (estado.falloRefresco) return cumplir(route, 503, { detail: 'No se pudo refrescar detalle' });
      return cumplir(route, 200, propuesta);
    }
    if (!accion && metodo === 'PUT') {
      if (estado.falloGuardar) return cumplir(route, 422, { detail: 'valor_compra: no puede ser negativo' });
      for (const [clave, valor] of Object.entries(cuerpo.datos)) if (JSON.stringify(valor) !== JSON.stringify(propuesta.datos[clave])) delete propuesta.revision_campos[clave];
      if (cuerpo.categoria_id !== propuesta.categoria_id) for (const clave of Object.keys(propuesta.revision_campos)) if (clave.startsWith('atributos.')) delete propuesta.revision_campos[clave];
      Object.assign(propuesta, cuerpo);
      return cumplir(route, 200, propuesta);
    }
    if (accion === 'duplicados') return cumplir(route, 200, pagina(estado.candidatos ? [{ tipo: 'activo', id: 'a-1' }, { tipo: 'propuesta', id: 'p-2' }] : []));
    if (accion === 'revisar') {
      if (propuesta.estado === 'duplicada') propuesta.revision_campos = {};
      for (const campo of cuerpo.campos) propuesta.revision_campos[campo] = { revisado_por: 'autor', revisado_en: '2026-11-22T12:30:00Z' };
      propuesta.estado = 'en_revision';
    }
    if (accion === 'aprobar') { propuesta.estado = 'aprobada'; propuesta.activo_creado_id = 'activo-creado'; }
    if (accion === 'rechazar') { propuesta.estado = 'rechazada'; propuesta.motivo_rechazo = cuerpo.motivo; }
    if (accion === 'duplicada' || accion === 'vincular') { propuesta.estado = 'duplicada'; propuesta.justificacion_vinculacion = cuerpo.justificacion; propuesta.activo_vinculado_id = cuerpo.activo_id || null; }
    return cumplir(route, 200, propuesta);
  });
  await page.goto('/propuestas');
  await expect(page.getByRole('heading', { name: 'Propuestas', exact: true })).toBeVisible();
  if (rol === 'encargado') await expect(page.getByRole('button', { name: 'Nuevo borrador' })).toBeEnabled();
  return { llamadas, estado };
}

async function abrirPrimera(page) {
  await page.getByRole('button', { name: 'Ver propuesta p-1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detalle de propuesta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar borrador' })).toBeEnabled();
}

test('borrador incompleto, atributos, revisión crítica explícita e invalidación del valor editado', async ({ page }) => {
  const { llamadas } = await preparar(page);
  await expect(page.getByRole('link', { name: 'Propuestas', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Nuevo borrador' }).click();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();
  const alta = llamadas.find((c) => c.ruta === '/api/v1/propuestas' && c.metodo === 'POST');
  expect(alta.cuerpo.categoria_id).toBeNull();
  expect(alta.cuerpo.datos.serial).toBeNull();
  expect(llamadas.some((c) => c.ruta === '/api/v1/propuestas/p-nueva' && c.metodo === 'GET')).toBeTruthy();
  await abrirPrimera(page);
  await expect(page.getByRole('button', { name: 'Registrar revisión de campos seleccionados' })).toBeDisabled();
  for (const nombre of ['Serial · revisión crítica', 'Número de factura · revisión crítica', 'Valor de compra (COP) · revisión crítica']) await page.getByRole('checkbox', { name: nombre, exact: true }).check();
  await page.getByRole('button', { name: 'Registrar revisión de campos seleccionados' }).click();
  await expect(page.getByText('Revisión vigente', { exact: true })).toHaveCount(3);
  expect(llamadas.find((c) => c.ruta.endsWith('/revisar')).cuerpo.campos).toEqual(['serial', 'numero_factura', 'valor_compra']);
  await page.getByRole('button', { name: 'Editar borrador' }).click();
  await page.getByLabel('Serial · revisión crítica', { exact: true }).fill('NUEVO');
  await page.getByLabel('ram · requerido al aprobar').fill('32');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Revisión vigente', { exact: true })).toHaveCount(2);
  const edicion = llamadas.find((c) => c.metodo === 'PUT');
  expect(edicion.cuerpo.datos.atributos).toMatchObject({ legado: { conservar: true }, ram: 32, portable: false });
  await page.getByRole('button', { name: 'Confirmar aprobación individual' }).click();
  await expect(page.getByText('Decisión terminal:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar borrador' })).toHaveCount(0);
});

test('lote usa una petición atómica y muestra el conflicto sin aprobar individualmente', async ({ page }) => {
  const { estado, llamadas } = await preparar(page);
  estado.propuestas[0].estado = 'en_revision';
  await page.getByRole('button', { name: 'Actualizar consulta y catálogos' }).click();
  await page.getByRole('checkbox', { name: /Lote\s*:\s*p-1$/ }).check();
  await page.getByRole('checkbox', { name: /Lote\s*:\s*p-2$/ }).check();
  estado.falloLote = true;
  await page.getByRole('button', { name: 'Aprobar lote seleccionado' }).click();
  await expect(page.getByRole('alert')).toContainText('Falta revisión de serial');
  expect(estado.propuestas.every((p) => p.estado === 'en_revision')).toBeTruthy();
  expect(llamadas.filter((c) => c.ruta.endsWith('/aprobar'))).toHaveLength(0);
  estado.falloLote = false;
  await page.getByRole('button', { name: 'Aprobar lote seleccionado' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'lote-1' })).toBeVisible();
  expect(llamadas.filter((c) => c.ruta.endsWith('/aprobar-lote'))).toHaveLength(2);
});

test('vincula candidato por tipo e id, reabre duplicada y rechaza con motivo', async ({ page }) => {
  const { estado, llamadas } = await preparar(page);
  estado.candidatos = true;
  await abrirPrimera(page);
  await page.getByLabel('Decisión', { exact: true }).selectOption('vincular');
  await expect(page.getByRole('button', { name: 'Confirmar vínculo con activo' })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar activo candidato a-1' }).click();
  await expect(page.getByText('TI-CMP-00001', { exact: true })).toBeVisible();
  await page.getByLabel('Justificación', { exact: true }).fill('Mismo equipo físico');
  await page.getByRole('button', { name: 'Confirmar vínculo con activo' }).click();
  await expect(page.getByText('Revisar campos reabre esta propuesta', { exact: false })).toBeVisible();
  expect(llamadas.find((c) => c.ruta.endsWith('/vincular')).cuerpo).toEqual({ activo_id: 'a-1', justificacion: 'Mismo equipo físico' });
  await page.getByRole('checkbox', { name: 'Serial · revisión crítica', exact: true }).check();
  await page.getByRole('button', { name: 'Reabrir y revisar campos seleccionados' }).click();
  await expect(page.getByText('Revisión vigente', { exact: true })).toHaveCount(1);
  await page.getByLabel('Decisión', { exact: true }).selectOption('rechazar');
  await page.getByLabel('Motivo del rechazo').fill('Captura no correspondiente');
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByText('Decisión terminal:', { exact: false })).toBeVisible();
  expect(llamadas.find((c) => c.ruta.endsWith('/rechazar')).cuerpo).toEqual({ motivo: 'Captura no correspondiente' });
});

test('marcar duplicada exige justificación y forzar aprobación conserva el cuerpo explícito', async ({ page }) => {
  const { llamadas } = await preparar(page);
  await abrirPrimera(page);
  await page.getByLabel('Decisión', { exact: true }).selectOption('duplicada');
  await expect(page.getByRole('button', { name: 'Confirmar duplicada' })).toBeDisabled();
  await page.getByLabel('Justificación', { exact: true }).fill('Registro repetido');
  await page.getByRole('button', { name: 'Confirmar duplicada' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Decisión confirmada' })).toBeVisible();
  expect(llamadas.find((c) => c.ruta.endsWith('/duplicada')).cuerpo).toEqual({ justificacion: 'Registro repetido' });
  await page.getByRole('checkbox', { name: 'Serial · revisión crítica', exact: true }).check();
  await page.getByRole('button', { name: 'Reabrir y revisar campos seleccionados' }).click();
  await page.getByLabel('Decisión', { exact: true }).selectOption('aprobar');
  await page.getByRole('checkbox', { name: 'Forzar aprobación con justificación', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Confirmar aprobación individual' })).toBeDisabled();
  await page.getByLabel('Justificación', { exact: true }).fill('Factura compartida verificada');
  await page.getByRole('button', { name: 'Confirmar aprobación individual' }).click();
  await expect(page.getByText('Decisión terminal:', { exact: false })).toBeVisible();
  expect(llamadas.find((c) => c.ruta.endsWith('/aprobar')).cuerpo).toEqual({ forzar: true, justificacion: 'Factura compartida verificada' });
});

test('distingue error de consulta, vacío, filtro y paginación', async ({ page }) => {
  const { estado, llamadas } = await preparar(page);
  estado.falloLista = true;
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Servidor temporalmente inaccesible');
  await expect(page.getByText('No hay propuestas para esta consulta.')).toHaveCount(0);
  estado.falloLista = false;
  await page.getByRole('button', { name: 'Reintentar bandeja' }).click();
  await page.getByLabel('Estado', { exact: true }).selectOption('rechazada');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText('No hay propuestas para esta consulta.')).toBeVisible();
  estado.propuestas = Array.from({ length: 21 }, (_, i) => ({ ...estado.propuestas[0], id: `p-${i + 1}` }));
  await page.getByLabel('Estado', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver propuesta p-21', exact: true })).toBeVisible();
  expect(llamadas.some((c) => c.consulta.includes('offset=20'))).toBeTruthy();
});

test('422 conserva el formulario y describe el contexto del servidor', async ({ page }) => {
  const { estado } = await preparar(page);
  await abrirPrimera(page);
  await page.getByRole('button', { name: 'Editar borrador' }).click();
  estado.falloGuardar = true;
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('alert')).toContainText('valor_compra: no puede ser negativo');
  await expect(page.getByRole('heading', { name: 'Editar borrador' })).toBeVisible();
});

test('escritura aceptada con fallo de refresco bloquea nuevas decisiones hasta consultar', async ({ page }) => {
  const { estado, llamadas } = await preparar(page);
  await abrirPrimera(page);
  estado.falloRefresco = true;
  await page.getByRole('checkbox', { name: 'Serial · revisión crítica', exact: true }).check();
  await page.getByRole('button', { name: 'Registrar revisión de campos seleccionados' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Usa Actualizar detalle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar aprobación individual' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar borrador' })).toHaveCount(0);
  expect(llamadas.filter((c) => c.ruta.endsWith('/revisar'))).toHaveLength(1);
  estado.falloRefresco = false;
  await page.getByRole('button', { name: 'Actualizar detalle' }).click();
  await expect(page.getByRole('button', { name: 'Editar borrador' })).toBeEnabled();
  await expect(page.getByText('Revisión vigente', { exact: true })).toHaveCount(1);
});

for (const ancho of [375, 768, 1024, 1440]) {
  test(`sin desbordamiento y controles por teclado a ${ancho}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await preparar(page);
    const desbordamiento = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(await desbordamiento()).toBeFalsy();
    await page.getByRole('button', { name: 'Nuevo borrador' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Nuevo borrador manual' })).toBeVisible();
    await page.getByLabel('Categoría · necesaria para aprobar').selectOption('cat-1');
    await expect(page.getByLabel('portable · opcional')).toBeVisible();
    await expect(page.getByLabel('garantia · opcional')).toHaveAttribute('type', 'date');
    await page.screenshot({ path: testInfo.outputPath('formulario.png'), fullPage: true });
    expect(await desbordamiento()).toBeFalsy();
    await page.getByRole('button', { name: 'Cancelar edición' }).click();
    await abrirPrimera(page);
    expect(await desbordamiento()).toBeFalsy();
    await page.screenshot({ path: testInfo.outputPath('detalle.png'), fullPage: true });
    const foco = await page.getByRole('button', { name: 'Editar borrador' }).evaluate((el) => { el.focus(); return getComputedStyle(el).outlineWidth; });
    expect(foco).toBe('3px');
  });
}

test('encargado revisa confianza OCR y puede consultar el documento origen', async ({ page }) => {
  const { estado } = await preparar(page);
  const fuente = {
    ...estado.propuestas[0], id: 'ocr-p1', origen: 'ocr',
    documento: { id: 'doc-1', nombre: 'factura.pdf', enlace: 'https://tenant.sharepoint.com/factura.pdf' },
    confianzas_campos: { serial: 0.72, modelo: 0.93 },
    datos: { ...estado.propuestas[0].datos, serial: 'SN-OCR', modelo: 'Latitude OCR' }
  };
  estado.propuestas.push(fuente);
  await page.reload();
  await page.getByRole('button', { name: 'Ver propuesta ocr-p1' }).click();
  await expect(page.getByText(/Propuesta extra.*da por OCR/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir factura.pdf en SharePoint' })).toHaveAttribute('href', fuente.documento.enlace);
  await expect(page.getByRole('heading', { name: 'Confianza por campo' })).toBeVisible();
  await expect(page.getByText('72%', { exact: true })).toBeVisible();
  await expect(page.getByText('Debajo del umbral; verifica con cuidado')).toBeVisible();
  await expect(page.getByText('Sobre el umbral; requiere revisión humana')).toBeVisible();
  await expect(page.getByRole('button', { name: /Registrar/ })).toBeDisabled();
});

test('admin sin encargado no ve enlace ni consulta propuestas', async ({ page }) => {
  const { llamadas } = await preparar(page, 'admin');
  await expect(page.getByRole('alert')).toContainText('únicamente para el rol encargado');
  await expect(page.getByRole('link', { name: 'Propuestas', exact: true })).toHaveCount(0);
  expect(llamadas.some((c) => c.ruta.startsWith('/api/v1/propuestas'))).toBeFalsy();
});
