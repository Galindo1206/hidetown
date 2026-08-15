# Backlog de remediación — Fase 11

Fecha: 2026-08-15  
Orden: severidad, luego dependencia y riesgo. Cada sección puede copiarse como tarjeta de Trello.

## Críticos

No se identificaron hallazgos críticos.

## Altos — bloquean la beta pública

### DEPLOY-001 — Establecer el repositorio y remoto correctos de HideTown

- **Objetivo:** disponer de un baseline versionado, revisable, clonable y publicable sin tocar el repositorio ajeno detectado en `C:/`.
- **Archivos o alcance:** metadatos Git a decidir; `.gitignore`; árbol completo del proyecto; configuración del remoto y CI/despliegue.
- **Criterios de aceptación:** la raíz Git corresponde a HideTown; el remoto ha sido confirmado por el propietario; todos y solo los archivos intencionales están bajo seguimiento; secretos y artefactos locales están ignorados; una clonación limpia instala y supera todas las suites.
- **Regresión requerida:** comparar inventario y hash del artefacto, `npm run check`, `npm test`, `npm run test:rc`, `npm run test:production`, escaneo de secretos y rutas privadas 404.
- **Dependencias:** decisión del propietario sobre repositorio, organización y destino; revisar el `C:\.git` existente sin modificarlo accidentalmente.
- **Esfuerzo:** Bajo a medio.

### SEC-001 — Implantar límites globales de salas y conexiones

- **Objetivo:** impedir crecimiento indefinido y responder de forma recuperable cuando la instancia alcance capacidad.
- **Archivos o alcance:** `server/services/roomService.js`, `server/server.js`, handlers de conexión/sala, configuración de entorno, errores, documentación y pruebas.
- **Criterios de aceptación:** límites configurables para salas/conexiones; N se acepta y N+1 devuelve `SERVER_AT_CAPACITY`; la capacidad se libera al salir/cerrar; existe política de inactividad de juego; el cliente muestra un mensaje accionable; hay métricas sin datos privados.
- **Regresión requerida:** creación/unión/reconexión normales, salas legítimamente activas, límites concurrentes, recuperación, timers, memoria y soak controlado.
- **Dependencias:** presupuesto de RAM/CPU/conexiones del destino; definir UX de expiración; conviene resolver `DEPLOY-001` antes de publicar.
- **Esfuerzo:** Medio.

## Medios — corregir antes del candidato público

### GAME-001 — Conservar el resultado durante `calculating_result`

- **Objetivo:** evitar que una retirada definitiva borre el desenlace ya calculado.
- **Archivos o alcance:** `server/services/roomService.js`, pruebas de estados/desconexión y, si cambia el contrato, frontend/documentación.
- **Criterios de aceptación:** una desconexión/expiración durante el conteo no cambia el ganador, votos ni roles; la sala llega una sola vez a `game_finished`; presencia y anfitrión se actualizan correctamente; volver a jugar limpia los datos cuando corresponde.
- **Regresión requerida:** desconectar antes/durante/después del conteo, empate/desempate, último jugador, cambio de anfitrión, timers cancelados y reconexión límite.
- **Dependencias:** ninguna técnica; coordinar con la política de expiración de `SEC-001`.
- **Esfuerzo:** Bajo a medio.

### NET-001 — Rediseñar el rate limit de crear/unirse detrás de proxy/NAT

- **Objetivo:** mantener protección contra abuso sin castigar grupos legítimos que comparten dirección.
- **Archivos o alcance:** `server/socket/roomHandlers.js`, `server/utils/rateLimiter.js`, `server/server.js`, configuración, pruebas y documentación de proxy.
- **Criterios de aceptación:** cuotas diferenciadas por socket/IP confiable/global; cadena de proxy explícita; cabeceras del cliente no se confían sin validación; grupos bajo una misma NAT pueden operar dentro de una política documentada; abuso sostenido sigue limitado.
- **Regresión requerida:** misma IP y sockets distintos, IP distintas, cabecera falsificada, IPv4/IPv6, reconexión, ráfaga y proxy real de Render.
- **Dependencias:** URL/servicio de staging y comportamiento confirmado del proxy; posterior a `DEPLOY-001`.
- **Esfuerzo:** Medio.

## Bajos — completar antes o durante una beta limitada

### SEC-002 — Restringir `connect-src` al origen necesario

- **Objetivo:** reforzar CSP sin romper Socket.IO por polling o WebSocket.
- **Archivos o alcance:** `server/server.js`, pruebas de cabeceras y navegadores objetivo.
- **Criterios de aceptación:** Socket.IO mismo origen conecta bajo HTTP/HTTPS; un WSS externo de prueba es bloqueado; no se amplían otras directivas.
- **Regresión requerida:** conexión, reconexión, fallback polling, CSP en Edge/Chrome/Firefox/Safari y producción HTTPS.
- **Dependencias:** dominio definitivo o prueba fiable de soporte de `'self'` para WSS.
- **Esfuerzo:** Bajo.

### UX-001 — Añadir guía contextual de privacidad

- **Objetivo:** desalentar datos personales en nombre y chat con lenguaje claro y no alarmista.
- **Archivos o alcance:** `index.html`, estilos si fueran necesarios, pruebas de accesibilidad/contenido.
- **Criterios de aceptación:** crear/unirse pide «nombre o apodo»; nombre/chat muestran guía breve; la ayuda está asociada accesiblemente; el flujo y el espacio móvil siguen correctos.
- **Regresión requerida:** 320 px, zoom de texto, lector de pantalla, formularios, chat, localización y revisión con usuarios.
- **Dependencias:** decisión de contenido y público objetivo.
- **Esfuerzo:** Bajo.

### CODE-001 — Reducir duplicación de estados y tamaño de módulos centrales

- **Objetivo:** disminuir el riesgo de divergencia al añadir fases sin debilitar la autoridad del servidor ni los DTO privados.
- **Archivos o alcance:** `js/app.js`, `server/services/roomService.js`, constantes/transiciones, renderizadores y pruebas.
- **Criterios de aceptación:** definición canónica de estados/transiciones en cada frontera apropiada; módulos cohesionados; cada estado posee pantalla/política/limpieza verificadas; comportamiento externo sin cambios no intencionales.
- **Regresión requerida:** las 67+ pruebas, recorrido completo, privacidad de DTO, timers, reconexión, chat, votos y play-again.
- **Dependencias:** corregir primero `GAME-001`; dividir en cambios revisables.
- **Esfuerzo:** Medio.

### DEPLOY-002 — Definir observabilidad de salud y reinicios

- **Objetivo:** diagnosticar fallos de salud, despertares y reinicios sin generar spam ni exponer estado privado.
- **Archivos o alcance:** logger, `/health`, configuración de producción, proveedor de métricas/logs y runbook.
- **Criterios de aceptación:** fallos/transiciones de salud y reinicios son visibles; checks correctos no saturan logs; no aparecen salas, nombres, chat, roles, pistas, votos o tokens.
- **Regresión requerida:** health 200 mínimo, nivel `info`, fallo simulado, shutdown, redacción de logs y retención acordada.
- **Dependencias:** servicio Render y política de observabilidad.
- **Esfuerzo:** Bajo.

### DOC-001 — Corregir el inventario de superficie HTTP

- **Objetivo:** documentar correctamente estáticos, `/health` y recursos/endpoints de Socket.IO.
- **Archivos o alcance:** `README.md`, `docs/DEPLOYMENT.md`, pruebas de producción si se automatiza el inventario.
- **Criterios de aceptación:** documentación coincide con `serveClient`; enumera superficies públicas y confirma que fuentes/configuración internas no se sirven.
- **Regresión requerida:** solicitar raíz, asset, health, cliente/endpoint Socket.IO y rutas privadas esperadas 404.
- **Dependencias:** incorporar cualquier cambio de CSP/proxy antes de cerrar el texto.
- **Esfuerzo:** Bajo.

## Informativos / trabajo futuro

### CODE-002 — Diseñar una ruta de escalado multiinstancia

- **Objetivo:** definir, sin implementarlo prematuramente, cómo compartir estado y eventos cuando una instancia deje de ser suficiente.
- **Archivos o alcance:** ADR/arquitectura futura; repositorio de estado, adaptador Socket.IO, timers/colas, recuperación y despliegue.
- **Criterios de aceptación:** documento de decisión con disparadores medibles, consistencia, fallos, privacidad, coste y migración; el alcance de una instancia sigue explícito mientras tanto.
- **Regresión requerida:** futura integración cruzada para crear/unir/reconectar/votar y reiniciar nodos sin filtrar secretos.
- **Dependencias:** métricas reales de beta y resolución de `SEC-001`.
- **Esfuerzo:** Alto.

### DEPLOY-003 — Ejecutar validación sobre la producción real

- **Objetivo:** sustituir supuestos locales por evidencia de Render antes de aprobar públicamente.
- **Archivos o alcance:** servicio/URL, logs, configuración, runbook y documentos de auditoría.
- **Criterios de aceptación:** HTTPS/HSTS, WSS/fallback, health, dos redes, 3–6 clientes, suspensión/despertar, reinicio y rollback verificados; revisión desplegada identificable; logs sin secretos.
- **Regresión requerida:** suites locales más humo remoto no destructivo y recorrido completo.
- **Dependencias:** `DEPLOY-001`, `SEC-001`, `GAME-001`, acceso/URL de staging y ventana autorizada.
- **Esfuerzo:** Medio.

### A11Y-001 — Completar la matriz de accesibilidad asistiva

- **Objetivo:** obtener evidencia manual suficiente para declarar un objetivo WCAG concreto.
- **Archivos o alcance:** todos los flujos frontend, matriz de navegadores/lectores, contraste y registro de resultados.
- **Criterios de aceptación:** recorridos con NVDA y VoiceOver, teclado, zoom, contraste y táctil; defectos trazados a criterios WCAG; cero bloqueo conocido para la audiencia objetivo.
- **Regresión requerida:** automatización existente y casos manuales repetibles por pantalla/diálogo/estado dinámico.
- **Dependencias:** dispositivos/tecnologías asistivas y nivel WCAG decidido.
- **Esfuerzo:** Medio.

### UX-002 — Realizar playtests de comprensión, balance y rejugabilidad

- **Objetivo:** validar que el juego es claro, justo y divertido, no solo funcional.
- **Archivos o alcance:** guion de prueba, historias/pistas/roles, reglas, métricas agregadas y backlog de balance.
- **Criterios de aceptación:** grupos de 3–6 completan partidas; se miden duración, comprensión, estrategia, justicia y repetición; cambios se justifican con patrones, no anécdotas aisladas.
- **Regresión requerida:** repetir sesiones tras cambios y conservar las reglas técnicas/invariantes del servidor.
- **Dependencias:** reclutamiento, consentimiento y política de datos; idealmente staging estable.
- **Esfuerzo:** Medio.

### PERF-001 — Ejecutar soak y concurrencia con clientes reales

- **Objetivo:** detectar fugas, deriva y degradación durante partidas repetidas bajo recursos objetivo.
- **Archivos o alcance:** entorno de staging, instrumentación, escenarios de 3–6 clientes y presupuesto de rendimiento.
- **Criterios de aceptación:** umbrales de RAM/CPU/latencia definidos y cumplidos; sin crecimiento no explicado de salas, timers, listeners o heap; recuperación correcta ante red inestable.
- **Regresión requerida:** varias partidas consecutivas, reconexiones, throttling, cierre/limpieza, capacidad N/N+1 y despertar.
- **Dependencias:** `SEC-001`, observabilidad de `DEPLOY-002` y staging de `DEPLOY-003`.
- **Esfuerzo:** Medio.

## Orden de ejecución recomendado

1. `DEPLOY-001`.
2. `SEC-001` y `GAME-001`.
3. `NET-001`, `SEC-002`, `UX-001`, `DEPLOY-002` y `DOC-001`.
4. Repetir todas las pruebas locales y la auditoría visual.
5. `DEPLOY-003`, `PERF-001` y `A11Y-001` en staging/producción controlada.
6. `UX-002` con usuarios; actualizar veredicto.
7. `CODE-001` en cambios pequeños; `CODE-002` solo cuando las métricas justifiquen escala.

