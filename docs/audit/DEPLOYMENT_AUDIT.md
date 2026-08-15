# Auditoría de despliegue y operación

Fecha: 2026-08-15  
Versión: `0.9.0-beta.1`  
Destino previsto: Render, una instancia

## Resumen

La configuración local de producción es coherente: `npm start` inicia el mismo servidor HTTP/Socket.IO, escucha en `0.0.0.0`, respeta `PORT`, valida variables, aplica cabeceras, caché diferenciada, cierre ordenado y expone un `/health` mínimo. Las pruebas de producción pasaron 4/4 y las rutas privadas ensayadas respondieron 404.

No puede aprobarse el despliegue desde el estado actual. HideTown está completamente sin seguimiento bajo una raíz Git `C:/` cuyo remoto pertenece a otro producto. Además, no se proporcionó ni descubrió una URL pública, servicio de Render o acceso a sus logs; por ello HTTPS/WSS, proxy real, suspensión/despertar, red externa y rollback no fueron verificados.

## Preparación observada

- `render.yaml` define servicio web Node, `npm install`, `npm start`, `/health`, `NODE_ENV=production` y una sola instancia.
- El proceso escucha en `0.0.0.0` y toma el puerto de `PORT`.
- El servidor confía un salto de proxy y activa HSTS cuando la petición se considera HTTPS.
- HTML y health usan política sin caché; assets versionables usan caché pública.
- `/health` responde solo `status` y versión; no revela salas o jugadores.
- Existe manejo de `SIGTERM`/`SIGINT`, cierre de Socket.IO/HTTP y limpieza de timers/limitadores.
- En local productivo, `/.env`, `/package.json`, `/server/server.js`, `/test/production.test.js` y `/docs/DEPLOYMENT.md` respondieron 404.

## Hallazgos

### DEPLOY-001 — Raíz y remoto Git ajenos; HideTown está completamente sin seguimiento

- **Severidad:** Alto.
- **Área:** control de versiones, entrega y seguridad operacional.
- **Evidencia:** `git rev-parse --show-toplevel` devuelve `C:/`; `origin` apunta a `https://github.com/Galindo1206/dg-soluciones-digitales.git`; `git status --short -- .` muestra `?? ./`; `git ls-files -- .` no lista ningún archivo de HideTown.
- **Archivo y ubicación:** metadatos Git en `C:\.git` (fuera del proyecto); árbol completo `C:\Dev\Web\HideTown` sin seguimiento.
- **Pasos para reproducir:** desde HideTown ejecutar los cuatro comandos Git anteriores y comparar raíz, remoto, estado e índice.
- **Resultado esperado:** repositorio deliberado de HideTown, remoto correcto, historial auditable y conjunto exacto de archivos de despliegue bajo seguimiento.
- **Resultado actual:** cualquier commit/push desde este contexto pertenece a otro repositorio y HideTown no tiene baseline recuperable.
- **Impacto:** despliegue no reproducible, imposibilidad de revisar diferencias/rollback y riesgo de incluir archivos ajenos o publicar el producto en el remoto equivocado.
- **Probabilidad:** alta si se intenta publicar sin corregir el contexto.
- **Recomendación:** detener publicación; crear o enlazar el repositorio correcto de HideTown, verificar `.gitignore`, revisar cada archivo que se añadirá y configurar el remoto intencionalmente. No copiar ni eliminar `C:\.git` sin decidir antes su propietario.
- **Esfuerzo estimado:** Bajo a medio.
- **Prueba futura:** raíz dentro de HideTown, remoto esperado, árbol limpio, clonación desde cero, instalación reproducible, suites completas y artefacto idéntico.

### DEPLOY-002 — Los health checks no quedan en logs con el nivel productivo

- **Severidad:** Bajo.
- **Área:** observabilidad.
- **Evidencia:** `/health` registra `health_check` mediante `logger.debug`; el valor por defecto de producción y `render.yaml` es `LOG_LEVEL=info`, por lo que el evento se suprime.
- **Archivo y ubicación:** `server/server.js:80-84`; `server/config/environment.js:38`; `render.yaml:14-15`.
- **Pasos para reproducir:** iniciar con `NODE_ENV=production` y `LOG_LEVEL=info`; solicitar `/health`; observar respuesta 200 y ausencia del evento debug.
- **Resultado esperado:** estrategia explícita para distinguir salud del proceso, reinicios y fallos sin generar ruido o datos sensibles.
- **Resultado actual:** Render puede usar la respuesta, pero el log de aplicación no deja rastro de checks correctos.
- **Impacto:** diagnóstico más difícil de intermitencias, despertares o reinicios; no afecta la respuesta de salud.
- **Probabilidad:** alta cuando se investigue una incidencia; impacto bajo.
- **Recomendación:** definir métricas/observabilidad apropiadas o registrar únicamente cambios/fallos de salud a nivel visible; evitar convertir cada check correcto en spam.
- **Esfuerzo estimado:** Bajo.
- **Prueba futura:** comprobar evento de fallo/transición, correlación con reinicio y ausencia de información privada bajo configuración real.

### DEPLOY-003 — Producción y URL pública no verificadas

- **Severidad:** Informativo.
- **Área:** validación de producción.
- **Evidencia:** documentación local indica que no hay URL/despliegue; una búsqueda pública acotada no encontró una instancia identificable. No hubo conexión a Render ni credenciales/panel proporcionados.
- **Archivo y ubicación:** `docs/DEPLOYMENT.md`; entorno externo no disponible.
- **Pasos para reproducir:** revisar la documentación y los datos de acceso disponibles para esta auditoría.
- **Resultado esperado:** URL inequívoca y acceso de solo lectura a estado/logs para verificar el servicio desplegado.
- **Resultado actual:** solo se pudo auditar el modo producción local.
- **Impacto:** no se puede afirmar que HTTPS/WSS, proxy, suspensión, recursos, logs, dos redes o rollback funcionen en Render.
- **Probabilidad:** certeza de cobertura faltante; no implica por sí misma un defecto del código.
- **Recomendación:** después de remediar los bloqueos, desplegar desde el repositorio correcto y ejecutar una lista de humo no destructiva en la URL real.
- **Esfuerzo estimado:** Medio, condicionado por acceso e infraestructura.
- **Prueba futura:** `/health`, HTTPS/HSTS, WSS y fallback, 3–6 clientes en dos redes, suspensión/despertar, logs sin secretos, límites, reinicio y rollback ensayado.

## Riesgos operativos y supuestos

- El diseño en memoria exige una sola instancia; reiniciar o dormir pierde salas activas.
- No existe persistencia ni coordinación horizontal; esto está aceptado para prototipo/beta pequeña, no para escalar.
- Render documenta que su instancia gratuita puede suspenderse tras inactividad, tarda en despertar y usa sistema de archivos efímero; esto debe comunicarse y comprobarse sobre el servicio real: [Free instances](https://render.com/docs/free).
- Las conexiones WebSocket consumen recursos finitos y una instancia puede degradarse con volumen; los límites deben validarse de forma controlada: [WebSockets on Render](https://render.com/docs/websocket) y [Compute plans](https://render.com/docs/compute-plans).
- El servidor ya usa `0.0.0.0`, `PORT` y un proceso HTTP compatible con los requisitos documentados: [Web services](https://render.com/docs/web-services).

## Lista de salida posterior a la remediación

1. Repositorio/remoto correctos y clonación limpia reproducible.
2. `npm ci`, `npm run check`, suites completas y auditoría de dependencias.
3. Límites de capacidad y corrección del desenlace probados.
4. Despliegue de una instancia desde revisión identificable.
5. Humo HTTPS/WSS desde dos redes y 3–6 clientes.
6. Suspensión/despertar, reinicio, logs, métricas y rollback ensayados.
7. Veredicto actualizado con evidencia real, sin reutilizar la aprobación local como aprobación productiva.

