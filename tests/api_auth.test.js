import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const entorno = vi.hoisted(() => ({ browser: true }));
vi.mock('$app/env', () => entorno);

let api;
const usuario = { id: 'prueba', email: 'persona@example.com', is_active: true, roles: ['encargado'] };
const respuestaSesion = () => Response.json({ access_token: 'token-de-prueba', user: usuario });

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:8000');
  entorno.browser = true;
  vi.stubGlobal('fetch', vi.fn());
  api = await import('../src/lib/services/api_auth.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('sesion del navegador', () => {
  it('envia credenciales por JSON y usa el access en Authorization', async () => {
    fetch.mockResolvedValueOnce(respuestaSesion()).mockResolvedValueOnce(Response.json(usuario));
    expect(await api.iniciarSesion(' persona@example.com ', 'contrasena')).toEqual(usuario);
    const [url, opciones] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/auth/login');
    expect(JSON.parse(opciones.body)).toEqual({ email: usuario.email, password: 'contrasena' });
    expect(opciones.credentials).toBe('include');
    await api.obtenerUsuario();
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer token-de-prueba');
  });

  it('deduplica renovaciones simultaneas para no reutilizar la cookie rotativa', async () => {
    fetch.mockImplementation(async () => {
      await new Promise((resolver) => setTimeout(resolver, 15));
      return respuestaSesion();
    });
    const resultado = await Promise.all([api.restaurarSesion(), api.restaurarSesion()]);
    expect(resultado).toEqual([usuario, usuario]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('trata 401 al restaurar como sesion anonima', async () => {
    fetch.mockResolvedValueOnce(Response.json({ detail: 'Sesión inválida' }, { status: 401 }));
    expect(await api.restaurarSesion()).toBeNull();
  });

  it('no convierte una caida de red en sesion anonima', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.restaurarSesion()).rejects.toThrow();
  });

  it('preserva el error de cuenta bloqueada sin informar exito', async () => {
    fetch.mockResolvedValueOnce(Response.json({ detail: 'Cuenta bloqueada temporalmente', code: 'account_locked' }, { status: 429 }));
    await expect(api.iniciarSesion(usuario.email, 'incorrecta')).rejects.toMatchObject({ status: 429, code: 'account_locked' });
  });

  it('maneja logout 204 y borra access de memoria solo tras confirmacion', async () => {
    fetch.mockResolvedValueOnce(respuestaSesion()).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(Response.json(usuario));
    await api.iniciarSesion(usuario.email, 'contrasena');
    await api.cerrarSesion();
    await api.obtenerUsuario();
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer ');
  });

  it('impide ejecutar autenticacion desde SSR', async () => {
    entorno.browser = false;
    await expect(api.iniciarSesion(usuario.email, 'contrasena')).rejects.toThrow('navegador');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renueva access expirado y repite una sola vez la consulta protegida', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(respuestaSesion())
      .mockResolvedValueOnce(Response.json({ items: [], total: 0, offset: 0, limit: 20 }));
    const resultado = await api.solicitarAutenticado('/api/v1/empleados');
    expect(resultado.total).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:8000/api/v1/auth/refresh');
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer token-de-prueba');
  });

  it('no intenta renovar cuando la API rechaza permisos', async () => {
    fetch.mockResolvedValueOnce(Response.json({ detail: 'Permiso denegado' }, { status: 403 }));
    await expect(api.solicitarAutenticado('/api/v1/usuarios')).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('no reintenta indefinidamente cuando access y refresh son invalidos', async () => {
    fetch.mockResolvedValueOnce(Response.json({ detail: 'Access vencido' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ detail: 'Refresh vencido' }, { status: 401 }));
    await expect(api.solicitarAutenticado('/api/v1/categorias')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it('deja el boundary multipart al navegador y preserva errores de campos', async () => {
  const datos = new FormData(); datos.append('archivo', new File(['csv'], 'datos.csv'));
  fetch.mockResolvedValueOnce(Response.json({ ok: true }));
  await api.solicitarAutenticado('/api/v1/importacion/dry-run', { method: 'POST', body: datos });
  expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  fetch.mockResolvedValueOnce(Response.json({ detail: [{loc: ['body', 'archivo'], msg: 'Requerido'}] }, { status: 422 }));
  await expect(api.solicitarAutenticado('/api/v1/importacion/dry-run')).rejects.toThrow('archivo');
});

it('un error sin JSON conserva un mensaje útil', async () => {
  fetch.mockResolvedValueOnce(new Response('Servidor no disponible', {status: 503}));
  await expect(api.solicitarAutenticado('/api/v1/licencias')).rejects.toThrow('No se pudo completar');
});
