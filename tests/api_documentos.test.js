import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/services/api_auth.js', () => ({ solicitarAutenticado: vi.fn() }));

import { solicitarAutenticado } from '../src/lib/services/api_auth.js';
import * as api from '../src/lib/services/api_documentos.js';

beforeEach(() => {
  vi.clearAllMocks();
  solicitarAutenticado.mockResolvedValue({});
});

describe('contrato de documentos', () => {
  it('consulta con filtros y paginación', async () => {
    await api.listarDocumentos({ tipo: 'factura', estado: 'error', offset: 20, limit: 20 });
    expect(solicitarAutenticado).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/documentos?tipo=factura&estado=error&offset=20&limit=20'
    );
  });

  it('codifica identificadores y solicita reproceso sin cuerpo', async () => {
    await api.obtenerDocumento('doc/1');
    await api.reprocesarDocumento('doc/1');
    expect(solicitarAutenticado.mock.calls).toEqual([
      ['/api/v1/documentos/doc%2F1'],
      ['/api/v1/documentos/doc%2F1/reprocesar', { method: 'POST' }]
    ]);
  });
});
