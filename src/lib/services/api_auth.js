import { browser } from '$app/env';

const URL_BASE = `${import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000'}/api/v1/auth`;
let tokenAcceso = null;
let renovacionPendiente = null;

async function solicitar(ruta, opciones, base = URL_BASE) {
  try { return await fetch(`${base}${ruta}`, { signal: AbortSignal.timeout(15000), ...opciones }); }
  catch { throw new Error('No se pudo conectar con el servidor. Comprueba la conexión y vuelve a intentar.'); }
}

async function procesarRespuesta(respuesta) {
  if (!respuesta.ok) {
    let problema;
    try { problema = await respuesta.json(); } catch { /* El servidor puede no devolver JSON. */ }
    const detalle = typeof problema?.detail === 'string' ? problema.detail : (problema?.detail || problema?.errors ? JSON.stringify(problema.detail || problema.errors) : '');
    const error = new Error(detalle || 'No se pudo completar la solicitud. Intenta de nuevo.');
    error.status = respuesta.status;
    error.code = problema?.code;
    error.errors = problema?.errors;
    throw error;
  }
  return respuesta.status === 204 ? null : respuesta.json();
}

function exigirNavegador() {
  if (!browser) throw new Error('La sesión solo está disponible en el navegador.');
}

export async function iniciarSesion(correo, contrasena) {
  exigirNavegador();
  const respuesta = await solicitar('/login', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correo.trim(), password: contrasena })
  });
  const sesion = await procesarRespuesta(respuesta);
  tokenAcceso = sesion.access_token;
  return sesion.user;
}

export async function restaurarSesion() {
  exigirNavegador();
  if (renovacionPendiente) return renovacionPendiente;
  renovacionPendiente = (async () => {
    const respuesta = await solicitar('/refresh', { method: 'POST', credentials: 'include' });
    if (respuesta.status === 401) { tokenAcceso = null; return null; }
    const sesion = await procesarRespuesta(respuesta);
    tokenAcceso = sesion.access_token;
    return sesion.user;
  })();
  try { return await renovacionPendiente; } finally { renovacionPendiente = null; }
}

export async function obtenerUsuario() {
  exigirNavegador();
  const respuesta = await solicitar('/me', { headers: { Authorization: `Bearer ${tokenAcceso || ''}` } });
  return procesarRespuesta(respuesta);
}

export async function cerrarSesion() {
  exigirNavegador();
  const respuesta = await solicitar('/logout', { method: 'POST', credentials: 'include' });
  await procesarRespuesta(respuesta);
  tokenAcceso = null;
}

export async function solicitarAutenticado(ruta, opciones = {}) {
  exigirNavegador();
  const base = import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000';
  const enviar = () => solicitar(ruta, {
    ...opciones,
    headers: { ...(opciones.body && !(opciones.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...opciones.headers, Authorization: `Bearer ${tokenAcceso || ''}` }
  }, base);
  let respuesta = await enviar();
  if (respuesta.status === 401) {
    const usuario = await restaurarSesion();
    if (usuario) respuesta = await enviar();
  }
  return procesarRespuesta(respuesta);
}
