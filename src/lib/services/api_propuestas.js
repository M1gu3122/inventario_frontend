import { solicitarAutenticado } from './api_auth.js';
const URL_BASE = '/api/v1/propuestas';
export function listarPropuestas({ estado, offset = 0, limit = 20 } = {}) {
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);
  parametros.set('offset', String(offset));
  parametros.set('limit', String(limit));
  return solicitarAutenticado(`${URL_BASE}?${parametros}`);
}
export function obtenerPropuesta(id) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`); }
export function crearPropuesta(datos) { return solicitarAutenticado(URL_BASE, { method: 'POST', body: JSON.stringify(datos) }); }
export function actualizarPropuesta(id, datos) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(datos) }); }
export function listarDuplicados(id, offset = 0, limit = 20) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/duplicados?${new URLSearchParams({ offset, limit })}`); }
export function revisarPropuesta(id, campos) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/revisar`, { method: 'POST', body: JSON.stringify({ campos }) }); }
export function aprobarPropuesta(id, datos = {}) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/aprobar`, { method: 'POST', body: JSON.stringify(datos) }); }
export function aprobarLote(propuestaIds, datos = {}) { return solicitarAutenticado(`${URL_BASE}/aprobar-lote`, { method: 'POST', body: JSON.stringify({ ...datos, propuesta_ids: propuestaIds }) }); }
export function rechazarPropuesta(id, motivo) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) }); }
export function marcarDuplicada(id, justificacion) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/duplicada`, { method: 'POST', body: JSON.stringify({ justificacion }) }); }
export function vincularPropuesta(id, activoId, justificacion) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/vincular`, { method: 'POST', body: JSON.stringify({ activo_id: activoId, justificacion }) }); }
