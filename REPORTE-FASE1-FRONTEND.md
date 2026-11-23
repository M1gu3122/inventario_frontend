# Fase 1 frontend: entrega para integración

Fecha: 2026-11-22. Implementación realizada exclusivamente en frontend/, sin commit.
Contrato: `C:/Users/mglmo/orca/workspaces/INVENTARIO_IT/phase1-backend-opencode/backend/openapi.json`, backend indicado por coordinación en `c2510a6c6a663a46db76f121d5b4d3f0f64ce62f`.

## Flujos implementados

- `/importacion`: plantilla desde respuesta JSON convertida a descarga CSV; selección de archivo, encoding y delimitador; instrucciones para encabezados; dry-run multipart sin escritura; detalles y errores por fila; bloqueo de archivos vacíos, inválidos, omitidos o de vista incompleta; advertencia y checkbox independiente de sobrescritura; botón final independiente. Archivo/configuración nuevos invalidan la vista. Un rechazo final exige nueva validación. Se verifica el resultado final contra todas las filas esperadas y los contadores creados/actualizados: errores o procesamiento parcial nunca producen mensaje de éxito.
- `/licencias`: listado paginado y filtro solo vigentes; totales/usados/disponibles del resumen; fechas y días de vigencia; formulario compartido crear/editar con POST/PUT; asignación de varios asientos a empleado o activo; directorio paginado de titulares y UUID directo; liberación explícita con motivo obligatorio y confirmación; historial paginado al desactivar solo activas. Las asignaciones se conservan por su ID, sin agrupar ni reemplazar por titular. Escrituras vuelven a consultar listados y resumen.
- `/auditoria`: navegación y consulta restringidas a admin/auditor; acciones, tipo/UUID de entidad, UUID de actor y fechas convertidas a UTC; paginación; detalle de solo lectura del registro devuelto; estados carga/vacío/error/403 y reintento.
- `/`: panel de KPIs reales para admin/auditor y navegación a los siete reportes; conserva información de sesión anterior.
- `/reportes`: inventario, responsables, historial de activo, licencias, mantenimientos, propuestas y notificaciones; filtros documentados por tipo, paginación de reportes, errores y estados vacíos. Columnas de resultados según los diccionarios realmente devueltos.
- Navbar: enlaces por rol, aria-current, objetivos de 44 px y salto de navegación para tablet; paleta y componentes existentes conservados.
- Servicio de autenticación: deja al navegador generar el boundary de multipart, conserva errores estructurados y mantiene mensaje útil cuando el servidor no devuelve JSON.

## Permisos y límites del contrato

- Gestión de licencias e importación: encargado. Asignar/liberar: encargado o técnico. Lectura de licencias: los cuatro roles TI.
- KPIs, todos los reportes y notificaciones están bajo `/api/v1/auditoria`, accesibles exclusivamente para admin/auditor. No se inventó un dashboard disponible para encargado/técnico.
- No existe un parámetro OpenAPI para mapeo configurable de columnas CSV. La pantalla explica adaptar encabezados a la plantilla; no envía propiedades de mapeo inexistentes.
- No existe endpoint de detalle individual de auditoría. El detalle muestra el registro de la página consultada.
- Las salidas de reportes/KPIs/notificaciones son `dict` en OpenAPI. Se renderizan los campos recibidos; el KPI de garantías no se presenta porque la implementación backend lo documenta como placeholder de Fase 3.
- Notificaciones: listado in-app, sin inventar marcar como leída, envío externo o paginación no documentada.
- Filtros UUID de reportes/auditoría aceptan identificadores; la asignación de licencias además ofrece selector de titulares.

## Archivos modificados

- `frontend/src/lib/components/Navbar.svelte`
- `frontend/src/lib/services/api_auth.js`
- `frontend/src/routes/+page.svelte`
- `frontend/tests/api_auth.test.js`

## Archivos nuevos

- `frontend/src/lib/services/api_importacion.js`
- `frontend/src/lib/services/api_licencias.js`
- `frontend/src/lib/services/api_auditoria.js`
- `frontend/src/routes/importacion/+page.svelte`
- `frontend/src/routes/licencias/+page.svelte`
- `frontend/src/routes/auditoria/+page.svelte`
- `frontend/src/routes/reportes/+page.svelte`
- `frontend/tests/api_fase1.test.js`
- `frontend/tests/e2e/fase1.spec.js`
- `frontend/REPORTE-FASE1-FRONTEND.md`

## Verificación ejecutada

1. `npm run check --prefix frontend`: PASS, 0 errores y 0 advertencias de svelte-check.
2. `npm test --prefix frontend`: PASS, 5 archivos / 24 pruebas. Incluye multipart real del servicio autenticado, errores de campos, fallback sin JSON, rutas/cuerpos contractuales, múltiples asientos y separación dry-run/confirmar.
3. `npm run build --prefix frontend`: PASS, cliente/SSR y adapter-node. Repetido después del último cambio de navegación.
4. `npm run test:e2e --prefix frontend -- tests/e2e/fase1.spec.js tests/e2e/activos.spec.js tests/e2e/propuestas.spec.js tests/e2e/layout.spec.js --workers=2`: PASS, 72/72 en desktop/mobile, 40.4 s. API simulada en pruebas funcionales; no constituye integración real con el backend pendiente de merge.
5. `npm run test:e2e --prefix frontend -- tests/e2e/fase1.spec.js --workers=2`: PASS, 24/24, 16.2 s, después de los ajustes finales de errores y capturas.
6. `npm run test:e2e --prefix frontend -- tests/e2e/fase1.spec.js --grep 'rutas nuevas' --workers=2`: PASS, 8/8, 11.7 s, después del ajuste visual del Navbar a 1024 px.
7. `git diff --check -- frontend`: PASS; sin fetch en rutas/componentes según búsqueda. No se añadieron stores, capas, dependencias ni archivos server de SvelteKit.

Las pruebas nuevas cubren descarga de plantilla, invalidación de vista al cambiar delimitador, errores por fila, bloqueo de sobrescritura, resultado parcial y rechazo, crear/editar licencias, selector de titular, múltiples asignaciones/asientos, liberación con motivo, historial, filtros/paginación/detalle/vacío/403 de auditoría, gating técnico, todos los reportes, carga/disabled/error, KPIs y contención horizontal a 375/768/1024/1440 px con reduced-motion. Capturas de reportes de los cuatro anchos están en `frontend/test-results/fase1-rutas-nuevas-a-<ancho>px-foco-y-contención-horizontal-{desktop,mobile}/reportes-<ancho>.png` (artefactos ignorados por Git); se inspeccionaron visualmente los cuatro anchos y se corrigió el salto de navegación a 1024 px. Las tablas desplazables tienen región con nombre y foco de teclado; se documenta localmente la supresión de la advertencia Svelte sobre tabindex de regiones no interactivas.

Incidencias de ejecución previas resueltas: patrones UUID literales necesitaban expresión Svelte para conservar las llaves; se corrigieron y las pruebas pasan. La primera ejecución amplia con diez procesos produjo 7 fallos de espera de hidratación/sesión en pruebas existentes, resueltos al repetir con dos procesos, y 6 fallos de catálogos por falta de E2E_PASSWORD; no se modificaron sus pruebas ni se suministraron credenciales. Las pruebas de catálogos/autenticación contra API real quedan para coordinación. Persiste el aviso previo de deprecación config.alias de SvelteKit, fuera del cambio funcional.

## Pendiente para coordinación

Integrar el backend aprobado y ejecutar E2E contra API real con credenciales de prueba; comprobar transacciones CSV y cupos concurrentes en esa integración. No se ejecutaron Azure/Graph/OCR ni se alteraron Docker, backend/, docs/, otros worktrees o los archivos sucios previos del coordinador; no hubo commit, push, publicación ni despliegue.
