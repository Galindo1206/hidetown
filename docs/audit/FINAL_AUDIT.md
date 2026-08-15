# Auditoría final integral — Fase 11

Fecha: 2026-08-15  
Versión auditada: `0.9.0-beta.1`  
Estado del producto: preparado localmente, sin despliegue público verificado  
Huella inicial del alcance auditado: 53 archivos, SHA-256 agregado `00B23E6D43B28331E64BA866A87FCDDEE2DE5FFB61C581F3051A0E833072B105`

## 1. Resumen ejecutivo

El prototipo tiene una base técnica sólida para grupos pequeños: la autoridad reside en el servidor, la información privada se entrega por socket, las transiciones inválidas se rechazan, los temporizadores se cancelan al limpiar y las votaciones se calculan con una función pura. Las 67 pruebas existentes pasaron y una auditoría real en Edge recorrió 17 pantallas y 3 diálogos en nueve resoluciones sin errores de consola, recursos fallidos ni desbordes detectados.

La auditoría no aprueba todavía una beta pública. Hay dos bloqueos altos: el proyecto completo está sin seguimiento dentro de un repositorio cuya raíz es `C:\` y cuyo remoto pertenece a otro producto (`DEPLOY-001`), y no existe una política global de capacidad para conexiones o salas persistentes mientras estén conectadas (`SEC-001`). También se reprodujo que una desconexión definitiva durante `calculating_result` borra un resultado ya calculado (`GAME-001`).

No existe una URL pública verificable. En consecuencia no se comprobaron Render, HTTPS/WSS real, suspensión y despertar, logs remotos, rollback ni uso desde dos redes. El resultado local correcto no debe presentarse como aprobación en producción.

## 2. Alcance

Se revisaron arquitectura, módulos, máquina de estados, salas, identidad, roles, pistas, chat, votaciones, temporizadores, desconexiones, frontend, responsive, accesibilidad técnica, rendimiento local, dependencias, producción preparada, privacidad, documentación y experiencia técnica del jugador.

No se modificaron fuentes, configuración ni dependencias. Solo se crearon los documentos de `docs/audit/`.

## 3. Entorno utilizado

- Windows NT `10.0.26200.0`, PowerShell `5.1.26100.9168`.
- Node.js `v22.19.0`; npm `10.9.3`.
- Microsoft Edge `151.0.4129.78`, modo headless y protocolo DevTools.
- Servidor local con `NODE_ENV=production`, HTTP en `127.0.0.1:3000`.
- Render: no conectado; no existe servicio ni panel accesible.
- Git detectado: raíz `C:/`; remoto `https://github.com/Galindo1206/dg-soluciones-digitales.git`; `git ls-files -- .` no listó archivos de HideTown.

## 4. Pruebas realizadas

| Prueba | Tipo | Resultado |
| --- | --- | --- |
| `npm run check` | Estática | Aprobada |
| `npm run test:production` | Automatizada local | 4/4 |
| `npm run test:rc` | Automatizada local | 7/7 |
| `npm test` | Automatizada local | 67/67 |
| `npm audit --omit=dev` | Registro npm, 2026-08-15 | 0 vulnerabilidades conocidas |
| `npm outdated --json` | Registro npm | `{}`; sin dependencias directas desactualizadas informadas |
| Flujo real de 3 clientes | Clientes Node `socket.io-client` contra servidor real | Aprobado |
| Flujos de 3, 4, 5 y 6 jugadores | Servicio de salas, sin navegador | Aprobados |
| Tres partidas consecutivas | Servicio de salas | Aprobadas |
| Victoria pueblo/criatura, abstención, empate y desempate | Funciones/servicio | Aprobadas |
| Reconexión por etapas | Servicio y protocolo real parcial | Aprobada en estados cubiertos |
| Edge en 9 viewports | Navegador real, emulación de viewport | 180/180; 0 fallos |
| Recursos privados por HTTP | Servidor local de producción | `.env`, `package.json`, servidor, prueba y documentación: 404 |
| Exposición de secretos | Revisión estática y serialización automatizada | Sin coincidencias materiales |
| Desconexión en `calculating_result` | Reproducción focalizada | Falló: vuelve a `waiting` y borra resultado |
| Limpieza de 20 salas conectadas inactivas | Reproducción focalizada no agresiva | 0 retiradas; confirma capacidad no acotada |

La prueba visual informó carga de 320 ms, 14 recursos, 186 584 bytes transferidos, ~1.88 MB de heap JS, 1 804 nodos, sin recursos externos, solicitudes fallidas o excepciones. Son medidas de una ejecución local, no un benchmark estadístico.

## 5. Pruebas bloqueadas o no realizadas

- URL pública, TLS, WSS, health, logs, métricas, cold start, rollback y `SIGTERM` en Linux/Render.
- Dispositivos físicos, teclado virtual, orientación real y redes Wi-Fi/datos móviles.
- Chrome, Firefox y Safari en esta fase; solo Edge fue revalidado.
- NVDA, VoiceOver o TalkBack; auditoría formal WCAG y medición instrumental completa de contraste.
- Partidas completas de 3–6 personas en navegadores reales; solo el flujo de 3 clientes Node atravesó Socket.IO real.
- Soak prolongado, límites reales de CPU/RAM, 100 conexiones y pruebas de carga. Se evitó carga agresiva.
- Diversión, balance, rejugabilidad, duración percibida, claridad de pistas y oportunidad de defensa de la criatura: pendiente de validar con usuarios.
- Instalación limpia con `npm ci`: no se ejecutó porque la fase prohíbe modificar dependencias instaladas.

## 6. Hallazgos por severidad

| Severidad | Cantidad |
| --- | ---: |
| Crítico | 0 |
| Alto | 2 |
| Medio | 2 |
| Bajo | 5 |
| Informativo | 5 |

| ID | Severidad | Título | Informe principal |
| --- | --- | --- | --- |
| DEPLOY-001 | Alto | Raíz y remoto Git ajenos; el proyecto está sin seguimiento | `DEPLOYMENT_AUDIT.md` |
| SEC-001 | Alto | Capacidad global de salas y conexiones sin límite de aplicación | `SECURITY_AUDIT.md` |
| GAME-001 | Medio | Una desconexión durante el conteo borra el resultado calculado | `UX_AUDIT.md` |
| NET-001 | Medio | El límite de crear/unirse se comparte por dirección de transporte | `SECURITY_AUDIT.md` |
| SEC-002 | Bajo | `connect-src` permite cualquier destino `ws:`/`wss:` | `SECURITY_AUDIT.md` |
| UX-001 | Bajo | Falta orientación general contra datos personales en nombre/chat | `UX_AUDIT.md` |
| CODE-001 | Bajo | Módulos centrales grandes y estados repetidos | Este informe |
| DEPLOY-002 | Bajo | Los health checks no quedan en logs con el nivel productivo | `DEPLOYMENT_AUDIT.md` |
| DOC-001 | Bajo | La lista de recursos públicos omite Socket.IO | Este informe |
| CODE-002 | Informativo | Arquitectura adecuada para beta pequeña, no para escala horizontal | Este informe |
| DEPLOY-003 | Informativo | Producción y URL pública no verificadas | `DEPLOYMENT_AUDIT.md` |
| A11Y-001 | Informativo | Verificación asistiva incompleta | `UX_AUDIT.md` |
| UX-002 | Informativo | Cualidades lúdicas pendientes de usuarios | `UX_AUDIT.md` |
| PERF-001 | Informativo | Falta prueba prolongada y con seis clientes reales | `UX_AUDIT.md` |

## 7. Hallazgos detallados de arquitectura y documentación

### CODE-001 — Módulos centrales grandes y estados repetidos

- **Severidad:** Bajo.
- **Área:** calidad y mantenibilidad.
- **Evidencia:** `js/app.js` tiene 1 188 líneas; `server/services/roomService.js`, 743. Las listas de estados aparecen en `ACTIVE_STATES`, `RESETTABLE_STATES`, métodos privados, `stateScreens` y condicionales del frontend.
- **Archivo y ubicación:** `js/app.js:20-59, 700-740`; `server/services/roomService.js:18-28, 450-480`.
- **Pasos para reproducir:** buscar cada literal de estado y comparar las listas.
- **Resultado esperado:** una definición canónica o módulos cohesionados que reduzcan divergencias.
- **Resultado actual:** varias listas manuales deben mantenerse sincronizadas.
- **Impacto:** una etapa nueva puede quedar sin pantalla, privacidad o limpieza correcta.
- **Probabilidad:** media al ampliar el juego; baja en el alcance actual.
- **Recomendación:** extraer constantes/transiciones compartidas del servidor, dividir renderizadores por etapa y conservar DTOs explícitos.
- **Esfuerzo:** Medio.
- **Prueba futura:** prueba que enumere todos los estados y exija pantalla, política privada y transición documentada.

### DOC-001 — La lista de recursos públicos omite Socket.IO

- **Severidad:** Bajo.
- **Área:** documentación.
- **Evidencia:** README afirma que Express publica solamente `index.html`, `css`, `js` y `assets`; el servidor configura `serveClient: true` y el HTML carga `/socket.io/socket.io.js`.
- **Archivo y ubicación:** `README.md:79`; `server/server.js:20-22`; `index.html:14`.
- **Pasos para reproducir:** iniciar el servidor y solicitar `/socket.io/socket.io.js`.
- **Resultado esperado:** inventario de superficie HTTP que incluya los endpoints administrados por Socket.IO.
- **Resultado actual:** documentación incompleta, aunque los recursos privados probados devuelven 404.
- **Impacto:** bajo; puede confundir revisiones de superficie pública y caché.
- **Probabilidad:** alta de confusión documental, baja de impacto funcional.
- **Recomendación:** actualizar el inventario después de remediar hallazgos.
- **Esfuerzo:** Bajo.
- **Prueba futura:** prueba/documentación que enumere raíz, estáticos, `/health` y `/socket.io/*`, y confirme 404 para fuentes privadas.

### CODE-002 — Arquitectura adecuada para beta pequeña, no para escala horizontal

- **Severidad:** Informativo.
- **Área:** arquitectura y crecimiento.
- **Evidencia:** una instancia conserva mapas, timers, roles, pistas, chat y votos en memoria; Socket.IO usa adaptador local. Las historias, roles, pistas y conteo sí están separados y son ampliables.
- **Archivo y ubicación:** `server/services/roomService.js:29-74`; `server/server.js:17-61`; `server/stories/index.js`; `server/game/*`.
- **Pasos para reproducir:** revisar propiedad de estado y ausencia de adaptador/persistencia compartida.
- **Resultado esperado:** para beta pequeña, una sola instancia documentada; para crecer, almacenamiento y coordinación compartidos.
- **Resultado actual:** correcto para prototipo y una instancia, incompatible con balanceo horizontal.
- **Impacto:** ninguno en alcance aceptado; relevante al crecer.
- **Probabilidad:** alta si aumenta tráfico o se habilita más de una instancia.
- **Recomendación:** antes de escalar, diseñar repositorio persistente, adaptador Socket.IO, reloj/colas y afinidad o recuperación distribuida.
- **Esfuerzo:** Alto.
- **Prueba futura:** integración multiinstancia con creación, reconexión y eventos cruzados.

## 8. Hallazgos por área

- **Arquitectura:** separación adecuada; dos módulos grandes y estado local limitan evolución.
- **Juego:** flujo completo aprobado salvo desconexión en `calculating_result`.
- **Seguridad/privacidad:** sin filtración comprobada; capacidad no acotada es el riesgo principal.
- **Tiempo real:** reconexión y aislamiento pasan; la clave de rate limit puede agrupar usuarios.
- **Responsive:** aprobado en emulación Edge de nueve viewports.
- **Accesibilidad:** teclado, foco, nombres, Escape, zoom y movimiento reducido pasan; evaluación asistiva incompleta.
- **Rendimiento:** carga local ligera; falta capacidad y soak.
- **Producción:** configuración preparada; Git y ausencia de servicio impiden validación.
- **Documentación:** extensa y mayormente coherente; una omisión de superficie pública.

## 9. Riesgos de producción principales

1. Publicar desde la raíz/remoto actuales puede mezclar o exponer archivos ajenos y no produce un artefacto reproducible.
2. Conexiones/salas sostenidas pueden agotar una instancia gratuita sin alcanzar ningún límite interno.
3. Una desconexión en la ventana de conteo puede convertir un final válido en cancelación.
4. El rate limit por dirección puede bloquear grupos legítimos detrás de NAT o proxy.
5. TLS/WSS, cold start, señal de cierre, métricas y rollback siguen sin evidencia real.

## 10. Limitaciones conocidas aceptadas

- Estado efímero en memoria y pérdida al reiniciar/suspender.
- Una sola instancia.
- Sonido sintetizado.
- Suspensión del plan gratuito tras inactividad.
- Sin cuentas, base de datos, estadísticas ni moderación persistente.

## 11. Aspectos pendientes con usuarios

Pendiente de validar con usuarios: diversión, balance, rejugabilidad, duración percibida, claridad de historia/pistas, presión del reloj, oportunidad de defensa de la criatura, privacidad al compartir pantalla y comprensión del despertar del servidor.

## 12. Puntuación orientativa

| Área | Puntuación | Evidencia principal |
| --- | ---: | --- |
| Arquitectura | 84 | Buena separación de dominio; estado en memoria y módulos grandes |
| Calidad del código | 82 | Validación/errores claros y 67 pruebas; duplicación de estados |
| Seguridad | 76 | Secretos y autorización aprobados; riesgo alto de disponibilidad |
| Lógica del juego | 88 | Resultados y transiciones cubiertos; defecto en conteo/desconexión |
| Tiempo real | 84 | Flujo Socket.IO real y reconexión; rate limit por dirección |
| Estabilidad | 85 | Suite verde y limpieza probada; sin soak y con ventana de cancelación |
| Responsive | 94 | 180 comprobaciones en nueve viewports sin fallos |
| Accesibilidad | 78 | Teclado/foco/zoom/movimiento pasan; sin lector ni auditoría formal |
| Rendimiento | 80 | 186 KB y ~1.88 MB heap local; capacidad no ensayada |
| Producción | 48 | Blueprint correcto, pero Git, URL y Render no verificados |
| Documentación | 88 | Cobertura extensa y honesta; omisión menor de superficie HTTP |

**Puntuación general: 81/100.** Es el promedio redondeado de las once áreas; no compensa los bloqueos altos ni equivale a aprobación.

## 13. Recomendaciones

1. Crear un repositorio dedicado y verificar su remoto antes de cualquier publicación.
2. Implementar límites globales configurables, respuesta de capacidad y métricas.
3. Preservar el resultado calculado durante desconexiones en `calculating_result` y añadir regresión.
4. Revisar el rate limit bajo proxy/NAT con una estrategia confiable y probada.
5. Repetir toda la lista pública en Render desde dos redes y dispositivos físicos.
6. Ejecutar playtest humano y evaluación asistiva antes de ampliar audiencia.

## 14. Veredicto final

### No aprobado para beta pública

Motivos: existen dos hallazgos altos y no se completaron verificaciones esenciales de producción. El artefacto local puede describirse como **preparado para despliegue después de remediar DEPLOY-001 y SEC-001, corregir GAME-001 y repetir la validación**, pero no como aprobado en producción.

## 15. Verificación de integridad al cierre

Se recalculó la misma huella sobre los 53 archivos auditados, excluyendo `node_modules` y `docs/audit`: SHA-256 agregado `00B23E6D43B28331E64BA866A87FCDDEE2DE5FFB61C581F3051A0E833072B105`, idéntico al valor inicial. Los únicos archivos creados o modificados por esta fase son los cinco informes de `docs/audit/`. No se modificaron código fuente, configuración ni dependencias; tampoco se realizó commit, push, despliegue o rollback.
