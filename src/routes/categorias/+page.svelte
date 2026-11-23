<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarCategorias, obtenerCategorias, crearCategorias, actualizarCategorias } from '#lib/services/api_categorias.js';
  const sesion = getContext('sesion');
  let montada = false;
  let inicializada = false;
  let registros = [];
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
  let campos = [];
  let activa = true;
  $: administrador = Boolean($sesion.usuario?.roles.includes('admin'));
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && !inicializada) { inicializada = true; cargar(); }
  onMount(() => { montada = true; });

  function informarError(error) { errorOperacion = error.message; if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' }); }
  async function cargar() {
    cargando = true; errorOperacion = '';
    try { const pagina = await listarCategorias({ offset, limit: limite, q: busqueda.trim(), activo: filtroActivo }); registros = pagina.items; total = pagina.total; }
    catch (error) { informarError(error); } finally { cargando = false; }
  }
  function limpiarFormulario() { idEditando = null; codigo = ''; nombre = ''; campos = []; activa = true; }
  function agregarCampo() { campos = [...campos, { id: crypto.randomUUID(), clave: '', tipo: 'texto', requerido: false }]; }
  function quitarCampo(id) { campos = campos.filter((campo) => campo.id !== id); }
  async function prepararEdicion(id) {
    guardando = true; mensaje = ''; errorOperacion = '';
    try { const registro = await obtenerCategorias(id); idEditando = registro.id; codigo = registro.codigo; nombre = registro.nombre; campos = Object.entries(registro.esquema_campos).map(([clave, definicion]) => ({ id: crypto.randomUUID(), clave, ...definicion })); activa = registro.activa; }
    catch (error) { informarError(error); } finally { guardando = false; }
  }
  async function guardar(evento) {
    evento.preventDefault(); if (guardando) return;
    guardando = true; errorOperacion = ''; mensaje = '';
    try {
      const nombresCampos = campos.map((campo) => campo.clave.trim());
      if (new Set(nombresCampos).size !== nombresCampos.length) throw new Error('Cada campo personalizado debe tener un nombre diferente.');
      if (nombresCampos.some((clave) => ['constructor', 'prototype', '__proto__'].includes(clave))) throw new Error('Ese nombre de campo está reservado. Usa otro nombre.');
      const esquemaCampos = Object.fromEntries(campos.map((campo) => [campo.clave.trim(), { tipo: campo.tipo, requerido: campo.requerido }]));
      const datos = { codigo: codigo.trim().toUpperCase(), nombre: nombre.trim(), esquema_campos: esquemaCampos };
      if (idEditando) await actualizarCategorias(idEditando, { ...datos, activa }); else await crearCategorias(datos);
      mensaje = 'Categoría guardada correctamente.'; limpiarFormulario(); await cargar();
    } catch (error) { informarError(error); } finally { guardando = false; }
  }
  async function filtrar(evento) { evento.preventDefault(); offset = 0; await cargar(); }
  async function cambiarPagina(paso) { offset = Math.max(0, offset + paso * limite); await cargar(); }
</script>

<svelte:head><title>Categorías · Inventario TI</title></svelte:head>
<div class="pagina-catalogo">
  <h1>Categorías</h1><p class="descripcion">Organiza los tipos de activos y define los datos específicos que necesita cada categoría.</p>
  {#if $sesion.estado === 'error'}<p class="error" role="alert">{$sesion.error}</p>{/if}
  {#if $sesion.estado === 'autenticada'}
    <form class="barra" on:submit={filtrar}><div><label for="buscar-categoria">Buscar categoría</label><input id="buscar-categoria" type="search" bind:value={busqueda} placeholder="Nombre o código" /></div><div><label for="estado-categoria">Estado</label><select id="estado-categoria" bind:value={filtroActivo}><option value="">Todos</option><option value="true">Activas</option><option value="false">Inactivas</option></select></div><button type="submit" disabled={cargando || guardando}>Consultar</button></form>
    {#if errorOperacion}<p class="error" role="alert">{errorOperacion}</p>{/if}{#if mensaje}<p class="exito" role="status">{mensaje}</p>{/if}
    {#if cargando}<p role="status">Cargando categorías…</p>{:else if !errorOperacion && !registros.length}<div class="vacio">No hay categorías para esta consulta.</div>{:else if registros.length}
      <div class="tabla" role="region" aria-label="Listado de categorías"><table><thead><tr><th>Código</th><th>Categoría</th><th>Campos personalizados</th><th>Estado</th>{#if administrador}<th>Acciones</th>{/if}</tr></thead><tbody>{#each registros as registro (registro.id)}<tr><td>{registro.codigo}</td><td><strong>{registro.nombre}</strong></td><td>{Object.keys(registro.esquema_campos).join(', ') || 'Sin campos adicionales'}</td><td><span class="estado" class:inactivo={!registro.activa}>{registro.activa ? 'Activa' : 'Inactiva'}</span></td>{#if administrador}<td><button class="secundario" on:click={() => prepararEdicion(registro.id)} disabled={guardando} aria-label={`Editar ${registro.nombre}`}>Editar</button></td>{/if}</tr>{/each}</tbody></table></div>
    {/if}
    <div class="paginacion"><span>{total} categorías · Página {Math.floor(offset / limite) + 1}</span><div class="acciones"><button class="secundario" disabled={!offset || cargando} on:click={() => cambiarPagina(-1)}>Anterior</button><button class="secundario" disabled={offset + limite >= total || cargando} on:click={() => cambiarPagina(1)}>Siguiente</button></div></div>
    {#if administrador}<form class="editor" on:submit={guardar} aria-busy={guardando}><h2>{idEditando ? 'Editar categoría' : 'Registrar categoría'}</h2><div class="campos">
      <div><label for="codigo-categoria">Código de categoría</label><input id="codigo-categoria" bind:value={codigo} required pattern="[A-Za-z]+" maxlength="255" /><p class="ayuda">Solo letras. Se usará en el código interno de los activos.</p></div>
      <div><label for="nombre-categoria">Nombre</label><input id="nombre-categoria" bind:value={nombre} required maxlength="255" /></div>
      <fieldset class="amplio"><legend>Campos personalizados</legend><p class="ayuda">Define solo los datos adicionales de esta categoría. Por ejemplo, ram_gb o sistema_operativo.</p>
        {#each campos as campo (campo.id)}<div class="fila-campo">
          <div><label for={`campo-${campo.id}`}>Nombre del campo</label><input id={`campo-${campo.id}`} bind:value={campo.clave} required pattern="[a-z][a-z0-9_]*" maxlength="64" placeholder="ram_gb" /></div>
          <div><label for={`tipo-${campo.id}`}>Tipo de dato</label><select id={`tipo-${campo.id}`} bind:value={campo.tipo}><option value="texto">Texto</option><option value="numero">Número</option><option value="booleano">Sí / No</option><option value="fecha">Fecha</option></select></div>
          <div><label for={`requerido-${campo.id}`}>Obligatorio</label><select id={`requerido-${campo.id}`} bind:value={campo.requerido}><option value={false}>No</option><option value={true}>Sí</option></select></div>
          <button type="button" class="secundario" on:click={() => quitarCampo(campo.id)} disabled={guardando} aria-label={`Quitar campo ${campo.clave || 'sin nombre'}`}>Quitar</button>
        </div>{/each}
        <button type="button" class="secundario" on:click={agregarCampo} disabled={guardando}>Añadir campo</button>
      </fieldset>
      {#if idEditando}<div><label for="activa-categoria">Estado de la categoría</label><select id="activa-categoria" bind:value={activa}><option value={true}>Activa</option><option value={false}>Inactiva</option></select></div>{/if}
    </div><div class="acciones"><button type="submit" disabled={guardando || cargando}>{guardando ? 'Guardando…' : 'Guardar categoría'}</button>{#if idEditando}<button type="button" class="secundario" on:click={limpiarFormulario} disabled={guardando}>Cancelar edición</button>{/if}</div></form>{/if}
  {:else if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión…</p>{/if}
</div>

<style>
  legend { font-size: 14px; font-weight: 600; }
  .fila-campo { display: grid; grid-template-columns: 2fr 1fr 1fr auto; align-items: end; gap: 12px; margin: 16px 0; }
  @media (max-width: 700px) { .fila-campo { grid-template-columns: 1fr 1fr; border-bottom: 1px solid #d5dfe2; padding-bottom: 18px; } }
</style>

