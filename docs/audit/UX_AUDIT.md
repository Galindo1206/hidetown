# Auditoría de experiencia, juego, accesibilidad y rendimiento

Fecha: 2026-08-15  
Versión: `0.9.0-beta.1`

## Resumen

La experiencia técnica es coherente y utilizable en la revisión automatizada: se recorrieron 17 pantallas y 3 diálogos en nueve tamaños de viewport, desde `320×568` hasta `1920×1080`, sin desbordes, controles sin nombre accesible, errores de consola ni recursos fallidos. La navegación por teclado, Escape en diálogos, zoom de texto y preferencia de movimiento reducido respondieron correctamente en Microsoft Edge.

Esto no equivale a una validación con personas. Diversión, equilibrio, comprensión de pistas, duración, capacidad de defensa de la criatura y rejugabilidad requieren sesiones reales. Tampoco se realizó una auditoría WCAG formal, lector de pantalla, contraste instrumental ni prueba en dispositivos físicos.

## Recorrido técnico observado

- Crear y unirse a sala ofrecen etiquetas, errores asociados y estados anunciados.
- La sala de espera presenta código copiable, anfitrión, conectividad y requisitos de inicio.
- Historia, rol, evidencia y pistas separan el contenido público del privado y piden confirmación antes de avanzar.
- Discusión muestra temporizador, participantes, historial, límite de texto y estado de cierre.
- Votación comunica que el voto es secreto y definitivo; el resultado revela roles y rondas solo al final.
- Reconexión, cambio de anfitrión y vuelta a la sala están modelados, aunque no sustituyen la prueba en redes reales.
- El audio inicia bloqueado y dispone de un control etiquetado; no hubo reproducción automática inesperada.

## Evidencia responsive y accesible

El script de auditoría recorrió `320×568`, `360×640`, `375×667`, `390×844`, `412×915`, `768×1024`, `1024×768`, `1366×768` y `1920×1080`: 180 comprobaciones, 0 fallos. Se inspeccionaron 54 controles y ninguno quedó sin nombre accesible. También pasaron foco visible por teclado, cierre de diálogo con Escape, zoom de texto y `prefers-reduced-motion`.

La evidencia es automatizada y de un único motor, Edge 151 en modo headless. No demuestra lectura correcta con NVDA/JAWS/VoiceOver, contraste conforme en todos los estados, comodidad táctil real ni compatibilidad con Safari/Firefox/Chrome.

## Hallazgos

### GAME-001 — Una desconexión definitiva durante el conteo borra el resultado calculado

- **Severidad:** Medio.
- **Área:** máquina de estados, desconexión y experiencia de fin de partida.
- **Evidencia:** el servidor calcula y guarda el resultado antes de entrar en `calculating_result`, pero al retirar definitivamente un jugador solo conserva el resultado si el estado previo es exactamente `game_finished`. Reproducción con reloj falso: `STATE_AFTER_COUNT=calculating_result`; al vencer la gracia de reconexión, `STATE_AFTER_EXPIRY=waiting` y `RESULT_AFTER_EXPIRY=null`.
- **Archivo y ubicación:** `server/services/roomService.js:400-410, 577-594`.
- **Pasos para reproducir:** completar una votación; dejar la sala en `calculating_result`; desconectar un jugador; avanzar el reloj más allá de la gracia; observar el estado y `result`.
- **Resultado esperado:** el resultado ya resuelto permanece íntegro y la partida llega a `game_finished`, ajustando únicamente la presencia del jugador.
- **Resultado actual:** la retirada trata `calculating_result` como partida activa, limpia sus datos y devuelve la sala a `waiting`.
- **Impacto:** todos pierden el desenlace de una partida completa por la desconexión de una persona en una ventana breve.
- **Probabilidad:** baja por la duración de la ventana; media en redes móviles o inestables. El impacto es visible para todo el grupo.
- **Recomendación:** considerar definitivo el resultado desde que termina el conteo, desacoplar presencia de la conservación del desenlace y comprobar el temporizador pendiente antes de limpiar.
- **Esfuerzo estimado:** Bajo a medio.
- **Prueba futura:** desconexión y expiración antes, durante y después de `calculating_result`; resultado idéntico para jugadores conectados; temporizadores sin duplicados; vuelta a jugar funcional.

### UX-001 — Falta orientación general contra datos personales en nombre y chat

- **Severidad:** Bajo.
- **Área:** privacidad comunicada y contenido generado por usuarios.
- **Evidencia:** el formulario dice «Ingresa tus datos» y el chat permite texto libre. El aviso explícito de no incluir datos personales aparece en el formulario de reporte, no junto al nombre ni al chat. No se encontró persistencia, analítica ni log de esos textos en el servidor.
- **Archivo y ubicación:** `index.html:93-134, 327-352, 432-442`; `server/chat/messageValidator.js`; `server/utils/logger.js`.
- **Pasos para reproducir:** abrir crear/unirse y luego el chat; revisar ayudas visibles y enviar un nombre o mensaje con datos personales.
- **Resultado esperado:** orientación breve y contextual que desaconseje información personal antes de compartirla con el grupo.
- **Resultado actual:** se aceptan nombres y mensajes válidos sin esa indicación general.
- **Impacto:** una persona, especialmente menor de edad, podría compartir datos con los demás participantes creyendo que son necesarios.
- **Probabilidad:** baja a media; depende del público y del contexto de uso.
- **Recomendación:** sustituir «datos» por «nombre o apodo» y añadir una guía concisa cerca del nombre/chat. Mantener el mensaje sin afirmar garantías de anonimato.
- **Esfuerzo estimado:** Bajo.
- **Prueba futura:** revisión de contenido con usuarios; ayuda accesible asociada al campo; confirmar que no bloquea mensajes legítimos ni se repite de forma intrusiva.

### A11Y-001 — Verificación asistiva incompleta

- **Severidad:** Informativo.
- **Área:** accesibilidad.
- **Evidencia:** pasaron controles técnicos de nombres accesibles, teclado, Escape, zoom y movimiento reducido, pero no se ejecutaron lector de pantalla, contraste instrumental, navegación por voz ni dispositivos físicos.
- **Archivo y ubicación:** `index.html`; `css/*.css`; `js/app.js`; `scripts/visual-browser-audit.mjs`.
- **Pasos para reproducir:** revisar el alcance del script y la matriz de pruebas; no existen resultados de tecnologías asistivas en esta fase.
- **Resultado esperado:** evidencia manual y automatizada suficiente para declarar un nivel WCAG objetivo.
- **Resultado actual:** buena base técnica, sin evidencia para una declaración formal de conformidad.
- **Impacto:** problemas de anuncios, orden, contraste o interacción pueden afectar a usuarios reales pese a pasar la automatización.
- **Probabilidad:** indeterminada hasta la prueba asistiva.
- **Recomendación:** validar los recorridos completos con NVDA + Firefox/Chrome, VoiceOver + Safari, contraste y teclado; definir el nivel WCAG objetivo.
- **Esfuerzo estimado:** Medio.
- **Prueba futura:** matriz documentada por tecnología, estado y flujo; registrar defectos con criterio WCAG y evidencia reproducible.

### UX-002 — Las cualidades lúdicas están pendientes de usuarios

- **Severidad:** Informativo.
- **Área:** jugabilidad y comprensión.
- **Evidencia:** las pruebas confirman reglas y transiciones, no diversión ni comprensión humana. No hay sesiones registradas que midan duración, claridad de historia/pistas, equilibrio de roles, estrategia de engaño, defensa de la criatura o deseo de repetir.
- **Archivo y ubicación:** `server/stories/*`; `server/game/*`; `index.html:181-428`; documentación de reglas en `README.md`.
- **Pasos para reproducir:** intentar extraer métricas cualitativas de la suite; solo existen aserciones funcionales.
- **Resultado esperado:** decisiones de balance respaldadas por sesiones observadas con grupos objetivo.
- **Resultado actual:** la mecánica es técnicamente completa, pero su calidad lúdica no está validada.
- **Impacto:** una beta puede funcionar sin resultar clara, justa o atractiva.
- **Probabilidad:** indeterminada.
- **Recomendación:** hacer sesiones moderadas de 3, 4, 5 y 6 jugadores; medir abandono, duración por fase, comprensión, percepción de justicia y repetición.
- **Esfuerzo estimado:** Medio.
- **Prueba futura:** guion neutral, cuestionario corto y registro agregado sin datos personales; separar defectos técnicos de ajustes de balance.

### PERF-001 — Falta prueba prolongada y con seis clientes reales

- **Severidad:** Informativo.
- **Área:** rendimiento y estabilidad percibida.
- **Evidencia:** la carga local de una vista transfirió 186 584 bytes en 14 recursos, creó 1 804 nodos DOM y mostró aproximadamente 1,88 MB de heap JavaScript, sin errores. Las suites simulan múltiples sockets, pero no hubo soak prolongado ni seis navegadores/dispositivos reales concurrentes.
- **Archivo y ubicación:** `scripts/visual-browser-audit.mjs`; `test/*.test.js`; frontend completo.
- **Pasos para reproducir:** comparar el alcance de las pruebas existentes con una sesión real prolongada y monitoreada; esta última no tiene evidencia.
- **Resultado esperado:** comportamiento estable durante partidas repetidas bajo presupuesto de memoria/CPU y condiciones de red representativas.
- **Resultado actual:** resultados locales ligeros y correctos, sin datos longitudinales ni capacidad real.
- **Impacto:** fugas, acumulación de listeners, deriva de temporizador o degradación podrían aparecer tras varias partidas.
- **Probabilidad:** indeterminada; no se observó señal de fallo en las pruebas cortas.
- **Recomendación:** ejecutar un soak controlado de partidas consecutivas con 3–6 clientes, throttling de red y observación de RAM, CPU, listeners y latencia de eventos.
- **Esfuerzo estimado:** Medio.
- **Prueba futura:** umbrales acordados, perfiles antes/después, reconexiones repetidas y cero crecimiento no explicado entre partidas.

## Pendientes que requieren personas o infraestructura

- Diversión, comprensión, equilibrio y rejugabilidad con grupos objetivo.
- Lectores de pantalla, contraste, navegación por voz y dispositivos táctiles físicos.
- Compatibilidad en Firefox, Safari y Chrome; esta fase solo revalidó Edge.
- Seis clientes reales, redes distintas, latencia/pérdida de paquetes y sesiones prolongadas.

