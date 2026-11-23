<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarAuditoria, listarAcciones } from '#lib/services/api_auditoria.js';
  const sesion = getContext('sesion');
  const campos = [['entidad_tipo', 'Tipo de entidad', 'text'], ['entidad_id', 'UUID de entidad', 'text'], ['actor_id', 'UUID de actor', 'text'], ['desde', 'Desde (hora local)', 'datetime-local'], ['hasta', 'Hasta (hora local)', 'datetime-local']];
  let montada = false, inicializada = false, cargando = false, error = '', acciones = [], registros = [], filtros = { accion: '', entidad_tipo: '', entidad_id: '', actor_id: '', desde: '', hasta: '' }, aplicados = {}, offset = 0, total = 0, detalle = null;
  $: permitido = $sesion.usuario?.roles.some(r => ['admin', 'auditor'].includes(r));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && permitido && !inicializada) { inicializada = true; inicializar(); }
  onMount(() => { montada = true; });
  function describir(e) { return `${e.status === 403 ? '403: No tienes permiso para consultar auditoría. ' : ''}${e.message}`; }
  async function inicializar() { await cargar(); try { acciones = await listarAcciones(); } catch(e) { error = describir(e); } }
  async function cargar() {
    cargando = true; error = ''; detalle = null; registros = [];
    try { const pagina = await listarAuditoria({...aplicados, offset, limit: 20}); registros = pagina.items; total = pagina.total; }
    catch(e) { error = describir(e); } finally { cargando = false; }
  }
  function filtrar() { aplicados = {...filtros, desde: filtros.desde ? new Date(filtros.desde).toISOString() : '', hasta: filtros.hasta ? new Date(filtros.hasta).toISOString() : ''}; offset = 0; cargar(); }
</script>
<svelte:head><title>Auditoría | Inventario TI</title></svelte:head>
<section class="pagina-catalogo"><h1>Auditoría</h1><p class="descripcion">Consulta de solo lectura. Las fechas del filtro se convierten a UTC.</p>
  {#if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión...</p>{:else if $sesion.estado === 'error'}<p role="alert" class="error">{$sesion.error}</p>{:else if $sesion.usuario && !permitido}<p role="alert" class="error">403: Auditoría requiere rol admin o auditor.</p>
  {:else if permitido}
    <form class="editor" on:submit|preventDefault={filtrar}><fieldset disabled={cargando}><div class="campos"><div><label for="accion">Acción</label><select id="accion" bind:value={filtros.accion}><option value="">Todas</option>{#each acciones as accion (accion)}<option value={accion}>{accion}</option>{/each}</select></div>
      {#each campos as [clave, etiqueta, tipo] (clave)}<div><label for={clave}>{etiqueta}</label><input id={clave} type={tipo} bind:value={filtros[clave]} pattern={clave.endsWith('_id') ? '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' : undefined} /></div>{/each}</div><button>Aplicar filtros</button></fieldset></form>
    {#if error}<p role="alert" class="error">{error}</p><button disabled={cargando} on:click={inicializar}>Reintentar consulta</button>{/if}
    {#if cargando}<p role="status">Cargando registros...</p>{:else if !error && !registros.length}<p class="vacio">No hay registros para los filtros seleccionados.</p>{:else if !error}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (La tabla desborda en móvil; la región necesita foco para desplazarse con teclado.) --><div class="tabla" role="region" aria-label="Registros de auditoría" tabindex="0"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>{#each registros as registro (registro.id)}<tr><td>{registro.creado_en}</td><td>{registro.accion}</td><td>{registro.actor_correo || registro.actor_id}</td><td>{registro.entidad_tipo}<br />{registro.entidad_id}</td><td><button on:click={() => detalle = registro} aria-label={`Ver registro ${registro.id}`}>Ver detalle</button></td></tr>{/each}</tbody></table></div>
      <div class="paginacion"><button disabled={offset === 0} on:click={() => {offset -= 20; cargar();}}>Anterior</button><span>{offset + 1}-{Math.min(offset + 20, total)} de {total}</span><button disabled={offset + 20 >= total} on:click={() => {offset += 20; cargar();}}>Siguiente</button></div>
    {/if}
    {#if detalle}<section class="editor"><h2>Detalle de auditoría</h2><p class="ayuda">Registro {detalle.id}. Solo lectura.</p><pre>{JSON.stringify(detalle, null, 2)}</pre><button class="secundario" on:click={() => detalle = null}>Cerrar detalle</button></section>{/if}
  {/if}
</section>
<style>fieldset { border: 0; padding: 0; min-width: 0; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; }</style>
