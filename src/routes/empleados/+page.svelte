<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarEmpleados, obtenerEmpleados, crearEmpleados, actualizarEmpleados } from '#lib/services/api_empleados.js';
  import { obtenerTodosUbicaciones } from '#lib/services/api_ubicaciones.js';
  import { obtenerTodosAreas } from '#lib/services/api_areas.js';
  import { obtenerTodosSedes } from '#lib/services/api_sedes.js';

  const sesion = getContext('sesion');
  let montada = false;
  let inicializada = false;
  let registros = [];
  let ubicaciones = [];
  let areas = [];
  let sedes = [];
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
  let documento = '';
  let nombreCompleto = '';
  let ubicacionId = '';
  let cargo = '';
  let correo = '';
  let activo = true;
  $: administrador = Boolean($sesion.usuario?.roles.includes('admin'));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && !inicializada) { inicializada = true; cargarInicial(); }
  onMount(() => { montada = true; });

  function informarError(error) {
    errorOperacion = error.message;
    if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' });
  }
  function nombreUbicacion(id) {
    const ubicacion = ubicaciones.find((registro) => registro.id === id);
    const area = areas.find((registro) => registro.id === ubicacion?.area_id);
    const sede = sedes.find((registro) => registro.id === area?.sede_id);
    return ubicacion ? `${sede?.nombre || ''} / ${area?.nombre || ''} / ${ubicacion.nombre}` : 'Ubicación no disponible';
  }
  function ubicacionDisponible(registro) {
    const area = areas.find((elemento) => elemento.id === registro.area_id);
    return registro.activa && area?.activa && sedes.find((elemento) => elemento.id === area.sede_id)?.activa;
  }
  async function cargarInicial() {
    try {
      [ubicaciones, areas, sedes] = await Promise.all([obtenerTodosUbicaciones(), obtenerTodosAreas(), obtenerTodosSedes()]);
      await cargar();
    } catch (error) { informarError(error); cargando = false; }
  }
  async function cargar() {
    cargando = true;
    errorOperacion = '';
    try {
      const pagina = await listarEmpleados({ offset, limit: limite, q: busqueda.trim(), activo: filtroActivo });
      registros = pagina.items; total = pagina.total;
    } catch (error) { informarError(error); }
    finally { cargando = false; }
  }
  function limpiarFormulario() {
    idEditando = null; documento = ''; nombreCompleto = ''; ubicacionId = ''; cargo = ''; correo = ''; activo = true;
  }
  async function prepararEdicion(id) {
    errorOperacion = ''; mensaje = ''; guardando = true;
    try {
      const registro = await obtenerEmpleados(id);
      idEditando = registro.id; documento = registro.documento; nombreCompleto = registro.nombre_completo;
      ubicacionId = registro.ubicacion_id; cargo = registro.cargo; correo = registro.correo || ''; activo = registro.activo;
    } catch (error) { informarError(error); }
    finally { guardando = false; }
  }
  async function guardar(evento) {
    evento.preventDefault();
    if (guardando) return;
    guardando = true; errorOperacion = ''; mensaje = '';
    const datos = { documento: documento.trim(), nombre_completo: nombreCompleto.trim(), ubicacion_id: ubicacionId, cargo: cargo.trim(), correo: correo.trim() || null };
    try {
      if (idEditando) await actualizarEmpleados(idEditando, { ...datos, activo });
      else await crearEmpleados(datos);
      mensaje = 'Empleado guardado. Se conserva su historial.';
      limpiarFormulario(); await cargar();
    } catch (error) { informarError(error); }
    finally { guardando = false; }
  }
  async function filtrar(evento) { evento.preventDefault(); offset = 0; await cargar(); }
  async function cambiarPagina(paso) { offset = Math.max(0, offset + paso * limite); await cargar(); }
</script>

<svelte:head><title>Empleados · Inventario TI</title></svelte:head>
<div class="pagina-catalogo">
  <h1>Empleados</h1>
  <p class="descripcion">Personas que pueden recibir activos. Este catálogo es independiente de las cuentas de acceso al sistema.</p>
  {#if $sesion.estado === 'error'}<p class="error" role="alert">{$sesion.error}</p>{/if}
  {#if $sesion.estado === 'autenticada'}
    <form class="barra" on:submit={filtrar}>
      <div><label for="buscar-empleado">Buscar empleado</label><input id="buscar-empleado" type="search" bind:value={busqueda} placeholder="Nombre o documento" /></div>
      <div><label for="estado-empleado">Estado</label><select id="estado-empleado" bind:value={filtroActivo}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></div>
      <button type="submit" disabled={cargando || guardando}>Consultar</button>
    </form>
    {#if errorOperacion}<p class="error" role="alert">{errorOperacion}</p>{/if}
    {#if mensaje}<p class="exito" role="status">{mensaje}</p>{/if}
    {#if cargando}<p role="status">Cargando empleados…</p>
    {:else if !errorOperacion && registros.length === 0}<div class="vacio">No hay empleados para esta consulta.{administrador ? ' Registra uno con el formulario.' : ''}</div>
    {:else if registros.length}
      <div class="tabla" role="region" aria-label="Listado de empleados"><table><thead><tr><th>Empleado</th><th>Documento</th><th>Ubicación</th><th>Cargo</th><th>Estado</th>{#if administrador}<th>Acciones</th>{/if}</tr></thead><tbody>
        {#each registros as registro (registro.id)}<tr><td><strong>{registro.nombre_completo}</strong><br />{registro.correo || 'Sin correo'}</td><td>{registro.documento}</td><td>{nombreUbicacion(registro.ubicacion_id)}</td><td>{registro.cargo}</td><td><span class="estado" class:inactivo={!registro.activo}>{registro.activo ? 'Activo' : 'Inactivo'}</span></td>{#if administrador}<td><button class="secundario" disabled={guardando} on:click={() => prepararEdicion(registro.id)} aria-label={`Editar ${registro.nombre_completo}`}>Editar</button></td>{/if}</tr>{/each}
      </tbody></table></div>
    {/if}
    <div class="paginacion"><span>{total} empleados · Página {Math.floor(offset / limite) + 1}</span><div class="acciones"><button class="secundario" disabled={offset === 0 || cargando} on:click={() => cambiarPagina(-1)}>Anterior</button><button class="secundario" disabled={offset + limite >= total || cargando} on:click={() => cambiarPagina(1)}>Siguiente</button></div></div>
    {#if administrador}
      <form class="editor" on:submit={guardar} aria-busy={guardando}>
        <h2>{idEditando ? 'Editar empleado' : 'Registrar empleado'}</h2>
        <div class="campos">
          <div><label for="nombre-empleado">Nombre completo</label><input id="nombre-empleado" bind:value={nombreCompleto} required maxlength="255" /></div>
          <div><label for="documento-empleado">Documento</label><input id="documento-empleado" bind:value={documento} required maxlength="255" /></div>
          <div><label for="ubicacion-empleado">Ubicación</label><select id="ubicacion-empleado" bind:value={ubicacionId} required><option value="">Selecciona una ubicación</option>{#each ubicaciones.filter((registro) => ubicacionDisponible(registro) || registro.id === ubicacionId) as registro (registro.id)}<option value={registro.id}>{nombreUbicacion(registro.id)}{registro.activa ? '' : ' (inactiva)'}</option>{/each}</select></div>
          <div><label for="cargo-empleado">Cargo</label><input id="cargo-empleado" bind:value={cargo} required maxlength="255" /></div>
          <div><label for="correo-empleado">Correo electrónico (opcional)</label><input id="correo-empleado" type="email" bind:value={correo} maxlength="254" /></div>
          {#if idEditando}<div><label for="activo-empleado">Estado del empleado</label><select id="activo-empleado" bind:value={activo}><option value={true}>Activo</option><option value={false}>Inactivo</option></select></div>{/if}
        </div>
        <div class="acciones"><button type="submit" disabled={guardando || cargando}>{guardando ? 'Guardando…' : 'Guardar empleado'}</button>{#if idEditando}<button type="button" class="secundario" on:click={limpiarFormulario} disabled={guardando}>Cancelar edición</button>{/if}</div>
      </form>
    {/if}
  {:else if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión…</p>{/if}
</div>


