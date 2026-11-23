<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarActivos, obtenerActivo, crearActivo, actualizarActivo } from '#lib/services/api_activos.js';
  import { obtenerTodosCategorias } from '#lib/services/api_categorias.js';
  import { obtenerTodosUbicaciones } from '#lib/services/api_ubicaciones.js';
  import { obtenerTodosAreas } from '#lib/services/api_areas.js';
  import { obtenerTodosSedes } from '#lib/services/api_sedes.js';

  import { obtenerTodosEmpleados } from '#lib/services/api_empleados.js';
  import { listarMovimientos, registrarMovimiento } from '#lib/services/api_movimientos.js';

  const sesion = getContext('sesion');
  const estados = [
    { valor: 'disponible', etiqueta: 'Disponible' },
    { valor: 'asignado', etiqueta: 'Asignado' },
    { valor: 'en mantenimiento', etiqueta: 'En mantenimiento' },
    { valor: 'en traslado', etiqueta: 'En traslado' },
    { valor: 'de baja', etiqueta: 'De baja' }
  ];
  let seleccionado = null;
  let movimientos = [];
  let empleados = [];
  let paginaHistorial = 0;
  let totalHistorial = 0;
  let cargandoHistorial = false;
  let enviandoMovimiento = false;
  let errorCiclo = '';
  let exitoCiclo = '';
  let accion = '';
  let datosMovimiento = {};
  let referenciaAbierta = null;
  $: operador = encargado || Boolean($sesion.usuario?.roles.includes('tecnico'));
  $: empleadosElegibles = empleados.filter((empleado) => empleado.activo && empleado.ubicacion_id === seleccionado?.ubicacion_id);
  $: accionesDisponibles = !operador || !seleccionado ? [] : seleccionado.estado === 'disponible'
    ? ['asignaciones', 'traslados', 'mantenimientos', ...(encargado ? ['bajas'] : [])]
    : seleccionado.estado === 'asignado' ? ['devoluciones', 'mantenimientos']
    : referenciaAbierta && seleccionado.estado === 'en traslado' ? ['confirmacion']
    : referenciaAbierta && seleccionado.estado === 'en mantenimiento' ? ['cierre'] : [];
  const etiquetasAccion = { asignaciones: 'Asignar', devoluciones: 'Devolver', traslados: 'Solicitar traslado', confirmacion: 'Confirmar traslado', mantenimientos: 'Abrir mantenimiento', cierre: 'Cerrar mantenimiento', bajas: 'Dar de baja' };

  function describirErrorCiclo(error) {
    const mensajes = { 401: 'Sesión vencida. Inicia sesión de nuevo.', 403: 'No tienes permiso para esta operación.', 409: 'Conflicto: el activo cambió o la operación no es válida. Consulta su estado actualizado.', 422: 'Revisa los datos del formulario.' };
    if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' });
    return [mensajes[error.status], error.message].filter(Boolean).join(' ');
  }

  async function consultarHistorial() {
    cargandoHistorial = true;
    errorCiclo = '';
    try {
      const pagina = await listarMovimientos(seleccionado.id, paginaHistorial, 10);
      movimientos = pagina.items;
      totalHistorial = pagina.total;
    } catch (error) {
      movimientos = [];
      errorCiclo = describirErrorCiclo(error);
    } finally { cargandoHistorial = false; }
  }

  async function abrirCiclo(id) {
    if (cargandoHistorial || enviandoMovimiento) return;
    cargandoHistorial = true;
    errorCiclo = '';
    exitoCiclo = '';
    accion = '';
    seleccionado = null;
    movimientos = [];
    totalHistorial = 0;
    referenciaAbierta = null;
    try {
      seleccionado = await obtenerActivo(id);
      paginaHistorial = 0;
      const pagina = await listarMovimientos(id, 0, 10);
      movimientos = pagina.items;
      totalHistorial = pagina.total;
      const ultimo = movimientos[0];
      if (seleccionado.estado === 'en traslado' && ultimo?.estado_nuevo === 'en traslado') referenciaAbierta = ultimo.traslado_id;
      if (seleccionado.estado === 'en mantenimiento' && ultimo?.estado_nuevo === 'en mantenimiento') referenciaAbierta = ultimo.mantenimiento_id;
    } catch (error) { errorCiclo = describirErrorCiclo(error); }
    finally { cargandoHistorial = false; }
  }

  async function elegirAccion(valor) {
    accion = valor;
    datosMovimiento = { tipo: 'preventivo', costo: '0' };
    errorCiclo = '';
    exitoCiclo = '';
    if (valor === 'asignaciones') {
      cargandoHistorial = true;
      try { empleados = await obtenerTodosEmpleados(); }
      catch (error) { errorCiclo = describirErrorCiclo(error); accion = ''; }
      finally { cargandoHistorial = false; }
    }
  }

  async function enviarMovimiento(evento) {
    evento.preventDefault();
    if (enviandoMovimiento || !accionesDisponibles.includes(accion)) return;
    enviandoMovimiento = true;
    errorCiclo = '';
    exitoCiclo = '';
    try {
      let datos = { observacion: datosMovimiento.observacion?.trim() };
      if (accion === 'asignaciones') datos.empleado_id = datosMovimiento.empleado_id;
      if (accion === 'traslados') datos.ubicacion_destino_id = datosMovimiento.ubicacion_destino_id;
      if (accion === 'bajas') datos = { motivo: datosMovimiento.motivo.trim(), fecha_baja: datosMovimiento.fecha_baja };
      if (accion === 'cierre') datos.fecha_cierre = new Date(datosMovimiento.fecha_cierre).toISOString();
      if (accion === 'mantenimientos') {
        if (!datosMovimiento.proveedor?.trim() && !datosMovimiento.tecnico?.trim()) throw new Error('Indica proveedor o técnico.');
        datos = { ...datos, tipo: datosMovimiento.tipo, descripcion: datosMovimiento.descripcion.trim(), fecha_inicio: new Date(datosMovimiento.fecha_inicio).toISOString(), proveedor: datosMovimiento.proveedor?.trim() || null, tecnico: datosMovimiento.tecnico?.trim() || null, costo: datosMovimiento.costo, proximo_mantenimiento: datosMovimiento.proximo_mantenimiento || null, referencia_documental: datosMovimiento.referencia_documental?.trim() || null };
      }
      await registrarMovimiento(seleccionado.id, accion, datos, referenciaAbierta);
      accion = '';
      seleccionado = await obtenerActivo(seleccionado.id);
      paginaHistorial = 0;
      const pagina = await listarMovimientos(seleccionado.id, 0, 10);
      movimientos = pagina.items;
      totalHistorial = pagina.total;
      referenciaAbierta = seleccionado.estado === 'en traslado' ? movimientos[0]?.traslado_id : seleccionado.estado === 'en mantenimiento' ? movimientos[0]?.mantenimiento_id : null;
      await cargar();
      exitoCiclo = 'Operación confirmada por el servidor.';
    } catch (error) {
      errorCiclo = describirErrorCiclo(error);
      if (error.status === 409) {
        try {
          seleccionado = await obtenerActivo(seleccionado.id);
          paginaHistorial = 0;
          const pagina = await listarMovimientos(seleccionado.id, 0, 10);
          movimientos = pagina.items;
          totalHistorial = pagina.total;
          referenciaAbierta = seleccionado.estado === 'en traslado' ? movimientos[0]?.traslado_id : seleccionado.estado === 'en mantenimiento' ? movimientos[0]?.mantenimiento_id : null;
          if (!accionesDisponibles.includes(accion)) accion = '';
          await cargar();
        } catch (errorRefresco) { errorCiclo += ` ${describirErrorCiclo(errorRefresco)}`; }
      }
    }
    finally { enviandoMovimiento = false; }
  }

  async function paginarHistorial(paso) {
    paginaHistorial = Math.max(0, paginaHistorial + paso * 10);
    await consultarHistorial();
  }

  let montada = false;
  let inicializada = false;
  let activos = [];
  let categorias = [];
  let ubicaciones = [];
  let areas = [];
  let sedes = [];
  let cargando = true;
  let cargandoCatalogos = true;
  let guardando = false;
  let errorOperacion = '';
  let mensaje = '';
  let filtroCategoria = '';
  let filtroEstado = '';
  let offset = 0;
  let total = 0;
  const limite = 20;
  let idEditando = null;
  let codigoInterno = '';
  let categoriaId = '';
  let ubicacionId = '';
  let marca = '';
  let modelo = '';
  let serial = '';
  let codigoExterno = '';
  let proveedor = '';
  let numeroFactura = '';
  let valorCompra = '';
  let fechaAdquisicion = '';
  let observaciones = '';
  let atributos = {};
  $: encargado = Boolean($sesion.usuario?.roles.includes('encargado'));
  $: categoriaSeleccionada = categorias.find((registro) => registro.id === categoriaId);
  $: esquemaCampos = categoriaSeleccionada?.esquema_campos || {};
  $: camposDinamicos = Object.entries(esquemaCampos);
  $: atributosHistoricos = Object.entries(atributos).filter(([clave]) => !(clave in esquemaCampos));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && !inicializada) {
    inicializada = true;
    cargarInicial();
  }
  onMount(() => { montada = true; });

  function informarError(error) {
    errorOperacion = error.message;
    if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' });
  }

  function nombreCategoria(id) {
    const categoria = categorias.find((registro) => registro.id === id);
    return categoria ? `${categoria.codigo} · ${categoria.nombre}` : 'Categoría no disponible';
  }

  function nombreUbicacion(id) {
    const ubicacion = ubicaciones.find((registro) => registro.id === id);
    const area = areas.find((registro) => registro.id === ubicacion?.area_id);
    const sede = sedes.find((registro) => registro.id === area?.sede_id);
    return ubicacion
      ? `${sede?.nombre || 'Sede no disponible'} / ${area?.nombre || 'Área no disponible'} / ${ubicacion.nombre}`
      : 'Ubicación no disponible';
  }

  function limpiarFormulario() {
    idEditando = null;
    codigoInterno = '';
    categoriaId = '';
    ubicacionId = '';
    marca = '';
    modelo = '';
    serial = '';
    codigoExterno = '';
    proveedor = '';
    numeroFactura = '';
    valorCompra = '';
    fechaAdquisicion = '';
    observaciones = '';
    atributos = {};
  }

  function cambiarCategoria(evento) {
    categoriaId = evento.currentTarget.value;
    atributos = {};
  }

  async function cargarInicial() {
    cargandoCatalogos = true;
    try {
      [categorias, ubicaciones, areas, sedes] = await Promise.all([
        obtenerTodosCategorias(),
        obtenerTodosUbicaciones(),
        obtenerTodosAreas(),
        obtenerTodosSedes()
      ]);
      await cargar();
    } catch (error) {
      informarError(error);
      cargando = false;
    } finally {
      cargandoCatalogos = false;
    }
  }

  async function cargar() {
    cargando = true;
    errorOperacion = '';
    try {
      const pagina = await listarActivos({
        categoria: filtroCategoria,
        estado: filtroEstado,
        offset,
        limit: limite
      });
      activos = pagina.items;
      total = pagina.total;
    } catch (error) {
      informarError(error);
    } finally {
      cargando = false;
    }
  }

  async function prepararEdicion(id) {
    guardando = true;
    errorOperacion = '';
    mensaje = '';
    try {
      const activo = await obtenerActivo(id);
      idEditando = activo.id;
      codigoInterno = activo.codigo_interno;
      categoriaId = activo.categoria_id;
      ubicacionId = activo.ubicacion_id;
      marca = activo.marca;
      modelo = activo.modelo;
      serial = activo.serial;
      codigoExterno = activo.codigo_externo || '';
      proveedor = activo.proveedor || '';
      numeroFactura = activo.numero_factura || '';
      valorCompra = activo.valor_compra || '';
      fechaAdquisicion = activo.fecha_adquisicion || '';
      observaciones = activo.observaciones || '';
      atributos = { ...activo.atributos };
    } catch (error) {
      informarError(error);
    } finally {
      guardando = false;
    }
  }

  function datosFormulario() {
    const datos = {
      ubicacion_id: ubicacionId,
      marca: marca.trim(),
      modelo: modelo.trim(),
      serial: serial.trim().toUpperCase(),
      codigo_externo: codigoExterno.trim() || null,
      proveedor: proveedor.trim() || null,
      numero_factura: numeroFactura.trim() || null,
      valor_compra: valorCompra.trim() || null,
      fecha_adquisicion: fechaAdquisicion || null,
      observaciones: observaciones.trim() || null,
      atributos: { ...atributos }
    };
    for (const [clave] of camposDinamicos) {
      if (datos.atributos[clave] === '') datos.atributos[clave] = null;
    }
    if (idEditando === null) datos.categoria_id = categoriaId;
    return datos;
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (guardando) return;
    guardando = true;
    errorOperacion = '';
    mensaje = '';
    try {
      const datos = datosFormulario();
      if (idEditando === null) await crearActivo(datos);
      else await actualizarActivo(idEditando, datos);
      mensaje = idEditando === null ? 'Activo registrado correctamente.' : 'Activo actualizado correctamente.';
      limpiarFormulario();
      await cargar();
    } catch (error) {
      informarError(error);
    } finally {
      guardando = false;
    }
  }

  async function filtrar(evento) {
    evento.preventDefault();
    offset = 0;
    await cargar();
  }

  async function cambiarPagina(paso) {
    offset = Math.max(0, offset + paso * limite);
    await cargar();
  }

  function mostrarAtributo(valor) {
    return typeof valor === 'string' ? valor : JSON.stringify(valor);
  }
</script>

<svelte:head>
  <title>Activos · Inventario TI</title>
  <meta name="description" content="Consulta y administra los activos tecnológicos del inventario." />
</svelte:head>

<div class="pagina-catalogo pagina-activos">
  <header class="cabecera">
    <h1>Activos</h1>
    <p class="descripcion">Consulta los bienes tecnológicos registrados y sus datos de identificación.</p>
  </header>
  {#if $sesion.estado === 'error'}<p class="error" role="alert">{$sesion.error}</p>{/if}
  {#if $sesion.estado === 'autenticada'}
    <section class="consulta" aria-labelledby="titulo-consulta">
    <div class="titulo-seccion"><h2 id="titulo-consulta">Consulta de activos</h2><span class="etiqueta-seccion">Listado</span></div>
    <form class="barra" on:submit={filtrar}>
      <div>
        <label for="filtro-categoria">Filtrar categoría</label>
        <select id="filtro-categoria" bind:value={filtroCategoria}>
          <option value="">Todas las categorías</option>
          {#each categorias as categoria (categoria.id)}
            <option value={categoria.id}>{categoria.codigo} · {categoria.nombre}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="filtro-estado">Filtrar estado</label>
        <select id="filtro-estado" bind:value={filtroEstado}>
          <option value="">Todos los estados</option>
          {#each estados as estado (estado.valor)}
            <option value={estado.valor}>{estado.etiqueta}</option>
          {/each}
        </select>
      </div>
      <button type="submit" disabled={cargando || guardando}>Consultar</button>
    </form>

    {#if errorOperacion}<p class="error" role="alert">{errorOperacion}</p>{/if}
    {#if mensaje}<p class="exito" role="status">{mensaje}</p>{/if}
    {#if !operador}<p class="solo-lectura">Consulta de solo lectura. El encargado de inventario administra los registros.</p>{/if}

    {#if cargandoCatalogos}
      <p class="carga" role="status">Cargando categorías y ubicaciones…</p>
    {:else if cargando}
      <p class="carga" role="status">Cargando activos…</p>
    {:else if !errorOperacion && activos.length === 0}
      <div class="vacio" role="status"><strong>No hay activos para esta consulta.</strong><p>Prueba con otra categoría o estado.</p>{encargado ? ' Puedes registrar uno en el formulario.' : ''}</div>
    {:else if activos.length}
      <p class="ayuda ayuda-tabla" id="ayuda-tabla">Desplaza la tabla horizontalmente para consultar todas las columnas.</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (La región desplazable necesita foco para recorrer la tabla con las flechas del teclado.) -->
      <div class="tabla" role="region" aria-label="Listado de activos" aria-describedby="ayuda-tabla" tabindex="0">
        <table>
          <caption class="solo-lectores">Activos registrados: identificación, categoría, ubicación y estado actual</caption>
          <thead>
            <tr>
              <th scope="col">Código interno</th><th scope="col">Activo</th><th scope="col">Categoría</th><th scope="col">Ubicación</th><th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {#each activos as activo (activo.id)}
              <tr>
                <td><code>{activo.codigo_interno}</code></td>
                <td><strong>{activo.marca} {activo.modelo}</strong><br /><span class="serial">Serial: {activo.serial}</span></td>
                <td>{nombreCategoria(activo.categoria_id)}</td>
                <td>{nombreUbicacion(activo.ubicacion_id)}</td>
                <td><span class="estado" class:inactivo={activo.estado === 'de baja'}>{activo.estado}</span></td>
                <td><div class="acciones"><button class="secundario" disabled={cargandoHistorial || enviandoMovimiento} on:click={() => abrirCiclo(activo.id)} aria-label={`Ciclo de vida ${activo.codigo_interno}`}>Ciclo de vida</button>
                {#if encargado}
                  <button class="secundario" on:click={() => prepararEdicion(activo.id)} disabled={guardando} aria-label={`Editar ${activo.codigo_interno}`}>Editar</button>
                {/if}</div></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <nav class="paginacion" aria-label="Páginas del listado de activos">
      <span aria-live="polite">{total} activos · Página {Math.floor(offset / limite) + 1}</span>
      <div class="acciones">
        <button class="secundario" disabled={!offset || cargando} on:click={() => cambiarPagina(-1)}>Anterior</button>
        <button class="secundario" disabled={offset + limite >= total || cargando} on:click={() => cambiarPagina(1)}>Siguiente</button>
      </div>
    </nav>
    </section>

    {#if cargandoHistorial && !seleccionado}<p role="status">Cargando ciclo de vida…</p>{/if}
    {#if errorCiclo}<p class="error" role="alert">{errorCiclo}</p>{/if}
    {#if seleccionado}
      <section class="editor ciclo" aria-labelledby="titulo-ciclo" aria-busy={cargandoHistorial || enviandoMovimiento}>
        <h2 id="titulo-ciclo">Ciclo de vida · {seleccionado.codigo_interno}</h2>
        <p><strong>Estado: {seleccionado.estado}</strong></p>
        <p>Ubicación confirmada: {nombreUbicacion(seleccionado.ubicacion_id)}</p>
        <p class="ayuda">Para cambiar la ubicación de un empleado: devuelve sus activos, cambia su ubicación sin asignaciones activas, traslada y confirma cada activo disponible y vuelve a asignarlo. Un traslado abierto conserva el origen; el cierre de mantenimiento restaura el estado previo.</p>
        {#if exitoCiclo}<p class="exito" role="status">{exitoCiclo}</p>{/if}
        <div class="acciones">
          {#each accionesDisponibles as valor}
            <button type="button" class="secundario" disabled={enviandoMovimiento || cargandoHistorial} on:click={() => elegirAccion(valor)}>{etiquetasAccion[valor]}</button>
          {/each}
        </div>
        {#if operador && ['en traslado', 'en mantenimiento'].includes(seleccionado.estado) && !referenciaAbierta && !cargandoHistorial}<p class="ayuda">No se pudo identificar la referencia abierta. Vuelve a consultar el activo.</p>{/if}
        {#if accion}
          <form class="formulario-ciclo" on:submit={enviarMovimiento}>
            <h3>{etiquetasAccion[accion]}</h3>
            <fieldset disabled={enviandoMovimiento || cargandoHistorial}>
              {#if accion === 'asignaciones'}
                <label for="empleado-movimiento">Empleado activo en la misma ubicación confirmada</label>
                <select id="empleado-movimiento" bind:value={datosMovimiento.empleado_id} required><option value="">Selecciona un empleado</option>{#each empleadosElegibles as empleado}<option value={empleado.id}>{empleado.nombre_completo}</option>{/each}</select>
                {#if !empleadosElegibles.length}<p class="ayuda">No hay empleados activos en esta ubicación. No se realiza reubicación implícita.</p>{/if}
              {:else if accion === 'traslados'}
                <label for="destino-movimiento">Ubicación de destino</label><select id="destino-movimiento" bind:value={datosMovimiento.ubicacion_destino_id} required><option value="">Selecciona destino</option>{#each ubicaciones.filter((ubicacion) => ubicacion.activa && ubicacion.id !== seleccionado.ubicacion_id) as ubicacion}<option value={ubicacion.id}>{nombreUbicacion(ubicacion.id)}</option>{/each}</select>
              {:else if accion === 'mantenimientos'}
                <label for="tipo-mantenimiento">Tipo de mantenimiento</label><select id="tipo-mantenimiento" bind:value={datosMovimiento.tipo}><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo</option></select>
                <label for="descripcion-mantenimiento">Descripción del mantenimiento</label><textarea id="descripcion-mantenimiento" bind:value={datosMovimiento.descripcion} required maxlength="4000"></textarea>
                <label for="inicio-mantenimiento">Fecha de inicio (hora local)</label><input id="inicio-mantenimiento" type="datetime-local" bind:value={datosMovimiento.fecha_inicio} required />
                <label for="proveedor-mantenimiento">Proveedor de mantenimiento</label><input id="proveedor-mantenimiento" bind:value={datosMovimiento.proveedor} maxlength="255" />
                <label for="tecnico-mantenimiento">Técnico de mantenimiento</label><input id="tecnico-mantenimiento" bind:value={datosMovimiento.tecnico} maxlength="255" />
                <p class="ayuda">Indica al menos proveedor o técnico. Las horas locales se envían con zona horaria.</p>
                <label for="costo-mantenimiento">Costo</label><input id="costo-mantenimiento" type="text" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" bind:value={datosMovimiento.costo} required />
                <label for="proximo-mantenimiento">Próximo mantenimiento (opcional)</label><input id="proximo-mantenimiento" type="date" bind:value={datosMovimiento.proximo_mantenimiento} />
                <label for="referencia-mantenimiento">Referencia documental (opcional)</label><input id="referencia-mantenimiento" bind:value={datosMovimiento.referencia_documental} maxlength="4000" />
              {:else if accion === 'cierre'}
                <label for="cierre-mantenimiento">Fecha de cierre (hora local)</label><input id="cierre-mantenimiento" type="datetime-local" bind:value={datosMovimiento.fecha_cierre} required />
              {:else if accion === 'bajas'}
                <label for="motivo-baja">Motivo de baja</label><textarea id="motivo-baja" bind:value={datosMovimiento.motivo} required maxlength="4000"></textarea>
                <label for="fecha-baja">Fecha de baja</label><input id="fecha-baja" type="date" bind:value={datosMovimiento.fecha_baja} required />
                <label class="confirmacion-baja"><input type="checkbox" required /> Confirmo explícitamente dar de baja este activo</label>
              {/if}
              {#if accion !== 'bajas'}<label for="observacion-movimiento">Observación del movimiento</label><textarea id="observacion-movimiento" bind:value={datosMovimiento.observacion} required maxlength="4000"></textarea>{/if}
              <div class="acciones"><button type="submit">{enviandoMovimiento ? 'Enviando…' : 'Confirmar operación'}</button><button type="button" class="secundario" on:click={() => accion = ''}>Cancelar operación</button></div>
            </fieldset>
          </form>
        {/if}
        <h3>Historial del activo</h3>
        {#if cargandoHistorial}<p role="status">Cargando historial…</p>
        {:else if !errorCiclo && !movimientos.length}<p role="status">Este activo no tiene movimientos registrados.</p>
        {:else}
          <ol class="historial">{#each movimientos as movimiento (movimiento.id)}<li>
            <strong>{movimiento.tipo} · {movimiento.estado_anterior} → {movimiento.estado_nuevo}</strong>
            <p><time datetime={movimiento.ocurrido_en}>{new Date(movimiento.ocurrido_en).toLocaleString('es-CO')}</time></p>
            <p>{movimiento.observacion}</p>
            <p>Origen: {movimiento.ubicacion_origen_id ? nombreUbicacion(movimiento.ubicacion_origen_id) : 'No aplica'}<br />Destino: {movimiento.ubicacion_destino_id ? nombreUbicacion(movimiento.ubicacion_destino_id) : 'No aplica'}</p>
          </li>{/each}</ol>
        {/if}
        <nav class="paginacion" aria-label="Páginas del historial"><span>{totalHistorial} movimientos · Página {Math.floor(paginaHistorial / 10) + 1}</span><div class="acciones"><button class="secundario" disabled={!paginaHistorial || cargandoHistorial || enviandoMovimiento} on:click={() => paginarHistorial(-1)}>Movimientos anteriores</button><button class="secundario" disabled={paginaHistorial + 10 >= totalHistorial || cargandoHistorial || enviandoMovimiento} on:click={() => paginarHistorial(1)}>Más movimientos</button></div></nav>
        <button class="secundario" disabled={enviandoMovimiento || cargandoHistorial} on:click={() => abrirCiclo(seleccionado.id)}>Actualizar ciclo de vida</button>
      </section>
    {/if}

    {#if encargado && !cargandoCatalogos}
      <form class="editor" on:submit={guardar} aria-busy={guardando} aria-labelledby="titulo-editor" aria-describedby="ayuda-editor">
        <h2 id="titulo-editor">{idEditando === null ? 'Registrar activo' : `Editar activo · ${codigoInterno}`}</h2>
        <p class="ayuda" id="ayuda-editor">El código interno se genera automáticamente. El código y la categoría quedan fijados al registrar. El estado inicial es disponible y se gestiona fuera de este formulario.</p>
        <p class="nota-obligatorios">Categoría, ubicación, marca, modelo y serial son obligatorios.</p>
        <div class="campos">
          <h3 class="amplio separador-campos">Identificación y ubicación</h3>
          <div>
            <label for="categoria-activo">Categoría</label>
            {#if idEditando === null}
              <select id="categoria-activo" value={categoriaId} on:change={cambiarCategoria} required>
                <option value="">Selecciona una categoría</option>
                {#each categorias as categoria (categoria.id)}
                  <option value={categoria.id}>{categoria.codigo} · {categoria.nombre}{categoria.activa ? '' : ' (inactiva)'}</option>
                {/each}
              </select>
            {:else}
              <input id="categoria-activo" value={nombreCategoria(categoriaId)} disabled />
            {/if}
          </div>
          <div>
            <label for="ubicacion-activo">Ubicación</label>
            <select id="ubicacion-activo" bind:value={ubicacionId} required>
              <option value="">Selecciona una ubicación</option>
              {#each ubicaciones as ubicacion (ubicacion.id)}
                <option value={ubicacion.id}>{nombreUbicacion(ubicacion.id)}{ubicacion.activa ? '' : ' (inactiva)'}</option>
              {/each}
            </select>
          </div>
          <div><label for="marca-activo">Marca</label><input id="marca-activo" bind:value={marca} required maxlength="255" /></div>
          <div><label for="modelo-activo">Modelo</label><input id="modelo-activo" bind:value={modelo} required maxlength="255" /></div>
          <div><label for="serial-activo">Serial</label><input id="serial-activo" bind:value={serial} required maxlength="255" autocomplete="off" aria-describedby="ayuda-serial" /><p class="ayuda" id="ayuda-serial">Debe ser único. Al guardar se eliminan los espacios de los extremos y se convierte a mayúsculas.</p></div>
          <div><label for="codigo-externo">Código externo (opcional)</label><input id="codigo-externo" bind:value={codigoExterno} maxlength="255" /></div>
          <h3 class="amplio separador-campos">Compra y documentación <span>Opcional</span></h3>
          <div><label for="proveedor-activo">Proveedor (opcional)</label><input id="proveedor-activo" bind:value={proveedor} maxlength="255" /></div>
          <div><label for="factura-activo">Número de factura (opcional)</label><input id="factura-activo" bind:value={numeroFactura} maxlength="255" /></div>
          <div>
            <label for="valor-compra">Valor de compra (opcional)</label>
            <input id="valor-compra" type="text" inputmode="decimal" bind:value={valorCompra} pattern="[0-9]{1,12}([.][0-9]{1,2})?" maxlength="15" aria-describedby="ayuda-valor" /><p class="ayuda" id="ayuda-valor">Usa punto para los decimales, sin separadores de miles. Ejemplo: 1500000.00</p>
          </div>
          <div><label for="fecha-adquisicion">Fecha de adquisición (opcional)</label><input id="fecha-adquisicion" type="date" bind:value={fechaAdquisicion} /></div>
          <div class="amplio"><label for="observaciones-activo">Observaciones (opcional)</label><textarea id="observaciones-activo" bind:value={observaciones} maxlength="4000" rows="3"></textarea></div>

          {#if camposDinamicos.length}
            <fieldset class="campos-dinamicos amplio">
              <legend>Datos de la categoría</legend>
              {#each camposDinamicos as [clave, definicion] (clave)}
                <div>
                  <label for={`atributo-${clave}`}>{clave}{definicion.requerido ? ' · Obligatorio' : ''}</label>
                  {#if definicion.tipo === 'booleano'}
                    <select id={`atributo-${clave}`} bind:value={atributos[clave]} required={definicion.requerido}>
                      <option value="">Selecciona una opción</option><option value={true}>Sí</option><option value={false}>No</option>
                    </select>
                  {:else}
                    <input
                      id={`atributo-${clave}`}
                      type={definicion.tipo === 'numero' ? 'number' : definicion.tipo === 'fecha' ? 'date' : 'text'}
                      step={definicion.tipo === 'numero' ? 'any' : undefined}
                      bind:value={atributos[clave]}
                      required={definicion.requerido}
                    />
                  {/if}
                </div>
              {/each}
            </fieldset>
          {/if}

          {#if atributosHistoricos.length}
            <div class="amplio atributos-historicos">
              <h3>Otros datos conservados</h3>
              <p class="ayuda">Estos atributos no están definidos en el esquema actual y se preservarán al guardar.</p>
              {#each atributosHistoricos as [clave, valor] (clave)}
                <p><code>{clave}</code>: {mostrarAtributo(valor)}</p>
              {/each}
            </div>
          {/if}
        </div>
        <div class="acciones acciones-editor">
          <button type="submit" disabled={guardando || cargando}>{guardando ? 'Guardando…' : idEditando === null ? 'Registrar activo' : 'Guardar cambios'}</button>
          {#if idEditando !== null}<button type="button" class="secundario" on:click={limpiarFormulario} disabled={guardando}>Cancelar edición</button>{/if}
        </div>
      </form>
    {/if}
  {:else if $sesion.estado === 'cargando'}
    <p role="status">Recuperando sesión…</p>
  {/if}
</div>

<style>
  .ciclo { overflow-wrap: anywhere; }
  .ciclo h3 { margin: 24px 0 16px; font-weight: 650; }
  .formulario-ciclo fieldset { border: 1px solid #d5dfe2; min-width: 0; padding: 18px; }
  .formulario-ciclo label { margin-top: 16px; }
  .formulario-ciclo .acciones { margin-top: 20px; }
  .confirmacion-baja { display: flex; align-items: center; gap: 12px; }
  .confirmacion-baja input { width: 44px; flex: 0 0 44px; }
  .historial { padding-left: 24px; }
  .historial li { border-bottom: 1px solid #d5dfe2; padding: 16px 0; }
  .historial p { margin: 8px 0; }

  .pagina-activos { min-width: 0; }
  .cabecera { margin-bottom: 28px; }
  .cabecera .descripcion { margin-bottom: 0; }
  .consulta { background: white; border: 1px solid #d5dfe2; border-radius: 10px; padding: 24px; min-width: 0; }
  .titulo-seccion { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  .titulo-seccion h2 { margin: 0; }
  .etiqueta-seccion { background: #eef3f3; color: #52666d; border-radius: 4px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
  .barra { padding-bottom: 22px; border-bottom: 1px solid #e5ebed; }
  .barra > div { flex: 1 1 220px; min-width: 0; }
  .pagina-activos input, .pagina-activos select, .pagina-activos textarea { box-sizing: border-box; min-width: 0; max-width: 100%; }
  .pagina-activos input:disabled { background: #eef3f3; color: #52666d; opacity: 1; }
  .pagina-activos button:disabled { cursor: not-allowed; }
  .pagina-activos :is(button, input, select, textarea):focus-visible, .tabla:focus-visible { outline: 3px solid #168579; outline-offset: 3px; }
  .error { border: 1px solid #e5b7be; }
  .exito { border: 1px solid #a7cdbd; }
  .solo-lectura { color: #52666d; font-size: 14px; margin: 0 0 18px; line-height: 1.6; }
  .serial { display: inline-block; color: #52666d; font-size: 13px; margin-top: 5px; }
  code { color: #145b52; font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 650; }
  .tabla { border: 1px solid #d5dfe2; border-radius: 6px; }
  table { min-width: 800px; }
  td code { white-space: normal; }
  td { vertical-align: top; overflow-wrap: anywhere; max-width: 280px; }
  th { white-space: nowrap; }
  tbody tr:hover { background: #f5f9f8; }
  tbody tr:focus-within { background: #edf4f2; }
  .estado { white-space: nowrap; }
  .ayuda-tabla { margin-bottom: 10px; }
  .carga, .vacio { min-height: 140px; padding: 32px 20px; background: #f5f9f8; border: 1px dashed #bac9cc; border-radius: 6px; color: #52666d; line-height: 1.6; }
  .vacio strong { color: #1c3035; display: block; font-size: 17px; }
  .vacio p { margin: 8px 0; }
  .pagina-activos .editor { border-top: 3px solid #145b52; }
  .editor h2 { margin-bottom: 12px; overflow-wrap: anywhere; }
  .nota-obligatorios { color: #52666d; font-size: 14px; margin: 12px 0 24px; }
  .separador-campos { border-bottom: 1px solid #e5ebed; padding-bottom: 12px; font-size: 16px; font-weight: 650; margin: 8px 0 0; }
  .separador-campos span { font-size: 13px; color: #52666d; font-weight: 400; margin-left: 8px; }
  .campos > div { min-width: 0; }
  .campos-dinamicos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; min-width: 0; border: 1px solid #d5dfe2; background: #f8faf9; border-radius: 6px; padding: 18px; }
  .campos-dinamicos legend { font-size: 14px; font-weight: 650; padding: 0 6px; }
  .atributos-historicos { border-top: 1px solid #e5ebed; padding-top: 14px; }
  .atributos-historicos h3 { font-size: 15px; margin: 0 0 8px; }
  .atributos-historicos p { overflow-wrap: anywhere; }
  .acciones-editor { padding-top: 20px; border-top: 1px solid #e5ebed; }
  .solo-lectores { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (max-width: 700px) {
    .consulta { padding: 18px; }
    .barra { align-items: stretch; }
    .barra > div { flex-basis: 100%; }
    .barra > button { width: 100%; }
    .pagina-activos .campos, .campos-dinamicos { grid-template-columns: 1fr; }
    .campos-dinamicos { padding: 12px; }
    .paginacion { align-items: stretch; }
    .paginacion > span, .paginacion .acciones { width: 100%; }
    .paginacion button { flex: 1; }
    .acciones-editor { flex-direction: column; }
    .pagina-activos input, .pagina-activos select, .pagina-activos textarea { font-size: 16px; }
  }
</style>
