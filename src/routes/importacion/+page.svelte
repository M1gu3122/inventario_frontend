<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    obtenerPlantilla,
    validarImportacion,
    confirmarImportacion
  } from '#lib/services/api_importacion.js';

  const CAMPOS_MAPEO = [
    { clave: 'categoria_codigo', etiqueta: 'Código de categoría', requerido: true },
    { clave: 'ubicacion_codigo', etiqueta: 'Código de ubicación', requerido: true },
    { clave: 'marca', etiqueta: 'Marca', requerido: true },
    { clave: 'modelo', etiqueta: 'Modelo', requerido: true },
    { clave: 'serial', etiqueta: 'Serial del activo', requerido: true },
    { clave: 'codigo_externo', etiqueta: 'Código externo', requerido: false },
    { clave: 'proveedor', etiqueta: 'Proveedor', requerido: false },
    { clave: 'numero_factura', etiqueta: 'Número de factura', requerido: false },
    { clave: 'valor_compra', etiqueta: 'Valor de compra', requerido: false },
    { clave: 'fecha_adquisicion', etiqueta: 'Fecha de adquisición', requerido: false },
    { clave: 'observaciones', etiqueta: 'Observaciones', requerido: false }
  ];
  const sesion = getContext('sesion');

  let montada = false;
  let archivo = null;
  let encoding = 'utf-8';
  let delimitador = ',';
  let encabezados = [];
  let mapeoColumnas = {};
  let errorEncabezados = '';
  let leyendoEncabezados = false;
  let solicitudEncabezados = 0;
  let vista = null;
  let sobrescribir = false;
  let ocupada = false;
  let error = '';
  let mensaje = '';

  $: encargado = $sesion.usuario?.roles.includes('encargado');
  $: encabezadosDuplicados = encabezados.filter(
    (encabezado, indice) => encabezados.indexOf(encabezado) !== indice
  );
  $: hayEncabezadoVacio = encabezados.some((encabezado) => !encabezado.trim());
  $: fuentesEfectivas = CAMPOS_MAPEO.map(
    (campo) => mapeoColumnas[campo.clave] || campo.clave
  );
  $: fuentesDuplicadas = fuentesEfectivas.filter(
    (fuente, indice) => fuentesEfectivas.indexOf(fuente) !== indice
  );
  $: camposObligatoriosCompletos = CAMPOS_MAPEO.filter((campo) => campo.requerido).every(
    (campo) => {
      const fuente = mapeoColumnas[campo.clave] || campo.clave;
      return encabezados.includes(fuente);
    }
  );
  $: mapeoListo = encabezados.length > 0
    && !leyendoEncabezados
    && !errorEncabezados
    && !hayEncabezadoVacio
    && encabezadosDuplicados.length === 0
    && fuentesDuplicadas.length === 0
    && camposObligatoriosCompletos;
  $: lista = vista
    && vista.total_filas > 0
    && vista.filas_invalidas === 0
    && vista.filas_omitir === 0
    && vista.filas_validas === vista.total_filas
    && vista.detalles.length === vista.total_filas
    && vista.detalles.every((fila) => fila.valida)
    && (vista.filas_actualizar === 0 || sobrescribir);
  $: if (montada && $sesion.estado === 'anonima') goto('/login');

  onMount(() => {
    montada = true;
  });

  function invalidar() {
    vista = null;
    sobrescribir = false;
    error = '';
    mensaje = '';
  }

  function describir(e) {
    return `${e.status === 403 ? '403: No tienes permiso para importar. ' : ''}${e.message}`;
  }

  function analizarEncabezadosCSV(texto, separador) {
    const encontrados = [];
    let valor = '';
    let entreComillas = false;

    for (let indice = 0; indice < texto.length; indice += 1) {
      const caracter = texto[indice];

      if (entreComillas) {
        if (caracter === '"' && texto[indice + 1] === '"') {
          valor += '"';
          indice += 1;
        } else if (caracter === '"') {
          entreComillas = false;
        } else {
          valor += caracter;
        }
      } else if (caracter === '"' && valor.length === 0) {
        entreComillas = true;
      } else if (caracter === separador) {
        encontrados.push(valor);
        valor = '';
      } else if (caracter === '\n' || caracter === '\r') {
        encontrados.push(valor);
        return encontrados;
      } else {
        valor += caracter;
      }
    }

    if (entreComillas) throw new Error('El encabezado tiene comillas sin cerrar.');
    encontrados.push(valor);
    return encontrados;
  }

  async function cargarEncabezados() {
    const solicitudActual = ++solicitudEncabezados;
    const archivoActual = archivo;
    const encodingActual = encoding;
    const delimitadorActual = delimitador;
    leyendoEncabezados = true;
    errorEncabezados = '';

    try {
      if (!archivoActual) {
        encabezados = [];
        mapeoColumnas = {};
        return;
      }

      const etiquetaEncoding = encodingActual === 'latin-1' ? 'iso-8859-1' : 'utf-8';
      const texto = new TextDecoder(etiquetaEncoding).decode(await archivoActual.arrayBuffer());
      const detectados = analizarEncabezadosCSV(texto, delimitadorActual);
      if (solicitudActual !== solicitudEncabezados) return;

      encabezados = detectados;
      mapeoColumnas = Object.fromEntries(
        CAMPOS_MAPEO.map((campo) => [
          campo.clave,
          detectados.includes(campo.clave) ? campo.clave : ''
        ])
      );

      if (!detectados.length || detectados.every((encabezado) => !encabezado.trim())) {
        errorEncabezados = 'No se encontraron encabezados CSV. Revisa la primera fila del archivo.';
      }
    } catch (e) {
      if (solicitudActual === solicitudEncabezados) {
        encabezados = [];
        mapeoColumnas = {};
        errorEncabezados = `No se pudieron leer los encabezados: ${e.message}`;
      }
    } finally {
      if (solicitudActual === solicitudEncabezados) leyendoEncabezados = false;
    }
  }

  async function seleccionarArchivo(evento) {
    archivo = evento.currentTarget.files[0] || null;
    invalidar();
    await cargarEncabezados();
  }

  async function cambiarFormato() {
    invalidar();
    await cargarEncabezados();
  }

  function obtenerMapeoActual() {
    return Object.fromEntries(
      CAMPOS_MAPEO
        .filter((campo) => mapeoColumnas[campo.clave])
        .map((campo) => [campo.clave, mapeoColumnas[campo.clave]])
    );
  }

  async function plantilla() {
    ocupada = true;
    error = '';
    try {
      const datos = await obtenerPlantilla();
      const url = URL.createObjectURL(new Blob([datos.contenido], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'plantilla-activos.csv';
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      error = describir(e);
    } finally {
      ocupada = false;
    }
  }

  async function validar() {
    invalidar();
    if (!archivo) return;
    if (!mapeoListo) {
      error = 'Completa el mapeo de campos obligatorios y corrige los encabezados duplicados o vacíos.';
      return;
    }

    ocupada = true;
    try {
      vista = await validarImportacion(archivo, encoding, delimitador, obtenerMapeoActual());
    } catch (e) {
      error = describir(e);
    } finally {
      ocupada = false;
    }
  }

  async function importar() {
    if (!lista || ocupada) return;
    ocupada = true;
    error = '';
    mensaje = '';
    const esperadas = vista.total_filas;
    try {
      const resultado = await confirmarImportacion(
        archivo,
        encoding,
        delimitador,
        sobrescribir,
        obtenerMapeoActual()
      );
      vista = null;
      sobrescribir = false;
      if (
        resultado.errores?.length
        || resultado.total_procesados !== esperadas
        || resultado.creados + resultado.actualizados !== esperadas
      ) {
        error = `Importación incompleta o rechazada. Revisa el inventario antes de reintentar. ${(resultado.errores || []).join(' ')} Procesadas: ${resultado.total_procesados} de ${esperadas}.`;
      } else {
        mensaje = `Importación completada: ${resultado.creados} creados y ${resultado.actualizados} actualizados.`;
      }
    } catch (e) {
      vista = null;
      sobrescribir = false;
      error = describir(e);
    } finally {
      ocupada = false;
    }
  }
</script>

<svelte:head><title>Importación CSV | Inventario TI</title></svelte:head>
<section class="pagina-catalogo">
  <h1>Importación CSV</h1>
  <p class="descripcion">Descarga la plantilla, asigna las columnas y valida el archivo antes de importar.</p>
  {#if $sesion.estado === 'cargando'}
    <p role="status">Recuperando sesión...</p>
  {:else if $sesion.estado === 'error'}
    <p role="alert" class="error">{$sesion.error}</p>
  {:else if $sesion.usuario}
    <button type="button" disabled={ocupada} on:click={plantilla}>Descargar plantilla CSV</button>
    {#if !encargado}
      <p role="alert">La importación requiere el rol encargado. Puedes descargar la plantilla.</p>
    {:else}
      <form class="editor" on:submit|preventDefault={validar}>
        <h2>1. Selección y mapeo</h2>
        <p class="ayuda">Asigna cada campo al encabezado que le corresponde. Los encabezados sin asignación se conservan como atributos dinámicos.</p>
        <fieldset disabled={ocupada}>
          <div class="campos">
            <div class="amplio">
              <label for="archivo">Archivo CSV</label>
              <input id="archivo" type="file" accept=".csv,text/csv" required on:change={seleccionarArchivo} />
            </div>
            <div>
              <label for="encoding">Codificación</label>
              <select id="encoding" bind:value={encoding} on:change={cambiarFormato}>
                <option value="utf-8">UTF-8</option>
                <option value="utf-8-sig">UTF-8 con BOM</option>
                <option value="latin-1">Latin-1</option>
              </select>
            </div>
            <div>
              <label for="delimitador">Delimitador</label>
              <select id="delimitador" bind:value={delimitador} on:change={cambiarFormato}>
                <option value=",">Coma</option>
                <option value=";">Punto y coma</option>
                <option value="\t">Tabulación</option>
              </select>
            </div>
          </div>

          {#if leyendoEncabezados}
            <p role="status">Leyendo encabezados del archivo...</p>
          {/if}
          {#if errorEncabezados}
            <p class="error" role="alert">{errorEncabezados}</p>
          {/if}
          {#if encabezados.length && !errorEncabezados}
            <section class="mapeo" aria-labelledby="titulo-mapeo">
              <div class="mapeo-cabecera">
                <div>
                  <h3 id="titulo-mapeo">Mapeo de columnas</h3>
                  <p class="ayuda">{encabezados.length} encabezados detectados. Los campos opcionales pueden quedar en detección automática.</p>
                </div>
              </div>
              {#if hayEncabezadoVacio}
                <p class="error" role="alert">Hay columnas sin nombre. Corrige la fila de encabezados antes de continuar.</p>
              {/if}
              {#if encabezadosDuplicados.length}
                <p class="error" role="alert">Encabezados repetidos: {Array.from(new Set(encabezadosDuplicados)).join(', ')}. Renómbralos para evitar ambigüedades.</p>
              {/if}
              {#if fuentesDuplicadas.length}
                <p class="error" role="alert">Un mismo encabezado quedó asignado a más de un campo: {Array.from(new Set(fuentesDuplicadas)).join(', ')}.</p>
              {/if}
              <div class="lista-mapeo">
                {#each CAMPOS_MAPEO as campo (campo.clave)}
                  <div class="fila-mapeo">
                    <label for={`mapeo-${campo.clave}`}>
                      {campo.etiqueta}
                      <span>{campo.requerido ? 'Obligatorio' : 'Opcional'}</span>
                    </label>
                    <select
                      id={`mapeo-${campo.clave}`}
                      bind:value={mapeoColumnas[campo.clave]}
                      on:change={invalidar}
                    >
                      <option value="">Detección automática por nombre</option>
                      {#each encabezados.filter((encabezado) => encabezado.trim()) as encabezado, indice (`${indice}-${encabezado}`)}
                        <option value={encabezado}>{encabezado}</option>
                      {/each}
                    </select>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
          <button type="submit" disabled={!archivo || !mapeoListo || ocupada || leyendoEncabezados}>
            2. Validar sin importar
          </button>
        </fieldset>
      </form>
      {#if ocupada}<p role="status">Procesando archivo...</p>{/if}
      {#if vista}
        <section class="editor">
          <h2>Vista previa</h2>
          <p role="status">{vista.total_filas} filas | {vista.filas_validas} válidas | {vista.filas_invalidas} inválidas | {vista.filas_crear} a crear | {vista.filas_actualizar} a actualizar | {vista.filas_omitir} a omitir</p>
          {#if vista.filas_invalidas || vista.filas_omitir || !vista.total_filas}
            <p class="error" role="alert">Corrige el archivo y vuelve a validar. No se puede importar.</p>
          {/if}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (La tabla desborda en móvil; la región necesita foco para desplazarse con teclado.) -->
          <div class="tabla" tabindex="0" role="region" aria-label="Validación por fila">
            <table>
              <thead><tr><th>Fila</th><th>Acción</th><th>Datos</th><th>Validación</th></tr></thead>
              <tbody>
                {#each vista.detalles as fila (fila.numero_fila)}
                  <tr>
                    <td>{fila.numero_fila}</td>
                    <td>{fila.accion}</td>
                    <td><pre>{JSON.stringify(fila.datos, null, 2)}</pre></td>
                    <td>{fila.valida ? 'Válida' : 'Inválida'}{#each fila.errores || [] as motivo}<p>{motivo}</p>{/each}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if vista.filas_actualizar > 0}
            <p class="error">Advertencia: se reemplazarán datos de {vista.filas_actualizar} activos existentes. Esta operación modifica el inventario.</p>
            <label class="confirmacion"><input type="checkbox" bind:checked={sobrescribir} disabled={ocupada} /> Confirmo sobrescribir los activos existentes</label>
          {/if}
          <button type="button" disabled={!lista || ocupada} on:click={importar}>3. Importar definitivamente</button>
        </section>
      {/if}
    {/if}
  {/if}
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  {#if mensaje}<p role="status" class="exito">{mensaje}</p>{/if}
</section>

<style>
  fieldset { border: 0; padding: 0; min-width: 0; }
  pre { max-width: 36ch; white-space: pre-wrap; overflow-wrap: anywhere; }
  .confirmacion { display: flex; align-items: center; gap: 12px; margin: 20px 0; }
  .confirmacion input { width: 24px; flex: 0 0 24px; }
  .mapeo { margin: 12px 0 24px; border-top: 1px solid #d5dfe2; }
  .mapeo-cabecera { display: flex; justify-content: space-between; align-items: end; gap: 16px; padding: 20px 0 8px; }
  .mapeo-cabecera h3 { margin: 0; color: #1c3035; font-size: 17px; font-weight: 650; }
  .mapeo-cabecera .ayuda { margin: 6px 0 0; }
  .lista-mapeo { border-bottom: 1px solid #d5dfe2; margin-bottom: 20px; }
  .fila-mapeo { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); align-items: center; gap: 18px; padding: 10px 0; border-bottom: 1px solid #e5ebed; }
  .fila-mapeo:last-child { border-bottom: 0; }
  .fila-mapeo label { margin: 0; }
  .fila-mapeo label span { display: block; margin-top: 3px; color: #52666d; font-size: 12px; font-weight: 400; }
  @media (max-width: 600px) {
    .fila-mapeo { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .mapeo-cabecera { align-items: start; }
  }
</style>
