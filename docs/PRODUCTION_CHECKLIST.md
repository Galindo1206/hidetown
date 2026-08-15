# Checklist de producción — 0.9.0-beta.1

Una casilla vacía significa **pendiente**, no fallida. Registra evidencia sin códigos de sala, nombres, mensajes, roles, pistas, votos ni tokens.

## Antes de publicar

- [ ] `git rev-parse --show-toplevel` apunta a `HideTown`.
- [ ] `git remote -v` apunta al repositorio dedicado correcto.
- [ ] `.env`, logs, `node_modules` y credenciales no están versionados.
- [ ] `npm ci` termina correctamente con Node 20 o posterior.
- [ ] `npm run check` pasa.
- [ ] `npm test` pasa.
- [ ] `npm run test:production` pasa.
- [ ] `npm audit --omit=dev` no informa vulnerabilidades conocidas.
- [ ] `render.yaml` conserva `plan: free` y `autoDeployTrigger: off`.

## Servicio Render

- [ ] El build ejecuta `npm ci --omit=dev`.
- [ ] El proceso inicia con `npm start` y registra `server_started`.
- [ ] `/health` devuelve 200, estado y versión únicamente.
- [ ] La aplicación abre por HTTPS sin contenido mixto.
- [ ] Socket.IO conecta por el mismo origen y negocia polling/WebSocket.
- [ ] No hay bucles de reconexión agresivos ni errores repetidos en consola.
- [ ] `SIGTERM` produce `server_shutdown` y `server_stopped`.
- [ ] Los logs no muestran payloads, nombres, códigos de sala, chat, roles, pistas, votos ni tokens.

## Prueba pública mínima

- [ ] Crear y unir 3–6 jugadores desde dos redes distintas (por ejemplo Wi-Fi y datos móviles).
- [ ] Completar historia, roles, evidencia, pistas, conversación, voto y resultado.
- [ ] Recargar y recuperar una sesión dentro del plazo.
- [ ] Cortar y recuperar red sin duplicar jugador.
- [ ] Volver a jugar y completar una segunda ronda.
- [ ] Probar al menos un teléfono real y un navegador de escritorio.
- [ ] Confirmar que el aviso de servidor despertando y **Reintentar** son comprensibles.
- [ ] Confirmar que **Acerca del prototipo** y el reporte seguro funcionan.

## Cierre

- URL pública real:
- Fecha UTC:
- Identificador del despliegue:
- Navegadores/redes:
- Resultado: pendiente / aprobado / revertido
- Incidencias públicas (solo códigos y referencias seguras):

