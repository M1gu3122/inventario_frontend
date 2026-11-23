<script>
  import { createEventDispatcher } from 'svelte';
  export let usuario = null;
  export let rutaActual = '/';
  const emitir = createEventDispatcher();
</script>

<header>
  <nav aria-label="Navegación principal">
    <a class="marca" href="/" aria-label="Inventario TI, inicio">
      <span class="simbolo" aria-hidden="true">TI</span>
      <span>Inventario <strong>TI</strong></span>
    </a>
    {#if usuario}
      <div class="rutas">
        <a href="/ubicaciones" aria-current={rutaActual === '/ubicaciones' ? 'page' : undefined}>Ubicaciones</a>
        <a href="/empleados" aria-current={rutaActual === '/empleados' ? 'page' : undefined}>Empleados</a>
        <a href="/categorias" aria-current={rutaActual === '/categorias' ? 'page' : undefined}>Categorías</a>
        <a href="/licencias" aria-current={rutaActual === '/licencias' ? 'page' : undefined}>Licencias</a>
        <a href="/garantias" aria-current={rutaActual === '/garantias' ? 'page' : undefined}>Garantías</a>
        {#if usuario.roles.includes('encargado')}<a href="/importacion" aria-current={rutaActual === '/importacion' ? 'page' : undefined}>Importación CSV</a>{/if}
        {#if usuario.roles.some(r => ['admin', 'auditor'].includes(r))}<a href="/auditoria" aria-current={rutaActual === '/auditoria' ? 'page' : undefined}>Auditoría</a><a href="/reportes" aria-current={rutaActual === '/reportes' ? 'page' : undefined}>Reportes</a>{/if}
        <a href="/activos" aria-current={rutaActual === '/activos' ? 'page' : undefined}>Activos</a>
        {#if usuario.roles.some(r => ['admin', 'encargado'].includes(r))}<a href="/documentos" aria-current={rutaActual === '/documentos' ? 'page' : undefined}>Documentos</a>{/if}
        {#if usuario.roles.includes('encargado')}<a href="/propuestas" style="min-height: 44px; display: inline-flex; align-items: center" aria-current={rutaActual === '/propuestas' ? 'page' : undefined}>Propuestas</a>{/if}
        {#if usuario.roles.includes('admin')}<a href="/usuarios" aria-current={rutaActual === '/usuarios' ? 'page' : undefined}>Usuarios</a>{/if}
      </div>
      <div class="cuenta"><span>{usuario.email}</span><button on:click={() => emitir('salir')}>Cerrar sesión</button></div>
    {:else}<a href="/login">Iniciar sesión</a>{/if}
  </nav>
</header>

<style>
  header { background: white; border-bottom: 1px solid #dce4e6; }
  nav { max-width: 1380px; margin: auto; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .marca { flex-shrink: 0; white-space: nowrap; display: flex; gap: 12px; align-items: center; font-size: 20px; text-decoration: none; color: #21373d; }
  .simbolo { background: #145b52; color: white; width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; font-size: 14px; font-weight: 700; }
  .cuenta { display: flex; align-items: center; gap: 20px; font-size: 14px; }
  .rutas { display: flex; gap: 18px; flex-wrap: wrap; font-size: 14px; }
  .rutas a { text-decoration: none; padding-block: 10px; min-height: 44px; display: inline-flex; align-items: center; color: #52666d; }
  .rutas a:hover, .rutas a[aria-current='page'] { color: #145b52; text-decoration: underline; text-underline-offset: 8px; }
  button { white-space: nowrap; min-height: 44px; cursor: pointer; background: transparent; border: 1px solid #ccd8d9; padding: 9px 14px; border-radius: 7px; }
  button:hover { background: #edf4f2; }
  @media (max-width: 600px) { nav { padding: 16px 20px; } .cuenta span { display: none; } }
  @media (max-width: 1200px) { nav { flex-wrap: wrap; } .rutas { order: 3; width: 100%; } .cuenta span { display: none; } }
</style>
