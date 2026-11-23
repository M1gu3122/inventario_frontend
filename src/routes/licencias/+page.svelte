<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarLicencias, resumenLicencias, obtenerLicencia, guardarLicencia, listarAsignaciones, asignarLicencia, liberarLicencia } from '#lib/services/api_licencias.js';
  import { listarEmpleados } from '#lib/services/api_empleados.js';
  import { listarActivos } from '#lib/services/api_activos.js';
  const sesion = getContext('sesion');
  let montada = false, inicializada = false, cargando = false, ocupada = false, error = '', mensaje = '';
  let licencias = [], resumen = [], total = 0, offset = 0, soloVigentes = false;
  let editando = false, idEdicion = '', datos = vacia(), seleccionada = null, asignaciones = [], totalAsignaciones = 0, offsetAsignaciones = 0, soloActivas = true, cargandoAsignaciones = false, errorAsignaciones = '';
  let titularTipo = 'empleado', titularId = '', asientos = 1, liberando = null, motivo = '';
  let titulares = [], offsetTitulares = 0, totalTitulares = 0, cargandoTitulares = false, errorTitulares = '', buscandoTitulares = false;
  $: gestionar = $sesion.usuario?.roles.includes('encargado');
  $: operar = $sesion.usuario?.roles.some(r => ['encargado', 'tecnico'].includes(r));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.usuario && !inicializada) { inicializada = true; cargar(); }
  onMount(() => { montada = true; });
  function vacia() { return { producto: '', proveedor: '', asientos_totales: 1, vigencia_inicio: '', vigencia_fin: '', costo: 0, observaciones: '' }; }
  function describir(e) { return `${e.status === 403 ? '403: Permiso denegado. ' : ''}${e.message}`; }
  async function cargar() {
    cargando = true; error = '';
    try { const [pagina, indicadores] = await Promise.all([listarLicencias({offset, limit: 20, solo_vigentes: soloVigentes}), resumenLicencias()]); licencias = pagina.items; total = pagina.total; resumen = indicadores; }
    catch(e) { licencias = []; error = describir(e); } finally { cargando = false; }
  }
  async function editar(licencia) {
    ocupada = true; error = ''; mensaje = '';
    try { const actual = await obtenerLicencia(licencia.id); datos = Object.fromEntries(Object.keys(vacia()).map(k => [k, actual[k] ?? ''])); idEdicion = actual.id; editando = true; }
    catch(e) { error = describir(e); } finally { ocupada = false; }
  }
  async function guardar() {
    if (ocupada) return; ocupada = true; error = ''; mensaje = '';
    try { await guardarLicencia(idEdicion, {...datos, producto: datos.producto.trim(), proveedor: datos.proveedor.trim(), observaciones: datos.observaciones || null}); editando = false; await cargar(); if (!error) mensaje = 'Licencia guardada.'; }
    catch(e) { error = describir(e); } finally { ocupada = false; }
  }
  async function cargarAsignaciones() {
    cargandoAsignaciones = true; errorAsignaciones = ''; asignaciones = [];
    try { const pagina = await listarAsignaciones(seleccionada.id, {solo_activas: soloActivas, offset: offsetAsignaciones, limit: 20}); asignaciones = pagina.items; totalAsignaciones = pagina.total; }
    catch(e) { errorAsignaciones = describir(e); } finally { cargandoAsignaciones = false; }
  }
  async function seleccionar(licencia) { seleccionada = licencia; offsetAsignaciones = 0; liberando = null; motivo = ''; mensaje = ''; await cargarAsignaciones(); }
  async function buscarTitulares(reiniciar = false) {
    if (reiniciar) offsetTitulares = 0;
    buscandoTitulares = true; cargandoTitulares = true; errorTitulares = ''; titulares = [];
    try { const pagina = titularTipo === 'empleado' ? await listarEmpleados({activo: true, offset: offsetTitulares, limit: 20}) : await listarActivos({offset: offsetTitulares, limit: 20}); titulares = pagina.items; totalTitulares = pagina.total; }
    catch(e) { errorTitulares = describir(e); } finally { cargandoTitulares = false; }
  }
  function cambiarTipo() { titularId = ''; titulares = []; buscandoTitulares = false; errorTitulares = ''; }
  async function asignar() {
    if (ocupada) return; ocupada = true; error = ''; mensaje = '';
    try { await asignarLicencia(seleccionada.id, { titular_tipo: titularTipo, titular_id: titularId.trim(), asientos }); titularId = ''; asientos = 1; await cargar(); await cargarAsignaciones(); if (!error && !errorAsignaciones) mensaje = 'Asientos asignados.'; }
    catch(e) { error = describir(e); } finally { ocupada = false; }
  }
  async function liberar() {
    if (ocupada || !motivo.trim()) return; ocupada = true; error = ''; mensaje = '';
    try { await liberarLicencia(liberando.id, motivo.trim()); liberando = null; motivo = ''; await cargar(); await cargarAsignaciones(); if (!error && !errorAsignaciones) mensaje = 'Asignación liberada.'; }
    catch(e) { error = describir(e); } finally { ocupada = false; }
  }
  function paginar(cambio) { offset += cambio; cargar(); }
</script>
<svelte:head><title>Licencias | Inventario TI</title></svelte:head>
<section class="pagina-catalogo">
  <h1>Licencias</h1><p class="descripcion">Capacidad, vigencia y trazabilidad de cada asignación.</p>
  {#if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión...</p>
  {:else if $sesion.estado === 'error'}<p role="alert" class="error">{$sesion.error}</p>
  {:else if $sesion.usuario}
    <div class="barra"><label class="casilla"><input type="checkbox" bind:checked={soloVigentes} disabled={cargando || ocupada} on:change={() => { offset = 0; cargar(); }} /> Solo vigentes</label><button class="secundario" disabled={cargando || ocupada} on:click={cargar}>Actualizar</button>{#if gestionar}<button disabled={ocupada} on:click={() => { datos = vacia(); idEdicion = ''; editando = true; mensaje = ''; }}>Nueva licencia</button>{/if}</div>
    {#if error}<p role="alert" class="error">{error}</p>{/if}{#if mensaje}<p role="status" class="exito">{mensaje}</p>{/if}
    {#if cargando}<p role="status">Cargando licencias...</p>
    {:else if !error && !licencias.length}<p class="vacio">No hay licencias para este filtro.</p>
    {:else if !error}<!-- svelte-ignore a11y_no_noninteractive_tabindex (La tabla desborda en móvil; la región necesita foco para desplazarse con teclado.) --><div class="tabla" role="region" aria-label="Listado de licencias" tabindex="0"><table><thead><tr><th>Producto / proveedor</th><th>Total / usados / disponibles</th><th>Vigencia</th><th>Acciones</th></tr></thead><tbody>
      {#each licencias as licencia (licencia.id)}{@const indicador = resumen.find(r => r.id === licencia.id)}<tr><td><strong>{licencia.producto}</strong><br />{licencia.proveedor}</td><td>{licencia.asientos_totales} / {indicador?.asientos_usados ?? 'No disponible'} / {indicador?.asientos_disponibles ?? 'No disponible'}</td><td>{licencia.vigencia_inicio} a {licencia.vigencia_fin}<br />{indicador ? indicador.dias_para_vencer < 0 ? 'Vencida' : indicador.por_vencer ? 'Por vencer' : 'Vigencia: ' + indicador.dias_para_vencer + ' días restantes' : ''}</td><td><div class="acciones"><button class="secundario" disabled={ocupada || cargandoAsignaciones} on:click={() => seleccionar(licencia)} aria-label={`Asignaciones de ${licencia.producto}`}>Asignaciones</button>{#if gestionar}<button disabled={ocupada} on:click={() => editar(licencia)} aria-label={`Editar ${licencia.producto}`}>Editar</button>{/if}</div></td></tr>{/each}
    </tbody></table></div><div class="paginacion"><button disabled={offset === 0 || ocupada} on:click={() => paginar(-20)}>Anterior</button><span>{offset + 1}-{Math.min(offset + 20, total)} de {total}</span><button disabled={offset + 20 >= total || ocupada} on:click={() => paginar(20)}>Siguiente</button></div>{/if}
    {#if editando && gestionar}<form class="editor" on:submit|preventDefault={guardar}><h2>{idEdicion ? 'Editar licencia' : 'Nueva licencia'}</h2><fieldset disabled={ocupada}><div class="campos">
      <div><label for="producto">Producto</label><input id="producto" bind:value={datos.producto} required maxlength="255" /></div><div><label for="proveedor">Proveedor</label><input id="proveedor" bind:value={datos.proveedor} required maxlength="255" /></div>
      <div><label for="total">Asientos totales</label><input id="total" type="number" min="1" step="1" bind:value={datos.asientos_totales} required /></div><div><label for="costo">Costo (COP)</label><input id="costo" type="number" min="0" step="0.01" bind:value={datos.costo} required /></div>
      <div><label for="inicio">Vigencia desde</label><input id="inicio" type="date" bind:value={datos.vigencia_inicio} required /></div><div><label for="fin">Vigencia hasta</label><input id="fin" type="date" min={datos.vigencia_inicio} bind:value={datos.vigencia_fin} required /></div>
      <div class="amplio"><label for="observaciones">Observaciones</label><textarea id="observaciones" maxlength="4000" bind:value={datos.observaciones}></textarea></div>
    </div><div class="acciones"><button>Guardar licencia</button><button type="button" class="secundario" on:click={() => editando = false}>Cancelar edición</button></div></fieldset></form>{/if}
    {#if seleccionada}<section class="editor"><h2>Asignaciones de {seleccionada.producto}</h2>
      <label class="casilla"><input type="checkbox" disabled={cargandoAsignaciones || ocupada} bind:checked={soloActivas} on:change={() => {offsetAsignaciones = 0; cargarAsignaciones();}} /> Solo asignaciones activas (desmarca para ver historial)</label>
      {#if cargandoAsignaciones}<p role="status">Cargando asignaciones...</p>{:else if errorAsignaciones}<p role="alert" class="error">{errorAsignaciones}</p><button on:click={cargarAsignaciones}>Reintentar asignaciones</button>
      {:else if !asignaciones.length}<p class="vacio">No hay asignaciones para este filtro.</p>
      {:else}<!-- svelte-ignore a11y_no_noninteractive_tabindex (La tabla desborda en móvil; la región necesita foco para desplazarse con teclado.) --><div class="tabla" role="region" aria-label="Historial de asignaciones" tabindex="0"><table><thead><tr><th>Titular</th><th>Asientos</th><th>Asignada</th><th>Liberada / motivo</th><th>Acción</th></tr></thead><tbody>{#each asignaciones as asignacion (asignacion.id)}<tr><td>{asignacion.titular_tipo}<br /><code>{asignacion.titular_id}</code></td><td>{asignacion.asientos}</td><td>{asignacion.asignada_en}</td><td>{asignacion.liberada_en || 'Activa'}<br />{asignacion.motivo_liberacion || ''}</td><td>{#if operar && !asignacion.liberada_en}<button disabled={ocupada} on:click={() => { liberando = asignacion; motivo = ''; }} aria-label={`Liberar asignación ${asignacion.id}`}>Liberar</button>{/if}</td></tr>{/each}</tbody></table></div>
      <div class="paginacion"><button disabled={offsetAsignaciones === 0 || ocupada} on:click={() => {offsetAsignaciones -= 20; cargarAsignaciones();}}>Anterior asignaciones</button><span>{offsetAsignaciones + 1}-{Math.min(offsetAsignaciones + 20, totalAsignaciones)} de {totalAsignaciones}</span><button disabled={offsetAsignaciones + 20 >= totalAsignaciones || ocupada} on:click={() => {offsetAsignaciones += 20; cargarAsignaciones();}}>Siguiente asignaciones</button></div>{/if}
      {#if operar}<form class="editor" on:submit|preventDefault={asignar}><h2>Asignar asientos</h2><p class="ayuda">Un titular puede recibir varias asignaciones y varios asientos. Cada registro conserva su historial.</p><fieldset disabled={ocupada || cargandoAsignaciones}><div class="campos"><div><label for="titularTipo">Tipo de titular</label><select id="titularTipo" bind:value={titularTipo} disabled={cargandoTitulares} on:change={cambiarTipo}><option value="empleado">Empleado</option><option value="activo">Activo</option></select></div><div><label for="titularId">UUID del titular</label><input id="titularId" bind:value={titularId} required pattern={'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'} aria-describedby="titularAyuda" /><p id="titularAyuda" class="ayuda">Selecciona un titular del directorio o pega su identificador UUID.</p></div><div><label for="asientos">Asientos a asignar</label><input id="asientos" type="number" min="1" step="1" bind:value={asientos} required /></div></div>
        <button type="button" class="secundario" disabled={cargandoTitulares} on:click={() => buscarTitulares(true)}>Consultar titulares</button>
        {#if cargandoTitulares}<p role="status">Cargando titulares...</p>{:else if errorTitulares}<p class="error" role="alert">{errorTitulares}</p>{:else if buscandoTitulares}
          {#if !titulares.length}<p class="vacio">No hay titulares en esta página.</p>{:else}<label for="directorio">Seleccionar titular del directorio</label><select id="directorio" bind:value={titularId}><option value="">Selecciona un titular</option>{#each titulares as titular (titular.id)}<option value={titular.id}>{titularTipo === 'empleado' ? titular.nombre_completo + ' · ' + titular.documento : titular.codigo_interno + ' · ' + titular.marca + ' ' + titular.modelo}</option>{/each}</select>{/if}
          <div class="paginacion"><button type="button" disabled={offsetTitulares === 0} on:click={() => {offsetTitulares -= 20; buscarTitulares();}}>Anterior titulares</button><span>{totalTitulares} titulares</span><button type="button" disabled={offsetTitulares + 20 >= totalTitulares} on:click={() => {offsetTitulares += 20; buscarTitulares();}}>Siguiente titulares</button></div>
        {/if}
        <button disabled={cargandoTitulares}>Asignar asientos</button></fieldset></form>{/if}
      {#if liberando && operar}<form class="editor" on:submit|preventDefault={liberar}><h2>Confirmar liberación</h2><p>Se liberarán los {liberando.asientos} asientos de la asignación {liberando.id}.</p><label for="motivo">Motivo obligatorio</label><textarea id="motivo" bind:value={motivo} required maxlength="4000" disabled={ocupada}></textarea><div class="acciones"><button disabled={ocupada || !motivo.trim()}>Confirmar liberación</button><button type="button" class="secundario" disabled={ocupada} on:click={() => liberando = null}>Cancelar liberación</button></div></form>{/if}
    </section>{/if}
  {/if}
</section>
<style>fieldset { border: 0; padding: 0; min-width: 0; } .casilla { display: flex; gap: 12px; align-items: center; min-height: 44px; } .casilla input { width: 24px; flex: 0 0 24px; } code { overflow-wrap: anywhere; } textarea { margin-bottom: 16px; }</style>
