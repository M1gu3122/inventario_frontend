import { solicitarAutenticado } from './api_auth.js';
const URL_BASE = '/api/v1/licencias';
export function listarLicencias(filtros = {}) { return solicitarAutenticado(`${URL_BASE}?${new URLSearchParams(filtros)}`); }
export function resumenLicencias() { return solicitarAutenticado(`${URL_BASE}/resumen`); }
export function obtenerLicencia(id) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`); }
export function guardarLicencia(id, datos) { return solicitarAutenticado(id ? `${URL_BASE}/${encodeURIComponent(id)}` : URL_BASE, { method: id ? 'PUT' : 'POST', body: JSON.stringify(datos) }); }
export function listarAsignaciones(id, filtros = {}) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/asignaciones?${new URLSearchParams(filtros)}`); }
export function asignarLicencia(id, datos) { return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/asignaciones`, { method: 'POST', body: JSON.stringify({ ...datos, licencia_id: id }) }); }
export function liberarLicencia(id, motivo) { return solicitarAutenticado(`${URL_BASE}/asignaciones/${encodeURIComponent(id)}/liberar`, { method: 'POST', body: JSON.stringify({ motivo }) }); }
