# El Pueblo Oculto

Videojuego web multijugador de misterio y engaño para grupos de 3 a 6 amigos, ambientado en un pueblo andino durante la noche.

## Estado actual

**Beta `0.9.0-beta.1` preparada para Render.** Frontend, Phaser, Express, Socket.IO y `/health` se sirven desde un único Web Service. La raíz y el remoto dedicado fueron verificados, pero el despliegue público sigue pendiente: no se creó una URL, servicio, commit ni push.

Las salas y partidas se almacenan temporalmente en memoria. Reiniciar Node elimina todas las salas.

## Requisitos y ejecución

- Node.js 20 o posterior.
- npm.
- Un navegador moderno.

```powershell
cd ruta\al\proyecto\HideTown
npm ci
npm run dev
```

Abre `http://localhost:3000`.

Otros comandos:

```powershell
npm start      # ejecución normal
npm test       # pruebas unitarias e integrales
npm run test:rc # recorridos críticos del candidato
npm run test:production # configuración, cabeceras, caché y salud
npm run smoke:production # rutas públicas/privadas y cierre en producción local
npm run check  # comprobación de sintaxis
```

## Configuración

Puede copiarse `.env.example` como `.env`. El archivo real está ignorado por Git.

| Variable | Predeterminado | Uso |
| --- | ---: | --- |
| `HOST` | `0.0.0.0` | Interfaz de red. |
| `PORT` | `3000` | Puerto HTTP y Socket.IO. |
| `RECONNECTION_GRACE_SECONDS` | `30` | Plazo de reconexión; acepta entre 5 y 300 segundos. |
| `ROOM_INACTIVITY_MINUTES` | `60` | Antigüedad necesaria para retirar una sala sin jugadores conectados; acepta entre 5 y 1440 minutos. |
| `ROOM_CLEANUP_INTERVAL_MINUTES` | `5` | Frecuencia del barrido de limpieza; acepta entre 1 y 60 minutos. |
| `ALLOWED_ORIGINS` | vacío | Orígenes HTTP permitidos, separados por comas. En producción se permite además el mismo origen. |
| `NODE_ENV` | `development` | Activa la política estricta de origen cuando vale `production`. |
| `LOG_LEVEL` | `debug` en desarrollo; `info` en producción | Nivel de logs estructurados: `error`, `warn`, `info` o `debug`. |
| `RATE_LIMIT_WINDOW_MS` | `10000` | Ventana del límite de intentos. |
| `RATE_LIMIT_MAX_ACTIONS` | `8` | Creaciones o ingresos permitidos por ventana. |
| `EXPLORATION_DURATION_SECONDS` | `90` | Duración de la exploración caminable; acepta entre 30 y 180 segundos. |
| `DISCUSSION_DURATION_SECONDS` | `240` | Duración de la conversación; acepta entre 30 y 600 segundos. |
| `RECONSTRUCTION_REQUIRED_SCORE` | `4` | Etapas correctas necesarias para aprobar la reconstrucción; acepta entre 1 y 5. |
| `VOTING_DURATION_SECONDS` | `60` | Duración de la votación principal; acepta entre 15 y 180 segundos. |
| `TIEBREAKER_DURATION_SECONDS` | `30` | Duración del desempate; acepta entre 10 y 120 segundos. |

## Arquitectura

```text
.
├── index.html
├── css/                         # Diseño, componentes y responsive
├── js/
│   ├── navigation.js            # Navegación SPA
│   ├── multiplayer.js           # Cliente Socket.IO y sesión propia
│   ├── audioManager.js           # Audio local, preferencia y limpieza
│   ├── game/                     # Phaser: escenas, entidades, sistemas y configuración
│   └── app.js                   # Renderizado seguro e interacción
├── server/
│   ├── server.js                # Express, HTTP y Socket.IO
│   ├── services/roomService.js  # Salas y máquina de estados
│   ├── socket/                  # Protocolo en tiempo real
│   ├── chat/                    # Validación de mensajes públicos
│   ├── game/                    # Roles, pistas, distribución y conteo de votos
│   ├── stories/                 # Historias independientes
│   └── utils/                   # Validación, códigos y errores
├── scripts/                     # Auditoría visual opcional en Chromium
├── docs/                        # Informe QA, checklist, guía y limitaciones
└── test/                        # Pruebas unitarias, integrales y visuales estáticas
```

Express publica solamente `index.html`, `css`, `js`, `assets` y la distribución fijada de Phaser en `/vendor/phaser.js`. El backend, las pruebas, `node_modules` en general y los archivos de entorno no son recursos públicos.

La arquitectura es híbrida. Menú, sala, historia, rol, cuaderno, reconstrucción, chat, votación y resultados continúan en HTML/CSS/JavaScript. Solo el estado `exploration` crea una instancia de **Phaser 3.90.0**; al terminar o salir se eliminan escenas, canvas, listeners, timers y sonido de exploración. La instancia reutiliza `MultiplayerClient` y su única conexión Socket.IO.

## Identidad visual y sistema de componentes

La escena se construye íntegramente con CSS local: cielo, estrellas, luna, montañas, pueblo, iglesia y campanario, ventanas tenues, camino de piedra, neblina y viñeta. No se descargan imágenes, fuentes ni recursos visuales de terceros.

`css/variables.css` centraliza la paleta nocturna, pergamino, dorado, peligro, éxito e investigación; también contiene tipografías de sistema, escala de espaciado, radios, sombras, capas y tiempos de transición. `css/components.css` comparte botones, campos, paneles, avisos, indicadores de conexión, listas, temporizadores, diálogos, cartas secretas, mensajes, opciones de voto y resultados.

Los roles se distinguen mediante color, símbolo, textura y composición. Las pistas muestran tipo e indicador de confiabilidad, con tratamientos propios para análisis y recuerdos fragmentados. La selección de voto combina borde, fondo, icono y el texto visible “Seleccionado”.

## Sonido

`js/audioManager.js` es el administrador central. Usa Web Audio API para sintetizar ambiente discreto, viento, interior, pasos, puerta, investigación, campana narrativa, recepción de pista, advertencia de tiempo, confirmación de voto y desenlaces. No solicita archivos de audio inexistentes.

El sonido comienza silenciado en la primera visita y solo se habilita tras una interacción explícita. La preferencia se guarda en `localStorage` con la clave `el-pueblo-oculto:sound-muted`. El contexto se pausa al ocultar la pestaña y se libera al abandonar la página. Los tonos son provisionales y pueden reemplazarse más adelante por grabaciones locales con licencia compatible.

## Responsive, accesibilidad y rendimiento

La interfaz admite desde 320 px, áreas seguras y alturas `svh`/`dvh`. Las pantallas bajas permiten desplazamiento; el chat comprime su cabecera y mantiene accesible el compositor. Paneles y texto conservan un ancho máximo en escritorio.

Hay enlace para saltar al contenido, foco visible, etiquetas, regiones vivas, controles nativos de teclado, diálogos modales, cierre con Escape e indicadores que no dependen solo del color. Se incluyen ajustes para `prefers-reduced-motion`, `prefers-contrast` y colores forzados.

Las animaciones usan principalmente opacidad y transformaciones breves. El paisaje evita video, dependencias visuales y recursos pesados; solo dos capas de neblina se mueven y quedan estáticas con movimiento reducido.

## Revisión visual de la Fase 8

Se revisan carga, menú, formularios, sala, historia, rol, evidencia, pistas, conversación, votación, desempate, resultados, reconexión y errores. Las resoluciones objetivo son 320×568, 360×640, 375×667, 390×844, 412×915, 768×1024, 1024×768, 1366×768 y 1920×1080.

Para una revisión manual, ejecuta `npm run dev`, abre `http://localhost:3000`, recorre una partida con tres ventanas privadas y usa el modo responsive del navegador para cada tamaño. Repite una vez con navegación por Tab/Shift+Tab/Escape, otra con movimiento reducido del sistema y otra alternando el control de sonido.

## QA, producción y despliegue

La regresión contiene 67 pruebas automatizadas. Además del flujo de Fase 9, valida variables críticas de producción, salud mínima sin salas, caché de HTML y recursos, proxy HTTPS, HSTS y logs estructurados.

Documentación de la campaña:

- [`docs/QA_PHASE_9.md`](docs/QA_PHASE_9.md): matriz, resultados, entornos e incidencias.
- [`docs/MANUAL_TEST_CHECKLIST.md`](docs/MANUAL_TEST_CHECKLIST.md): recorrido humano sin marcar como ejecutado.
- [`docs/FRIENDS_PLAYTEST_GUIDE.md`](docs/FRIENDS_PLAYTEST_GUIDE.md): sesión en una red local con 4–6 amigos.
- [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md): limitaciones abiertas del candidato.
- [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md): configuración exacta y publicación manual segura en Render.
- [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md): verificación local y pública.
- [`docs/PUBLIC_PLAYTEST.md`](docs/PUBLIC_PLAYTEST.md): invitación y reporte seguro para probadores.
- [`docs/ROLLBACK.md`](docs/ROLLBACK.md): reversión, suspensión y consecuencias.

Comandos de regresión:

```powershell
npm run check
npm test
npm run test:rc
npm run test:production
```

La auditoría de navegador necesita Edge o Chrome iniciado con depuración remota, el servidor activo en el puerto 3000 y un perfil temporal independiente:

```powershell
npm run dev
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --remote-debugging-port=9223 --user-data-dir="$env:TEMP\hide-town-qa" http://127.0.0.1:3000
npm run audit:browser
```

La auditoría recorre las 17 pantallas y 3 diálogos en nueve resoluciones, además de comprobar solicitudes, nombres accesibles, foco, Escape, zoom de texto, movimiento reducido y ciclo de audio.

### Temporizadores cortos para QA

Copia `.env.example` como `.env` y usa los mínimos admitidos. Esto no modifica los valores predeterminados ni las reglas de producción:

```dotenv
DISCUSSION_DURATION_SECONDS=30
RECONSTRUCTION_REQUIRED_SCORE=4
VOTING_DURATION_SECONDS=15
TIEBREAKER_DURATION_SECONDS=10
```

Reinicia el servidor después de modificar `.env`.

### Prueba local con amigos

El servidor escucha por defecto en `0.0.0.0`. En una red Wi-Fi privada, consulta la IPv4 del anfitrión con `ipconfig` y abre `http://DIRECCION-IP:3000` desde los demás dispositivos. No abras puertos del router ni lo expongas a Internet. Las instrucciones completas están en la guía de playtest.

### Limitaciones y publicación

Las salas siguen en memoria, los sonidos continúan siendo sintetizados y faltan validaciones humanas en dispositivos físicos, lectores de pantalla, Firefox y Safari. `render.yaml` prepara Node nativo en una sola instancia gratuita, HTTPS/WSS bajo el mismo origen y despliegues manuales. Render puede dormir el servicio tras 15 minutos sin tráfico y reiniciarlo; cualquiera de esos eventos elimina las salas activas. Hasta verificar una URL real, el estado es **Preparado para publicar, pendiente de despliegue manual**.

## Máquina de estados

El servidor es el único que puede cambiar el estado:

```text
waiting
  → story
  → role_reveal
  → waiting_ready
  → ready_for_exploration
  → exploration
  → exploration_finished
  → ready_for_discussion
  → discussion
  → discussion_finished
  → ready_for_voting
  → voting
  → calculating_result
  → game_finished

Si la ronda principal termina empatada:

ready_for_voting → voting → vote_tiebreaker → calculating_result → game_finished
```

- `waiting`: acepta jugadores y permite iniciar al anfitrión.
- `story`: presenta la historia y registra quién terminó de leer.
- `role_reveal`: entrega individualmente los roles cuando todos confirmaron la historia.
- `waiting_ready`: espera las confirmaciones de rol restantes.
- `ready_for_exploration`: presenta las reglas, cinco zonas y espera confirmaciones; un timeout del servidor evita el bloqueo.
- `exploration`: aldea 2D caminable sincronizada con un único reloj predeterminado de 90 segundos y búsquedas privadas.
- `exploration_finished`: cancela búsquedas pendientes y presenta el cierre antes de conversar.
- `ready_for_discussion`: todos están listos y el anfitrión puede iniciar.
- `discussion`: chat abierto y reloj del servidor en curso.
- `discussion_finished`: cierre breve, formulario bloqueado e historial en lectura.
- `ready_for_voting`: transición breve que inicia automáticamente la votación.
- `voting`: ronda principal secreta con reloj de 60 segundos.
- `vote_tiebreaker`: única ronda secreta entre los candidatos empatados, con reloj de 30 segundos.
- `calculating_result`: transición breve mientras el cliente representa el conteo ya resuelto por el servidor.
- `game_finished`: resultado inmutable, roles y papeletas revelados.
- `returning_to_lobby`: transición interna usada al limpiar la partida antes de volver a `waiting`.

Las confirmaciones repetidas son idempotentes. Una transición fuera de orden es rechazada.

## Primera historia

**Las campanas de San Jerónimo**, ubicada en la sierra del Perú. Una iglesia abandonada, las campanas que vuelven a sonar tras la desaparición del cuidador y una criatura oculta introducen el misterio sin violencia explícita.

La historia vive en `server/stories/sanJeronimo.js` y contiene también su conclusión. Esta solución permanece fuera del DTO público hasta `game_finished`.

## Roles

| Jugadores | Criatura | Investigador | Habitantes |
| ---: | ---: | ---: | ---: |
| 3 | 1 | 1 | 1 |
| 4 | 1 | 1 | 2 |
| 5 | 1 | 1 | 3 |
| 6 | 1 | 1 | 4 |

- **Criatura:** debe permanecer oculta y evitar que descubran su identidad.
- **Investigador:** ayudará a analizar la información y descubrir a la criatura.
- **Habitante:** observará y ayudará al pueblo a identificarla.

La distribución utiliza Fisher–Yates con `crypto.randomInt`. Se ejecuta una sola vez al comenzar y se asocia al UUID estable de cada jugador.

## Fase 4B: exploración caminable de San Jerónimo

Después de confirmar los roles, todos comienzan simultáneamente en la plaza. El exterior mide 1600×1152 (25×18 tiles lógicos de 64 px) e incluye plaza, calle occidental, iglesia, campanario, casa del cuidador, fuente, caminos, viviendas, vegetación, faroles y niebla. Iglesia, casa y campanario tienen interiores de una pantalla. La ventana occidental comparte su ID desde ambos lados; no crea una pista duplicada.

Controles: **WASD** o flechas para caminar, **E** para investigar/entrar/salir. En pantallas táctiles aparecen joystick direccional y botón contextual. El movimiento se limita a cuatro direcciones y se detiene al perder foco, desconectarse, investigar o terminar el reloj. La cámara sigue al jugador, respeta límites y adapta el zoom sin recrear Phaser.

El cliente envía posición/dirección/movimiento a 12,5 Hz como máximo y solamente si cambian. Los jugadores remotos se interpolan y solo se dibujan cuando comparten escena. El aspecto publica identidad, nombre, conexión e investigación, pero nunca rol, pistas, voto o autenticidad. El servidor valida frecuencia, escena, coordenadas, colisiones básicas, velocidad, puertas y distancia de interacción; rechaza teletransportes y entradas inexistentes.

Cada búsqueda dura aproximadamente tres segundos. Habitante e investigador reciben la versión verdadera del objeto; la criatura recibe únicamente una versión distorsionada y plausible. El investigador puede añadir una sola observación analítica a una pista encontrada. Ubicaciones y presencia son públicas, pero objetos investigados, textos, análisis y cuaderno permanecen privados.

El cuaderno conserva zona, objeto, título, texto y análisis. Se puede abrir sin pausar el reloj y sigue alimentando **Ver mis pistas** durante conversación y votación. Al terminar `endsAt`, el servidor cancela búsquedas incompletas, conserva las completadas y entra a `ready_for_discussion`; el chat no conoce el mapa. El reparto automático anterior (`public_evidence` → `private_clues`) ya no forma parte de la máquina de estados ni tiene eventos activos.

La reconexión restaura escena, coordenadas autoritativas, dirección, tiempo, objetos, pistas, análisis y búsqueda pendiente. Si la fase ya terminó no se vuelve a crear el canvas. Volver a jugar parte del punto inicial y construye una instancia limpia.

### Arte y audio provisionales

El prototipo usa formas vectoriales generadas por el propio proyecto: personaje base, adobe, madera, piedra, caminos, vegetación, faroles, niebla y mobiliario. Los sonidos son síntesis Web Audio original, sin archivos ni licencias externas. Recursos pendientes de producción: tiles pintados de exterior; sprites definitivos con cuatro caminatas e investigación; fondos de los tres interiores; ilustraciones individuales de objetos; transiciones/efectos atmosféricos finales; grabaciones licenciadas de viento, pasos por superficie, puertas, madera, perros y campanas.

## Protección de información privada

- `room:updated` y el estado público se construyen mediante una lista explícita de campos.
- Los roles, objetos investigados y cuadernos viven únicamente en `Map` internos del servidor.
- `role:assigned` y `clues:assigned` se emiten directamente al Socket autenticado de cada jugador.
- No se envían listas de roles, objetivos ajenos ni la identidad de la criatura.
- El cliente recibe el mapa sin versiones de pistas; cada texto encontrado llega solo al socket autenticado.
- Al ocultar un rol o las pistas, su contenido visible se elimina del DOM.
- Los roles no se registran en la consola.
- Las pruebas inspeccionan que las cargas públicas no incluyan asignaciones, tokens, Socket IDs u objetivos.
- Las papeletas viven en un `Map` interno. Durante las rondas solo se publica `{ confirmed, total }`; nombres elegidos, totales y ganador aparecen exclusivamente al final.

## Confirmaciones, desconexión y reconexión

Cada etapa mantiene su propio conjunto de UUID confirmados. El servidor ignora duplicados y publica únicamente las cantidades necesarias.

El servidor usa un UUID estable y un token aleatorio de reconexión; el Socket ID nunca es la identidad permanente. `sessionStorage` guarda únicamente código, UUID y token. Durante una desconexión se publica el estado temporal y el límite de regreso, pero nunca el token.

Durante los 30 segundos configurables se conservan historia, rol, pistas, confirmaciones y voto. El anfitrión no se transfiere todavía y nadie puede aprovechar su ausencia para ejecutar acciones exclusivas. Al restaurar la sesión, el jugador recupera:

- La etapa actual.
- Sus propias confirmaciones de historia, rol y preparación para explorar.
- Su mismo rol, ubicación, objetos ya investigados, búsqueda activa, pistas encontradas y uso del análisis.
- El mismo `endsAt`, el tiempo restante y hasta los últimos 100 mensajes públicos durante o después de la conversación.
- Su marca privada `hasVoted`, sin revelar su elección, o el resultado final ya calculado.

La recuperación cubre `waiting`, historia, rol, preparación, mapa, conversación, votación, desempate y resultado. El servidor conserva `endsAt`, selecciona la pantalla desde el estado real y entrega únicamente los secretos del jugador restaurado.

Si vence el plazo:

- En `waiting`, elimina al ausente y transfiere el anfitrión al conectado más antiguo.
- En cualquier ronda activa anterior al resultado, elimina al ausente, cancela la ronda, limpia secretos, chat, votos, resultados parciales y temporizadores, y devuelve a los restantes a `waiting` con el mismo código.
- En `game_finished`, elimina al ausente y transfiere permisos sin recalcular ni modificar el resultado.
- Si la sala queda vacía, se elimina completamente.

Una sesión cuyo jugador o sala ya no existe recibe `SESSION_EXPIRED` o `RECONNECTION_FAILED`; el navegador borra `sessionStorage`, explica el problema y vuelve al menú.

## Errores e idempotencia

Todos los errores de Socket.IO utilizan `{ code, message, recoverable }`. Los errores esperados mantienen códigos estables como `INVALID_NAME`, `ROOM_NOT_FOUND`, `NOT_HOST`, `INVALID_STATE`, `CHAT_RATE_LIMITED`, `VOTE_ALREADY_SUBMITTED`, `SESSION_EXPIRED` y `RECONNECTION_FAILED`. Un error interno se transforma en `INTERNAL_ERROR` sin enviar stack, ruta, payload ni token.

Los payloads se validan como objetos exactos con campos obligatorios. Identidad, sala, permisos y estado se comprueban nuevamente en el servidor. Crear/unirse, iniciar, confirmar, votar, volver a jugar y salir bloquean solicitudes simultáneas equivalentes en el cliente; el servidor conserva además guardas idempotentes, conjuntos de confirmación, límites de frecuencia y cierres de temporizador de una sola ejecución.

La interfaz utiliza regiones `aria-live` para conexión perdida, reconexión, recuperación, sesión expirada y cancelación. Los avisos repetidos se deduplican y una recuperación imposible ofrece **Volver al inicio**.

## Limpieza y estabilidad

- Cada sala registra su última actividad y mantiene referencias explícitas a sus temporizadores de conversación, transiciones, votación, desempate, resultado y reconexión.
- Reiniciar, cancelar, volver a jugar, eliminar una sala o cerrar el servidor cancela todas esas referencias.
- Un barrido periódico retira salas inactivas sin jugadores conectados y depura entradas vencidas del limitador de frecuencia. Nunca elimina una sala que conserve una conexión activa.
- `GET /health` responde solamente con estado y versión pública; nunca expone salas ni jugadores.
- Express oculta su firma, usa CSP y cabeceras básicas; Socket.IO limita el tamaño de mensajes y valida orígenes en producción.
- `SIGINT` y `SIGTERM` realizan un cierre ordenado. Errores no controlados se registran con contexto limitado y provocan el cierre, en vez de mantener un estado desconocido.
- Las salas siguen almacenadas solo en memoria: reiniciar Node elimina todas las partidas y las sesiones del navegador pasarán a expiradas.

## Fase 5: mesa de reconstrucción y chat

- El anfitrión inicia una sola vez cuando la exploración terminó y todos están conectados.
- El servidor guarda `startedAt` y `endsAt` y mantiene un único temporizador por sala. El navegador solo representa el tiempo restante y muestra avisos a 60, 30 y 10 segundos.
- El tiempo predeterminado es 240 segundos. Una recarga, otra pestaña o una reconexión no lo reinician.
- La conversación contiene una mesa pública con cinco etapas ordenadas: Llegada, Entrada, Campanas, Advertencia y Suplantación. Cada etapa admite una sola pista y el chat permanece disponible en paralelo.
- Cada hallazgo conserva en servidor `canonicalStep` e `isAuthentic`. Las pistas distorsionadas de la criatura nunca puntúan y esos campos no forman parte de ningún DTO público o privado del cliente.
- Solo el propietario puede colocar, mover o retirar su pista; ser anfitrión no concede privilegios. Cada operación exige la versión vigente, incrementa `boardVersion` e invalida todas las confirmaciones anteriores.
- Los jugadores seleccionan una pista y una etapa y confirman el cambio en un diálogo accesible. En móvil pueden alternar entre Mesa y Chat sin perder el reloj ni el estado compartido.
- Todos los conectados deben confirmar la misma versión. La unanimidad o el vencimiento bloquean la mesa una sola vez; el servidor calcula de 0 a 5 aciertos y considera superada la reconstrucción con al menos 4.
- Antes de votar solo se publica puntuación, estado superado/no superado y mensaje general. Las etapas correctas, incorrectas, autenticidad, pasos canónicos y pistas usadas quedan como resultado interno para integración futura.
- Cada cliente envía solamente `{ text }`. El servidor deriva UUID público, nombre, sala y hora desde la sesión autenticada.
- Se aceptan hasta 300 caracteres, se rechazan vacíos y se exige un intervalo de 750 ms; además se permiten como máximo ocho mensajes aceptados por jugador en diez segundos.
- El historial permanece en memoria y conserva solamente los últimos 100 mensajes. No se reenvía completo con cada mensaje.
- HTML, enlaces y scripts se conservan como texto plano y se insertan mediante `textContent`.
- El modal de consulta se construye solo al abrirse, muestra evidencia pública y las pistas del socket actual, y elimina el contenido privado del DOM al cerrarse.
- Al bloquearse la mesa, el servidor rechaza nuevos cambios y mensajes, muestra la puntuación con la mesa congelada y conduce automáticamente a `ready_for_voting` sin cambiar el conteo ni el resultado de la Fase 6.

## Votación, desempate y resultado

- Cada participante envía únicamente el UUID público del candidato. El servidor deriva votante y sala desde el socket, rechaza voto propio, candidato inválido, repetición, estado incorrecto, solicitud tardía y exceso de frecuencia.
- La selección no cuenta hasta confirmarse en un diálogo accesible. Después es definitiva. La ronda termina cuando votan todos o vence `endsAt`; los faltantes se registran como abstenciones.
- `server/game/countVotes.js` es una función pura que valida las papeletas y devuelve votos válidos, abstenciones, total por candidato, máximos, empate y candidato seleccionado.
- Un empate abre una sola ronda de 30 segundos y limita la lista a los empatados. Si persiste, la criatura gana porque el pueblo no llegó a una decisión única.
- El pueblo dispone de dos objetivos: aprobar la reconstrucción y señalar correctamente a la criatura. Solo gana cuando completa ambos; si falla cualquiera, gana la criatura.
- `RECONSTRUCTION_REQUIRED_SCORE` fija el requisito en servidor y vale 4/5 de forma predeterminada. La puntuación y el requisito quedan congelados al bloquear la mesa y se vuelven a validar antes de votar y de calcular el resultado.
- El cálculo puro produce los códigos `VILLAGE_COMPLETED_BOTH_OBJECTIVES`, `CREATURE_SABOTAGED_STORY`, `CREATURE_EVADED_VOTE`, `CREATURE_TOTAL_DECEPTION` y `CREATURE_WON_BY_PERSISTENT_TIE`; los textos visuales no deciden el ganador.
- Un empate persistente, una acusación a un inocente o la ausencia de sospechoso único hacen que falle el objetivo de acusación. Las abstenciones continúan contándose con las reglas existentes y no alteran la puntuación de reconstrucción.
- En `game_finished` se revelan las posiciones correctas e incorrectas, autenticidad, ubicación canónica y propietario de las pistas colocadas, junto con el orden verdadero. Nada de esa información aparece durante la votación.
- En `game_finished` se revelan criatura, jugador seleccionado, todos los roles, votos recibidos, abstenciones y papeletas por ronda sin tokens, Socket IDs ni identificadores internos.
- `winner` se conserva como alias compatible de `winnerTeam` en `game:result`; `outcomeCode` es la fuente estable del motivo.

El umbral 4/5 queda pendiente de validación con jugadores reales. Si el pueblo pierde con demasiada frecuencia se considerará 3/5; si la criatura pierde demasiado, se mantendrá 4/5 o se revisará la cobertura de pistas. No se harán cambios de balance sin datos.

## Volver a jugar

Solo el anfitrión puede usar **Volver a jugar**. Todos los conectados regresan a `waiting` con el mismo código y se limpian historia, roles, ubicaciones, objetos investigados, búsquedas, cuadernos, análisis, confirmaciones, chat, papeletas, rondas, resultado y temporizadores. Cada jugador también puede **Regresar al menú**; su sesión local se elimina y la anfitrionía se transfiere cuando corresponde.

## Reiniciar para pruebas

En `ready_for_discussion`, el anfitrión puede pulsar **Reiniciar partida**. El servidor valida el permiso, conserva los jugadores y limpia:

- Historia seleccionada.
- Asignaciones secretas.
- Ubicaciones, objetos investigados, búsquedas y cuadernos privados.
- Todas las confirmaciones de etapa.
- Historial, controles de frecuencia y temporizadores de conversación.

La siguiente partida realiza un nuevo barajado.

## Eventos Socket.IO

Cliente → servidor:

- Salas: `room:create`, `room:join`, `room:restore`, `room:leave`.
- Juego: `game:start`, `story:confirm`, `role:confirm`, `exploration:ready`, `exploration:position`, `exploration:transition`, `exploration:investigate`, `exploration:analyze`, `discussion:start`, `chat:send`, `reconstruction:place`, `reconstruction:move`, `reconstruction:remove`, `reconstruction:confirm`, `vote:submit`, `game:play-again`, `game:return-to-menu`, `game:reset`.

Servidor → cliente:

- Sala: `room:joined`, `room:updated`, `room:left`, `room:error`.
- Exploración pública: `exploration:waiting`, `exploration:started`, `exploration:player-state`, `exploration:scene-changed`, `exploration:finished`; nunca contienen hallazgos.
- Exploración privada: `exploration:state`, `exploration:search-started`, `exploration:clue-found`, `exploration:error`.
- Juego público: `game:started`, `story:presented`, los eventos de progreso, `game:ready-for-discussion`, `discussion:started`, `discussion:state`, `discussion:finished`, `chat:message`, `chat:history`, `chat:error`, `reconstruction:started`, `reconstruction:board-updated`, `reconstruction:progress`, `reconstruction:locked`, `reconstruction:result`, `reconstruction:error`, `game:ready-for-voting`, `voting:started`, `voting:progress`, `voting:closed`, `voting:tiebreaker`, `game:result`, `game:reset`, `game:cancelled`, `vote:error`, `game:error`.
- `game:result` conserva `winner` por compatibilidad y añade `winnerTeam`, `outcomeCode`, el resumen/revelación `reconstruction` y el objetivo `accusation`. La reconexión posterior recibe exactamente el resultado almacenado, sin recalcularlo.
- Estado individual: `game:state`, `role:assigned` y `clues:assigned`. Roles y cuadernos siempre se envían a una única conexión.
- Presencia: `player:disconnected`, `player:reconnected`, `player:removed`, `host:changed`.

`room:start` y `room:reset` permanecen como alias compatibles de la Fase 2, pero el frontend utiliza los eventos `game:*`.

## Probar con varias pestañas

1. Ejecuta `npm run dev`.
2. Crea una sala en la primera pestaña.
3. Abre dos pestañas adicionales y entra con nombres diferentes.
4. Inicia como anfitrión y confirma la historia en cada pestaña.
5. Revela cada carta manteniendo las otras pantallas fuera de vista.
6. Confirma los roles y pulsa **Estoy preparado** en las tres pestañas.
7. Recorre la plaza y calle, entra y sal de los tres interiores y observa que solo se ven jugadores de la misma escena. Investiga hasta dos objetos por jugador y comprueba las reglas de rol.
8. Abre el cuaderno, recarga una pestaña durante la exploración y comprueba que recupera tiempo, escena, posición, objetos y hallazgos sin duplicar canvas.
9. Espera el cierre, inicia la conversación como anfitrión y verifica **Ver mis pistas** y el chat desde cada pestaña.
10. Espera el cierre automático, elige un sospechoso en cada pestaña y confirma cada voto.
11. Comprueba que antes del cierre solo cambia el contador de participación, no los totales por candidato.
12. Revisa la revelación final. Para forzar un desempate, distribuye los votos entre dos o tres candidatos; deja una pestaña sin votar para comprobar abstenciones por tiempo.
13. Pulsa **Volver a jugar** como anfitrión y verifica que todos regresan a la misma sala limpia.

Para una prueba manual reducida, crea un `.env` con `EXPLORATION_DURATION_SECONDS=30`, `DISCUSSION_DURATION_SECONDS=30`, `VOTING_DURATION_SECONDS=15` y `TIEBREAKER_DURATION_SECONDS=10`. Las pruebas automatizadas inyectan milisegundos aún más cortos directamente en el servicio sin cambiar los valores de producción.

Para verificar recuperación, recarga sucesivamente durante historia, rol, preparación, exploración, conversación, votación, desempate y resultado. Después desconecta una pestaña menos y más que `RECONNECTION_GRACE_SECONDS`; el primer caso debe restaurar exactamente la etapa y el segundo debe cancelar limpiamente una ronda activa.

Desde otro dispositivo de la misma red utiliza `http://IP_LOCAL_DEL_SERVIDOR:3000`. Puede ser necesario permitir el puerto en el firewall.

## Pruebas realizadas

La suite cubre:

- Inicio con 3, 4, 5 y 6 jugadores.
- Distribución exacta y variación del barajado.
- Exterior de 25×18 tiles, tres interiores, quince IDs de objeto y mundo público sin secretos.
- Frecuencia, límites, obstáculos, velocidad, teletransportes, escenas, puertas y distancia autoritativa.
- Máximo de dos pistas, versiones por rol y análisis único del investigador.
- Temporizador único, cancelación de búsqueda, reconexión y limpieza de exploración.
- Permisos, estados y pulsaciones repetidas.
- Confirmaciones idempotentes y progreso sincronizado.
- Estado público sin secretos.
- Reinicio y limpieza completa.
- Reconexión conservando el mismo papel, pistas y confirmaciones.
- Cancelación por vencimiento de reconexión.
- Protocolo real con varios clientes Socket.IO.
- Inicio exclusivo del anfitrión y un mismo `endsAt` para todos.
- Mensajes de 3 a 6 jugadores, validación, longitud, identidad, frecuencia y ráfaga.
- HTML inerte, historial de 100, deduplicación y rechazo fuera de etapa.
- Cierre automático, bloqueo posterior y limpieza de reloj e historial.
- Reconexión durante el conteo con historial, tiempo y pistas propias.
- Flujo completo en tres pestañas de navegador.
- Responsive en 320, 375, 768 y 1440 px.
- Consolas de navegador sin errores.
- Inicio automático y `endsAt` compartido de la votación.
- Rechazo de voto propio, inexistente, repetido, ajeno, tardío y fuera de estado.
- Cierre por último voto y por reloj, incluida la protección contra doble cierre.
- Privacidad de resultados parciales y revelación segura solo en `game_finished`.
- Conteo, abstenciones, empate, desempate resuelto y empate persistente.
- Victoria del pueblo, victoria de la criatura y reconexión sin segundo voto.
- Recuperación del resultado final y limpieza integral al volver a jugar.
- Formato centralizado de errores y ocultación de detalles internos.
- Rechazo de payloads incompletos o con propiedades inesperadas.
- Creación duplicada, confirmaciones repetidas y solicitudes concurrentes deduplicadas.
- Conservación temporal y transferencia definitiva del anfitrión.
- Recuperación durante desempate sin duplicar jugadores.
- Cancelación y limpieza integral al vencer una reconexión durante votación.
- Inmutabilidad del resultado cuando expira un jugador.
- Eliminación por inactividad y cancelación de referencias de reconexión.
- Endpoint `/health` mínimo, configuración de producción, caché, proxy HTTPS, logs seguros, cierre ordenado y limpieza del limitador de frecuencia.

## Reservado para fases posteriores

- Nuevas historias y roles.
- Cuentas, estadísticas permanentes, ranking y tienda.
- Persistencia en base de datos.
