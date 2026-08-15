# Guía de prueba local con amigos

## Objetivo

Validar si un grupo real entiende el flujo, disfruta la conversación y puede completar varias partidas sin ayuda técnica. Esta versión es candidata y **todavía no está publicada en Internet**.

## Grupo recomendado

Reúne entre 4 y 6 jugadores. Una persona ejecutará el servidor y será responsable de registrar incidencias. Cada participante debe usar su propio navegador o una ventana privada para proteger su rol.

## Preparar el servidor

```powershell
cd ruta\al\proyecto\HideTown
npm ci
Copy-Item .env.example .env
npm run dev
```

En el equipo anfitrión abre `http://localhost:3000/health`; debe mostrar `{"status":"ok","version":"0.9.0-beta.1"}` sin datos de salas.

## Entrar desde la misma red

1. Conecta todos los dispositivos a la misma red Wi-Fi privada.
2. En Windows ejecuta `ipconfig` y localiza la dirección IPv4 del adaptador activo, por ejemplo `192.168.1.25`.
3. En cada dispositivo abre `http://DIRECCION-IP:3000`, sustituyendo `DIRECCION-IP` por la IPv4 real.
4. Si Windows pregunta por el firewall, permite Node únicamente en redes privadas y solo durante la prueba.
5. No abras puertos del router ni expongas este servidor directamente a Internet.

Si no conecta, comprueba que `.env` conserva `HOST=0.0.0.0`, que todos están en la misma red y que el firewall permite el puerto 3000 en perfil privado.

## Realizar la partida

1. Un jugador crea la sala y comparte el código, nunca su pantalla privada.
2. Los demás se unen con nombres distintos.
3. El anfitrión inicia cuando todos aparezcan conectados.
4. Cada persona revela y vuelve a ocultar su rol antes de pasar el dispositivo.
5. Lean historia, evidencia y pistas; confirmen individualmente.
6. Conversen por el chat o por voz sin mostrar la pantalla.
7. Voten y revisen juntos el conteo final.
8. Usen “Volver a jugar” y completen idealmente tres rondas.

Reglas esenciales: una persona es la criatura, otra investiga y el resto son habitantes; el pueblo gana identificando a la criatura, y la criatura gana si acusan a un inocente o persiste un empate.

## Qué observar

- Dónde hace falta explicar un botón o una etapa.
- Si alguien revela accidentalmente información privada.
- Si el tiempo de conversación se siente adecuado.
- Si los mensajes, pistas y votos se entienden.
- Desconexiones, duplicados, pantallas detenidas o temporizadores distintos.
- Legibilidad, campo de chat con teclado móvil y volumen del sonido.

## Preguntas al terminar

- ¿Entendiste qué debías hacer?
- ¿En qué momento te confundiste?
- ¿Las pistas fueron útiles?
- ¿La criatura tuvo oportunidad de defenderse?
- ¿La conversación fue muy corta o larga?
- ¿La votación fue clara?
- ¿Volverías a jugar?
- ¿Qué fue lo más divertido?
- ¿Qué eliminarías o cambiarías?

No completes estas respuestas por los participantes: registra sus palabras o un resumen claramente identificado.

## Registrar problemas

Usa la plantilla de `MANUAL_TEST_CHECKLIST.md`. Para errores críticos —partida imposible, filtración de secretos, mezcla de salas, ganador incorrecto o caída del servidor— detén la sesión y conserva capturas, hora, código de sala y pasos. No compartas tokens de reconexión en mensajes públicos.

Para detener el servidor usa `Ctrl+C` en su terminal y confirma que el proceso finaliza.
