import { solicitarAutenticado } from './api_auth.js';

export function listarMovimientos(activoId, offset = 0, limit = 10) {
  return solicitarAutenticado(`/api/v1/activos/${encodeURIComponent(activoId)}/movimientos?${new URLSearchParams({ offset: String(offset), limit: String(limit) })}`);
}

export function registrarMovimiento(activoId, operacion, datos, referenciaId = null) {
  const rutas = {
    asignaciones: 'asignaciones', devoluciones: 'devoluciones', traslados: 'traslados',
    confirmacion: `traslados/${encodeURIComponent(referenciaId)}/confirmacion`,
    mantenimientos: 'mantenimientos', cierre: `mantenimientos/${encodeURIComponent(referenciaId)}/cierre`, bajas: 'bajas'
  };
  if (!Object.hasOwn(rutas, operacion)) throw new Error('Operación no permitida.');
  if (['confirmacion', 'cierre'].includes(operacion) && !referenciaId) throw new Error('Falta la referencia de la operación abierta.');
  return solicitarAutenticado(`/api/v1/activos/${encodeURIComponent(activoId)}/${rutas[operacion]}`, { method: 'POST', body: JSON.stringify(datos) });
}
