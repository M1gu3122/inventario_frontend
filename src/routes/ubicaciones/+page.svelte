<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import * as apiSedes from '#lib/services/api_sedes.js';
  import * as apiAreas from '#lib/services/api_areas.js';
  import * as apiUbicaciones from '#lib/services/api_ubicaciones.js';
  const sesion = getContext('sesion');
  const niveles = [{ codigo: 'sedes', titulo: 'Sedes' }, { codigo: 'areas', titulo: 'Áreas' }, { codigo: 'ubicaciones', titulo: 'Ubicaciones' }];
  const servicios = {
    sedes: { listar: apiSedes.listarSedes, obtener: apiSedes.obtenerSedes, crear: apiSedes.crearSedes, actualizar: apiSedes.actualizarSedes },
    areas: { listar: apiAreas.listarAreas, obtener: apiAreas.obtenerAreas, crear: apiAreas.crearAreas, actualizar: apiAreas.actualizarAreas },
    ubicaciones: { listar: apiUbicaciones.listarUbicaciones, obtener: apiUbicaciones.obtenerUbicaciones, crear: apiUbicaciones.crearUbicaciones, actualizar: apiUbicaciones.actualizarUbicaciones }
  };
  let nivel = 'sedes';
  let montada = false;
  let inicializada = false;
  let registros = [];
  let sedes = [];
  let areas = [];
  let cargando = true;
  let guardando = false;
  let errorOperacion = '';
  let mensaje = '';
  let busqueda = '';
  let filtroActivo = '';
  let offset = 0;
  let total = 0;
  const limite = 20;
  let idEditando = null;
  let codigo = '';
  let nombre = '';
  let direccion = '';
  let padreId = '';
  let activa = true;
  $: administrador = Boolean($sesion.usuario?.roles.includes('admin'));
  $: tituloNivel = niveles.find((registro) => registro.codigo === nivel).titulo;
  $: opcionesPadre = nivel === 'areas' ? sedes : areas;
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && !inicializada) { inicializada = true; cargarInicial(); }
  onMount(() => { montada = true; });

  function informarError(error) { errorOperacion = error.message; if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' }); }
  function nombrePadre(registro) {
    if (nivel === 'sedes') return registro.direccion || 'Sin dirección';
    if (nivel === 'areas') return sedes.find((sede) => sede.id === registro.sede_id)?.nombre || 'Sede no disponible';
    const area = areas.find((registroArea) => registroArea.id === registro.area_id);
    return `${sedes.find((sede) => sede.id === area?.sede_id)?.nombre || ''} / ${area?.nombre || 'Área no disponible'}`;
  }
  function padreDisponible(registro) { return registro.activa && (nivel === 'areas' || sedes.find((sede) => sede.id === registro.sede_id)?.activa); }
  async function cargarOpciones() { [sedes, areas] = await Promise.all([apiSedes.obtenerTodosSedes(), apiAreas.obtenerTodosAreas()]); }
  async function cargarInicial() { try { await cargarOpciones(); await cargar(); } catch (error) { informarError(error); cargando = false; } }
  async function cargar() {
    cargando = true; errorOperacion = '';
    try { const pagina = await servicios[nivel].listar({ offset, limit: limite, q: busqueda.trim(), activo: filtroActivo }); registros = pagina.items; total = pagina.total; }
    catch (error) { informarError(error); } finally { cargando = false; }
  }
  function limpiarFormulario() { idEditando = null; codigo = ''; nombre = ''; direccion = ''; padreId = ''; activa = true; }
  async function cambiarNivel(destino) { if (cargando || guardando) return; nivel = destino; limpiarFormulario(); offset = 0; busqueda = ''; filtroActivo = ''; mensaje = ''; await cargar(); }
  async function prepararEdicion(id) {
    guardando = true; errorOperacion = ''; mensaje = '';
    try { const registro = await servicios[nivel].obtener(id); idEditando = registro.id; codigo = registro.codigo; nombre = registro.nombre; direccion = registro.direccion || ''; padreId = registro.sede_id || registro.area_id || ''; activa = registro.activa; }
    catch (error) { informarError(error); } finally { guardando = false; }
  }
  async function guardar(evento) {
    evento.preventDefault(); if (guardando) return;
    guardando = true; errorOperacion = ''; mensaje = '';
    const datos = { codigo: codigo.trim().toUpperCase(), nombre: nombre.trim() };
    if (nivel === 'sedes') datos.direccion = direccion.trim() || null;
    if (nivel === 'areas') datos.sede_id = padreId;
    if (nivel === 'ubicaciones') datos.area_id = padreId;
    try {
      if (idEditando) await servicios[nivel].actualizar(idEditando, { ...datos, activa }); else await servicios[nivel].crear(datos);
      mensaje = 'Registro guardado correctamente.'; limpiarFormulario(); await cargarOpciones(); await cargar();
    } catch (error) { informarError(error); } finally { guardando = false; }
  }
  async function filtrar(evento) { evento.preventDefault(); offset = 0; await cargar(); }
  async function cambiarPagina(paso) { offset = Math.max(0, offset + paso * limite); await cargar(); }
</script>

<svelte:head><title>Ubicaciones · Inventario TI</title></svelte:head>
<div class="pagina-catalogo">
  <h1>Ubicaciones</h1><p class="descripcion">Organiza el inventario por sede, área y ubicación física. La jerarquía conserva el contexto de cada activo.</p>
  {#if $sesion.estado === 'error'}<p class="error" role="alert">{$sesion.error}</p>{/if}
  {#if $sesion.estado === 'autenticada'}
    <nav class="niveles" aria-label="Niveles de ubicación">{#each niveles as opcion (opcion.codigo)}<button class="secundario" aria-pressed={nivel === opcion.codigo} disabled={cargando || guardando} on:click={() => cambiarNivel(opcion.codigo)}>{opcion.titulo}</button>{/each}</nav>
    <form class="barra" on:submit={filtrar}><div><label for="buscar-ubicacion">Buscar en {tituloNivel.toLowerCase()}</label><input id="buscar-ubicacion" type="search" bind:value={busqueda} placeholder="Nombre o código" /></div><div><label for="estado-ubicacion">Estado</label><select id="estado-ubicacion" bind:value={filtroActivo}><option value="">Todos</option><option value="true">Activas</option><option value="false">Inactivas</option></select></div><button type="submit" disabled={cargando || guardando}>Consultar</button></form>
    {#if errorOperacion}<p class="error" role="alert">{errorOperacion}</p>{/if}{#if mensaje}<p class="exito" role="status">{mensaje}</p>{/if}
    {#if cargando}<p role="status">Cargando {tituloNivel.toLowerCase()}…</p>{:else if !errorOperacion && !registros.length}<div class="vacio">No hay registros para esta consulta.</div>{:else if registros.length}
      <div class="tabla" role="region" aria-label={`Listado de ${tituloNivel.toLowerCase()}`}><table><thead><tr><th>Código</th><th>Nombre</th><th>{nivel === 'sedes' ? 'Dirección' : 'Pertenece a'}</th><th>Estado</th>{#if administrador}<th>Acciones</th>{/if}</tr></thead><tbody>{#each registros as registro (registro.id)}<tr><td>{registro.codigo}</td><td><strong>{registro.nombre}</strong></td><td>{nombrePadre(registro)}</td><td><span class="estado" class:inactivo={!registro.activa}>{registro.activa ? 'Activa' : 'Inactiva'}</span></td>{#if administrador}<td><button class="secundario" disabled={guardando} on:click={() => prepararEdicion(registro.id)} aria-label={`Editar ${registro.nombre}`}>Editar</button></td>{/if}</tr>{/each}</tbody></table></div>
    {/if}
    <div class="paginacion"><span>{total} registros · Página {Math.floor(offset / limite) + 1}</span><div class="acciones"><button class="secundario" disabled={!offset || cargando} on:click={() => cambiarPagina(-1)}>Anterior</button><button class="secundario" disabled={offset + limite >= total || cargando} on:click={() => cambiarPagina(1)}>Siguiente</button></div></div>
    {#if administrador}<form class="editor" on:submit={guardar} aria-busy={guardando}><h2>{idEditando ? 'Editar registro' : 'Registrar'} · {tituloNivel}</h2><div class="campos">
      <div><label for="codigo-ubicacion">Código</label><input id="codigo-ubicacion" bind:value={codigo} required maxlength="255" /></div><div><label for="nombre-ubicacion">Nombre</label><input id="nombre-ubicacion" bind:value={nombre} required maxlength="255" /></div>
      {#if nivel === 'sedes'}<div class="amplio"><label for="direccion-sede">Dirección (opcional)</label><input id="direccion-sede" bind:value={direccion} maxlength="255" /></div>{:else}<div class="amplio"><label for="padre-ubicacion">{nivel === 'areas' ? 'Sede' : 'Área'}</label><select id="padre-ubicacion" bind:value={padreId} required><option value="">Selecciona {nivel === 'areas' ? 'una sede' : 'un área'}</option>{#each opcionesPadre.filter((registro) => padreDisponible(registro) || registro.id === padreId) as registro (registro.id)}<option value={registro.id}>{nivel === 'ubicaciones' ? `${sedes.find((sede) => sede.id === registro.sede_id)?.nombre || ''} / ` : ''}{registro.nombre}{registro.activa ? '' : ' (inactiva)'}</option>{/each}</select></div>{/if}
      {#if idEditando}<div><label for="activa-ubicacion">Estado del registro</label><select id="activa-ubicacion" bind:value={activa}><option value={true}>Activa</option><option value={false}>Inactiva</option></select><p class="ayuda">Los registros con dependencias activas deben conservarse activos.</p></div>{/if}
    </div><div class="acciones"><button type="submit" disabled={guardando || cargando}>{guardando ? 'Guardando…' : 'Guardar registro'}</button>{#if idEditando}<button class="secundario" type="button" disabled={guardando} on:click={limpiarFormulario}>Cancelar edición</button>{/if}</div></form>{/if}
  {:else if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión…</p>{/if}
</div>

<style>
  .niveles { display: flex; gap: 8px; padding-bottom: 24px; flex-wrap: wrap; }
  .pagina-catalogo .niveles button[aria-pressed='true'] { background: #145b52; color: white; border-color: #145b52; }
</style>

