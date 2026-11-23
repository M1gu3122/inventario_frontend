import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const transporte = vi.hoisted(() => ({ solicitarAutenticado: vi.fn() }));
vi.mock('../src/lib/services/api_auth.js', () => transporte);
beforeEach(() => transporte.solicitarAutenticado.mockReset());
afterEach(() => vi.restoreAllMocks());

it('incluye opciones despues de la primera pagina de cien ubicaciones', async () => {
  const { obtenerTodosUbicaciones } = await import('../src/lib/services/api_ubicaciones.js');
  const primeraPagina = Array.from({ length: 100 }, (_, indice) => ({ id: `ubicacion-${indice}` }));
  transporte.solicitarAutenticado.mockResolvedValueOnce({ items: primeraPagina, total: 101, offset: 0, limit: 100 })
    .mockResolvedValueOnce({ items: [{ id: 'ultima-ubicacion' }], total: 101, offset: 100, limit: 100 });
  const resultado = await obtenerTodosUbicaciones();
  expect(resultado).toHaveLength(101);
  expect(resultado.at(-1).id).toBe('ultima-ubicacion');
  expect(transporte.solicitarAutenticado.mock.calls[1][0]).toContain('offset=100');
});

it('no presenta opciones parciales como carga correcta si una pagina falla', async () => {
  const { obtenerTodosSedes } = await import('../src/lib/services/api_sedes.js');
  transporte.solicitarAutenticado.mockResolvedValueOnce({ items: [{ id: 'primera' }], total: 2, offset: 0, limit: 100 })
    .mockRejectedValueOnce(new Error('Servidor inaccesible'));
  await expect(obtenerTodosSedes()).rejects.toThrow('Servidor inaccesible');
});
