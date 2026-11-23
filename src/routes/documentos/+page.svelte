<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    consultarConfiguracionDocumental,
    listarDocumentos,
    obtenerDocumento,
    registrarReferencia,
    reprocesarDocumento
  } from '#lib/services/api_documentos.js';

  const sesion = getContext('sesion');
  const limite = 20;
  const tipos = [
    ['factura', 'Factura'],
    ['orden_compra', 'Orden de compra'],
    ['acta', 'Acta de entrega o devolución'],
    ['certificado_garantia', 'Certificado de garantía']
  ];
  const estados = [
    ['pendiente', 'Pendiente'],
    ['procesando', 'Procesando'],
    ['procesado', 'Procesado'],
    ['error', 'Error']
  ];
  const etiquetasEstado = Object.fromEntries(estados);
  const etiquetasTipo = Object.fromEntries(tipos);

  let montada = false;
  let inicializada = false;
  let permitido = false;
  let esAdmin = false;
  let cargando = false;
  let cargandoDetalle = false;
  let reprocesando = false;
  let errorLista = '';
  let errorDetalle = '';
  let mensaje = '';
  let documentos = [];
  let detalle = null;
  let filtroEstado = '';
  let filtroTipo = '';
  let filtrosAplicados = {};
  let offset = 0;
  let total = 0;
  let configuracion = null;
  let cargandoConfiguracion = false;
  let registrando = false;
  let errorRegistro = '';
  let fuenteRegistro = '';
  let claveRegistro = '';
  let tipoRegistro = 'factura';

  $: permitido = Boolean($sesion.usuario?.roles.some((rol) => ['admin', 'encargado'].includes(rol)));
  $: esAdmin = Boolean($sesion.usuario?.roles.includes('admin'));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && permitido && !inicializada) {
    inicializada = true;
    cargarLista();
  }
  onMount(() => { montada = true; });

  function describirError(error) {
    if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' });
    const contexto = {
      401: 'La sesión venció.',
      403: 'Tu rol no permite consultar documentos.',
      404: 'El documento ya no está disponible.',
      409: 'El documento cambió de estado. Actualiza la consulta antes de reintentar.'
    };
    return [contexto[error.status], error.message].filter(Boolean).join(' ');
  }

  async function cargarLista() {
    cargando = true;
    errorLista = '';
    try {
      const pagina = await listarDocumentos({ ...filtrosAplicados, offset, limit: limite });
      documentos = pagina.items;
      total = pagina.total;
      offset = pagina.offset;
      if (detalle && !documentos.some((documento) => documento.id === detalle.id)) {
        detalle = null;
      }
    } catch (error) {
      errorLista = describirError(error);
      documentos = [];
    } finally {
      cargando = false;
    }
  }

  async function filtrar() {
    mensaje = '';
    filtrosAplicados = { estado: filtroEstado, tipo: filtroTipo };
    offset = 0;
    detalle = null;
    await cargarLista();
  }

  async function paginar(paso) {
    mensaje = '';
    offset = Math.max(0, offset + paso * limite);
    detalle = null;
    await cargarLista();
  }

  async function abrirDetalle(id) {
    cargandoDetalle = true;
    errorDetalle = '';
    mensaje = '';
    try {
      detalle = await obtenerDocumento(id);
    } catch (error) {
      errorDetalle = describirError(error);
    } finally {
      cargandoDetalle = false;
    }
  }

  async function reprocesar() {
    if (!detalle || !esAdmin || reprocesando) return;
    reprocesando = true;
    errorDetalle = '';
    mensaje = '';
    try {
      detalle = await reprocesarDocumento(detalle.id);
      mensaje = 'El documento volvió a la cola para su reproceso.';
      await cargarLista();
      detalle = await obtenerDocumento(detalle.id);
    } catch (error) {
      errorDetalle = describirError(error);
    } finally {
      reprocesando = false;
    }
  }

  async function cargarConfiguracion(evento) {
    if (!evento.currentTarget.open || configuracion || cargandoConfiguracion) return;
    cargandoConfiguracion = true;
    errorRegistro = '';
    try {
      configuracion = await consultarConfiguracionDocumental();
      fuenteRegistro = configuracion.sharepoint ? 'sharepoint' : configuracion.local ? 'local' : '';
    } catch (error) {
      errorRegistro = describirError(error);
    } finally {
      cargandoConfiguracion = false;
    }
  }

  async function registrar() {
    if (registrando || !claveRegistro.trim()) return;
    registrando = true;
    errorRegistro = '';
    mensaje = '';
    try {
      const registro = await registrarReferencia({
        fuente: fuenteRegistro,
        clave: claveRegistro.trim(),
        tipo: tipoRegistro
      });
      claveRegistro = '';
      filtroTipo = '';
      filtroEstado = '';
      filtrosAplicados = {};
      offset = 0;
      detalle = null;
      await cargarLista();
      mensaje = registro.creado ? 'Referencia registrada y añadida a la cola.' : 'La referencia ya estaba registrada.';
    } catch (error) {
      errorRegistro = describirError(error);
    } finally {
      registrando = false;
    }
  }

  function fecha(valor) {
    return valor ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin registro';
  }

  function mostrar(valor) {
    if (valor === null || valor === undefined || valor === '') return 'Sin dato extraído';
    if (typeof valor === 'object') return JSON.stringify(valor);
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    return String(valor);
  }
</script>

<svelte:head>
  <title>Documentos | Inventario TI</title>
  <meta name="description" content="Consulta referencias documentales y resultados de revisión OCR." />
</svelte:head>

<section class="pagina-catalogo documentos">
  <div class="encabezado">
    <div>
      <p class="ceja">CAPTURA DOCUMENTAL · FASE 2</p>
      <h1>Documentos</h1>
      <p class="descripcion">Consulta referencias y resultados OCR. Los archivos permanecen en SharePoint; esta pantalla no recibe archivos.</p>
    </div>
    <div class="total" aria-label={`${total} documentos encontrados`}>
      <strong>{total}</strong>
      <span>referencias</span>
    </div>
  </div>

  {#if $sesion.estado === 'cargando'}
    <p class="estado-carga" role="status">Recuperando sesión…</p>
  {:else if $sesion.estado === 'error'}
    <p class="alerta error" role="alert">{$sesion.error}</p>
  {:else if $sesion.usuario && !permitido}
    <p class="alerta error" role="alert">403: La consulta de documentos requiere rol admin o encargado.</p>
  {:else if permitido}
    {#if esAdmin}
      <details class="registro mb-5 rounded-md border bg-white" on:toggle={cargarConfiguracion}>
        <summary class="cursor-pointer p-4 font-semibold">Fuentes y registro documental</summary>
        <div class="px-4 pb-4">
          {#if cargandoConfiguracion}<p role="status">Consultando configuración…</p>{/if}
          {#if configuracion}
            <p class="mb-4 text-sm">Microsoft Graph {configuracion.sharepoint ? 'configurado' : 'sin configurar'}. Azure OCR {configuracion.azure ? 'configurado' : 'sin configurar'}. PaddleOCR {configuracion.paddle ? 'habilitado' : 'deshabilitado'}.</p>
            {#if !configuracion.azure && !configuracion.paddle}
              <p class="mb-4 text-sm">Las referencias nuevas quedarán pendientes hasta habilitar un proveedor OCR.</p>
            {/if}
            {#if configuracion.sharepoint || configuracion.local}
              <form class="grid items-end gap-3 lg:grid-cols-[1fr_2fr_1fr_auto]" on:submit|preventDefault={registrar}>
                <div>
                  <label for="fuente-registro">Fuente</label>
                  <select id="fuente-registro" bind:value={fuenteRegistro} disabled={registrando}>
                    {#if configuracion.sharepoint}<option value="sharepoint">SharePoint</option>{/if}
                    {#if configuracion.local}<option value="local">Carpeta local</option>{/if}
                  </select>
                </div>
                <div>
                  <label for="clave-registro">{fuenteRegistro === 'local' ? 'Ruta relativa' : 'Identificador del archivo'}</label>
                  <input id="clave-registro" bind:value={claveRegistro} required maxlength="1024" disabled={registrando} />
                </div>
                <div>
                  <label for="tipo-registro">Tipo</label>
                  <select id="tipo-registro" bind:value={tipoRegistro} disabled={registrando}>
                    {#each tipos as [valor, etiqueta] (valor)}<option value={valor}>{etiqueta}</option>{/each}
                  </select>
                </div>
                <button disabled={registrando || !claveRegistro.trim()}>{registrando ? 'Registrando…' : 'Registrar referencia'}</button>
              </form>
            {:else}
              <p>Configura SharePoint o una carpeta local para registrar referencias.</p>
            {/if}
          {/if}
          {#if errorRegistro}<p class="alerta error" role="alert">{errorRegistro}</p>{/if}
        </div>
      </details>
    {/if}
    <form class="filtros" on:submit|preventDefault={filtrar}>
      <div class="campo">
        <label for="filtro-tipo">Tipo de documento</label>
        <select id="filtro-tipo" bind:value={filtroTipo} disabled={cargando}>
          <option value="">Todos los tipos</option>
          {#each tipos as [valor, etiqueta] (valor)}<option value={valor}>{etiqueta}</option>{/each}
        </select>
      </div>
      <div class="campo">
        <label for="filtro-estado">Estado OCR</label>
        <select id="filtro-estado" bind:value={filtroEstado} disabled={cargando}>
          <option value="">Todos los estados</option>
          {#each estados as [valor, etiqueta] (valor)}<option value={valor}>{etiqueta}</option>{/each}
        </select>
      </div>
      <button disabled={cargando}>{cargando ? 'Consultando…' : 'Aplicar filtros'}</button>
    </form>

    {#if mensaje}<p class="alerta exito" role="status">{mensaje}</p>{/if}
    {#if errorLista}
      <p class="alerta error" role="alert">{errorLista}</p>
      <button class="secundario" disabled={cargando} on:click={cargarLista}>Reintentar consulta</button>
    {:else if cargando}
      <div class="cargando" role="status"><span class="indicador" aria-hidden="true"></span><span>Consultando referencias documentales</span></div>
    {:else if !documentos.length}
      <div class="vacio">
        <span class="vacio-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M7 3.75h6.4L19 9.4v10.85H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5"/><path d="M13 4v6h6M9 14h6M9 17h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </span>
        <h2>No hay documentos para mostrar</h2>
        <p>Las referencias aparecen aquí después de la sincronización documental. No subas copias; SharePoint es la fuente original.</p>
      </div>
    {:else}
      <div class="tabla" role="region" aria-label="Documentos registrados">
        <table>
          <thead><tr><th>Documento</th><th>Tipo</th><th>Estado</th><th>Actualizado</th><th><span class="solo-lectores">Acciones</span></th></tr></thead>
          <tbody>
            {#each documentos as documento (documento.id)}
              <tr class:seleccionado={detalle?.id === documento.id}>
                <td><strong>{documento.nombre}</strong><span class="subdato">{documento.fuente === 'sharepoint' ? 'SharePoint' : 'Fuente local'}</span></td>
                <td>{etiquetasTipo[documento.tipo] || documento.tipo}</td>
                <td><span class={`estado estado-${documento.estado}`}>{etiquetasEstado[documento.estado] || documento.estado}</span></td>
                <td>{fecha(documento.actualizado_en)}</td>
                <td><button class="accion-fila" aria-label={`Ver detalle de ${documento.nombre}`} on:click={() => abrirDetalle(documento.id)}>Ver detalle</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="paginacion">
        <span>{offset + 1}–{Math.min(offset + documentos.length, total)} de {total}</span>
        <div class="controles-pagina">
          <button class="secundario" disabled={offset === 0 || cargando} on:click={() => paginar(-1)}>Anterior</button>
          <button class="secundario" disabled={offset + limite >= total || cargando} on:click={() => paginar(1)}>Siguiente</button>
        </div>
      </div>
    {/if}

    {#if cargandoDetalle}<p class="estado-carga" role="status">Cargando detalle…</p>{/if}
    {#if errorDetalle}<p class="alerta error" role="alert">{errorDetalle}</p>{/if}
    {#if detalle}
      <section class="detalle" aria-labelledby="titulo-detalle">
        <div class="detalle-cabecera">
          <div><p class="ceja">FICHA DOCUMENTAL</p><h2 id="titulo-detalle">{detalle.nombre}</h2><p class="subdato">{detalle.id}</p></div>
          {#if esAdmin && detalle.estado === 'error'}
            <button disabled={reprocesando} on:click={reprocesar}>{reprocesando ? 'Encolando…' : 'Reprocesar OCR'}</button>
          {/if}
        </div>
        <div class="metadatos">
          <div><span>Tipo</span><strong>{etiquetasTipo[detalle.tipo] || detalle.tipo}</strong></div>
          <div><span>Estado</span><strong><span class={`estado estado-${detalle.estado}`}>{etiquetasEstado[detalle.estado] || detalle.estado}</span></strong></div>
          <div><span>Origen</span><strong>{detalle.fuente === 'sharepoint' ? 'SharePoint' : 'Fuente local'}</strong></div>
          <div><span>Tamaño</span><strong>{(detalle.tamanio_bytes / 1024).toFixed(1)} KB</strong></div>
          <div><span>Intentos OCR</span><strong>{detalle.intentos}</strong></div>
          <div><span>Páginas</span><strong>{detalle.paginas ?? 'Pendiente'}</strong></div>
          <div><span>Última actualización</span><strong>{fecha(detalle.actualizado_en)}</strong></div>
          <div><span>SHA-256</span><code>{detalle.sha256}</code></div>
        </div>
        {#if detalle.enlace}<a class="enlace-fuente" href={detalle.enlace} target="_blank" rel="noreferrer">Abrir original en SharePoint <span aria-hidden="true">↗</span></a>{/if}
        {#if detalle.error}<p class="alerta error" role="status"><strong>Último fallo:</strong> {detalle.error}</p>{/if}

        {#if Object.keys(detalle.campos_documento || {}).length}
          <section class="bloque-detalle"><h3>Datos detectados del documento</h3><dl>{#each Object.entries(detalle.campos_documento) as [campo, valor] (campo)}<div><dt>{campo.replaceAll('_', ' ')}</dt><dd>{mostrar(valor)}</dd></div>{/each}</dl></section>
        {/if}
        <section class="bloque-detalle propuestas">
          <div class="bloque-cabecera"><div><h3>Activos candidatos</h3><p>Los resultados OCR son propuestas; una persona debe revisarlos antes de crear activos.</p></div><strong>{detalle.propuestas.length}</strong></div>
          {#if detalle.propuestas.length}
            <div class="lista-propuestas">
              {#each detalle.propuestas as propuesta (propuesta.id)}
                <article>
                  <div class="propuesta-top"><span class={`estado estado-${propuesta.estado}`}>{propuesta.estado.replaceAll('_', ' ')}</span><span>{propuesta.id}</span></div>
                  <dl>{#each Object.entries(propuesta.datos) as [campo, valor] (campo)}<div><dt>{campo.replaceAll('_', ' ')}</dt><dd>{mostrar(valor)}</dd></div>{/each}</dl>
                  {#if Object.keys(propuesta.confianzas_campos || {}).length}<div class="confianzas"><h4>Confianza por campo</h4>{#each Object.entries(propuesta.confianzas_campos) as [campo, confianza] (campo)}<div><span>{campo.replaceAll('_', ' ')}</span><meter min="0" max="1" value={confianza} aria-label={`Confianza de ${campo}: ${(confianza * 100).toFixed(0)} por ciento`}></meter><strong>{(confianza * 100).toFixed(0)}%</strong></div>{/each}</div>{/if}
                  <a href="/propuestas">Abrir bandeja de revisión</a>
                </article>
              {/each}
            </div>
          {:else}<p class="vacio-pequeno">Todavía no hay propuestas asociadas.</p>{/if}
        </section>
      </section>
    {/if}
  {/if}
</section>

<style>
  .documentos { --tinta: #183b3b; --verde: #145b52; --linea: #d6e2df; }
  .registro { border-color: var(--linea); color: var(--tinta); }
  .encabezado { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 28px; }
  .ceja { color: #47746b; font-size: 11px; font-weight: 750; letter-spacing: .13em; margin: 0 0 8px; }
  .total { min-width: 112px; padding: 14px 18px; border: 1px solid var(--linea); border-top: 3px solid var(--verde); background: #fff; display: grid; gap: 2px; text-align: right; }
  .total strong { color: var(--tinta); font: 650 26px/1.1 'Fira Sans', 'Segoe UI', sans-serif; }
  .total span { color: #62766f; font-size: 12px; }
  .filtros { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; padding: 18px; background: #edf3f0; border: 1px solid var(--linea); margin-bottom: 20px; }
  .campo { width: min(260px, 100%); flex: 1 1 220px; }
  .filtros button { min-width: 144px; }
  .alerta { padding: 14px 16px; border-radius: 5px; line-height: 1.55; margin: 16px 0; }
  .error { color: #852d32; background: #fff0ef; border-left: 3px solid #b54c50; }
  .exito { color: #145b52; background: #e8f3ed; border-left: 3px solid #378a69; }
  .cargando { min-height: 180px; display: flex; gap: 12px; justify-content: center; align-items: center; color: #52666d; }
  .indicador { width: 18px; height: 18px; border: 2px solid #bed1cb; border-top-color: var(--verde); border-radius: 50%; animation: giro .8s linear infinite; }
  .vacio { min-height: 230px; display: grid; justify-items: center; align-content: center; padding: 32px 24px; text-align: center; background: white; border: 1px solid var(--linea); }
  .vacio-icono { display: grid; place-items: center; width: 48px; height: 48px; color: var(--verde); background: #eaf2ee; border-radius: 50%; }
  .vacio-icono svg { width: 24px; height: 24px; }
  .vacio h2 { margin: 18px 0 6px; color: var(--tinta); font-size: 18px; }
  .vacio p { max-width: 54ch; color: #52666d; font-size: 14px; line-height: 1.65; margin: 0; }
  .tabla { border: 1px solid var(--linea); border-radius: 7px; overflow: auto; }
  table { min-width: 700px; }
  tbody tr { transition: background-color .18s ease; }
  tbody tr:hover, tbody tr.seleccionado { background: #f0f6f3; }
  td strong { display: block; color: #183b3b; }
  .subdato { display: block; margin-top: 4px; color: #60756e; font-size: 12px; overflow-wrap: anywhere; }
  .estado { display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; background: #e6f0ec; color: #245a47; font-size: 12px; font-weight: 700; text-transform: capitalize; white-space: nowrap; }
  .estado-error { background: #fde9e8; color: #862e33; }
  .estado-procesando { background: #fff3d7; color: #725311; }
  .estado-procesado { background: #e1f1e8; color: #155b3d; }
  .estado-pendiente { background: #edf0f2; color: #475a63; }
  button.accion-fila { min-height: 38px !important; padding: 7px 11px !important; background: white !important; color: #145b52 !important; border-color: #9bb9b0 !important; white-space: nowrap; }
  .paginacion { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 16px 0 28px; }
  .controles-pagina { display: flex; gap: 8px; }
  .detalle { margin-top: 34px; padding: 24px; background: #fff; border: 1px solid var(--linea); border-radius: 9px; box-shadow: 0 12px 32px #193c3510; }
  .detalle-cabecera { display: flex; justify-content: space-between; align-items: start; gap: 20px; }
  .detalle-cabecera h2 { overflow-wrap: anywhere; margin-bottom: 0; color: var(--tinta); }
  .metadatos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; overflow: hidden; margin: 24px 0; background: var(--linea); border: 1px solid var(--linea); }
  .metadatos div { min-width: 0; display: grid; gap: 8px; padding: 14px; background: #f9fbfa; }
  .metadatos div > span { color: #647970; font-size: 12px; }
  .metadatos strong, .metadatos code { overflow-wrap: anywhere; font-size: 13px; color: #233c39; }
  .metadatos code { font-family: 'Fira Code', Consolas, monospace; font-size: 11px; }
  .enlace-fuente { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 650; }
  .bloque-detalle { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--linea); }
  .bloque-detalle h3 { color: var(--tinta); font-size: 17px; margin: 0 0 14px; }
  .bloque-detalle > p, .bloque-cabecera p { color: #60756e; font-size: 13px; line-height: 1.6; margin: 4px 0 0; }
  dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin: 0; background: var(--linea); border: 1px solid var(--linea); }
  dl div { min-width: 0; padding: 12px; background: #fbfcfc; }
  dt { color: #60756e; font-size: 11px; text-transform: capitalize; }
  dd { margin: 5px 0 0; color: #183b3b; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
  .bloque-cabecera { display: flex; justify-content: space-between; align-items: start; gap: 20px; margin-bottom: 16px; }
  .bloque-cabecera strong { color: var(--verde); font: 700 24px/1 'Fira Sans', 'Segoe UI', sans-serif; }
  .lista-propuestas { display: grid; gap: 14px; }
  .lista-propuestas article { padding: 16px; background: #f8faf9; border: 1px solid var(--linea); border-radius: 6px; }
  .propuesta-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .propuesta-top > span:last-child { color: #6a7b76; font: 11px 'Fira Code', Consolas, monospace; overflow-wrap: anywhere; }
  .confianzas { max-width: 700px; margin: 18px 0; }
  .confianzas h4 { margin: 0 0 10px; color: var(--tinta); font-size: 13px; }
  .confianzas > div { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(90px, 2fr) 42px; gap: 10px; align-items: center; margin: 8px 0; font-size: 12px; text-transform: capitalize; }
  meter { width: 100%; height: 10px; accent-color: var(--verde); }
  .lista-propuestas article > a { display: inline-flex; align-items: center; min-height: 44px; font-size: 13px; font-weight: 650; }
  .vacio-pequeno { padding: 12px; color: #60756e; background: #f6f9f7; }
  .solo-lectores { white-space: nowrap; }
  @keyframes giro { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .encabezado { align-items: start; } .metadatos { grid-template-columns: repeat(2, minmax(0, 1fr)); } dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .detalle { padding: 18px; } }
  @media (max-width: 480px) { .encabezado { flex-direction: column; } .total { width: 100%; box-sizing: border-box; text-align: left; } .metadatos, dl { grid-template-columns: 1fr; } .detalle-cabecera { flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { .indicador { animation: none; border-top-color: #bed1cb; } tbody tr { transition: none; } }
</style>
