import { solicitarAutenticado } from './api_auth.js';

const URL_BASE = '/api/v1/categorias';

export function listarCategorias(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== undefined && valor !== null) parametros.set(clave, String(valor));
  }
  return solicitarAutenticado(`${URL_BASE}?${parametros}`);
}

export function obtenerCategorias(id) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`);
}

export function crearCategorias(datos) {
  return solicitarAutenticado(URL_BASE, { method: 'POST', body: JSON.stringify(datos) });
}

export function actualizarCategorias(id, datos) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(datos) });
}

export async function obtenerTodosCategorias() {
  let registros = [];
  let offset = 0;
  while (true) {
    const pagina = await listarCategorias({ offset, limit: 100 });
    registros = [...registros, ...pagina.items];
    offset += pagina.items.length;
    if (offset >= pagina.total || pagina.items.length === 0) return registros;
  }
}

