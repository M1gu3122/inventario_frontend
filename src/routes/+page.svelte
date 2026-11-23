<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/env';
  import { obtenerKpis } from '#lib/services/api_auditoria.js';
  let montada = false, inicializada = false, cargando = false, errorKpis = '', indicadores = null;
  const reportes = [['inventario', 'Inventario'], ['responsables', 'Responsables'], ['historial', 'Historial de activo'], ['licencias', 'Licencias'], ['garantias', 'Garantías'], ['mantenimientos', 'Mantenimientos'], ['propuestas', 'Propuestas'], ['notificaciones', 'Notificaciones']];
  const sesion = getContext('sesion');
  $: if (browser && $sesion.estado === 'anonima') goto('/login', { replace: true });
  $: auditor = $sesion.usuario?.roles.some(r => ['admin', 'auditor'].includes(r));
  $: if (montada && auditor && !inicializada) { inicializada = true; cargarKpis(); }
  onMount(() => { montada = true; });
  async function cargarKpis() { cargando = true; errorKpis = ''; indicadores = null; try { indicadores = await obtenerKpis(); } catch(e) { errorKpis = `${e.status === 403 ? '403: No tienes permiso para consultar el panel. ' : ''}${e.message}`; } finally { cargando = false; } }
</script>

{#if $sesion.estado === 'cargando'}
  <p role="status">Recuperando tu sesión…</p>
{:else if $sesion.estado === 'error'}
  <h1>No pudimos conectar</h1>
  <p role="alert">{$sesion.error}</p>
  <button on:click={() => window.location.reload()}>Volver a intentar</button>
{:else if $sesion.usuario}
  <section>
    {#if $sesion.error}<p role="alert">{$sesion.error}</p>{/if}
    <div class="estado"><span aria-hidden="true"></span>Sesión activa</div>
    <h1>Tu espacio de inventario</h1>
    <p>Has iniciado sesión como <strong>{$sesion.usuario.email}</strong>.</p>
    <dl><div><dt>Permisos de tu cuenta</dt><dd>{$sesion.usuario.roles.join(', ')}</dd></div></dl>
    <p class="nota">Usa la navegación para consultar ubicaciones, empleados y categorías. Las acciones disponibles dependen de los roles de tu cuenta.</p>
    {#if auditor}
      <div class="pagina-catalogo panel"><h2>Panel operativo</h2>
        {#if cargando}<p role="status">Cargando indicadores...</p>{:else if errorKpis}<p class="error" role="alert">{errorKpis}</p><button on:click={cargarKpis}>Reintentar indicadores</button>
        {:else if indicadores}<dl class="indicadores">{#each Object.entries(indicadores) as [clave, valor] (clave)}<div><dt>{clave.replaceAll('_', ' ')}</dt><dd>{#if valor && typeof valor === 'object'}<dl class="desglose">{#each Object.entries(valor) as [periodo, cantidad] (periodo)}<div><dt>{periodo.replaceAll('_', ' ')}</dt><dd>{cantidad}</dd></div>{/each}</dl>{:else}{valor}{/if}</dd></div>{/each}</dl>{/if}
        <nav aria-label="Reportes operativos">{#each reportes as [tipo, etiqueta] (tipo)}<a href={`/reportes?tipo=${tipo}`}>{etiqueta}</a>{/each}</nav>
      </div>
    {:else}<p>Los indicadores y reportes requieren rol admin o auditor. Usa los módulos disponibles en la navegación.</p>{/if}
  </section>
{/if}

<style>
  section { max-width: 1180px; padding-top: 24px; }
  h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 650; line-height: 1.15; margin: 24px 0; }
  p { color: #4a6169; line-height: 1.7; }
  .estado { display: flex; gap: 9px; align-items: center; color: #145b52; font-size: 14px; }
  .estado span { width: 8px; height: 8px; background: #168579; border-radius: 50%; }
  dl { margin-top: 36px; border-block: 1px solid #d5dfe2; padding: 24px 0; }
  dt { font-size: 13px; color: #52666d; } dd { margin: 8px 0 0; font-weight: 600; }
  .nota { margin-top: 28px; max-width: 60ch; }
  button { padding: 12px 20px; border-radius: 7px; background: #145b52; color: white; cursor: pointer; }
  .desglose { margin: 0; padding: 0; border: 0; } .indicadores .desglose div { border: 0; padding: 8px 0; } .panel { margin-top: 36px; } .indicadores { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; border: 0; padding: 0; } .indicadores div { background: white; border: 1px solid #d5dfe2; padding: 20px; border-top: 3px solid #145b52; min-width: 0; } .indicadores dd { font-size: 26px; overflow-wrap: anywhere; } nav { display: flex; gap: 12px; flex-wrap: wrap; } nav a { min-height: 44px; padding: 10px 14px; border: 1px solid #bac9cc; border-radius: 6px; background: white; }
</style>
