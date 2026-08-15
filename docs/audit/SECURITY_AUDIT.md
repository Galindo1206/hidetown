# Auditoría de seguridad y privacidad

Fecha: 2026-08-15  
Versión: `0.9.0-beta.1`

## Resumen

No se encontró exposición de roles, pistas, votos previos al cierre, tokens ni estado entre salas en los escenarios revisados. Identidad y autorización se resuelven en el servidor; los clientes envían acciones, no permisos. Los tokens se generan con 32 bytes aleatorios y se comparan con `timingSafeEqual`. Los DTO públicos omiten asignaciones y el frontend inserta contenido mediante `textContent`.

El riesgo principal es de disponibilidad: un cliente puede mantener indefinidamente una sala conectada y no hay límite global de salas/conexiones en la aplicación. Esto es especialmente relevante para el plan Render Free previsto. No se ejecutaron ataques ni carga agresiva.

## Controles comprobados

- Códigos de sala generados con `crypto.randomInt`; espacio de seis caracteres sin símbolos ambiguos.
- UUID de jugadores y token de reconexión de 256 bits.
- Comparación de tokens con tiempo constante y eliminación al retirar jugador/sala.
- Permisos de anfitrión revalidados para inicio, conversación, reinicio y volver a jugar.
- Identidad de chat y voto derivada del socket autenticado.
- Payloads exactos: se rechazan campos inesperados y tipos inválidos.
- Voto propio, duplicado, ajeno, tardío y candidato inválido rechazados.
- Secretos entregados con emisiones dirigidas; estados públicos inspeccionados sin roles/pistas/tokens.
- HTML de chat permanece texto; no se usa `innerHTML`, `eval` ni recursos externos.
- CSP, `frame-ancestors 'none'`, `object-src 'none'`, HSTS bajo proxy HTTPS, `nosniff`, Referrer Policy y Permissions Policy.
- `maxHttpBufferSize: 10_000`, rate limit de acciones, chat limitado a 300 caracteres/100 mensajes.
- Logs estructurados sin nombres, chat, códigos de sala, roles, pistas, votos ni tokens en llamadas revisadas.
- `/health` solo devuelve estado y versión; rutas privadas probadas devolvieron 404.
- Búsqueda local de patrones de credenciales: sin secretos materiales; solo `.env.example` presente.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas al 2026-08-15.

## Hallazgos

### SEC-001 — Capacidad global de salas y conexiones sin límite de aplicación

- **Severidad:** Alto.
- **Área:** seguridad de disponibilidad y rendimiento.
- **Evidencia:** `RoomService` usa un `Map` sin máximo global. `cleanupInactiveRooms` omite toda sala con al menos un jugador conectado. El límite de creación reduce ráfagas, pero no impide crecimiento sostenido. Reproducción controlada: se crearon 20 salas conectadas, se avanzó el reloj más allá de inactividad y el barrido retiró 0; quedaron 20.
- **Archivo y ubicación:** `server/services/roomService.js:72, 495-505`; `server/socket/roomHandlers.js:83-103`; `server/server.js:49-59`.
- **Pasos para reproducir:** instanciar `RoomService` con reloj falso e inactividad corta; crear salas con sockets distintos; avanzar el reloj; ejecutar `cleanupInactiveRooms`.
- **Resultado esperado:** capacidad máxima explícita y rechazo recuperable, o política documentada de expiración/heartbeat que impida crecimiento indefinido.
- **Resultado actual:** una conexión activa excluye la sala de limpieza sin límite total.
- **Impacto:** agotamiento de RAM/CPU/conexiones y caída o degradación del servicio para todos. Render documenta recursos finitos y advierte que muchas conexiones pueden degradar una instancia.
- **Probabilidad:** media en beta pública; alta bajo abuso sostenido o pestañas abandonadas.
- **Recomendación:** añadir `MAX_ACTIVE_ROOMS`, `MAX_CONNECTIONS`, métricas y error `SERVER_AT_CAPACITY`; definir inactividad real de juego con aviso/cierre; conservar rate limits por actor y globales. Probar sin carga contra producción hasta disponer de entorno controlado.
- **Esfuerzo estimado:** Medio.
- **Prueba futura:** límites exactos N/N+1, recuperación al liberar capacidad, salas activas legítimas no retiradas, soak controlado bajo RAM objetivo.

### NET-001 — El límite de crear/unirse se comparte por dirección de transporte

- **Severidad:** Medio.
- **Área:** Socket.IO, disponibilidad y autorización de tráfico.
- **Evidencia:** `attemptKey` usa `socket.handshake.address`; el limitador permite 8 creaciones/ingresos cada 10 segundos por esa clave. Usuarios detrás del mismo NAT comparten dirección; bajo un reverse proxy debe verificarse si la dirección es la del cliente o la del salto de Render.
- **Archivo y ubicación:** `server/socket/roomHandlers.js:6-8, 68-75`; `server/server.js:49-55`; `server/utils/rateLimiter.js:3-17`.
- **Pasos para reproducir:** conectar clientes distintos desde una misma dirección y acumular más de ocho intentos válidos/fallidos en diez segundos.
- **Resultado esperado:** proteger abuso sin bloquear grupos independientes que comparten red o proxy.
- **Resultado actual:** todos comparten el mismo presupuesto cuando `handshake.address` coincide.
- **Impacto:** un segundo grupo o varios reintentos pueden recibir `RATE_LIMITED` aunque sus sockets sean independientes.
- **Probabilidad:** media en redes escolares, domésticas, eventos o proxy; comportamiento exacto en Render pendiente.
- **Recomendación:** verificar cabeceras confiables de Render, normalizar IP solo tras una cadena de proxy definida y combinar cuotas por socket, IP confiable y global. No confiar en una cabecera arbitraria del cliente.
- **Esfuerzo estimado:** Medio.
- **Prueba futura:** dos grupos detrás de la misma IP, dos IP distintas, cabecera falsificada, proxy real y ráfaga abusiva controlada.

### SEC-002 — `connect-src` permite cualquier destino `ws:`/`wss:`

- **Severidad:** Bajo.
- **Área:** defensa en profundidad del navegador.
- **Evidencia:** CSP usa `connect-src 'self' ws: wss:`. Los esquemas permiten conexiones WebSocket a hosts distintos si un script autorizado llegase a ejecutarse.
- **Archivo y ubicación:** `server/server.js:66-73`.
- **Pasos para reproducir:** inspeccionar la cabecera CSP e intentar desde consola una conexión WSS externa compatible.
- **Resultado esperado:** destinos de conexión limitados al mismo origen necesario para Socket.IO.
- **Resultado actual:** HTTP fetch queda en `self`, pero WebSocket admite cualquier host por esquema.
- **Impacto:** no crea XSS; reduce la capacidad de CSP para bloquear exfiltración tras otra vulnerabilidad.
- **Probabilidad:** baja porque `script-src` es `self` y no se encontró un vector de ejecución.
- **Recomendación:** probar compatibilidad de `'self'` con WebSocket en navegadores objetivo y retirar esquemas amplios, o construir una política explícita para el dominio real.
- **Esfuerzo estimado:** Bajo.
- **Prueba futura:** Socket.IO mismo origen conecta por HTTPS/WSS; WSS externo es bloqueado; polling continúa funcionando.

## Información secreta

### Estado público

`toPublicRoom` expone código, etapa, tiempos, progreso, nombres/UUID públicos, presencia, candidatos y resultado solo en `game_finished`. No incluye `roleAssignments`, `clueAssignments`, votos parciales, Socket IDs ni tokens. El contador de votos revela participación agregada, no elección.

### Estado privado

`getPrivateGameStateBySocket` deriva al jugador desde `socketIndex` y entrega solo su rol, pistas, confirmaciones, historial permitido y marca `hasVoted`. La restauración exige código, UUID y token; una sesión de otra sala no fue aceptada por las pruebas.

### Navegador y almacenamiento

`sessionStorage` guarda código de sala, UUID y token para la pestaña. `localStorage` guarda únicamente silencio de audio. No hay cookies de aplicación, analítica ni rastreadores. El token sigue siendo un bearer token: cualquier XSS/origen con acceso al almacenamiento podría secuestrar la sesión, por lo que la CSP y el renderizado seguro siguen siendo controles esenciales.

### Logs y errores

Los errores internos se normalizan a `INTERNAL_ERROR` sin stack, ruta o payload. El logger filtra metadatos complejos y las llamadas actuales usan contadores/estados anónimos. No se observó registro de chats o credenciales.

## Privacidad

- No hay almacenamiento permanente ni telemetría.
- Nombres, mensajes y resultados viven en memoria hasta limpiar la sala.
- La UI avisa sobre pantalla privada y el reporte técnico excluye datos de partida.
- Falta una recomendación general para no usar datos personales en nombre/chat; se registra como `UX-001`.
- La revelación final muestra papeletas con nombres por diseño del juego. Debe confirmarse con usuarios que esta expectativa se entiende antes de votar.

## Pruebas bloqueadas

- Inspección de tráfico HTTPS/WSS, logs y métricas en Render.
- Prueba controlada de capacidad sobre el tamaño real de la instancia.
- Pentest, fuzzing extensivo, DAST y carga agresiva.
- Navegadores distintos de Edge durante esta fase.

## Referencias de plataforma

- Render Free: https://render.com/docs/free
- Tipos/capacidad de instancia: https://render.com/docs/compute-plans
- WebSockets en Render: https://render.com/docs/websocket

