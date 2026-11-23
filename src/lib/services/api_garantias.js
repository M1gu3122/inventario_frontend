import { solicitarAutenticado } from './api_auth.js';

const URL_BASE = '/api/v1/garantias';

function consulta(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== null && valor !== undefined) parametros.set(clave, String(valor));
  }
  const query = parametros.toString();
  return query ? `${URL_BASE}?${query}` : URL_BASE;
}

export function listarGarantias(filtros = {}) {
  return solicitarAutenticado(consulta(filtros));
}

export function obtenerGarantia(id) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`);
}

export function guardarGarantia(id, datos) {
  return solicitarAutenticado(id ? `${URL_BASE}/${encodeURIComponent(id)}` : URL_BASE, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(datos)
  });
}

export function listarGarantiasPorVencer(dias = 30) {
  return solicitarAutenticado(`${URL_BASE}/por-vencer?dias=${encodeURIComponent(dias)}`);
}
