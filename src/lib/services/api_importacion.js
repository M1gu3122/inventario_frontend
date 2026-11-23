import { solicitarAutenticado } from './api_auth.js';
const URL_BASE = '/api/v1/importacion';
export function obtenerPlantilla() { return solicitarAutenticado(`${URL_BASE}/plantilla`); }
function formulario(archivo, encoding, delimitador, sobrescribir, mapeoColumnas) {
  const datos = new FormData();
  datos.append('archivo', archivo);
  datos.append('encoding', encoding);
  datos.append('delimitador', delimitador);
  if (sobrescribir !== undefined) datos.append('sobrescribir_existentes', String(sobrescribir));
  if (mapeoColumnas && Object.keys(mapeoColumnas).length) {
    datos.append('mapeo_columnas', JSON.stringify(mapeoColumnas));
  }
  return datos;
}
export function validarImportacion(archivo, encoding, delimitador, mapeoColumnas) {
  return solicitarAutenticado(`${URL_BASE}/dry-run`, { method: 'POST', body: formulario(archivo, encoding, delimitador, undefined, mapeoColumnas) });
}
export function confirmarImportacion(archivo, encoding, delimitador, sobrescribir, mapeoColumnas) {
  return solicitarAutenticado(`${URL_BASE}/confirmar`, { method: 'POST', body: formulario(archivo, encoding, delimitador, sobrescribir, mapeoColumnas) });
}
