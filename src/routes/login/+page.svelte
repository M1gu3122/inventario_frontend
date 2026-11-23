<script>
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/env';
  import { iniciarSesion } from '#lib/services/api_auth.js';
  const sesion = getContext('sesion');
  let correo = '';
  let contrasena = '';
  let enviando = false;
  let errorFormulario = '';

  $: if (browser && $sesion.estado === 'autenticada') goto('/', { replaceState: true });

  async function ingresar(evento) {
    evento.preventDefault();
    if (enviando) return;
    enviando = true;
    errorFormulario = '';
    try {
      const usuario = await iniciarSesion(correo, contrasena);
      contrasena = '';
      sesion.set({ estado: 'autenticada', usuario, error: '' });
      await goto('/');
    } catch (error) {
      errorFormulario = error.message;
    } finally {
      enviando = false;
    }
  }
</script>

<svelte:head><title>Iniciar sesión · Inventario TI</title><meta name="description" content="Acceso del equipo de TI al inventario de activos." /></svelte:head>

<div class="acceso">
  <aside aria-label="Inventario TI">
    <a class="marca" href="/">Inventario <strong>TI</strong></a>
    <div class="presentacion">
      <div class="diagrama" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <h1>Cada activo,<br />una historia clara.</h1>
      <p>Ubicaciones, responsables y movimientos. La información de tu inventario, en un mismo lugar.</p>
    </div>
    <p class="firma">Gestión de activos tecnológicos</p>
  </aside>
  <section class="formulario" aria-labelledby="titulo-acceso">
    <div class="contenido">
      <div class="acento" aria-hidden="true"></div>
      <h2 id="titulo-acceso">Bienvenido de nuevo</h2>
      <p class="introduccion">Ingresa con tu cuenta del equipo de TI.</p>
      {#if $sesion.estado === 'cargando'}
        <p class="aviso" role="status">Comprobando si tienes una sesión activa…</p>
      {:else}
        {#if $sesion.estado === 'error'}<p class="aviso" role="alert">{$sesion.error}</p>{/if}
        <form on:submit={ingresar} aria-busy={enviando}>
          <label for="correo">Correo electrónico</label>
          <input id="correo" type="email" autocomplete="username" bind:value={correo} required maxlength="254" placeholder="nombre@organizacion.com" disabled={enviando} />
          <label for="contrasena">Contraseña</label>
          <input id="contrasena" type="password" autocomplete="current-password" bind:value={contrasena} required disabled={enviando} aria-describedby={errorFormulario ? 'error-acceso' : undefined} />
          {#if errorFormulario}<p id="error-acceso" class="error" role="alert">{errorFormulario}</p>{/if}
          <button class="btn preset-filled" type="submit" disabled={enviando}>{enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
        </form>
      {/if}
      <div class="ayuda"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><p>Acceso exclusivo para personal autorizado.<br />Si necesitas una cuenta, contacta al administrador.</p></div>
    </div>
    <p class="pie">Inventario TI · Equipo de tecnología</p>
  </section>
</div>

<style>
  .acceso { min-height: 100svh; display: grid; grid-template-columns: 46% 54%; background: #fff; }
  aside { padding: 48px 56px 32px; background: #153e3b; color: #fff; display: flex; flex-direction: column; justify-content: space-between; }
  .marca { text-decoration: none; color: #fff; font-size: 24px; letter-spacing: -.02em; }
  .presentacion { margin-block: 60px; max-width: 440px; }
  h1 { font-size: clamp(36px, 3.7vw, 54px); line-height: 1.13; font-weight: 600; margin: 36px 0 24px; }
  .presentacion p { font-size: 17px; color: #d4e5e0; line-height: 1.8; max-width: 36ch; }
  .firma { font-size: 13px; color: #bed4ce; }
  .diagrama { display: grid; grid-template-columns: 42px 42px; gap: 6px; }
  .diagrama span { height: 32px; border: 1px solid #7bada0; border-radius: 3px; }
  .diagrama span:first-child { background: #8dbbad; }
  .diagrama span:last-child { background: #326356; }
  .formulario { display: flex; flex-direction: column; justify-content: center; padding: 72px 64px; position: relative; }
  .contenido { max-width: 400px; width: 100%; margin: auto; }
  .acento { height: 4px; width: 36px; background: #207a69; border-radius: 2px; margin-bottom: 28px; }
  h2 { font-size: 30px; font-weight: 650; letter-spacing: -.025em; line-height: 1.25; margin: 0 0 12px; }
  .introduccion { color: #52666d; line-height: 1.65; margin: 0 0 40px; }
  form { display: flex; flex-direction: column; }
  label { font-size: 14px; font-weight: 600; margin-bottom: 9px; }
  input { width: 100%; border: 1px solid #b9c9cc; border-radius: 7px; background: #fff; padding: 13px 14px; color: #1c3035; min-height: 48px; margin-bottom: 24px; }
  input::placeholder { color: #657a81; }
  input:focus { border-color: #145b52; }
  button { margin-top: 8px; padding: 14px 18px; background: #145b52; color: #fff; border: 0; border-radius: 7px; font-size: 15px; font-weight: 600; min-height: 50px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
  button:hover:not(:disabled) { background: #0c493f; }
  .ayuda { border-top: 1px solid #dce4e6; margin-top: 36px; padding-top: 24px; display: flex; gap: 10px; align-items: flex-start; color: #52666d; }
  .ayuda p { font-size: 12px; line-height: 1.7; margin: -2px 0 0; }
  .ayuda svg { flex-shrink: 0; }
  .pie { position: absolute; bottom: 28px; left: 0; width: 100%; text-align: center; font-size: 12px; color: #657a81; }
  .error { color: #a02230; background: #fff0f1; border-radius: 6px; padding: 12px; font-size: 14px; line-height: 1.5; margin: 0 0 12px; }
  .aviso { color: #4a6169; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
  @media (max-width: 800px) { aside { padding: 36px 32px; } .formulario { padding: 64px 32px 80px; } h1 { font-size: 36px; } }
  @media (max-width: 600px) { .acceso { display: block; } aside { padding: 24px; } .presentacion, .firma { display: none; } .formulario { min-height: calc(100svh - 80px); padding: 44px 24px 80px; } h2 { font-size: 28px; } }
</style>
