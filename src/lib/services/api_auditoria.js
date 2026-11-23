import { solicitarAutenticado } from './api_auth.js';
const URL_BASE = '/api/v1/auditoria';
function consultar(ruta, filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) if (valor !== '' && valor !== null && valor !== undefined) parametros.set(clave, String(valor));
  return solicitarAutenticado(`${URL_BASE}${ruta}?${parametros}`);
}
export function listarAuditoria(filtros) { return consultar('/logs', filtros); }
export function listarAcciones() { return consultar('/acciones'); }
export function obtenerKpis() { return consultar('/reportes/kpis'); }
export function obtenerNotificaciones() { return consultar('/notificaciones'); }
export function obtenerReporte(tipo, filtros = {}, activoId = '') {
  const rutas = { inventario: '/reportes/inventario', responsables: '/reportes/activos-por-responsable', historial: `/reportes/historial-activo/${encodeURIComponent(activoId)}`, licencias: '/reportes/licencias', garantias: '/reportes/garantias', mantenimientos: '/reportes/mantenimientos', propuestas: '/reportes/propuestas' };
  if (!rutas[tipo]) throw new Error('Reporte no disponible.');
  return consultar(rutas[tipo], filtros);
}

export async function obtenerReporteCompleto(tipo, filtros = {}, activoId = '') {
  if (tipo === 'notificaciones') return obtenerNotificaciones();
  const registros = [];
  let offset = 0;
  let total = null;
  while (total === null || offset < total) {
    const pagina = await obtenerReporte(tipo, { ...filtros, offset, limit: 100 }, activoId);
    if (Array.isArray(pagina)) return pagina;
    if (!Array.isArray(pagina.items) || !Number.isInteger(pagina.total)) {
      throw new Error('La API devolvió una página de reporte no válida.');
    }
    registros.push(...pagina.items);
    total = pagina.total;
    if (!pagina.items.length) break;
    offset += pagina.items.length;
  }
  return registros;
}
