<script>
  import { setContext, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import Navbar from '#lib/components/Navbar.svelte';
  import Footer from '#lib/components/Footer.svelte';
  import { restaurarSesion, cerrarSesion } from '#lib/services/api_auth.js';

  const sesion = writable({ estado: 'cargando', usuario: null, error: '' });
  let rutaActual = page.url.pathname;
  afterNavigate(() => { rutaActual = page.url.pathname; });
  setContext('sesion', sesion);

  onMount(async () => {
    try {
      const usuario = await restaurarSesion();
      sesion.set({ estado: usuario ? 'autenticada' : 'anonima', usuario, error: '' });
    } catch (error) {
      sesion.set({ estado: 'error', usuario: null, error: error.message });
    }
  });

  async function salir() {
    try {
      await cerrarSesion();
      sesion.set({ estado: 'anonima', usuario: null, error: '' });
      await goto('/login');
    } catch (error) {
      sesion.update((actual) => ({ ...actual, error: error.message }));
    }
  }
</script>

<svelte:head><title>Inventario TI</title></svelte:head>

{#if rutaActual !== '/login'}
  <div class="aplicacion">
    <Navbar usuario={$sesion.usuario} {rutaActual} on:salir={salir} />
    <main id="contenido"><slot /></main>
    <Footer />
  </div>
{:else}
  <main id="contenido"><slot /></main>
{/if}

<style lang="postcss">
  :global {
    @import 'tailwindcss';
    @import '@skeletonlabs/skeleton';
    @import '@skeletonlabs/skeleton/themes/cerberus';
  }

  :global(body) { margin: 0; background: #f5f7f8; color: #1c3035; font-family: 'Segoe UI', system-ui, sans-serif; }
  :global(button), :global(input) { font: inherit; }
  :global(button), :global(a), :global(input) { outline-offset: 4px; }
  :global(:focus-visible) { outline: 3px solid #168579; }
  :global(button:disabled) { cursor: wait; opacity: .65; }
  :global(a) { color: #145b52; }
  :global(h1) { text-wrap: balance; letter-spacing: -.025em; }
  :global(.pagina-catalogo h1) { font-size: 30px; font-weight: 650; line-height: 1.2; margin: 0 0 10px; }
  :global(.pagina-catalogo .descripcion) { color: #52666d; line-height: 1.6; margin: 0 0 32px; max-width: 70ch; }
  :global(.pagina-catalogo .barra) { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
  :global(.pagina-catalogo label) { display: block; font-size: 14px; font-weight: 600; margin-bottom: 7px; }
  :global(.pagina-catalogo input), :global(.pagina-catalogo select), :global(.pagina-catalogo textarea) { background: white; border: 1px solid #bac9cc; border-radius: 6px; padding: 10px 12px; min-height: 44px; width: 100%; color: #1c3035; font: inherit; }
  :global(.pagina-catalogo button) { min-height: 44px; padding: 10px 16px; background: #145b52; border: 1px solid #145b52; color: white; border-radius: 6px; cursor: pointer; font-weight: 600; }
  :global(.pagina-catalogo button:hover:not(:disabled)) { background: #0c493f; }
  :global(.pagina-catalogo button.secundario) { background: white; color: #145b52; border-color: #bac9cc; }
  :global(.pagina-catalogo button.secundario:hover:not(:disabled)) { background: #edf4f2; }
  :global(.pagina-catalogo .tabla) { overflow-x: auto; border-block: 1px solid #d5dfe2; background: white; }
  :global(.pagina-catalogo table) { width: 100%; border-collapse: collapse; font-size: 14px; }
  :global(.pagina-catalogo th), :global(.pagina-catalogo td) { text-align: left; padding: 14px 16px; border-bottom: 1px solid #e5ebed; }
  :global(.pagina-catalogo th) { color: #52666d; background: #eef3f3; font-size: 12px; font-weight: 650; }
  :global(.pagina-catalogo .estado) { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #e7f2ed; color: #145b52; font-size: 12px; }
  :global(.pagina-catalogo .estado.inactivo) { color: #52666d; background: #edf0f2; }
  :global(.pagina-catalogo .paginacion) { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 18px; font-size: 14px; color: #52666d; }
  :global(.pagina-catalogo .acciones) { display: flex; gap: 10px; flex-wrap: wrap; }
  :global(.pagina-catalogo .editor) { margin-top: 36px; background: white; padding: 26px; border: 1px solid #d5dfe2; border-radius: 10px; }
  :global(.pagina-catalogo h2) { font-size: 20px; font-weight: 650; margin: 0 0 24px; }
  :global(.pagina-catalogo .campos) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-bottom: 24px; }
  :global(.pagina-catalogo .amplio) { grid-column: 1 / -1; }
  :global(.pagina-catalogo .error) { color: #9c2332; background: #fff0f1; padding: 14px; border-radius: 6px; margin: 18px 0; line-height: 1.5; }
  :global(.pagina-catalogo .exito) { color: #145b52; background: #e7f2ed; padding: 14px; border-radius: 6px; margin: 18px 0; }
  :global(.pagina-catalogo .vacio) { padding: 36px 20px; color: #52666d; line-height: 1.6; background: white; }
  :global(.pagina-catalogo .ayuda) { font-size: 13px; color: #52666d; line-height: 1.6; margin: 8px 0; }
  @media (max-width: 600px) { :global(.pagina-catalogo .campos) { grid-template-columns: 1fr; } :global(.pagina-catalogo .editor) { padding: 18px; } }
  .aplicacion { min-height: 100svh; display: flex; flex-direction: column; }
  .aplicacion main { width: min(1180px, 100%); margin: auto; flex: 1; padding: 48px 32px; }
  @media (max-width: 600px) { .aplicacion main { padding: 28px 20px; } }
</style>
