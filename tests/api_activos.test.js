import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/services/api_auth.js', () => ({
  solicitarAutenticado: vi.fn()
}));

import { solicitarAutenticado } from '../src/lib/services/api_auth.js';
import {
  actualizarActivo,
  crearActivo,
  listarActivos,
  obtenerActivo
} from '../src/lib/services/api_activos.js';

beforeEach(() => {
  vi.clearAllMocks();
  solicitarAutenticado.mockResolvedValue({});
});

describe('servicio de activos', () => {
  it('construye filtros de colección sin inventar parámetros', async () => {
    await listarActivos({
      categoria: 'categoria/1',
      estado: 'disponible',
      offset: 0,
      limit: 20,
      ignorar: ''
    });
    expect(solicitarAutenticado).toHaveBeenCalledWith(
      '/api/v1/activos?categoria=categoria%2F1&estado=disponible&offset=0&limit=20'
    );
  });

  it('usa GET individual y POST/PUT con el cuerpo JSON del contrato', async () => {
    const datos = { serial: 'SN-1', atributos: { ram_gb: 16 } };
    await obtenerActivo('id/1');
    await crearActivo(datos);
    await actualizarActivo('id/1', datos);
    expect(solicitarAutenticado).toHaveBeenNthCalledWith(1, '/api/v1/activos/id%2F1');
    expect(solicitarAutenticado).toHaveBeenNthCalledWith(2, '/api/v1/activos', {
      method: 'POST',
      body: JSON.stringify(datos)
    });
    expect(solicitarAutenticado).toHaveBeenNthCalledWith(3, '/api/v1/activos/id%2F1', {
      method: 'PUT',
      body: JSON.stringify(datos)
    });
  });
});
