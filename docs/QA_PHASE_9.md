# Informe de QA — Fase 9

## Identificación

- Producto: El Pueblo Oculto.
- Candidato: `0.9.0-rc.1`.
- Fecha: 14 de agosto de 2026.
- Alcance: instalación, flujo multijugador, privacidad, concurrencia, recuperación, responsive, accesibilidad técnica, audio y rendimiento local.
- Fuera de alcance: publicación, funciones nuevas y opiniones de jugadores reales.

## Resultado ejecutivo

El candidato queda **aprobado para una prueba local con amigos**. No se conocen errores críticos, altos ni medios pendientes. Las reglas y los contratos Socket.IO no fueron modificados.

- Pruebas automatizadas finales: 63 aprobadas, 0 fallidas, 0 bloqueadas.
- Auditoría de navegador: 342 comprobaciones aprobadas en Edge y Chrome, 0 fallidas.
- Casos QA de esta matriz: 34 aprobados, 0 fallidos, 5 bloqueados por falta de hardware, software o participantes reales.
- Instalación limpia: 119 paquetes instalados, 0 vulnerabilidades informadas por npm.

## Entornos realmente utilizados

| Entorno | Detalle |
| --- | --- |
| Sistema | Windows, PowerShell |
| Runtime | Node.js 22.19.0, npm 10.9.3 |
| Navegadores | Microsoft Edge y Google Chrome, modo headless mediante Chrome DevTools Protocol |
| Servidor | Desarrollo y producción local, IPv4 `127.0.0.1` |
| Instalación limpia | Copia temporal independiente, `npm ci --ignore-scripts` |
| Resoluciones | 320×568, 360×640, 375×667, 390×844, 412×915, 768×1024, 1024×768, 1366×768, 1920×1080 |

## Matriz ejecutada

Cada fila registra identificador, módulo/objetivo, condiciones previas, pasos, resultado esperado, resultado obtenido, estado, entorno, evidencia y error relacionado.

| ID | Módulo / objetivo | Condiciones previas | Pasos | Esperado | Obtenido | Estado | Entorno | Evidencia | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P9-INST-01 | Instalación limpia | Copia sin `node_modules` | Copiar proyecto; ejecutar `npm ci --ignore-scripts` | Dependencias completas, sin secretos | 119 paquetes; 0 vulnerabilidades | Aprobado | Node/npm, copia temporal | Salida npm | — |
| P9-INST-02 | Desarrollo | Instalación limpia | `npm run dev`; consultar `/health` | Arranque correcto y HTTP 200 | HTTP 200, `rooms: 0` | Aprobado | Nodemon, puerto 3201 | Respuesta health | — |
| P9-INST-03 | Producción y cierre | Instalación limpia | `NODE_ENV=production`; iniciar; health; detener | Arranque y cierre sin proceso abandonado | HTTP 200; proceso detenido | Aprobado | Node, puerto 3199 | Respuesta health | — |
| P9-INST-04 | Recursos y rutas | Fuentes del candidato | Buscar rutas locales y solicitudes externas | Sin rutas del equipo ni recursos faltantes | Ruta absoluta del README corregida; 0 solicitudes fallidas | Aprobado | `rg`, CDP | Auditoría de red | QA-DEF-001 |
| P9-MENU-01 | Carga, menú y navegación | Servidor activo | Recorrer carga, menú, formularios y ayuda | Controles visibles y navegables | 16 pantallas inspeccionadas | Aprobado | Edge/Chrome | Auditoría visual | — |
| P9-MENU-02 | Sonido y preferencia | Web Audio disponible | Activar; silenciar; leer almacenamiento; crear y destruir manager | Sin autoplay; preferencia persistente; limpieza | Bloqueado antes de interacción y toggle correcto | Aprobado | Edge/Chrome | `audioStartsLocked`, `audioToggle` | — |
| P9-ROOM-01 | Crear y unir jugadores | Servidor de integración | Crear sala; unir varias sesiones; observar DTO | Código válido y lista sincronizada | Coincide con lo esperado | Aprobado | Socket.IO real | `socket.integration.test.js` | — |
| P9-ROOM-02 | Validaciones y capacidad | Sala abierta | Vacío, duplicado, inexistente, llenar, séptimo e ingreso iniciado | Rechazos públicos correctos | Todos rechazados con código esperado | Aprobado | Unitarias/integración | `roomService.test.js`, RC | — |
| P9-ROOM-03 | Salida y anfitrión | Sala con invitados | Salir anfitrión y vaciar sala | Transferencia única y eliminación final | Coincide | Aprobado | RoomService | Pruebas 28, 38–40 | — |
| P9-GAME-01 | Inicio autorizado | 2–3 jugadores | Intentar con pocos, invitado y anfitrión | Solo anfitrión con mínimo 3 | Coincide | Aprobado | RoomService | Pruebas 15, 30 | — |
| P9-GAME-02 | Partida con 3 | Tres sesiones | Recorrer todas las etapas y votar | 1/1/1; resultado final | Partida completada | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-GAME-03 | Partida con 4 | Cuatro sesiones | Recorrer todas las etapas y votar | 1/1/2; resultado final | Partida completada | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-GAME-04 | Partida con 5 | Cinco sesiones | Recorrer todas las etapas y votar | 1/1/3; resultado final | Partida completada | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-GAME-05 | Partida con 6 | Seis sesiones | Recorrer todas las etapas y votar | 1/1/4; resultado final | Partida completada | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-STORY-01 | Historia sincronizada | Partida iniciada | Confirmar individualmente y repetir | Una transición y progreso idempotente | Coincide | Aprobado | Socket.IO real | Pruebas 15, 35 | — |
| P9-ROLE-01 | Roles privados | Historia confirmada | Recibir roles; reconectar; inspeccionar público | Un rol propio; ningún rol ajeno | Distribución exacta y restaurada | Aprobado | Integración/RC | Pruebas 12–19, 35 | — |
| P9-CLUE-01 | Pistas privadas | Roles confirmados | Confirmar evidencia; distribuir; reconectar; reiniciar | Pistas por rol, sin filtración | Coincide; no repite cuando es posible | Aprobado | Integración/RC | Pruebas 1–3, 35 | — |
| P9-CHAT-01 | Chat y temporizador | Conversación activa | Enviar, reconectar, finalizar y enviar tarde | Historial único y bloqueo final | Coincide | Aprobado | Integración | Pruebas 4–11, 35 | — |
| P9-CHAT-02 | Entrada hostil y spam | Conversación activa | Vacío, 301 caracteres, HTML y ráfaga | Rechazo o texto literal | Coincide, sin interpretación HTML | Aprobado | Integración | Pruebas 4, 8, 35 | — |
| P9-VOTE-01 | Voto secreto y conteo | Votación activa | Propio, inválido, duplicado, válido y tardío | Rechazos correctos; sin parciales | Coincide | Aprobado | Unitarias/integración | Pruebas 45–55 | — |
| P9-VOTE-02 | Resultados forzados | Votaciones controladas | Pueblo, inocente, empate, abstención y desempate | Ganador/conteo esperado | Cinco escenarios aprobados | Aprobado | RoomService | `voting.test.js` | — |
| P9-REPLAY-01 | Tres partidas seguidas | Sala de 4 finalizada | Jugar, limpiar, repetir tres veces | Código/jugadores conservados; datos limpios | Tres partidas; criatura rotó | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-DISC-01 | Reconexión temporal | Etapas activas | Desconectar y restaurar sesión | Estado, rol, pistas, chat, voto y tiempos conservados | Espera y las ocho etapas activas/finales aprobadas | Aprobado | Integración/unitarias | Prueba RC por etapas y regresión previa | — |
| P9-DISC-02 | Desconexión definitiva | Espera, juego y final | Vencer gracia para jugador/anfitrión | Transferir o cancelar/limpiar según etapa | Coincide | Aprobado | RoomService | Pruebas 20, 33, 41, 43 | — |
| P9-CONC-01 | Última plaza | Sala con 5 | Lanzar dos ingresos casi simultáneos | Solo uno entra; máximo 6 | 1 aprobado, 1 `ROOM_FULL` | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-CONC-02 | Carreras de transición | Partida activa | Doble inicio/confirmación y último voto contra timer | Una transición/resultado | Idempotencia verificada | Aprobado | Unitarias | Pruebas 15, 49 | — |
| P9-SEC-01 | Serialización privada | Partida antes del resultado | Serializar estado público y eventos | Sin roles, pistas, votos ni tokens | Sin coincidencias sensibles | Aprobado | Integración/RC | Pruebas 17, 50 y RC | — |
| P9-SEC-02 | Aislamiento de salas | Dos salas simultáneas | Enviar mensajes y reutilizar token ajeno | Datos separados y token rechazado | Coincide | Aprobado | RC automatizada | `releaseCandidate.test.js` | — |
| P9-SEC-03 | Producción y origen | Servidor production | Leer cabeceras; conectar origen ajeno y mismo origen | Cabeceras; ajeno rechazado | Coincide | Aprobado | Socket.IO real | Prueba RC de producción | — |
| P9-RESP-01 | Responsive completo | Servidor y navegador CDP | Medir 16 pantallas y 3 diálogos en 9 tamaños | Sin overflow ni controles inaccesibles | 171/171 por navegador | Aprobado | Edge y Chrome | `visual-browser-audit.mjs` | — |
| P9-A11Y-01 | Teclado y diálogos | Navegador activo | Enfocar control y enviar Escape | Foco visible; diálogo cerrado | Coincide | Aprobado | Edge/Chrome | Auditoría CDP | — |
| P9-A11Y-02 | Etiquetas, zoom y movimiento | DOM completo | Auditar 50 controles; 200 %; reduced motion | Sin controles sin nombre ni overflow | 0 sin etiqueta; zoom/reduced correctos | Aprobado | Edge/Chrome | Auditoría CDP | — |
| P9-PERF-01 | Carga y red | Localhost sin caché | Recargar y leer Performance/Network | Sin fallos/externos; carga ligera | 14 recursos, 181 993 B, 49–69 ms | Aprobado | Edge/Chrome | CDP | — |
| P9-PERF-02 | Duración y limpieza | Reloj/configuración de prueba | Crear/eliminar 120 salas; tres partidas | Sin crecimiento de salas/sockets/timers | 0 salas y 0 sockets al final | Aprobado | RoomService | Prueba RC | — |
| P9-BLOCK-01 | Prueba con amigos | 4–6 participantes reales | Ejecutar sesión y encuesta | Opiniones reales | No hay participantes en este entorno | Bloqueado | No disponible | `FRIENDS_PLAYTEST_GUIDE.md` | — |
| P9-BLOCK-02 | Dispositivos físicos/LAN | Teléfono/tablet y red local | Abrir desde dispositivo y usar teclado táctil | Flujo usable en hardware | Solo emulación de viewport disponible | Bloqueado | No disponible | Checklist manual | — |
| P9-BLOCK-03 | Lector de pantalla | NVDA/JAWS/VoiceOver | Recorrer flujo y anuncios | Lectura razonable | Herramienta no disponible | Bloqueado | No disponible | Checklist manual | — |
| P9-BLOCK-04 | Firefox/Safari | Navegadores instalados | Repetir auditoría | Compatibilidad sin defectos | No disponibles | Bloqueado | No disponible | Inventario de navegadores | — |
| P9-BLOCK-05 | Percepción acústica | Altavoces/usuarios reales | Escuchar ambiente y señales | Volumen no molesto y distinguible | Headless verifica función, no percepción | Bloqueado | No disponible | Guía de playtest | — |

## Incidencias encontradas

| ID | Severidad | Reproducción y causa | Corrección | Regresión | Estado |
| --- | --- | --- | --- | --- | --- |
| QA-DEF-001 | Medio | Buscar rutas absolutas mostraba una ruta local del equipo en README; era documentación no portable | Sustituida por `ruta\al\proyecto\HideTown` | Búsqueda de rutas y prueba desde copia temporal | Corregido |
| QA-HAR-001 | Bajo, herramienta | El primer envío sintético de Escape usaba `keyDown` sin código virtual y produjo un falso negativo | La auditoría usa `rawKeyDown` y código virtual 27 | Edge y Chrome cierran el diálogo | Corregido |
| QA-HAR-002 | Bajo, prueba | Una prueba esperaba callbacks de temporizador después de 50 ms fijos y falló una vez bajo carga | Espera condicionada con límite de 250 ms, sin cambiar el servidor | 20 repeticiones del caso y suite de chat completa | Corregido |

No se encontraron defectos funcionales críticos o altos. `QA-HAR-001` y `QA-HAR-002` afectaban únicamente a las herramientas de prueba, no al juego.

Durante la regresión, una primera invocación de `npm audit --omit=dev` no pudo alcanzar el endpoint del registro dentro del sandbox. El fallo de red se conservó como evidencia; la repetición autorizada fuera del sandbox terminó correctamente y reportó 0 vulnerabilidades, coincidiendo con la instalación limpia.

## Limitaciones

La auditoría de accesibilidad comprueba estructura DOM, nombres accesibles, foco, Escape, zoom y preferencias CSS; no sustituye una sesión con lector de pantalla. Las métricas son observaciones locales, no una prueba de red móvil ni de hardware modesto. Las opiniones de jugadores no fueron simuladas.
