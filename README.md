# Frontend Inventario TI

Desde frontend/: `npm ci`, `npm run dev`. Navegador: http://localhost:5173/login.

La API real debe ejecutarse en http://localhost:8000; VITE_API_ORIGIN permite configurar otro origen publico en build (.env local ignorado). API_PROXY_TARGET configura proxy Vite cuando se use origen relativo. Nunca colocar secretos en variables VITE_.

## Verificacion

- `npm run check`: diagnostico Svelte sin errores ni advertencias de componentes.
- `npm run test`: pruebas de servicios auth (HTTP simulado solo en tests).
- `npm run build`: construccion Node.
- `npx playwright install chromium`: navegador de pruebas.
- `npm run test:e2e`: API real y variables E2E_EMAIL/E2E_PASSWORD de una cuenta demo. Sin estas variables, la integracion falla, no se omite.

Playwright verifica escritorio y movil, login, restauracion tras recarga, logout, rechazo real y almacenamiento del navegador sin tokens. Capturas en test-results/ (ignorado).

`E2E_BASE_URL=http://localhost:3000` permite comprobar el build Node ya iniciado, sin levantar Vite. La API debe permitir ese origen. El historial interno SvelteKit puede usar sessionStorage; se verifica que ninguna credencial/token se persista y que no existan claves de aplicacion ajenas a las claves internas conocidas.

## Estructura

Solo pages/layout en routes; componentes autocontenidos en lib/components; HTTP en lib/services/api_auth.js. Tests fuera de src. Convenciones tradicionales Svelte; no runes ni TypeScript. No datos de respaldo ficticios ni persistencia local de tokens.

## Decisiones tecnicas

Kit3 no admite svelte.config.js; preprocess/adapter configurados en vite.config.js. Alias $lib conserva la guia aunque Kit3 avisa de deprecacion. Variables publicas mediante Vite evitan agregar modulo extra src/env.js. Estilos globales importados en :global del layout.

`npm audit` informa cuatro hallazgos low derivados de deepmerge4.3.1, usado por tooling de configuracion confiable. No hay parche publicado en ese paquete al verificar; no ejecutar audit fix --force porque propone versiones incompatibles antiguas. Reevaluar al actualizar tooling. No se considera que estas observaciones sustituyan pruebas funcionales.
