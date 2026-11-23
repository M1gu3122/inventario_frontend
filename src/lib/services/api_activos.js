import { solicitarAutenticado } from './api_auth.js';

const URL_BASE = '/api/v1/activos';

export function listarActivos(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== undefined && valor !== null) {
      parametros.set(clave, String(valor));
    }
  }
  const consulta = parametros.toString();
  return solicitarAutenticado(consulta ? `${URL_BASE}?${consulta}` : URL_BASE);
}

export function obtenerActivo(id) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`);
}

export function crearActivo(datos) {
  return solicitarAutenticado(URL_BASE, { method: 'POST', body: JSON.stringify(datos) });
}

export function actualizarActivo(id, datos) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(datos)
  });
}
