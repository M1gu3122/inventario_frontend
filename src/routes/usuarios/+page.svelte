<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listarUsuarios, obtenerUsuarios, crearUsuarios, actualizarUsuarios } from '#lib/services/api_usuarios.js';
  const sesion = getContext('sesion');
  const rolesDisponibles = [{ codigo: 'admin', nombre: 'Administrador' }, { codigo: 'encargado', nombre: 'Encargado' }, { codigo: 'tecnico', nombre: 'Técnico' }, { codigo: 'auditor', nombre: 'Auditor' }];
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
  let nombreCompleto = '';
  let correo = '';
  let contrasena = '';
  let roles = [];
  let activo = true;
  $: administrador = Boolean($sesion.usuario?.roles.includes('admin'));
  $: propiaCuenta = idEditando === $sesion.usuario?.id;
  $: if (montada && $sesion.estado === 'anonima') goto('/login');
  $: if (montada && $sesion.estado === 'autenticada' && administrador && !inicializada) { inicializada = true; cargar(); }
  onMount(() => { montada = true; });

  function informarError(error) { errorOperacion = error.message; if (error.status === 401) sesion.set({ estado: 'anonima', usuario: null, error: '' }); }
  async function cargar() {
    cargando = true; errorOperacion = '';
    try { const pagina = await listarUsuarios({ offset, limit: limite, q: busqueda.trim(), activo: filtroActivo }); registros = pagina.items; total = pagina.total; }
    catch (error) { informarError(error); } finally { cargando = false; }
  }
  function limpiarFormulario() { idEditando = null; nombreCompleto = ''; correo = ''; contrasena = ''; roles = []; activo = true; }
  async function prepararEdicion(id) {
    guardando = true; errorOperacion = ''; mensaje = '';
    try { const registro = await obtenerUsuarios(id); idEditando = registro.id; nombreCompleto = registro.nombre_completo; correo = registro.correo; roles = [...registro.roles]; activo = registro.activo; contrasena = ''; }
    catch (error) { informarError(error); } finally { guardando = false; }
  }
  async function guardar(evento) {
    evento.preventDefault(); if (guardando) return;
    guardando = true; errorOperacion = ''; mensaje = '';
    try {
      if (!roles.length) throw new Error('Selecciona al menos un rol para esta cuenta.');
      const datos = { nombre_completo: nombreCompleto.trim(), correo: correo.trim(), roles };
      if (idEditando) await actualizarUsuarios(idEditando, { ...datos, activo });
      else await crearUsuarios({ ...datos, password: contrasena });
      mensaje = 'Usuario guardado. Los permisos se aplican a sus próximas solicitudes.';
      limpiarFormulario(); await cargar();
    } catch (error) { informarError(error); } finally { guardando = false; }
  }
  async function filtrar(evento) { evento.preventDefault(); offset = 0; await cargar(); }
  async function cambiarPagina(paso) { offset = Math.max(0, offset + paso * limite); await cargar(); }
</script>

<svelte:head><title>Usuarios y roles · Inventario TI</title></svelte:head>
<div class="pagina-catalogo">
  <h1>Usuarios y roles</h1><p class="descripcion">Administra el acceso del equipo de TI. Los permisos se acumulan cuando una cuenta tiene varios roles.</p>
  {#if $sesion.estado === 'error'}<p class="error" role="alert">{$sesion.error}</p>{/if}
  {#if $sesion.estado === 'autenticada' && !administrador}<p class="error" role="alert">Esta sección requiere el rol de administrador.</p><a href="/">Volver al inicio</a>
  {:else if $sesion.estado === 'autenticada' && administrador}
    <form class="barra" on:submit={filtrar}><div><label for="buscar-usuario">Buscar usuario</label><input id="buscar-usuario" type="search" bind:value={busqueda} placeholder="Nombre o correo" /></div><div><label for="estado-usuario">Estado</label><select id="estado-usuario" bind:value={filtroActivo}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></div><button type="submit" disabled={cargando || guardando}>Consultar</button></form>
    {#if errorOperacion}<p class="error" role="alert">{errorOperacion}</p>{/if}{#if mensaje}<p class="exito" role="status">{mensaje}</p>{/if}
    {#if cargando}<p role="status">Cargando usuarios…</p>{:else if !errorOperacion && !registros.length}<div class="vacio">No hay usuarios para esta consulta.</div>{:else if registros.length}
      <div class="tabla" role="region" aria-label="Listado de usuarios"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Roles</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{#each registros as registro (registro.id)}<tr><td><strong>{registro.nombre_completo}</strong>{registro.id === $sesion.usuario.id ? ' (tu cuenta)' : ''}</td><td>{registro.correo}</td><td>{registro.roles.map((codigo) => rolesDisponibles.find((rol) => rol.codigo === codigo)?.nombre || codigo).join(', ')}</td><td><span class="estado" class:inactivo={!registro.activo}>{registro.activo ? 'Activo' : 'Inactivo'}</span></td><td><button class="secundario" on:click={() => prepararEdicion(registro.id)} disabled={guardando} aria-label={`Editar ${registro.nombre_completo}`}>Editar</button></td></tr>{/each}</tbody></table></div>
    {/if}
    <div class="paginacion"><span>{total} usuarios · Página {Math.floor(offset / limite) + 1}</span><div class="acciones"><button class="secundario" disabled={!offset || cargando} on:click={() => cambiarPagina(-1)}>Anterior</button><button class="secundario" disabled={offset + limite >= total || cargando} on:click={() => cambiarPagina(1)}>Siguiente</button></div></div>
    <form class="editor" on:submit={guardar} aria-busy={guardando}><h2>{idEditando ? 'Editar usuario' : 'Crear usuario'}</h2><div class="campos">
      <div><label for="nombre-usuario">Nombre completo</label><input id="nombre-usuario" bind:value={nombreCompleto} required maxlength="255" autocomplete="off" /></div>
      <div><label for="correo-usuario">Correo de acceso</label><input id="correo-usuario" type="email" bind:value={correo} required maxlength="254" autocomplete="off" /></div>
      {#if !idEditando}<div><label for="password-usuario">Contraseña inicial</label><input id="password-usuario" type="password" bind:value={contrasena} required minlength="8" maxlength="256" autocomplete="new-password" /><p class="ayuda">Mínimo 8 caracteres. Comunícala al usuario por un canal seguro.</p></div>{/if}
      {#if idEditando}<div><label for="activo-usuario">Estado de la cuenta</label><select id="activo-usuario" bind:value={activo} disabled={propiaCuenta}><option value={true}>Activo</option><option value={false}>Inactivo</option></select>{#if propiaCuenta}<p class="ayuda">No puedes desactivar tu propia cuenta.</p>{/if}</div>{/if}
      <fieldset class="amplio"><legend>Roles de acceso</legend><div class="opciones-roles">{#each rolesDisponibles as rol (rol.codigo)}<label class="opcion-rol"><input type="checkbox" bind:group={roles} value={rol.codigo} disabled={propiaCuenta && rol.codigo === 'admin'} />{rol.nombre}</label>{/each}</div><p class="ayuda">Administrador configura usuarios y catálogos; encargado opera el inventario; técnico registra movimientos; auditor consulta información.</p></fieldset>
    </div><div class="acciones"><button type="submit" disabled={guardando || cargando}>{guardando ? 'Guardando…' : 'Guardar usuario'}</button>{#if idEditando}<button class="secundario" type="button" on:click={limpiarFormulario} disabled={guardando}>Cancelar edición</button>{/if}</div></form>
  {:else if $sesion.estado === 'cargando'}<p role="status">Recuperando sesión…</p>{/if}
</div>

<style>
  legend { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
  .opciones-roles { display: flex; flex-wrap: wrap; gap: 12px 28px; }
  .pagina-catalogo .opcion-rol { display: flex; align-items: center; gap: 10px; min-height: 44px; font-weight: 400; }
  .pagina-catalogo .opcion-rol input { width: 18px; height: 18px; min-height: 0; accent-color: #145b52; }
</style>

