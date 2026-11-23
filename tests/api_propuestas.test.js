import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/services/api_auth.js', () => ({ solicitarAutenticado: vi.fn() }));
import { solicitarAutenticado } from '../src/lib/services/api_auth.js';
import * as api from '../src/lib/services/api_propuestas.js';
beforeEach(() => { vi.clearAllMocks(); solicitarAutenticado.mockResolvedValue({}); });
describe('contrato de propuestas', () => {
  it('consulta páginas sin barra final y codifica identificadores', async () => {
    await api.listarPropuestas({ estado: 'en_revision', offset: 20, limit: 20 });
    await api.obtenerPropuesta('id/1');
    await api.listarDuplicados('id/1', 20, 10);
    expect(solicitarAutenticado.mock.calls).toEqual([
      ['/api/v1/propuestas?estado=en_revision&offset=20&limit=20'],
      ['/api/v1/propuestas/id%2F1'],
      ['/api/v1/propuestas/id%2F1/duplicados?offset=20&limit=10']
    ]);
  });
  it('guarda borradores incompletos y conserva atributos desconocidos', async () => {
    const cuerpo = { categoria_id: null, datos: { serial: null, atributos: { legado: { valor: false } } } };
    await api.crearPropuesta(cuerpo);
    await api.actualizarPropuesta('id', cuerpo);
    expect(solicitarAutenticado.mock.calls).toEqual([
      ['/api/v1/propuestas', { method: 'POST', body: JSON.stringify(cuerpo) }],
      ['/api/v1/propuestas/id', { method: 'PUT', body: JSON.stringify(cuerpo) }]
    ]);
  });
  it('envía únicamente los campos explícitamente seleccionados a revisar', async () => {
    await api.revisarPropuesta('id', ['serial', 'numero_factura', 'valor_compra', 'atributos.ram']);
    expect(JSON.parse(solicitarAutenticado.mock.calls[0][1].body)).toEqual({ campos: ['serial', 'numero_factura', 'valor_compra', 'atributos.ram'] });
  });
  it('aprueba un lote mediante una sola solicitud atómica y propaga el conflicto', async () => {
    const conflicto = Object.assign(new Error('Revisión pendiente'), { status: 409 });
    solicitarAutenticado.mockRejectedValueOnce(conflicto);
    await expect(api.aprobarLote(['a', 'b'], { forzar: true, justificacion: 'Factura compartida' })).rejects.toBe(conflicto);
    expect(solicitarAutenticado).toHaveBeenCalledExactlyOnceWith('/api/v1/propuestas/aprobar-lote', { method: 'POST', body: JSON.stringify({ forzar: true, justificacion: 'Factura compartida', propuesta_ids: ['a', 'b'] }) });
  });
  it('conecta decisiones individuales con sus cuerpos exactos', async () => {
    await api.aprobarPropuesta('id', { forzar: true, justificacion: 'Comprobado' });
    await api.rechazarPropuesta('id', 'No corresponde');
    await api.marcarDuplicada('id', 'Ya registrado');
    await api.vincularPropuesta('id', 'activo', 'Mismo equipo');
    expect(solicitarAutenticado.mock.calls.map(([ruta, opciones]) => [ruta, opciones.method, JSON.parse(opciones.body)])).toEqual([
      ['/api/v1/propuestas/id/aprobar', 'POST', { forzar: true, justificacion: 'Comprobado' }],
      ['/api/v1/propuestas/id/rechazar', 'POST', { motivo: 'No corresponde' }],
      ['/api/v1/propuestas/id/duplicada', 'POST', { justificacion: 'Ya registrado' }],
      ['/api/v1/propuestas/id/vincular', 'POST', { activo_id: 'activo', justificacion: 'Mismo equipo' }]
    ]);
  });
});
