# Lista manual de prueba — candidato 0.9.0-rc.1

Esta lista está preparada para una ejecución humana posterior. Una casilla vacía significa **no ejecutada**, no fallida.

## Registro de sesión

- Fecha:
- Responsable:
- Versión/identificador:
- Sistema y navegador:
- Dispositivo y resolución:
- Red:

## Instalación y menú

- [ ] `npm ci` termina sin errores.
- [ ] `.env.example` puede copiarse como `.env` sin añadir secretos.
- [ ] `npm run dev` inicia el servidor y `/health` responde 200.
- [ ] La carga pasa al menú sin quedar bloqueada.
- [ ] Crear, unir, ayuda y regresar funcionan con ratón y teclado.
- [ ] Los errores de nombre y código se entienden.
- [ ] El sonido comienza silenciado, se activa, se silencia y conserva la preferencia al recargar.

## Sala y partida

- [ ] Crear una sala y copiar el código.
- [ ] Unir entre 4 y 6 jugadores.
- [ ] Ver nombres, capacidad, anfitrión y conexión en tiempo real.
- [ ] Confirmar que invitado no puede iniciar.
- [ ] Recorrer historia, rol cerrado/revelado, evidencia y pistas.
- [ ] Cada jugador ve únicamente su rol y sus pistas.
- [ ] Conversar, consultar pistas y recibir mensajes sin duplicados.
- [ ] Ver el temporizador en todos los dispositivos.
- [ ] Votar, cancelar el modal y confirmar definitivamente.
- [ ] Confirmar que no aparecen resultados parciales.
- [ ] Entender resultado, roles y conteo.
- [ ] Volver a jugar conservando código y jugadores.
- [ ] Completar tres partidas seguidas.

## Casos incorrectos

- [ ] Nombre vacío y duplicado.
- [ ] Código inexistente.
- [ ] Séptimo jugador y acceso después de iniciar.
- [ ] Mensaje vacío, demasiado largo y ráfaga rápida.
- [ ] Intento de voto propio y doble voto.
- [ ] Doble clic en inicio, confirmaciones y volver a jugar.

## Conexión

- [ ] Desactivar y recuperar red durante espera, historia, rol, pistas, chat, voto y resultado.
- [ ] La pantalla, información privada y voto correcto se restauran.
- [ ] No aparece un jugador duplicado.
- [ ] El anfitrión se transfiere después de una salida definitiva.
- [ ] Una salida definitiva durante partida cancela y limpia la ronda.

## Responsive y accesibilidad

- [ ] Revisar 320×568, 360×640, 375×667, 390×844 y 412×915.
- [ ] Revisar 768×1024, 1024×768, 1366×768 y 1920×1080.
- [ ] Probar vertical y horizontal en dispositivo físico.
- [ ] Abrir el teclado móvil en el chat; el compositor permanece accesible.
- [ ] No hay desplazamiento horizontal, solapamientos ni botones fuera de alcance.
- [ ] Completar el flujo con Tab, Shift+Tab, Enter, Espacio y Escape.
- [ ] Probar zoom de texto al 200 %.
- [ ] Activar movimiento reducido y contraste alto.
- [ ] Ejecutar con NVDA, JAWS, TalkBack o VoiceOver y registrar anuncios confusos.

## Registro de defecto

```text
ID:
Resumen:
Severidad: crítica / alta / media / baja
Versión:
Dispositivo, sistema y navegador:
Condiciones previas:
Pasos exactos:
Resultado esperado:
Resultado obtenido:
Frecuencia:
Captura o vídeo:
¿Expone rol, pista, voto o token?:
```
