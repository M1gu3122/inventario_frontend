import { solicitarAutenticado } from './api_auth.js';

const URL_BASE = '/api/v1/documentos';

function construirConsulta(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== null && valor !== undefined) {
      parametros.set(clave, String(valor));
    }
  }
  const consulta = parametros.toString();
  return consulta ? `?${consulta}` : '';
}

export function listarDocumentos(filtros = {}) {
  return solicitarAutenticado(`${URL_BASE}${construirConsulta(filtros)}`);
}

export function obtenerDocumento(id) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}`);
}

export function consultarConfiguracionDocumental() {
  return solicitarAutenticado(`${URL_BASE}/configuracion`);
}

export function registrarReferencia(datos) {
  return solicitarAutenticado(URL_BASE, {
    method: 'POST',
    body: JSON.stringify(datos)
  });
}

export function reprocesarDocumento(id) {
  return solicitarAutenticado(`${URL_BASE}/${encodeURIComponent(id)}/reprocesar`, {
    method: 'POST'
  });
}
