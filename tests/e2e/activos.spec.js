import { expect, test } from '@playwright/test';

test('encargado registra y edita activos sin mutar categoría ni estado', async ({ page }) => {
  let activo = null;
  const categoria = {
    id: 'categoria-1',
    codigo: 'CMP',
    nombre: 'Computadoras',
    activa: true,
    esquema_campos: {
      ram_gb: { tipo: 'numero', requerido: true },
      portable: { tipo: 'booleano', requerido: false }
    }
  };
  const respuestaActivo = (datos) => ({
    id: 'activo-1',
    codigo_interno: 'TI-CMP-00001',
    categoria_id: categoria.id,
    ubicacion_id: 'ubicacion-1',
    marca: datos.marca,
    modelo: datos.modelo,
    serial: datos.serial,
    estado: 'disponible',
    codigo_externo: datos.codigo_externo || null,
    proveedor: datos.proveedor || null,
    numero_factura: datos.numero_factura || null,
    valor_compra: datos.valor_compra || null,
    fecha_adquisicion: datos.fecha_adquisicion || null,
    observaciones: datos.observaciones || null,
    atributos: datos.atributos,
    creado_por: 'usuario-1',
    actualizado_por: datos.actualizado_por || null,
    creado_en: '2026-11-22T12:00:00Z',
    actualizado_en: '2026-11-22T12:00:00Z'
  });
  const cumplir = (route, status, body) => {
    const headers = {
      'access-control-allow-origin': 'http://localhost:5173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type'
    };
    if (status === 204) return route.fulfill({ status, headers });
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(body)
    });
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const metodo = request.method();
    if (metodo === 'OPTIONS') return cumplir(route, 204, {});
    if (url.pathname === '/api/v1/auth/refresh') {
      return cumplir(route, 200, {
        access_token: 'token-e2e',
        user: { id: 'usuario-1', email: 'encargado@inventario.local', roles: ['encargado'] }
      });
    }
    if (url.pathname === '/api/v1/categorias') {
      return cumplir(route, 200, { items: [categoria], total: 1, offset: 0, limit: 100 });
    }
    if (url.pathname === '/api/v1/ubicaciones') {
      return cumplir(route, 200, {
        items: [{ id: 'ubicacion-1', area_id: 'area-1', codigo: 'LAB', nombre: 'Laboratorio', activa: true }],
        total: 1,
        offset: 0,
        limit: 100
      });
    }
    if (url.pathname === '/api/v1/areas') {
      return cumplir(route, 200, {
        items: [{ id: 'area-1', sede_id: 'sede-1', codigo: 'TI', nombre: 'Tecnología', activa: true }],
        total: 1,
        offset: 0,
        limit: 100
      });
    }
    if (url.pathname === '/api/v1/sedes') {
      return cumplir(route, 200, {
        items: [{ id: 'sede-1', codigo: 'BOG', nombre: 'Bogotá', activa: true }],
        total: 1,
        offset: 0,
        limit: 100
      });
    }
    if (url.pathname === '/api/v1/activos' && metodo === 'GET') {
      return cumplir(route, 200, {
        items: activo ? [activo] : [],
        total: activo ? 1 : 0,
        offset: 0,
        limit: 20
      });
    }
    if (url.pathname === '/api/v1/activos' && metodo === 'POST') {
      const datos = request.postDataJSON();
      activo = respuestaActivo(datos);
      return cumplir(route, 201, activo);
    }
    if (url.pathname === '/api/v1/activos/activo-1' && metodo === 'GET') {
      return cumplir(route, activo ? 200 : 404, activo || { detail: 'No encontrado' });
    }
    if (url.pathname === '/api/v1/activos/activo-1' && metodo === 'PUT') {
      activo = { ...activo, ...request.postDataJSON() };
      return cumplir(route, 200, activo);
    }
    return cumplir(route, 404, { detail: `Ruta no simulada: ${metodo} ${url.pathname}` });
  });

  await page.goto('/activos');
  await expect(page.getByRole('heading', { name: 'Activos' })).toBeVisible();
  await expect(page.getByText('No hay activos para esta consulta.')).toBeVisible();
  await page.locator('#categoria-activo').selectOption(categoria.id);
  await page.locator('#ubicacion-activo').selectOption('ubicacion-1');
  await page.getByLabel('Marca', { exact: true }).fill('Dell');
  await page.getByLabel('Modelo', { exact: true }).fill('Latitude');
  await page.getByLabel('Serial', { exact: true }).fill('sn-e2e-001');
  await page.getByLabel('ram_gb', { exact: false }).fill('16');
  await page.getByLabel('portable', { exact: true }).selectOption({ label: 'Sí' });
  await page.getByRole('button', { name: 'Registrar activo', exact: true }).click();

  await expect(page.getByRole('row').filter({ hasText: 'TI-CMP-00001' })).toContainText('SN-E2E-001');
  expect(activo.atributos).toEqual({ ram_gb: 16, portable: true });
  await page.getByRole('button', { name: 'Editar TI-CMP-00001' }).click();
  await expect(page.locator('#categoria-activo')).toBeDisabled();
  await expect(page.getByLabel('ram_gb', { exact: false })).toHaveValue('16');
  await page.getByLabel('Serial', { exact: true }).fill('sn-e2e-002');
  await page.getByLabel('ram_gb', { exact: false }).fill('32');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'TI-CMP-00001' })).toContainText('SN-E2E-002');
  expect(activo.estado).toBe('disponible');
  expect(activo.categoria_id).toBe(categoria.id);

  for (const ancho of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('administrador consulta activos sin controles de escritura', async ({ page }) => {
  const cumplir = (route, status, body) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': 'http://localhost:5173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type'
    },
    body: JSON.stringify(body)
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({
      status: 204,
      headers: {
        'access-control-allow-origin': 'http://localhost:5173',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type'
      }
    });
    if (url.pathname === '/api/v1/auth/refresh') {
      return cumplir(route, 200, {
        access_token: 'token-e2e',
        user: { id: 'admin-1', email: 'admin@inventario.local', roles: ['admin'] }
      });
    }
    if (['/api/v1/categorias', '/api/v1/ubicaciones', '/api/v1/areas', '/api/v1/sedes'].includes(url.pathname)) {
      return cumplir(route, 200, { items: [], total: 0, offset: 0, limit: 100 });
    }
    if (url.pathname === '/api/v1/activos') {
      return cumplir(route, 200, { items: [], total: 0, offset: 0, limit: 20 });
    }
    return cumplir(route, 404, { detail: 'No encontrado' });
  });

  await page.goto('/activos');
  await expect(page.getByRole('heading', { name: 'Activos' })).toBeVisible();
  await expect(page.getByText('Consulta de solo lectura.')).toBeVisible();
  await expect(page.locator('form.editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
});


const idB3 = '00000000-0000-4000-8000-000000000001';
const destinoB3 = '00000000-0000-4000-8000-000000000002';
const referenciaB3 = '00000000-0000-4000-8000-000000000003';

async function prepararCiclo(page, rol, conflicto = false) {
  let activo = { id: idB3, codigo_interno: 'TI-CMP-00042', categoria_id: idB3, ubicacion_id: idB3, marca: 'Dell', modelo: 'Latitude', serial: 'B3-42', estado: 'disponible', atributos: {}, codigo_externo: null, proveedor: null, numero_factura: null, valor_compra: null, fecha_adquisicion: null, observaciones: null, creado_por: idB3, actualizado_por: null, creado_en: '2026-11-22T12:00:00Z', actualizado_en: '2026-11-22T12:00:00Z' };
  let previo = '';
  let historial = [];
  const solicitudes = [];
  const offsets = [];
  const ubicaciones = [
    { id: idB3, area_id: idB3, codigo: 'LAB', nombre: 'Laboratorio', activa: true },
    { id: destinoB3, area_id: idB3, codigo: 'OF', nombre: 'Oficina', activa: true }
  ];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' };
    const responder = (status, body) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/refresh')) return responder(200, { access_token: 'b3-token', user: { id: idB3, email: 'b3@inventario.local', roles: [rol] } });
    const catalogos = {
      categorias: [{ id: idB3, codigo: 'CMP', nombre: 'Computadoras', activa: true, esquema_campos: {} }],
      ubicaciones,
      areas: [{ id: idB3, sede_id: idB3, nombre: 'TI', codigo: 'TI', activa: true }],
      sedes: [{ id: idB3, nombre: 'Bogota', codigo: 'BOG', activa: true }],
      empleados: [
        { id: idB3, nombre_completo: 'Empleado local', ubicacion_id: activo.ubicacion_id, activo: true },
        { id: destinoB3, nombre_completo: 'Empleado remoto', ubicacion_id: 'otra', activo: true },
        { id: referenciaB3, nombre_completo: 'Empleado inactivo', ubicacion_id: activo.ubicacion_id, activo: false }
      ]
    };
    const recurso = url.pathname.split('/').at(-1);
    if (catalogos[recurso]) return responder(200, { items: catalogos[recurso], total: catalogos[recurso].length, offset: 0, limit: 100 });
    if (url.pathname === '/api/v1/activos') return responder(200, { items: [activo], total: 1, offset: 0, limit: 20 });
    if (url.pathname === `/api/v1/activos/${idB3}`) return responder(200, activo);
    if (recurso === 'movimientos') {
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      return responder(200, { items: historial.slice(offset, offset + 10), total: historial.length, offset, limit: 10 });
    }
    if (request.method() === 'POST') {
      const datos = request.postDataJSON();
      solicitudes.push({ ruta: url.pathname, datos });
      if (conflicto) return responder(typeof conflicto === 'number' ? conflicto : 409, { detail: 'Conflicto concurrente', code: 'estado_invalido' });
      const anterior = activo.estado;
      let tipo;
      if (recurso === 'asignaciones') { activo.estado = 'asignado'; tipo = 'asignacion'; }
      if (recurso === 'devoluciones') { activo.estado = 'disponible'; tipo = 'devolucion'; }
      if (recurso === 'traslados') { activo.estado = 'en traslado'; tipo = 'traslado'; }
      if (recurso === 'confirmacion') { activo.estado = 'disponible'; activo.ubicacion_id = destinoB3; tipo = 'traslado'; }
      if (recurso === 'mantenimientos') { previo = anterior; activo.estado = 'en mantenimiento'; tipo = 'mantenimiento'; }
      if (recurso === 'cierre') { activo.estado = previo; tipo = 'mantenimiento'; }
      if (recurso === 'bajas') { activo.estado = 'de baja'; tipo = 'baja'; }
      historial.unshift({ id: `10000000-0000-4000-8000-${String(historial.length).padStart(12, '0')}`, activo_id: idB3, tipo, estado_anterior: anterior, estado_nuevo: activo.estado, ocurrido_en: '2026-11-22T12:00:00Z', actor_id: idB3, observacion: datos.observacion || datos.motivo, ubicacion_origen_id: idB3, ubicacion_destino_id: tipo === 'traslado' ? destinoB3 : idB3, asignacion_id: tipo === 'asignacion' ? referenciaB3 : null, traslado_id: tipo === 'traslado' ? referenciaB3 : null, mantenimiento_id: tipo === 'mantenimiento' ? referenciaB3 : null, baja_id: tipo === 'baja' ? referenciaB3 : null });
      const base = { id: referenciaB3, activo_id: idB3 };
      const fecha = '2026-11-22T12:00:00Z';
      if (tipo === 'asignacion' || tipo === 'devolucion') return responder(201, { ...base, empleado_id: idB3, ubicacion_id: activo.ubicacion_id, asignado_por: idB3, asignada_en: fecha, devuelta_en: tipo === 'devolucion' ? fecha : null, devuelto_por: tipo === 'devolucion' ? idB3 : null, observaciones: datos.observacion });
      if (tipo === 'traslado') return responder(recurso === 'traslados' ? 201 : 200, { ...base, ubicacion_origen_id: idB3, ubicacion_destino_id: destinoB3, estado: recurso === 'confirmacion' ? 'confirmado' : 'abierto', estado_activo_previo: 'disponible', solicitado_por: idB3, solicitado_en: fecha, confirmado_por: recurso === 'confirmacion' ? idB3 : null, confirmado_en: recurso === 'confirmacion' ? fecha : null, observacion: datos.observacion });
      if (tipo === 'mantenimiento') return responder(recurso === 'mantenimientos' ? 201 : 200, { ...base, tipo: 'preventivo', descripcion: 'Revision', estado: recurso === 'cierre' ? 'cerrado' : 'abierto', estado_activo_previo: previo, fecha_inicio: fecha, fecha_cierre: recurso === 'cierre' ? fecha : null, proveedor: null, tecnico: 'Tecnico TI', costo: '0', proximo_mantenimiento: null, referencia_documental: null, creado_por: idB3, cerrado_por: recurso === 'cierre' ? idB3 : null, creado_en: fecha, actualizado_en: fecha });
      return responder(201, { ...base, motivo: datos.motivo, fecha_baja: datos.fecha_baja, autorizada_por: idB3, registrada_en: fecha });
    }
    return responder(404, { detail: 'Ruta no prevista' });
  });
  await page.goto('/activos');
  await page.getByRole('button', { name: 'Ciclo de vida TI-CMP-00042' }).click();
  await expect(page.getByRole('heading', { name: /Ciclo de vida/ })).toBeVisible();
  return { solicitudes, offsets, historial: () => historial, sembrar: () => { historial = Array.from({ length: 12 }, (_, i) => ({ ...historial[0], id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}` })); } };
}

async function confirmarCiclo(page) {
  await page.getByLabel('Observaci\u00f3n del movimiento').fill('Operacion documentada');
  await page.getByRole('button', { name: 'Confirmar operaci\u00f3n', exact: true }).click();
  await expect(page.getByText('Operaci\u00f3n confirmada por el servidor.')).toBeVisible();
}

test('B3 encargado completa ciclo operativo y conserva ubicacion hasta confirmar', async ({ page }) => {
  const contexto = await prepararCiclo(page, 'encargado');
  await page.getByRole('button', { name: 'Asignar', exact: true }).click();
  await expect(page.locator('#empleado-movimiento option')).toHaveCount(2);
  await page.locator('#empleado-movimiento').selectOption(idB3);
  await confirmarCiclo(page);
  await expect(page.getByRole('button', { name: 'Solicitar traslado', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir mantenimiento', exact: true }).click();
  await page.getByLabel('Descripci\u00f3n del mantenimiento').fill('Revision');
  await page.getByLabel('Fecha de inicio (hora local)').fill('2026-11-22T08:00');
  await page.getByLabel('T\u00e9cnico de mantenimiento').fill('Tecnico TI');
  await confirmarCiclo(page);
  expect(contexto.solicitudes.at(-1).datos.fecha_inicio).toMatch(/Z$/);
  await expect(page.getByRole('button', { name: 'Devolver', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar mantenimiento', exact: true }).click();
  await page.getByLabel('Fecha de cierre (hora local)').fill('2026-11-22T09:00');
  await confirmarCiclo(page);
  expect(contexto.solicitudes.at(-1).ruta).toContain(`/mantenimientos/${referenciaB3}/cierre`);
  await expect(page.getByText('Estado: asignado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Devolver', exact: true }).click();
  await confirmarCiclo(page);
  await page.getByRole('button', { name: 'Solicitar traslado', exact: true }).click();
  await page.getByLabel('Ubicaci\u00f3n de destino').selectOption(destinoB3);
  await confirmarCiclo(page);
  await expect(page.getByText(/Ubicaci\u00f3n confirmada:.*Laboratorio/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar traslado', exact: true }).click();
  await confirmarCiclo(page);
  expect(contexto.solicitudes.at(-1).ruta).toContain(`/traslados/${referenciaB3}/confirmacion`);
  await expect(page.getByText(/Ubicaci\u00f3n confirmada:.*Oficina/)).toBeVisible();
  contexto.sembrar();
  await page.getByRole('button', { name: 'Actualizar ciclo de vida' }).click();
  await expect(page.locator('.historial li')).toHaveCount(10);
  await page.getByRole('button', { name: 'M\u00e1s movimientos', exact: true }).click();
  await expect(page.locator('.historial li')).toHaveCount(2);
  expect(contexto.offsets).toContain(10);
  for (const ancho of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Dar de baja', exact: true }).click();
  await page.getByLabel('Motivo de baja').fill('Fin de vida util');
  await page.getByLabel('Fecha de baja').fill('2026-11-22');
  await page.getByRole('button', { name: 'Confirmar operaci\u00f3n', exact: true }).click();
  expect(contexto.solicitudes.at(-1).ruta).not.toMatch(/bajas$/);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirmar operaci\u00f3n', exact: true }).click();
  await expect(page.getByText('Estado: de baja', { exact: true })).toBeVisible();
  await expect(page.locator('.ciclo > .acciones button')).toHaveCount(0);
});

for (const rol of ['admin', 'auditor']) {
  test(`B3 ${rol} lee historial sin controles de movimientos`, async ({ page }) => {
    await prepararCiclo(page, rol);
    await expect(page.getByText('Este activo no tiene movimientos registrados.')).toBeVisible();
    await expect(page.locator('.ciclo > .acciones button')).toHaveCount(0);
    await expect(page.locator('form.editor')).toHaveCount(0);
  });
}

test('B3 tecnico opera sin baja y 409 no produce exito ni historial vacio', async ({ page }) => {
  const contexto = await prepararCiclo(page, 'tecnico', true);
  await expect(page.getByRole('button', { name: 'Dar de baja', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Solicitar traslado', exact: true }).click();
  await page.getByLabel('Ubicaci\u00f3n de destino').selectOption(destinoB3);
  await page.getByLabel('Observaci\u00f3n del movimiento').fill('Traslado solicitado');
  await page.getByRole('button', { name: 'Confirmar operaci\u00f3n', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Conflicto');
  await expect(page.getByText('Operaci\u00f3n confirmada por el servidor.')).toHaveCount(0);
  await expect(page.getByText('Este activo no tiene movimientos registrados.')).toHaveCount(0);
  await expect(page.getByText('Estado: disponible', { exact: true })).toBeVisible();
  expect(contexto.solicitudes).toHaveLength(1);
});


for (const [status, mensaje] of [[401, 'Sesi\u00f3n vencida'], [403, 'No tienes permiso'], [422, 'Revisa los datos']]) {
  test(`B3 presenta error ${status} sin anunciar exito`, async ({ page }) => {
    await prepararCiclo(page, 'tecnico', status);
    await page.getByRole('button', { name: 'Solicitar traslado', exact: true }).click();
    await page.getByLabel('Ubicaci\u00f3n de destino').selectOption(destinoB3);
    await page.getByLabel('Observaci\u00f3n del movimiento').fill('Solicitud');
    await page.getByRole('button', { name: 'Confirmar operaci\u00f3n', exact: true }).click();
    if (status === 401) await expect(page).toHaveURL(/\/login$/);
    else await expect(page.getByRole('alert')).toContainText(mensaje);
    await expect(page.getByText('Operaci\u00f3n confirmada por el servidor.')).toHaveCount(0);
  });
}

test('B3 bloquea doble envio mientras espera confirmacion real', async ({ page }) => {
  const contexto = await prepararCiclo(page, 'tecnico');
  let liberar;
  const pendiente = new Promise((resolve) => { liberar = resolve; });
  await page.route('**/api/v1/activos/*/traslados', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await pendiente;
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Solicitar traslado', exact: true }).click();
  await page.getByLabel('Ubicaci\u00f3n de destino').selectOption(destinoB3);
  await page.getByLabel('Observaci\u00f3n del movimiento').fill('Solicitud');
  await page.getByRole('button', { name: 'Confirmar operaci\u00f3n', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviando\u2026', exact: true })).toBeDisabled();
  await expect(page.getByText('Operaci\u00f3n confirmada por el servidor.')).toHaveCount(0);
  liberar();
  await expect(page.getByText('Operaci\u00f3n confirmada por el servidor.')).toBeVisible();
  expect(contexto.solicitudes).toHaveLength(1);
});

test('B3 distingue fallo de historial de una coleccion vacia', async ({ page }) => {
  await prepararCiclo(page, 'auditor');
  await page.route('**/api/v1/activos/*/movimientos?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:5173' }, body: JSON.stringify({ detail: 'Historial temporalmente inaccesible' }) }));
  await page.getByRole('button', { name: 'Actualizar ciclo de vida' }).click();
  await expect(page.getByRole('alert')).toContainText('Historial temporalmente inaccesible');
  await expect(page.getByText('Este activo no tiene movimientos registrados.')).toHaveCount(0);
});
