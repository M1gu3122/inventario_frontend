import { solicitarAutenticado } from './api_auth.js';

const URL_BASE = '/api/v1/sedes';

export function listarSedes(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== undefined && valor !== null) parametros.set(clave, String(valor));
  }
  return solicitarAutenticado(`${URL_BASE}?${parametros}`);
}

export function obtenerSedes(id) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`);
}

export function crearSedes(datos) {
  return solicitarAutenticado(URL_BASE, { method: 'POST', body: JSON.stringify(datos) });
}

export function actualizarSedes(id, datos) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(datos) });
}

export async function obtenerTodosSedes() {
  let registros = [];
  let offset = 0;
  while (true) {
    const pagina = await listarSedes({ offset, limit: 100 });
    registros = [...registros, ...pagina.items];
    offset += pagina.items.length;
    if (offset >= pagina.total || pagina.items.length === 0) return registros;
  }
}

