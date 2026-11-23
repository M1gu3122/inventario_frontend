import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/lib/services/api_auth.js', () => ({ solicitarAutenticado: vi.fn() }));
import { solicitarAutenticado } from '../src/lib/services/api_auth.js';
import { validarImportacion, confirmarImportacion } from '../src/lib/services/api_importacion.js';
import { asignarLicencia, liberarLicencia, listarAsignaciones, guardarLicencia } from '../src/lib/services/api_licencias.js';
import { obtenerReporte, obtenerReporteCompleto, listarAuditoria } from '../src/lib/services/api_auditoria.js';
import { listarGarantias, guardarGarantia } from '../src/lib/services/api_garantias.js';
beforeEach(() => vi.clearAllMocks());
it('separa simulación y confirmación con el mismo archivo y opciones multipart', async () => {
  const archivo = new File(['serial\nSN'], 'activos.csv');
  await validarImportacion(archivo, 'utf-8', ';');
  await confirmarImportacion(archivo, 'utf-8', ';', true);
  const llamadas = solicitarAutenticado.mock.calls;
  expect(llamadas.map(c => c[0])).toEqual(['/api/v1/importacion/dry-run', '/api/v1/importacion/confirmar']);
  expect(llamadas[0][1].body.get('archivo').name).toBe('activos.csv');
  expect(llamadas[0][1].body.has('sobrescribir_existentes')).toBe(false);
  expect(llamadas[1][1].body.get('sobrescribir_existentes')).toBe('true');
  expect(llamadas[1][1].body.get('delimitador')).toBe(';');
});
it('envía el mismo mapeo configurable en simulación y confirmación', async () => {
  const archivo = new File(['Category,Serial Number\nCOM,SN-1'], 'activos.csv');
  const mapeo = { categoria_codigo: 'Category', serial: 'Serial Number' };
  await validarImportacion(archivo, 'utf-8', ',', mapeo);
  await confirmarImportacion(archivo, 'utf-8', ',', false, mapeo);
  const llamadas = solicitarAutenticado.mock.calls;
  expect(JSON.parse(llamadas[0][1].body.get('mapeo_columnas'))).toEqual(mapeo);
  expect(JSON.parse(llamadas[1][1].body.get('mapeo_columnas'))).toEqual(mapeo);
});
it('preserva múltiples asientos y exige el cuerpo contractual de liberación', async () => {
  await asignarLicencia('l/1', { titular_tipo: 'empleado', titular_id: 'e1', asientos: 3 });
  await liberarLicencia('as/1', 'Cambio de equipo');
  await listarAsignaciones('l1', { solo_activas: false, offset: 20, limit: 20 });
  expect(JSON.parse(solicitarAutenticado.mock.calls[0][1].body)).toEqual({ licencia_id: 'l/1', titular_tipo: 'empleado', titular_id: 'e1', asientos: 3 });
  expect(solicitarAutenticado.mock.calls[1]).toEqual(['/api/v1/licencias/asignaciones/as%2F1/liberar', { method: 'POST', body: JSON.stringify({ motivo: 'Cambio de equipo' }) }]);
  expect(solicitarAutenticado.mock.calls[2][0]).toContain('solo_activas=false&offset=20&limit=20');
});
it('edita con PUT y consulta solo rutas de reportes documentadas', async () => {
  await guardarLicencia('l1', { producto: 'Software' });
  await obtenerReporte('historial', {offset: 20, limit: 20}, 'a/1');
  await listarAuditoria({ accion: '', actor_id: 'u1', offset: 0 });
  expect(solicitarAutenticado.mock.calls[0][1].method).toBe('PUT');
  expect(solicitarAutenticado.mock.calls[1][0]).toBe('/api/v1/auditoria/reportes/historial-activo/a%2F1?offset=20&limit=20');
  expect(solicitarAutenticado.mock.calls[2][0]).toBe('/api/v1/auditoria/logs?actor_id=u1&offset=0');
});
it('consulta y guarda garantías con los contratos versionados', async () => {
  await listarGarantias({ activo_id: 'a1', offset: 0, limit: 20 });
  await guardarGarantia('', { activo_id: 'a1', proveedor: 'Proveedor' });
  await guardarGarantia('g/1', { proveedor: 'Proveedor editado' });
  expect(solicitarAutenticado.mock.calls[0][0]).toBe('/api/v1/garantias?activo_id=a1&offset=0&limit=20');
  expect(solicitarAutenticado.mock.calls[1]).toEqual(['/api/v1/garantias', { method: 'POST', body: JSON.stringify({ activo_id: 'a1', proveedor: 'Proveedor' }) }]);
  expect(solicitarAutenticado.mock.calls[2]).toEqual(['/api/v1/garantias/g%2F1', { method: 'PUT', body: JSON.stringify({ proveedor: 'Proveedor editado' }) }]);
});
it('recorre todas las páginas disponibles al preparar una exportación', async () => {
  solicitarAutenticado
    .mockResolvedValueOnce({ items: [{ serial: 'A' }], total: 2, limit: 1 })
    .mockResolvedValueOnce({ items: [{ serial: 'B' }], total: 2, limit: 1 });
  const filas = await obtenerReporteCompleto('inventario', { estado: 'disponible' });
  expect(filas.map(fila => fila.serial)).toEqual(['A', 'B']);
  expect(solicitarAutenticado.mock.calls.map(([url]) => url)).toEqual([
    '/api/v1/auditoria/reportes/inventario?estado=disponible&offset=0&limit=100',
    '/api/v1/auditoria/reportes/inventario?estado=disponible&offset=1&limit=100'
  ]);
});
