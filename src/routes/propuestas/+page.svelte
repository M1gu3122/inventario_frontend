<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarPropuestas, obtenerPropuesta, crearPropuesta, actualizarPropuesta, listarDuplicados, revisarPropuesta, aprobarPropuesta, aprobarLote, rechazarPropuesta, marcarDuplicada, vincularPropuesta } from '#lib/services/api_propuestas.js';
  import { obtenerTodosCategorias } from '#lib/services/api_categorias.js';
  import { obtenerTodosUbicaciones } from '#lib/services/api_ubicaciones.js';
  import { obtenerActivo } from '#lib/services/api_activos.js';

  const sesion = getContext('sesion');
  const limite = 20;
  const UMBRAL_CONFIANZA_OCR = 0.85;
  const estados = { pendiente: 'Pendiente', en_revision: 'En revisión', aprobada: 'Aprobada', rechazada: 'Rechazada', duplicada: 'Duplicada' };
  const campos = [
    ['marca', 'Marca', 'texto'], ['modelo', 'Modelo', 'texto'], ['serial', 'Serial · revisión crítica', 'texto'],
    ['codigo_interno', 'Código interno de referencia', 'texto'], ['codigo_externo', 'Código externo', 'texto'],
    ['proveedor', 'Proveedor', 'texto'], ['numero_factura', 'Número de factura · revisión crítica', 'texto'],
    ['valor_compra', 'Valor de compra (COP) · revisión crítica', 'numero'], ['fecha_adquisicion', 'Fecha de adquisición', 'fecha'], ['observaciones', 'Observaciones', 'texto']
  ];
  let montada = false;
  let inicializada = false;
  let cargando = true;
  let cargandoCatalogos = true;
  let ocupada = false;
  let errorLista = '';
  let errorOperacion = '';
  let mensaje = '';
  let propuestas = [];
  let categorias = [];
  let ubicaciones = [];
  let filtroEstado = '';
  let offset = 0;
  let total = 0;
  let seleccionLote = [];
  let forzarLote = false;
  let justificacionLote = '';
  let detalle = null;
  let formularioAbierto = false;
  let categoriaId = '';
  let datos = {};
  let atributos = {};
  let camposRevision = [];
  let decision = 'aprobar';
  let forzar = false;
  let justificacion = '';
  let motivo = '';
  let duplicados = [];
  let totalDuplicados = 0;
  let offsetDuplicados = 0;
  let cargandoDuplicados = false;
  let errorDuplicados = '';
  let activoCandidato = null;
  let idCandidato = '';
  let errorCandidato = '';
  let detalleVigente = false;

  $: encargado = Boolean($sesion.usuario?.roles.includes('encargado'));
  $: terminal = detalle && ['aprobada', 'rechazada'].includes(detalle.estado);
  $: esquema = categorias.find((categoria) => categoria.id === categoriaId)?.esquema_campos || {};
  $: historicos = Object.entries(atributos).filter(([clave]) => !(clave in esquema));
  $: valoresRevision = detalle ? [
    ['categoria_id', 'Categoría', nombreCategoria(detalle.categoria_id)],
    ['ubicacion_id', 'Ubicación', nombreUbicacion(detalle.datos.ubicacion_id)],
    ...campos.map(([clave, etiqueta]) => [clave, etiqueta, detalle.datos[clave]]),
    ...Object.entries(detalle.datos.atributos || {}).map(([clave, valor]) => [`atributos.${clave}`, `Atributo: ${clave}`, valor])
  ] : [];
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && encargado && !inicializada) {
    inicializada = true;
    inicializar();
  }
  onMount(() => { montada = true; });

  function describirError(error) {
    if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' });
    const contexto = { 401: 'Sesión vencida.', 403: 'Esta operación requiere el rol encargado.', 409: 'Conflicto: comprueba el estado y las revisiones actuales; la API no aceptó la operación.', 422: 'Datos no válidos: revisa categoría, campos requeridos, tipos y justificaciones.' };
    return [contexto[error.status], error.message].filter(Boolean).join(' ');
  }
  function nombreCategoria(id) { return categorias.find((registro) => registro.id === id)?.nombre || id || 'Sin categoría'; }
  function nombreUbicacion(id) { return ubicaciones.find((registro) => registro.id === id)?.nombre || id || 'Sin ubicación'; }
  function mostrar(valor) { return valor === null || valor === undefined || valor === '' ? 'Sin valor (null)' : typeof valor === 'object' ? JSON.stringify(valor) : typeof valor === 'boolean' ? valor ? 'Sí' : 'No' : String(valor); }
  function fecha(valor) { return valor ? new Date(valor).toLocaleString('es-CO') : 'Sin registro'; }

  async function inicializar() {
    cargandoCatalogos = true;
    errorOperacion = '';
    try {
      [categorias, ubicaciones] = await Promise.all([obtenerTodosCategorias(), obtenerTodosUbicaciones()]);
      await cargarLista();
    } catch (error) { errorOperacion = describirError(error); cargando = false; }
    finally { cargandoCatalogos = false; }
  }
  async function cargarLista() {
    cargando = true;
    errorLista = '';
    try {
      const pagina = await listarPropuestas({ estado: filtroEstado, offset, limit: limite });
      propuestas = pagina.items;
      total = pagina.total;
      offset = pagina.offset;
      seleccionLote = seleccionLote.filter((id) => propuestas.some((propuesta) => propuesta.id === id && propuesta.estado === 'en_revision'));
    } catch (error) { errorLista = describirError(error); }
    finally { cargando = false; }
  }
  async function paginar(paso) {
    offset = Math.max(0, offset + paso * limite);
    seleccionLote = [];
    await cargarLista();
  }
  async function filtrar() { offset = 0; seleccionLote = []; await cargarLista(); }
  function nuevo() {
    detalle = null;
    detalleVigente = false;
    formularioAbierto = true;
    categoriaId = '';
    datos = {};
    atributos = {};
    camposRevision = [];
    errorOperacion = '';
    mensaje = '';
  }
  function editar() {
    categoriaId = detalle.categoria_id || '';
    datos = { ...detalle.datos };
    atributos = { ...detalle.datos.atributos };
    formularioAbierto = true;
    camposRevision = [];
    errorOperacion = '';
    mensaje = '';
  }
  async function abrir(id) {
    if (ocupada) return;
    ocupada = true;
    errorOperacion = '';
    mensaje = '';
    formularioAbierto = false;
    detalle = null;
    detalleVigente = false;
    duplicados = [];
    camposRevision = [];
    activoCandidato = null;
    idCandidato = '';
    errorCandidato = '';
    decision = 'aprobar';
    forzar = false;
    justificacion = '';
    motivo = '';
    try { detalle = await obtenerPropuesta(id); detalleVigente = true; offsetDuplicados = 0; await cargarDuplicados(); }
    catch (error) { errorOperacion = describirError(error); }
    finally { ocupada = false; }
  }
  async function cargarDuplicados() {
    cargandoDuplicados = true;
    errorDuplicados = '';
    try {
      const pagina = await listarDuplicados(detalle.id, offsetDuplicados, limite);
      duplicados = pagina.items;
      totalDuplicados = pagina.total;
    } catch (error) { errorDuplicados = describirError(error); }
    finally { cargandoDuplicados = false; }
  }
  async function paginarDuplicados(paso) {
    offsetDuplicados = Math.max(0, offsetDuplicados + paso * limite);
    await cargarDuplicados();
  }
  async function elegirCandidato(id) {
    ocupada = true;
    errorCandidato = '';
    activoCandidato = null;
    idCandidato = '';
    try { activoCandidato = await obtenerActivo(id); idCandidato = id; }
    catch (error) { errorCandidato = describirError(error); }
    finally { ocupada = false; }
  }
  async function refrescar(id) {
    detalleVigente = false;
    camposRevision = [];
    activoCandidato = null;
    idCandidato = '';
    await cargarLista();
    if (id) {
      detalle = await obtenerPropuesta(id);
      detalleVigente = true;
      offsetDuplicados = 0;
      await cargarDuplicados();
    }
    if (errorLista || errorDuplicados) throw new Error('La escritura fue aceptada, pero no se pudo refrescar toda la información. Reintenta la consulta.');
  }
  async function guardar() {
    if (ocupada) return;
    ocupada = true;
    errorOperacion = '';
    mensaje = '';
    try {
      const cuerpoDatos = Object.fromEntries(['ubicacion_id', ...campos.map(([clave]) => clave)].map((clave) => [clave, typeof datos[clave] === 'string' ? datos[clave].trim() || null : datos[clave] ?? null]));
      cuerpoDatos.atributos = Object.fromEntries(Object.entries(atributos).map(([clave, valor]) => [clave, valor === '' || valor === undefined ? null : valor]));
      const cuerpo = { categoria_id: categoriaId || null, datos: cuerpoDatos };
      const respuesta = detalle ? await actualizarPropuesta(detalle.id, cuerpo) : await crearPropuesta(cuerpo);
      formularioAbierto = false;
      await refrescar(respuesta.id);
      mensaje = 'Borrador guardado y consultado desde el servidor. Revisa explícitamente los valores actuales antes de decidir.';
    } catch (error) { errorOperacion = describirError(error); }
    finally { ocupada = false; }
  }
  async function revisar() {
    if (ocupada || !detalleVigente || !camposRevision.length) return;
    ocupada = true;
    errorOperacion = '';
    mensaje = '';
    try {
      await revisarPropuesta(detalle.id, camposRevision);
      await refrescar(detalle.id);
      mensaje = 'Revisión registrada. Se muestran las revisiones vigentes del servidor.';
    } catch (error) { errorOperacion = describirError(error); }
    finally { ocupada = false; }
  }
  async function decidir() {
    if (ocupada || !detalleVigente) return;
    ocupada = true;
    errorOperacion = '';
    mensaje = '';
    try {
      if (decision === 'aprobar') await aprobarPropuesta(detalle.id, { forzar, ...(forzar ? { justificacion: justificacion.trim() } : {}) });
      if (decision === 'rechazar') await rechazarPropuesta(detalle.id, motivo.trim());
      if (decision === 'duplicada') await marcarDuplicada(detalle.id, justificacion.trim());
      if (decision === 'vincular') await vincularPropuesta(detalle.id, idCandidato, justificacion.trim());
      await refrescar(detalle.id);
      justificacion = ''; motivo = ''; forzar = false;
      mensaje = 'Decisión confirmada por el servidor.';
    } catch (error) {
      errorOperacion = describirError(error);
      if (error.status === 409) {
        try { await refrescar(detalle.id); }
        catch (errorRefresco) { errorOperacion += ` ${describirError(errorRefresco)}`; }
      }
    } finally { ocupada = false; }
  }
  async function aprobarSeleccion() {
    if (ocupada || !seleccionLote.length) return;
    ocupada = true;
    errorOperacion = '';
    mensaje = '';
    try {
      const respuesta = await aprobarLote(seleccionLote, { forzar: forzarLote, ...(forzarLote ? { justificacion: justificacionLote.trim() } : {}) });
      seleccionLote = [];
      forzarLote = false;
      justificacionLote = '';
      await refrescar(detalle?.id);
      mensaje = `Lote aprobado de forma atómica. Identificador: ${respuesta.lote_aprobacion_id}.`;
    } catch (error) {
      errorOperacion = describirError(error);
      if (error.status === 409) {
        try { await refrescar(detalle?.id); }
        catch (errorRefresco) { errorOperacion += ` ${describirError(errorRefresco)}`; }
      }
    } finally { ocupada = false; }
  }
</script>

<svelte:head><title>Propuestas · Inventario TI</title><meta name="description" content="Captura manual, revisión humana y decisiones sobre propuestas de activos." /></svelte:head>

<div class="propuestas">
  <header class="cabecera"><p class="eyebrow">Inventario / Revisión humana</p><h1>Propuestas</h1><p>Registra borradores, revisa sus valores y decide su incorporación al inventario.</p></header>
  {#if $sesion.estado === 'cargando'}<p role="status">Comprobando sesión…</p>
  {:else if $sesion.estado === 'error'}<p class="error" role="alert">{$sesion.error}</p>
  {:else if $sesion.estado === 'autenticada' && !encargado}<p class="error" role="alert">Esta sección está disponible únicamente para el rol encargado.</p>
  {:else if encargado}
    {#if errorOperacion}<p class="error" role="alert">{errorOperacion}</p>{/if}
    {#if mensaje}<p class="exito" role="status">{mensaje}</p>{/if}
    {#if ocupada}<p role="status">Procesando solicitud…</p>{/if}
    {#if cargandoCatalogos}<p role="status">Cargando categorías y ubicaciones…</p>
    {:else}
      <div class="acciones"><button on:click={nuevo} disabled={ocupada || cargando}>Nuevo borrador</button><button class="secundario" on:click={inicializar} disabled={ocupada || cargando}>Actualizar consulta y catálogos</button></div>
      <section aria-labelledby="bandeja">
        <h2 id="bandeja">Bandeja de propuestas</h2>
        <form class="acciones" on:submit|preventDefault={filtrar}><div><label for="estado">Estado</label><select id="estado" bind:value={filtroEstado}><option value="">Todos</option>{#each Object.entries(estados) as [valor, etiqueta]}<option value={valor}>{etiqueta}</option>{/each}</select></div><button disabled={ocupada || cargando}>Consultar</button></form>
        {#if cargando}<p role="status">Cargando propuestas…</p>
        {:else if errorLista}<p class="error" role="alert">{errorLista}</p><button class="secundario" on:click={cargarLista} disabled={ocupada}>Reintentar bandeja</button>
        {:else if propuestas.length === 0}<p>No hay propuestas para esta consulta.</p>
        {:else}
          <ul class="bandeja">{#each propuestas as propuesta (propuesta.id)}
            <li><div class="registro"><label class="check"><input type="checkbox" value={propuesta.id} bind:group={seleccionLote} disabled={ocupada || propuesta.estado !== 'en_revision'} />Lote<span class="sr-only">: {propuesta.id}</span></label><div class="resumen"><strong>{propuesta.datos.marca || 'Sin marca'} · {propuesta.datos.modelo || 'Sin modelo'}</strong><span>{nombreCategoria(propuesta.categoria_id)} · Serial: {propuesta.datos.serial || 'Sin valor'}</span><small>{propuesta.origen === 'ocr' ? `OCR - ${propuesta.documento?.nombre || 'Documento fuente'}` : 'Captura manual'} - {propuesta.id}</small></div><span class="estado">{estados[propuesta.estado]}</span><button class="secundario" disabled={ocupada} on:click={() => abrir(propuesta.id)} aria-label={`Ver propuesta ${propuesta.id}`}>Ver detalle</button></div></li>
          {/each}</ul>
        {/if}
        <div class="acciones paginacion"><button class="secundario" disabled={ocupada || cargando || offset === 0} on:click={() => paginar(-1)}>Anterior</button><span>{total} propuestas · {offset + 1 > total ? 0 : offset + 1}–{Math.min(offset + limite, total)}</span><button class="secundario" disabled={ocupada || cargando || offset + limite >= total} on:click={() => paginar(1)}>Siguiente</button></div>
        <form class="lote" on:submit|preventDefault={aprobarSeleccion}>
          <h3>Aprobar selección ({seleccionLote.length})</h3><p>Selecciona propuestas en revisión de esta página. El servidor valida todas y aprueba el lote en una sola transacción; si alguna falla, ninguna se aprueba.</p>
          <label class="check"><input type="checkbox" bind:checked={forzarLote} disabled={ocupada} />Forzar aprobación del lote con justificación</label>
          {#if forzarLote}<label for="justificacion-lote">Justificación del forzado de lote</label><textarea id="justificacion-lote" bind:value={justificacionLote} required maxlength="4000" disabled={ocupada}></textarea><p>El forzado no omite las unicidades obligatorias ni las revisiones.</p>{/if}
          <button disabled={ocupada || cargando || !seleccionLote.length || formularioAbierto || (forzarLote && !justificacionLote.trim())}>Aprobar lote seleccionado</button>
        </form>
      </section>
      {#if formularioAbierto}
        <section aria-labelledby="titulo-formulario"><h2 id="titulo-formulario">{detalle ? 'Editar borrador' : 'Nuevo borrador manual'}</h2><p>Puedes guardar datos incompletos. Los requeridos se validan al aprobar. Cambiar un valor invalida su revisión; cambiar categoría invalida las revisiones de atributos.</p>
          <form on:submit|preventDefault={guardar}><fieldset disabled={ocupada}><legend>Datos del borrador</legend><div class="campos">
            <div><label for="categoria">Categoría · necesaria para aprobar</label><select id="categoria" bind:value={categoriaId}><option value="">Sin categoría</option>{#if categoriaId && !categorias.some((categoria) => categoria.id === categoriaId)}<option value={categoriaId}>{categoriaId} (no disponible)</option>{/if}{#each categorias as categoria (categoria.id)}<option value={categoria.id}>{categoria.codigo} · {categoria.nombre}{!categoria.activa ? ' (inactiva)' : ''}</option>{/each}</select></div>
            <div><label for="ubicacion">Ubicación · necesaria para aprobar</label><select id="ubicacion" bind:value={datos.ubicacion_id}><option value={null}>Sin ubicación</option>{#if datos.ubicacion_id && !ubicaciones.some((ubicacion) => ubicacion.id === datos.ubicacion_id)}<option value={datos.ubicacion_id}>{datos.ubicacion_id} (no disponible)</option>{/if}{#each ubicaciones as ubicacion (ubicacion.id)}<option value={ubicacion.id}>{ubicacion.codigo} · {ubicacion.nombre}{!ubicacion.activa ? ' (inactiva)' : ''}</option>{/each}</select></div>
            {#each campos as [clave, etiqueta, tipo] (clave)}<div class:ancho={clave === 'observaciones'}><label for={`dato-${clave}`}>{etiqueta}{['marca', 'modelo'].includes(clave) ? ' · necesaria para aprobar' : ''}</label>
              {#if clave === 'observaciones'}<textarea id={`dato-${clave}`} bind:value={datos[clave]} maxlength="4000"></textarea>
              {:else if tipo === 'numero'}<input id={`dato-${clave}`} type="number" min="0" step="0.01" bind:value={datos[clave]} />
              {:else if tipo === 'fecha'}<input id={`dato-${clave}`} type="date" bind:value={datos[clave]} />
              {:else}<input id={`dato-${clave}`} bind:value={datos[clave]} maxlength="255" />{/if}
              {#if clave === 'codigo_interno'}<small>Referencia para detectar duplicados. El código del activo lo genera el servidor.</small>{/if}
            </div>{/each}
          </div></fieldset>
          <fieldset disabled={ocupada}><legend>Atributos de categoría</legend>{#if !categoriaId}<p>Elige una categoría para ver su esquema.</p>{/if}<div class="campos">
            {#each Object.entries(esquema) as [clave, definicion] (clave)}<div><label for={`atributo-${clave}`}>{clave}{definicion.requerido ? ' · requerido al aprobar' : ' · opcional'}</label>
              {#if definicion.tipo === 'booleano'}<select id={`atributo-${clave}`} bind:value={atributos[clave]}><option value={null}>Sin valor</option><option value={true}>Sí</option><option value={false}>No</option></select>
              {:else if definicion.tipo === 'numero'}<input id={`atributo-${clave}`} type="number" step="any" bind:value={atributos[clave]} />
              {:else if definicion.tipo === 'fecha'}<input id={`atributo-${clave}`} type="date" bind:value={atributos[clave]} />
              {:else}<input id={`atributo-${clave}`} bind:value={atributos[clave]} />{/if}
            </div>{/each}
          </div>{#if historicos.length}<p>Atributos fuera del esquema actual: se conservarán al guardar.</p><dl>{#each historicos as [clave, valor] (clave)}<div><dt>{clave}</dt><dd>{mostrar(valor)}</dd></div>{/each}</dl>{/if}</fieldset>
          <div class="acciones"><button disabled={ocupada}>Guardar borrador</button><button type="button" class="secundario" disabled={ocupada} on:click={() => { formularioAbierto = false; }}>Cancelar edición</button></div></form>
        </section>
      {/if}
      {#if detalle && !formularioAbierto}
        <section aria-labelledby="detalle"><div class="acciones"><h2 id="detalle">Detalle de propuesta</h2><span class="estado">{estados[detalle.estado]}</span>{#if !terminal && detalleVigente}<button class="secundario" on:click={editar} disabled={ocupada}>Editar borrador</button>{/if}<button class="secundario" on:click={() => abrir(detalle.id)} disabled={ocupada}>Actualizar detalle</button></div>
          <p class="identificador">{detalle.id}</p>{#if !detalleVigente}<p class="aviso" role="alert">No se pudo actualizar este detalle. Usa Actualizar detalle antes de revisar o decidir nuevamente.</p>{/if}<p>{terminal ? 'Decisión terminal: esta propuesta no admite edición ni nuevas decisiones.' : 'Selecciona explícitamente los campos cuyos valores actuales has comprobado.'}</p>
          <p>Serial, número de factura y valor de compra requieren revisión incluso sin valor. La aprobación también exige categoría, ubicación, marca, modelo, serial y los atributos requeridos válidos.</p>
          {#if detalle.estado === 'duplicada'}<p class="aviso">Revisar campos reabre esta propuesta y limpia el vínculo y las revisiones anteriores. Se requiere una nueva revisión humana.</p>{/if}
          {#if detalle.origen === 'ocr'}
            <section class="panel-ocr" aria-label="Origen y confianza OCR">
              <div class="panel-ocr-cabecera"><strong>Propuesta extraída por OCR</strong>{#if detalle.documento?.enlace}<a href={detalle.documento.enlace} target="_blank" rel="noreferrer">Abrir {detalle.documento.nombre || 'documento original'} en SharePoint</a>{:else}<span>{detalle.documento?.nombre || 'Documento de origen'}</span>{/if}</div>
              <p>La confianza es una referencia del OCR, no una aprobación. Verifica cada campo antes de revisar la propuesta. El umbral de referencia es {Math.round(UMBRAL_CONFIANZA_OCR * 100)}%.</p>
              {#if Object.keys(detalle.confianzas_campos || {}).length}
                <div class="confianzas-propuesta"><h3>Confianza por campo</h3>{#each Object.entries(detalle.confianzas_campos) as [campo, confianza] (campo)}<div class:confianza-baja={confianza < UMBRAL_CONFIANZA_OCR}><span>{campo.replaceAll('_', ' ')}</span><meter min="0" max="1" value={confianza} aria-label={`Confianza OCR de ${campo}: ${(confianza * 100).toFixed(0)} por ciento`}></meter><strong>{(confianza * 100).toFixed(0)}%</strong><small>{confianza < UMBRAL_CONFIANZA_OCR ? 'Debajo del umbral; verifica con cuidado' : 'Sobre el umbral; requiere revisión humana'}</small></div>{/each}</div>
              {:else}<p>No hay valores de confianza para estos campos.</p>{/if}
            </section>
          {/if}
          <form on:submit|preventDefault={revisar}><ul class="revisiones">{#each valoresRevision as [clave, etiqueta, valor] (clave)}<li><div><label class="check"><input type="checkbox" value={clave} bind:group={camposRevision} disabled={ocupada || terminal || !detalleVigente} />{etiqueta}</label><p class="valor">{mostrar(valor)}</p></div><div class="vigencia">{#if detalle.revision_campos[clave]}<strong>Revisión vigente</strong><span>{detalle.revision_campos[clave].revisado_por}</span><span>{fecha(detalle.revision_campos[clave].revisado_en)}</span>{:else}<span>Sin revisión vigente</span>{/if}</div></li>{/each}</ul>{#if !terminal && detalleVigente}<button disabled={ocupada || !camposRevision.length}>{detalle.estado === 'duplicada' ? 'Reabrir y revisar campos seleccionados' : 'Registrar revisión de campos seleccionados'}</button>{/if}</form>
          <details><summary>Trazabilidad y decisiones registradas</summary><dl>{#each ['creado_por', 'creado_en', 'actualizado_en', 'revisado_por', 'revisado_en', 'activo_creado_id', 'candidato_duplicado_id', 'activo_vinculado_id', 'justificacion_vinculacion', 'forzado', 'justificacion_forzado', 'lote_aprobacion_id', 'motivo_rechazo'] as clave}<div><dt>{clave.replaceAll('_', ' ')}</dt><dd>{mostrar(detalle[clave])}</dd></div>{/each}</dl></details>
        </section>
        <section aria-labelledby="duplicados"><h2 id="duplicados">Posibles duplicados</h2><p>Los candidatos indican tipo e identificador. Selecciona un activo para consultar sus datos antes de vincularlo.</p>
          {#if cargandoDuplicados}<p role="status">Consultando duplicados…</p>{:else if errorDuplicados}<p class="error" role="alert">{errorDuplicados}</p><button class="secundario" on:click={cargarDuplicados} disabled={ocupada}>Reintentar duplicados</button>{:else if !duplicados.length}<p>No se encontraron candidatos en esta consulta.</p>{:else}<ul class="candidatos">{#each duplicados as candidato (`${candidato.tipo}-${candidato.id}`)}<li><span>{candidato.tipo === 'activo' ? 'Activo' : 'Propuesta'}: {candidato.id}</span>{#if candidato.tipo === 'activo'}<button class="secundario" disabled={ocupada} on:click={() => elegirCandidato(candidato.id)}>Consultar activo candidato<span class="sr-only"> {candidato.id}</span></button>{/if}</li>{/each}</ul>{/if}
          <div class="acciones"><button class="secundario" on:click={() => paginarDuplicados(-1)} disabled={ocupada || cargandoDuplicados || offsetDuplicados === 0}>Duplicados anteriores</button><span>{totalDuplicados} candidatos · desde {totalDuplicados ? offsetDuplicados + 1 : 0}</span><button class="secundario" on:click={() => paginarDuplicados(1)} disabled={ocupada || cargandoDuplicados || offsetDuplicados + limite >= totalDuplicados}>Duplicados siguientes</button></div>
          {#if errorCandidato}<p class="error" role="alert">{errorCandidato}</p>{/if}
          {#if activoCandidato}<h3>Activo candidato seleccionado</h3><dl>{#each ['id', 'codigo_interno', 'marca', 'modelo', 'serial', 'estado'] as clave}<div><dt>{clave.replaceAll('_', ' ')}</dt><dd>{mostrar(activoCandidato[clave])}</dd></div>{/each}<div><dt>Ubicación</dt><dd>{nombreUbicacion(activoCandidato.ubicacion_id)}</dd></div></dl>{/if}
        </section>
        {#if !terminal && detalleVigente}<section aria-labelledby="decision"><h2 id="decision">Decisión humana</h2><form on:submit|preventDefault={decidir}><fieldset disabled={ocupada}><legend>Operación sobre esta propuesta</legend><label for="accion">Decisión</label><select id="accion" bind:value={decision}><option value="aprobar">Aprobar y crear activo</option><option value="rechazar">Rechazar propuesta</option><option value="duplicada">Marcar como duplicada</option><option value="vincular">Vincular con activo candidato</option></select>
          {#if decision === 'aprobar'}<p>La aprobación crea un activo. La API valida los datos, la revisión explícita y los posibles duplicados.</p><label class="check"><input type="checkbox" bind:checked={forzar} />Forzar aprobación con justificación</label>{#if forzar}<p>El forzado no omite las unicidades obligatorias ni las revisiones.</p>{/if}{/if}
          {#if decision === 'rechazar'}<label for="motivo">Motivo del rechazo</label><textarea id="motivo" bind:value={motivo} required maxlength="4000"></textarea>{/if}
          {#if decision === 'vincular'}<p>Vincular deja la propuesta como duplicada. No fusiona datos ni crea un activo.</p><p>Activo seleccionado: {idCandidato || 'Selecciona un activo en los posibles duplicados.'}</p>{/if}
          {#if ['duplicada', 'vincular'].includes(decision) || (decision === 'aprobar' && forzar)}<label for="justificacion">Justificación</label><textarea id="justificacion" bind:value={justificacion} required maxlength="4000"></textarea>{/if}
          <button disabled={ocupada || (decision === 'vincular' && !idCandidato) || (decision === 'rechazar' && !motivo.trim()) || ((['duplicada', 'vincular'].includes(decision) || (decision === 'aprobar' && forzar)) && !justificacion.trim())}>{({ aprobar: 'Confirmar aprobación individual', rechazar: 'Confirmar rechazo', duplicada: 'Confirmar duplicada', vincular: 'Confirmar vínculo con activo' })[decision]}</button>
        </fieldset></form></section>{/if}
      {/if}
    {/if}
  {/if}
</div>

<style>
  .propuestas { max-width: 1280px; margin: auto; padding: 32px; line-height: 1.5; }
  .propuestas, .propuestas * { box-sizing: border-box; }
  .cabecera { border-bottom: 2px solid #145b52; margin-bottom: 24px; }
  .eyebrow { color: #145b52; font-size: 13px; font-weight: 650; text-transform: uppercase; letter-spacing: .05em; }
  h1 { font-size: 32px; font-weight: 650; margin: 4px 0; } h2 { font-size: 23px; font-weight: 650; margin: 0 0 16px; } h3 { font-size: 18px; font-weight: 650; }
  p { margin: 8px 0 16px; } small, .vigencia { color: #52666d; }
  section { background: #fff; border: 1px solid #d5dfe2; padding: 24px; margin: 24px 0; min-width: 0; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  input, select, textarea { font: inherit; color: #1c3035; border: 1px solid #bac9cc; border-radius: 4px; padding: 10px 12px; min-height: 44px; width: 100%; background: #fff; min-width: 0; }
  textarea { min-height: 96px; resize: vertical; } select { max-width: 100%; }
  button { font: inherit; font-weight: 600; color: #fff; background: #145b52; border: 1px solid #145b52; padding: 10px 16px; min-height: 44px; border-radius: 4px; cursor: pointer; max-width: 100%; }
  button:hover:not(:disabled) { background: #0c493f; } button.secundario { color: #145b52; background: #fff; border-color: #bac9cc; } button.secundario:hover:not(:disabled) { background: #edf4f2; }
  .acciones { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 16px 0; } .acciones h2 { margin: 0; }
  .campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; } .ancho { grid-column: 1 / -1; }
  fieldset { min-width: 0; border: 1px solid #d5dfe2; padding: 20px; margin: 20px 0; } legend { font-weight: 650; padding: 0 8px; }
  .check { display: flex; gap: 8px; align-items: center; min-height: 44px; cursor: pointer; margin: 0; } .check input { width: 22px; height: 22px; min-height: 22px; flex-shrink: 0; accent-color: #145b52; }
  .bandeja, .revisiones, .candidatos { list-style: none; padding: 0; margin: 16px 0; }
  .bandeja li, .revisiones li, .candidatos li { border-top: 1px solid #d5dfe2; padding: 14px 0; }
  .registro { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 16px; align-items: center; }
  .resumen { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .estado { display: inline-block; padding: 4px 10px; border: 1px solid #bac9cc; color: #145b52; font-weight: 650; }
  .lote { border-top: 1px solid #d5dfe2; padding-top: 12px; margin-top: 24px; } .lote button, fieldset > button { margin-top: 16px; }
  .revisiones li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; } .valor { margin: 0 0 0 30px; white-space: pre-wrap; }
  .vigencia { display: flex; flex-direction: column; font-size: 14px; } .vigencia strong { color: #145b52; }

  .panel-ocr { display: grid; gap: 12px; margin: 20px 0; padding: 16px 18px; border-left: 4px solid #145b52; background: #edf4f2; color: #244742; }
  .panel-ocr p { margin: 0; line-height: 1.55; }
  .panel-ocr-cabecera { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .panel-ocr a { display: inline-flex; min-height: 44px; align-items: center; color: #145b52; font-weight: 650; }
  .confianzas-propuesta { display: grid; gap: 10px; max-width: 720px; }
  .confianzas-propuesta h3 { margin: 4px 0; font-size: 15px; }
  .confianzas-propuesta > div { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(90px, 2fr) 44px; align-items: center; gap: 8px; }
  .confianzas-propuesta meter { width: 100%; accent-color: #287658; }
  .confianzas-propuesta small { grid-column: 1 / -1; color: #52666d; }
  .confianzas-propuesta .confianza-baja strong { color: #8a4d12; }
  .confianzas-propuesta .confianza-baja meter { accent-color: #b86b20; }

  .candidatos li { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
  dl > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px; padding: 8px 0; border-bottom: 1px solid #e4eaec; } dt { font-weight: 600; } dd { margin: 0; }
  details { margin-top: 24px; } summary { min-height: 44px; cursor: pointer; padding: 10px 0; color: #145b52; font-weight: 600; }
  .error, .exito, .aviso { padding: 14px 16px; border-left: 4px solid; } .error { color: #8a2424; background: #fff0f0; } .exito { color: #145b52; background: #edf4f2; } .aviso { color: #654b16; background: #fff8e8; }
  .identificador, dd, .resumen, .vigencia, .candidatos, .valor, .exito, .error { overflow-wrap: anywhere; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  :focus-visible { outline: 3px solid #168579; outline-offset: 3px; }
  @media (max-width: 900px) { .registro { grid-template-columns: auto minmax(0, 1fr); } .registro > button { justify-self: start; } }
  @media (max-width: 600px) { .propuestas { padding: 20px 12px; } section { padding: 16px; } fieldset { padding: 12px; } .campos, .revisiones li { grid-template-columns: minmax(0, 1fr); } .revisiones li { gap: 8px; } .vigencia { padding-left: 30px; } dl > div { grid-template-columns: minmax(0, 1fr); gap: 4px; } .acciones { align-items: stretch; } }
</style>
