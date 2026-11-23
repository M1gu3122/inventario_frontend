<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarGarantias, obtenerGarantia, guardarGarantia } from '#lib/services/api_garantias.js';
  import { listarActivos } from '#lib/services/api_activos.js';
  import { listarDocumentos } from '#lib/services/api_documentos.js';

  const sesion = getContext('sesion');
  const vacia = () => ({ activo_id: '', proveedor: '', vigencia_inicio: '', vigencia_fin: '', condiciones: '', documento_id: '' });
  function fechaLocal(fecha) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }
  let montada = false;
  let inicializada = false;
  let offset = 0;
  let total = 0;
  let garantias = [];
  let activos = [];
  let documentos = [];
  let totalActivos = 0;
  let offsetActivos = 0;
  let datos = vacia();
  let idEdicion = '';
  let editando = false;
  let soloPorVencer = false;
  let cargando = false;
  let ocupada = false;
  let error = '';
  let errorActivos = '';
  let mensaje = '';

  $: gestionar = Boolean($sesion.usuario?.roles.includes('encargado'));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && !inicializada) { inicializada = true; iniciar(); }
  onMount(() => { montada = true; });

  async function iniciar() {
    await cargar();
    if (gestionar) await cargarActivos();
  }

  async function cargarActivos() {
    errorActivos = '';
    try {
      const pagina = await listarActivos({ offset: offsetActivos, limit: 100 });
      activos = pagina.items; totalActivos = pagina.total;
    } catch (e) { errorActivos = e.message; }
    try {
      const paginaDocumentos = await listarDocumentos({ tipo: 'certificado_garantia', offset: 0, limit: 100 });
      documentos = paginaDocumentos.items;
    } catch { documentos = []; }
  }

  async function cargar() {
    cargando = true; error = '';
    try {
      const limite = new Date();
      limite.setDate(limite.getDate() + 30);
      const pagina = await listarGarantias({ offset, limit: 20, ...(soloPorVencer ? { vigencia_desde: fechaLocal(new Date()), vigencia_hasta: fechaLocal(limite) } : {}) });
      garantias = pagina.items; total = pagina.total;
    } catch (e) { error = e.message; garantias = []; }
    finally { cargando = false; }
  }

  async function editar(item) {
    ocupada = true; error = ''; mensaje = '';
    try {
      const actual = await obtenerGarantia(item.id);
      datos = { activo_id: actual.activo_id, proveedor: actual.proveedor, vigencia_inicio: actual.vigencia_inicio, vigencia_fin: actual.vigencia_fin, condiciones: actual.condiciones || '', documento_id: actual.documento_id || '' };
      idEdicion = actual.id; editando = true;
    } catch (e) { error = e.message; }
    finally { ocupada = false; }
  }

  async function guardar() {
    if (ocupada) return;
    ocupada = true; error = ''; mensaje = '';
    const payload = { ...datos, proveedor: datos.proveedor.trim(), condiciones: datos.condiciones.trim() || null, documento_id: datos.documento_id.trim() || null };
    if (!idEdicion && !payload.activo_id) { error = 'Selecciona un activo.'; ocupada = false; return; }
    delete payload.activo_id;
    try {
      await guardarGarantia(idEdicion, idEdicion ? payload : { ...payload, activo_id: datos.activo_id });
      editando = false; datos = vacia(); await cargar(); mensaje = 'Garantía guardada.';
    } catch (e) { error = e.message; }
    finally { ocupada = false; }
  }
</script>

<svelte:head><title>Garantías | Inventario TI</title></svelte:head>

<section class="pagina-catalogo">
  <header class="encabezado">
    <div><p class="ceja">CICLO DE VIDA · ACTIVOS</p><h1>Garantías</h1><p class="descripcion">Vigencias y documentos de respaldo asociados a cada activo.</p></div>
    {#if gestionar}<button disabled={ocupada} on:click={() => { datos = vacia(); idEdicion = ''; editando = true; mensaje = ''; }}>Registrar garantía</button>{/if}
  </header>

  {#if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión…</p>
  {:else if $sesion.estado === 'error'}<p role="alert" class="error">{$sesion.error}</p>
  {:else if $sesion.usuario}
    <section class="resumen" aria-label="Resumen de garantías">
      <div><span class="marca" aria-hidden="true">✓</span><div><strong>Una vista por activo</strong><p>Conserva cada garantía y sus cambios en el historial.</p></div></div>
      <button class="secundario" disabled={cargando || ocupada} aria-pressed={soloPorVencer} on:click={() => { soloPorVencer = !soloPorVencer; offset = 0; cargar(); }}>{soloPorVencer ? 'Ver todas' : 'Vencen en 30 días'}</button>
    </section>
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    {#if mensaje}<p role="status" class="exito">{mensaje}</p>{/if}
    {#if cargando}<p role="status">Cargando garantías…</p>
    {:else if !error && !garantias.length}<div class="vacio"><h2>{soloPorVencer ? 'Sin vencimientos próximos' : 'Aún no hay garantías registradas'}</h2><p>{soloPorVencer ? 'No hay garantías que venzan durante los próximos 30 días.' : 'Cuando registres una garantía, su vigencia y referencia aparecerán aquí.'}</p>{#if gestionar && !soloPorVencer}<button on:click={() => { datos = vacia(); idEdicion = ''; editando = true; }}>Registrar primera garantía</button>{/if}</div>
    {:else if !error}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Permite desplazar la tabla con teclado en pantallas pequeñas.) -->
      <div class="tabla" role="region" aria-label="Listado de garantías" tabindex="0"><table><thead><tr><th>Activo</th><th>Proveedor</th><th>Vigencia</th><th>Documento</th>{#if gestionar}<th>Acción</th>{/if}</tr></thead><tbody>
        {#each garantias as garantia (garantia.id)}
          {@const activo = activos.find(a => a.id === garantia.activo_id)}
          {@const dias = Math.ceil((new Date(`${garantia.vigencia_fin}T00:00:00`) - new Date(new Date().toDateString())) / 86400000)}
          <tr><td><strong>{activo?.codigo_interno || 'Activo'}</strong><span class="secundario-texto">{activo?.marca} {activo?.modelo} · {activo?.serial || garantia.activo_id}</span></td><td>{garantia.proveedor}<span class="secundario-texto">{garantia.condiciones || 'Sin condiciones registradas'}</span></td><td>{garantia.vigencia_inicio} — {garantia.vigencia_fin}<span class:alerta={dias >= 0 && dias <= 30} class="secundario-texto">{dias < 0 ? 'Vencida' : dias === 0 ? 'Vence hoy' : `${dias} días restantes`}</span></td><td>{garantia.documento_id ? `Referencia ${garantia.documento_id}` : 'Sin documento'}</td>{#if gestionar}<td><button class="secundario" disabled={ocupada} on:click={() => editar(garantia)}>Editar</button></td>{/if}</tr>
        {/each}
      </tbody></table></div>
      <div class="paginacion"><button class="secundario" disabled={offset === 0 || ocupada} on:click={() => { offset -= 20; cargar(); }}>Anterior</button><span>{offset + 1}–{Math.min(offset + 20, total)} de {total}</span><button class="secundario" disabled={offset + 20 >= total || ocupada} on:click={() => { offset += 20; cargar(); }}>Siguiente</button></div>
    {/if}

    {#if editando && gestionar}<form class="editor" on:submit|preventDefault={guardar}><div><p class="ceja">REGISTRO</p><h2>{idEdicion ? 'Editar garantía' : 'Nueva garantía'}</h2><p class="ayuda">El activo asociado se mantiene fijo para conservar la trazabilidad.</p></div><fieldset disabled={ocupada}><div class="campos">
      {#if !idEdicion}<div class="amplio"><label for="activo">Activo</label>{#if errorActivos}<p role="alert" class="error">{errorActivos}</p>{:else}<select id="activo" bind:value={datos.activo_id} required><option value="">Selecciona un activo</option>{#each activos as activo (activo.id)}<option value={activo.id}>{activo.codigo_interno} · {activo.marca} {activo.modelo} · {activo.serial}</option>{/each}</select><div class="paginacion activos-paginacion"><button type="button" class="secundario" disabled={offsetActivos === 0 || ocupada} on:click={async () => { offsetActivos -= 100; await cargarActivos(); }}>Activos anteriores</button><span>{Math.min(offsetActivos + activos.length, totalActivos)} de {totalActivos}</span><button type="button" class="secundario" disabled={offsetActivos + 100 >= totalActivos || ocupada} on:click={async () => { offsetActivos += 100; await cargarActivos(); }}>Más activos</button></div>{#if !activos.length}<p class="ayuda">No hay activos registrados.</p>{/if}{/if}</div>{/if}
      <div><label for="proveedor">Proveedor</label><input id="proveedor" bind:value={datos.proveedor} required maxlength="255" /></div><div><label for="documento">Certificado de garantía asociado (opcional)</label><select id="documento" bind:value={datos.documento_id}><option value="">Sin documento asociado</option>{#each documentos as documento (documento.id)}<option value={documento.id}>{documento.nombre} · {documento.estado}</option>{/each}</select><span class="ayuda">Solo referencia documentos ya registrados; este formulario no carga archivos.</span></div>
      <div><label for="inicio">Vigencia desde</label><input id="inicio" type="date" bind:value={datos.vigencia_inicio} required /></div><div><label for="fin">Vigencia hasta</label><input id="fin" type="date" min={datos.vigencia_inicio} bind:value={datos.vigencia_fin} required /></div>
      <div class="amplio"><label for="condiciones">Condiciones</label><textarea id="condiciones" bind:value={datos.condiciones} maxlength="4000" rows="4"></textarea></div>
    </div><div class="acciones"><button disabled={ocupada}>{ocupada ? 'Guardando…' : 'Guardar garantía'}</button><button type="button" class="secundario" disabled={ocupada} on:click={() => editando = false}>Cancelar</button></div></fieldset></form>{/if}
  {/if}
</section>

<style>
  .encabezado { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
  .encabezado .descripcion { margin-bottom: 0; }
  .ceja { margin: 0 0 8px; color: #52666d; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
  .resumen { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px; border: 1px solid #d5dfe2; border-radius: 10px; background: #fff; margin-bottom: 22px; }
  .resumen > div { display: flex; align-items: center; gap: 14px; }
  .marca { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border-radius: 50%; color: #145b52; background: #e7f2ed; font-weight: 700; }
  .resumen p, .ayuda { margin: 4px 0 0; color: #52666d; font-size: 13px; line-height: 1.5; }
  .secundario-texto { display: block; margin-top: 5px; color: #52666d; font-size: 13px; overflow-wrap: anywhere; }
  .alerta { color: #9c2332; font-weight: 650; }
  .vacio { padding: 42px 24px; border: 1px dashed #bac9cc; border-radius: 10px; background: #fff; text-align: center; }
  .vacio h2 { margin: 0 0 8px; font-size: 20px; }
  .vacio p { color: #52666d; margin: 0 0 20px; }
  .editor { margin-top: 30px; padding: 26px; border: 1px solid #d5dfe2; border-radius: 10px; background: #fff; }
  .editor h2 { margin: 0 0 6px; font-size: 21px; }
  fieldset { min-width: 0; padding: 0; border: 0; }
  .campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 24px 0; }
  .campos > div { min-width: 0; }
  .campos label { display: block; margin-bottom: 7px; font-size: 14px; font-weight: 600; }
  .campos input, .campos select, .campos textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #bac9cc; border-radius: 6px; background: #fff; color: #1c3035; font: inherit; }
  .campos textarea { resize: vertical; }
  .amplio { grid-column: 1 / -1; }
  .acciones { display: flex; flex-wrap: wrap; gap: 10px; }
  .acciones button, .encabezado > button, .vacio button { min-height: 44px; padding: 10px 16px; border: 1px solid #145b52; border-radius: 6px; background: #145b52; color: white; font: inherit; font-weight: 600; cursor: pointer; }
  .acciones .secundario, .resumen button { border-color: #bac9cc; background: #fff; color: #145b52; }
  button:disabled { opacity: .65; cursor: wait; }
  .paginacion { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; color: #52666d; font-size: 14px; }
  .activos-paginacion { margin-top: 8px; }
  .paginacion button { min-height: 44px; padding: 8px 14px; border: 1px solid #bac9cc; border-radius: 6px; background: white; color: #145b52; font: inherit; cursor: pointer; }
  .error, .exito { padding: 14px; border-radius: 6px; line-height: 1.5; }
  .error { color: #9c2332; background: #fff0f1; }
  .exito { color: #145b52; background: #e7f2ed; }
  @media (max-width: 650px) { .encabezado, .resumen { align-items: stretch; flex-direction: column; } .campos { grid-template-columns: 1fr; } .amplio { grid-column: auto; } .editor { padding: 18px; } }
</style>
