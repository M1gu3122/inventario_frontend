<script>
  import { getContext, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { obtenerReporte, obtenerNotificaciones, obtenerReporteCompleto } from '#lib/services/api_auditoria.js';
  const sesion = getContext('sesion');
  const reportes = [['inventario', 'Inventario'], ['responsables', 'Responsables'], ['historial', 'Historial de activo'], ['licencias', 'Licencias'], ['garantias', 'Garantías'], ['mantenimientos', 'Mantenimientos'], ['propuestas', 'Propuestas'], ['notificaciones', 'Notificaciones']];
  const camposPorTipo = {
    inventario: [['categoria_id', 'UUID de categoría', 'text'], ['ubicacion_id', 'UUID de ubicación', 'text'], ['estado', 'Estado', 'text'], ['incluir_baja', 'Incluir activos de baja', 'checkbox']],
    responsables: [['solo_asignados', 'Solo responsables con asignaciones', 'checkbox']],
    historial: [], licencias: [['solo_vigentes', 'Solo vigentes', 'checkbox'], ['por_vencer', 'Por vencer (30 días)', 'checkbox']],
    mantenimientos: [['tipo', 'Tipo (preventivo / correctivo)', 'text'], ['estado', 'Estado (abierto / cerrado)', 'text'], ['activo_id', 'UUID de activo', 'text']],
    garantias: [['por_vencer', 'Vencen en 30 días', 'checkbox']], propuestas: [['estado', 'Estado', 'text']], notificaciones: []
  };
  let montada = false, inicializada = false, tipo = 'inventario', filtros = {}, activoId = '', aplicado = null, registros = [], columnas = [], offset = 0, total = 0, cargando = false, exportando = false, mensajeExportacion = '', error = '', consultado = false, datosImpresion = null, columnasImpresion = [];
  $: registrosTabla = datosImpresion ?? registros;
  $: columnasTabla = datosImpresion ? columnasImpresion : columnas;
  $: permitido = $sesion.usuario?.roles.some(r => ['admin', 'auditor'].includes(r));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && permitido && !inicializada) { inicializada = true; iniciar(); }
  onMount(() => { montada = true; });
  function iniciar() { const buscado = new URLSearchParams(window.location.search).get('tipo'); if (reportes.some(([clave]) => clave === buscado)) tipo = buscado; cambiar(); if (tipo !== 'historial') consultar(); }
  function cambiar() { filtros = tipo === 'responsables' ? {solo_asignados: true} : {}; registros = []; columnas = []; error = ''; consultado = false; aplicado = null; offset = 0; }
  async function consultar() { offset = 0; aplicado = {tipo, filtros: {...filtros}, activoId: activoId.trim()}; await cargar(); }
  async function cargar() {
    cargando = true; error = ''; registros = []; columnas = []; consultado = true;
    try {
      const resultado = aplicado.tipo === 'notificaciones' ? await obtenerNotificaciones() : await obtenerReporte(aplicado.tipo, {...aplicado.filtros, offset, limit: 20}, aplicado.activoId);
      registros = Array.isArray(resultado) ? resultado : resultado.items; total = Array.isArray(resultado) ? resultado.length : resultado.total;
      columnas = [...new Set(registros.flatMap(registro => Object.keys(registro)))];
    } catch(e) { error = `${e.status === 403 ? '403: Reportes requiere rol admin o auditor. ' : ''}${e.message}`; } finally { cargando = false; }
  }
  async function obtenerTodosLosRegistros() {
    if (!aplicado || aplicado.tipo === 'historial' && !aplicado.activoId) throw new Error('Consulta el reporte con sus filtros antes de exportar.');
    return obtenerReporteCompleto(aplicado.tipo, aplicado.filtros, aplicado.activoId);
  }
  function columnasDe(items) { return [...new Set(items.flatMap(registro => Object.keys(registro)))]; }
  function valorCSV(valor) {
    let texto = valor === null || valor === undefined ? '' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    const esNumero = typeof valor === 'string' && /^-?\d+(?:\.\d+)?$/.test(texto);
    if (typeof valor === 'string' && !esNumero && /^[\t\r ]*[=+\-@]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replaceAll('"', '""')}"`;
  }
  async function exportarCSV() {
    if (exportando) return;
    exportando = true; error = ''; mensajeExportacion = '';
    try {
      const filas = await obtenerTodosLosRegistros();
      if (!filas.length) throw new Error('No hay resultados para exportar.');
      const encabezados = columnasDe(filas);
      const contenido = [encabezados.map(valorCSV).join(','), ...filas.map(fila => encabezados.map(columna => valorCSV(fila[columna])).join(','))].join('\r\n');
      const archivo = URL.createObjectURL(new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = archivo; enlace.download = `reporte-${aplicado.tipo}.csv`; enlace.click();
      setTimeout(() => URL.revokeObjectURL(archivo), 1000);
      mensajeExportacion = `CSV exportado: ${filas.length} resultados.`;
    } catch (e) { error = e.message; }
    finally { exportando = false; }
  }
  async function exportarPDF() {
    if (exportando) return;
    exportando = true; error = ''; mensajeExportacion = '';
    try {
      const filas = await obtenerTodosLosRegistros();
      if (!filas.length) throw new Error('No hay resultados para preparar el PDF.');
      datosImpresion = filas; columnasImpresion = columnasDe(filas);
      await tick();
      window.addEventListener('afterprint', () => { datosImpresion = null; columnasImpresion = []; }, { once: true });
      window.print();
      mensajeExportacion = 'El reporte está listo para imprimir o guardar como PDF.';
    } catch (e) { datosImpresion = null; columnasImpresion = []; error = e.message; }
    finally { exportando = false; }
  }
  function mostrar(valor) { return valor === null || valor === undefined ? '—' : typeof valor === 'object' ? JSON.stringify(valor, null, 2) : String(valor); }
</script>
<svelte:head><title>Reportes | Inventario TI</title></svelte:head>
<section class="pagina-catalogo"><h1>Reportes</h1><p class="descripcion">Consultas operativas de solo lectura con datos del servidor.</p>
  {#if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión...</p>{:else if $sesion.estado === 'error'}<p role="alert" class="error">{$sesion.error}</p>{:else if $sesion.usuario && !permitido}<p class="error" role="alert">403: Reportes requiere rol admin o auditor.</p>
  {:else if permitido}
    <form class="editor" on:submit|preventDefault={consultar}><fieldset disabled={cargando || exportando}><div class="campos"><div><label for="reporte">Reporte</label><select id="reporte" bind:value={tipo} on:change={cambiar}>{#each reportes as [clave, etiqueta] (clave)}<option value={clave}>{etiqueta}</option>{/each}</select></div>
    {#if tipo === 'historial'}<div><label for="activo">UUID del activo</label><input id="activo" bind:value={activoId} required pattern={'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'} /></div>{/if}
    {#each camposPorTipo[tipo] as [clave, etiqueta, formato] (clave)}<div>{#if formato === 'checkbox'}<label class="casilla"><input type="checkbox" bind:checked={filtros[clave]} />{etiqueta}</label>{:else}<label for={clave}>{etiqueta}</label><input id={clave} bind:value={filtros[clave]} pattern={clave.endsWith('_id') ? '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' : undefined} />{/if}</div>{/each}</div><button>Consultar reporte</button></fieldset></form>
    {#if error}<p role="alert" class="error">{error}</p><button on:click={cargar} disabled={cargando}>Reintentar reporte</button>{/if}
    {#if cargando}<p role="status">Cargando reporte...</p>{:else if consultado && !error && !registros.length}<p class="vacio">No hay resultados para esta consulta.</p>
    {:else if !error && registros.length}<div class="acciones-exportacion no-imprimir"><p role="status">{total} resultados · CSV y PDF incluyen el conjunto completo de este filtro.</p><button class="secundario" disabled={exportando} on:click={exportarCSV}>{exportando ? 'Preparando…' : 'Exportar CSV'}</button><button class="secundario" disabled={exportando} on:click={exportarPDF}>{exportando ? 'Preparando…' : 'Imprimir / guardar PDF'}</button></div>{#if mensajeExportacion}<p role="status" class="exito no-imprimir">{mensajeExportacion}</p>{/if}<!-- svelte-ignore a11y_no_noninteractive_tabindex (La tabla desborda en móvil; la región necesita foco para desplazarse con teclado.) --><div class="tabla" role="region" aria-label="Resultados del reporte" tabindex="0"><table><thead><tr>{#each columnasTabla as columna (columna)}<th>{columna.replaceAll('_', ' ')}</th>{/each}</tr></thead><tbody>{#each registrosTabla as registro, indice (indice)}<tr>{#each columnasTabla as columna (columna)}<td><pre>{mostrar(registro[columna])}</pre></td>{/each}</tr>{/each}</tbody></table></div>
    {#if aplicado?.tipo !== 'notificaciones'}<div class="paginacion"><button disabled={offset === 0 || exportando} on:click={() => {offset -= 20; cargar();}}>Anterior</button><span>{offset + 1}-{Math.min(offset + 20, total)} de {total}</span><button disabled={offset + 20 >= total || exportando} on:click={() => {offset += 20; cargar();}}>Siguiente</button></div>{/if}{/if}
  {/if}
</section>
<style>fieldset { border: 0; padding: 0; min-width: 0; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 42ch; min-width: 12ch; font: inherit; } .casilla { display: flex; align-items: center; gap: 12px; min-height: 44px; } .casilla input { width: 24px; flex: 0 0 24px; } .acciones-exportacion { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 22px 0 14px; } .acciones-exportacion p { flex: 1 1 100%; margin: 0; color: #52666d; font-size: 13px; } .acciones-exportacion button { min-height: 44px; } .exito { color: #145b52; background: #e7f2ed; padding: 12px; border-radius: 6px; } @media print { :global(header), :global(footer), .no-imprimir, form { display: none !important; } :global(main) { width: 100% !important; padding: 0 !important; } .tabla { overflow: visible !important; border: 0 !important; } table { width: 100%; font-size: 9pt; } pre { max-width: none; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; } tr { break-inside: avoid; } th { print-color-adjust: exact; } }</style>
