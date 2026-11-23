import { expect, test } from '@playwright/test';
const uuid = '11111111-1111-4111-8111-111111111111';
async function preparar(page, rol = 'encargado') {
  const llamadas = [];
  const licencia = {id: uuid, producto: 'Suite TI', proveedor: 'Proveedor', asientos_totales: 10, vigencia_inicio: '2026-01-01', vigencia_fin: '2027-01-01', costo: '100', observaciones: ''};
  const estado = {invalida: false, parcial: false, rechazo: false, vacio: false, asignaciones: [{id:'as1', titular_tipo:'empleado', titular_id:uuid, asientos:2, asignada_en:'2026-11-01', liberada_en:null, motivo_liberacion:null}, {id:'as2', titular_tipo:'empleado', titular_id:uuid, asientos:1, asignada_en:'2026-10-01', liberada_en:'2026-10-31', motivo_liberacion:'Fin de proyecto'}]};
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), ruta = url.pathname;
    const cumplir = (body, status = 200) => route.fulfill({status, contentType:'application/json', headers:{'access-control-allow-origin':'http://localhost:5173','access-control-allow-credentials':'true','access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-allow-headers':'Authorization, Content-Type'},body:JSON.stringify(body)});
    if(req.method() === 'OPTIONS') return cumplir({});
    llamadas.push({ruta, metodo:req.method(), cuerpo:req.postData(), consulta:url.search});
    if(ruta.endsWith('/auth/refresh')) return cumplir({access_token:'test',user:{id:uuid,email:'ti@example.test',roles:[rol]}});
    if(estado.rechazo) return cumplir({detail:'Permiso denegado'},403);
    const pagina = items => ({items, total:items.length,offset:0,limit:20});
    if(ruta.endsWith('/importacion/plantilla')) return cumplir({contenido:'categoria_codigo,ubicacion_codigo,marca,modelo,serial\n', encoding:'utf-8', delimitador:','});
    if(ruta.endsWith('/importacion/dry-run')) return cumplir({total_filas:1,filas_validas:estado.invalida?0:1,filas_invalidas:estado.invalida?1:0,filas_crear:0,filas_actualizar:1,filas_omitir:0,detalles:[{numero_fila:2,valida:!estado.invalida,accion:'actualizar',datos:{serial:'SN-1'},errores:estado.invalida?['Serial inválido']:[]}]});
    if(ruta.endsWith('/importacion/confirmar')) return cumplir({creados:0,actualizados:estado.parcial?0:1,total_procesados:estado.parcial?0:1,errores:estado.parcial?['Fila rechazada']:[]});
    if(ruta.endsWith('/licencias/resumen')) return cumplir([{...licencia,asientos_usados:2,asientos_disponibles:8,dias_para_vencer:40,por_vencer:false}]);
    if(ruta === '/api/v1/empleados') return cumplir(pagina([{id:uuid,nombre_completo:'Ana Pérez',documento:'123'}]));
    if(ruta === '/api/v1/activos') return cumplir(pagina([{id:uuid,codigo_interno:'TI-COM-001',marca:'Dell',modelo:'Latitude'}]));
    if(ruta === '/api/v1/licencias') return cumplir(req.method()==='GET'?pagina([licencia]):licencia);
    if(ruta === '/api/v1/licencias/'+uuid) return cumplir(licencia);
    if(ruta.endsWith('/asignaciones') && req.method()==='GET') return cumplir(pagina(estado.asignaciones.filter(a => url.searchParams.get('solo_activas')==='false'||!a.liberada_en)));
    if(ruta.endsWith('/asignaciones') && req.method()==='POST') {const d=req.postDataJSON();estado.asignaciones.push({id:'as3',...d,asignada_en:'2026-11-22',liberada_en:null});return cumplir(estado.asignaciones.at(-1));}
    if(ruta.endsWith('/liberar')) {estado.asignaciones[0].liberada_en='2026-11-22';estado.asignaciones[0].motivo_liberacion=req.postDataJSON().motivo;return cumplir(estado.asignaciones[0]);}
    if(ruta.endsWith('/auditoria/acciones')) return cumplir(['activo_creado']);
    if(ruta.endsWith('/auditoria/logs')) return cumplir(estado.vacio?pagina([]):{items:[{id:'log1',accion:'activo_creado',actor_correo:'ti@example.test',entidad_tipo:'activo',entidad_id:uuid,creado_en:'2026-11-22',detalle:{serial:'SN-1'}}],total:21,offset:Number(url.searchParams.get('offset')),limit:20});
    if(ruta.endsWith('/reportes/kpis')) return cumplir({total_operativos:10,asignados:4,disponibles:6});
    if(ruta.endsWith('/notificaciones')) return cumplir([{tipo:'licencia',mensaje:'Licencia próxima a vencer'}]);
    if(ruta.includes('/reportes/')) return cumplir(estado.vacio?pagina([]):pagina([{id:uuid,producto:'Suite TI',estado:'disponible'}]));
    return cumplir({detail:'Ruta inesperada '+ruta},404);
  });
  return {llamadas,estado};
}
async function archivo(page, contenido = 'categoria_codigo,ubicacion_codigo,marca,modelo,serial\nCOM,UBI1,Dell,Latitude,SN-1') {await page.getByLabel('Archivo CSV').setInputFiles({name:'activos.csv',mimeType:'text/csv',buffer:Buffer.from(contenido)});}
test('CSV: mapea encabezados personalizados y conserva el mapeo al confirmar',async({page})=>{
 const {llamadas}=await preparar(page);await page.goto('/importacion');
 await archivo(page,'Category,Location,Brand,Model,Serial Number\nCOM,UBI1,Dell,Latitude,SN-1');
 await expect(page.getByLabel('Código de categoría')).toBeVisible();
 const mapeo={categoria_codigo:'Category',ubicacion_codigo:'Location',marca:'Brand',modelo:'Model',serial:'Serial Number'};
 await page.getByLabel('Código de categoría').selectOption('Category');await page.getByLabel('Código de ubicación').selectOption('Location');await page.getByLabel('Marca').selectOption('Brand');await page.getByLabel('Modelo').selectOption('Model');await page.getByLabel('Serial del activo').selectOption('Serial Number');
 await page.getByRole('button',{name:'2. Validar sin importar'}).click();await expect(page.getByRole('heading',{name:'Vista previa'})).toBeVisible();
 const solicitudDryRun=llamadas.find(c=>c.ruta.endsWith('/importacion/dry-run')).cuerpo;expect(solicitudDryRun).toContain('mapeo_columnas');expect(solicitudDryRun).toContain(JSON.stringify(mapeo));
 await page.getByLabel('Confirmo sobrescribir los activos existentes').check();await page.getByRole('button',{name:'3. Importar definitivamente'}).click();
 const solicitudConfirmacion=llamadas.find(c=>c.ruta.endsWith('/importacion/confirmar')).cuerpo;expect(solicitudConfirmacion).toContain(JSON.stringify(mapeo));
});
test('CSV: plantilla, errores por fila, confirmación explícita y resultado parcial',async({page})=>{
  const {llamadas,estado}=await preparar(page);await page.goto('/importacion');
  const descarga=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar plantilla CSV'}).click();expect((await descarga).suggestedFilename()).toBe('plantilla-activos.csv');
  estado.invalida=true;await archivo(page);await page.getByRole('button',{name:'2. Validar sin importar'}).click();await expect(page.getByText('Serial inválido')).toBeVisible();await expect(page.getByRole('button',{name:'3. Importar definitivamente'})).toBeDisabled();
  estado.invalida=false;await page.getByRole('button',{name:'2. Validar sin importar'}).click();await expect(page.getByRole('button',{name:'3. Importar definitivamente'})).toBeDisabled();expect(llamadas.filter(c=>c.ruta.endsWith('/confirmar'))).toHaveLength(0);
  await page.getByLabel('Confirmo sobrescribir los activos existentes').check();await page.getByRole('button',{name:'3. Importar definitivamente'}).click();await expect(page.getByRole('status').filter({hasText:'Importación completada'})).toBeVisible();
  await page.getByRole('button',{name:'2. Validar sin importar'}).click();await page.getByLabel('Confirmo sobrescribir los activos existentes').check();await page.getByLabel('Delimitador').selectOption(';');await expect(page.getByRole('heading',{name:'Vista previa'})).toHaveCount(0);await expect(page.getByRole('button',{name:'2. Validar sin importar'})).toBeDisabled();
  await page.getByLabel('Delimitador').selectOption(',');await expect(page.getByRole('button',{name:'2. Validar sin importar'})).toBeEnabled();await page.getByRole('button',{name:'2. Validar sin importar'}).click();await page.getByLabel('Confirmo sobrescribir los activos existentes').check();estado.parcial=true;await page.getByRole('button',{name:'3. Importar definitivamente'}).click();await expect(page.getByRole('alert')).toContainText('incompleta');await expect(page.getByText('Importación completada:')).toHaveCount(0);
});
test('licencias: edición, múltiples asientos por titular, historial y liberación con motivo',async({page})=>{
  const {llamadas}=await preparar(page);await page.goto('/licencias');await expect(page.getByText('10 / 2 / 8')).toBeVisible();
  await page.getByRole('button',{name:'Editar Suite TI'}).click();await page.getByLabel('Producto',{exact:true}).fill('Suite actualizada');await page.getByRole('button',{name:'Guardar licencia'}).click();await expect.poll(()=>llamadas.some(c=>c.metodo==='PUT')).toBe(true);
  await page.getByRole('button',{name:'Asignaciones de Suite TI'}).click();await page.getByRole('button',{name:'Consultar titulares'}).click();await page.getByLabel('Seleccionar titular del directorio').selectOption(uuid);await page.getByLabel('Asientos a asignar').fill('3');await page.getByRole('button',{name:'Asignar asientos',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Asientos asignados'})).toBeVisible();
  const asignada=llamadas.find(c=>c.metodo==='POST'&&c.ruta.endsWith('/asignaciones'));expect(JSON.parse(asignada.cuerpo).asientos).toBe(3);
  await page.getByLabel('Solo asignaciones activas').uncheck();await expect(page.getByText('Fin de proyecto')).toBeVisible();await expect(page.getByRole('row').filter({hasText:uuid})).toHaveCount(3);
  await page.getByRole('button',{name:'Liberar asignación as1',exact:true}).click();await expect(page.getByRole('button',{name:'Confirmar liberación'})).toBeDisabled();await page.getByLabel('Motivo obligatorio').fill('Cambio de responsable');await page.getByRole('button',{name:'Confirmar liberación'}).click();await expect(page.getByRole('status').filter({hasText:'Asignación liberada'})).toBeVisible();expect(JSON.parse(llamadas.find(c=>c.ruta.endsWith('/liberar')).cuerpo)).toEqual({motivo:'Cambio de responsable'});
});
test('auditoría: filtros, paginación, detalle, vacío y 403',async({page})=>{
 const {llamadas,estado}=await preparar(page,'auditor');await page.goto('/auditoria');await page.getByLabel('Acción',{exact:true}).selectOption('activo_creado');await page.getByLabel('Desde (hora local)').fill('2026-11-01T08:00');await page.getByRole('button',{name:'Aplicar filtros'}).click();await page.getByRole('button',{name:'Siguiente',exact:true}).click();await expect.poll(()=>llamadas.some(c=>c.consulta.includes('offset=20')&&c.consulta.includes('desde='))).toBe(true);await page.getByRole('button',{name:'Ver registro log1'}).click();await expect(page.getByRole('heading',{name:'Detalle de auditoría'})).toBeVisible();
 estado.vacio=true;await page.getByRole('button',{name:'Aplicar filtros'}).click();await expect(page.getByText('No hay registros para los filtros seleccionados.')).toBeVisible();estado.rechazo=true;await page.getByRole('button',{name:'Aplicar filtros'}).click();await expect(page.getByRole('alert')).toContainText('403');
});
test('técnico: navegación restringida y acceso directo a auditoría sin peticiones',async({page})=>{
 const {llamadas}=await preparar(page,'tecnico');await page.goto('/auditoria');await expect(page.getByRole('alert')).toContainText('403');await expect(page.getByRole('link',{name:'Auditoría',exact:true})).toHaveCount(0);expect(llamadas.some(c=>c.ruta.includes('/auditoria/'))).toBe(false);
 await page.goto('/licencias');await expect(page.getByRole('button',{name:'Nueva licencia',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Asignaciones de Suite TI'}).click();await expect(page.getByRole('button',{name:'Asignar asientos',exact:true})).toBeVisible();
});
test('panel: KPIs y navegación de todos los reportes, historial y notificaciones',async({page})=>{
 const {llamadas}=await preparar(page,'admin');await page.goto('/');await expect(page.getByText('total operativos')).toBeVisible();
 await page.getByRole('navigation',{name:'Reportes operativos'}).getByRole('link',{name:'Licencias',exact:true}).click();await expect(page.getByLabel('Reporte',{exact:true})).toHaveValue('licencias');await expect(page.getByText('Suite TI')).toBeVisible();
 for(const tipo of ['inventario','responsables','mantenimientos','propuestas','notificaciones']) {await page.getByLabel('Reporte',{exact:true}).selectOption(tipo);await page.getByRole('button',{name:'Consultar reporte'}).click();await expect(page.getByRole('status').filter({hasText:'resultados'})).toBeVisible();}
 await expect(page.getByText('Licencia próxima a vencer')).toBeVisible();await page.getByLabel('Reporte',{exact:true}).selectOption('historial');await page.getByLabel('UUID del activo').fill(uuid);await page.getByRole('button',{name:'Consultar reporte'}).click();await expect.poll(()=>llamadas.some(c=>c.ruta.endsWith('/historial-activo/'+uuid))).toBe(true);
});
for(const ancho of [375,768,1024,1440]) test(`rutas nuevas a ${ancho}px, foco y contención horizontal`,async({page}, informacion)=>{
 await preparar(page,'admin');await page.setViewportSize({width:ancho,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 for(const ruta of ['/','/licencias','/auditoria','/reportes']) {await page.goto(ruta);await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByRole('status').filter({hasText:/Cargando|Recuperando/})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.screenshot({path:informacion.outputPath(`reportes-${ancho}.png`),fullPage:true});await page.getByLabel('Reporte',{exact:true}).focus();await expect(page.getByLabel('Reporte',{exact:true})).toBeFocused();expect(await page.getByLabel('Reporte',{exact:true}).evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});

test('errores de servidor, estados vacíos y carga visible sin éxito falso', async({page})=>{
 const {estado}=await preparar(page,'admin');
 let resolver; const espera=new Promise(r=>resolver=r);
 await page.route('**/api/v1/auditoria/reportes/inventario*',async route=>{await espera;await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'http://localhost:5173'},body:JSON.stringify({items:[],total:0,offset:0,limit:20})});});
 await page.goto('/reportes');await expect(page.getByRole('status').filter({hasText:'Cargando reporte'})).toBeVisible();await expect(page.getByRole('button',{name:'Consultar reporte'})).toBeDisabled();resolver();await expect(page.getByText('No hay resultados para esta consulta.')).toBeVisible();
 estado.rechazo=true;await page.getByLabel('Reporte',{exact:true}).selectOption('licencias');await page.getByRole('button',{name:'Consultar reporte'}).click();await expect(page.getByRole('alert')).toContainText('403');
 await page.goto('/');await expect(page.getByRole('alert')).toContainText('403');await page.goto('/licencias');await expect(page.getByRole('alert')).toContainText('403');
});
test('crear licencia usa POST y un rechazo de asignación conserva datos sin éxito',async({page})=>{
 const {llamadas,estado}=await preparar(page);await page.goto('/licencias');await page.getByRole('button',{name:'Nueva licencia',exact:true}).click();await page.getByLabel('Producto',{exact:true}).fill('Nueva suite');await page.getByLabel('Proveedor',{exact:true}).fill('Empresa');await page.getByLabel('Vigencia desde').fill('2026-01-01');await page.getByLabel('Vigencia hasta').fill('2027-01-01');await page.getByRole('button',{name:'Guardar licencia'}).click();await expect(page.getByRole('status').filter({hasText:'Licencia guardada'})).toBeVisible();expect(llamadas.some(c=>c.metodo==='POST'&&c.ruta==='/api/v1/licencias')).toBe(true);
 await page.getByRole('button',{name:'Asignaciones de Suite TI'}).click();await page.getByLabel('Tipo de titular').selectOption('activo');await page.getByLabel('UUID del titular').fill(uuid);estado.rechazo=true;await page.getByRole('button',{name:'Asignar asientos',exact:true}).click();await expect(page.getByRole('alert')).toContainText('403');await expect(page.getByLabel('UUID del titular')).toHaveValue(uuid);await expect(page.getByText('Asientos asignados.')).toHaveCount(0);
});
test('importación rechazada exige nueva validación y cabe a 375px',async({page})=>{
 const {estado}=await preparar(page);await page.setViewportSize({width:375,height:900});await page.goto('/importacion');await archivo(page);await page.getByRole('button',{name:'2. Validar sin importar'}).click();await page.getByLabel('Confirmo sobrescribir los activos existentes').check();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);estado.rechazo=true;await page.getByRole('button',{name:'3. Importar definitivamente'}).click();await expect(page.getByRole('alert')).toContainText('403');await expect(page.getByRole('button',{name:'3. Importar definitivamente'})).toHaveCount(0);await expect(page.getByRole('button',{name:'2. Validar sin importar'})).toBeEnabled();
});
