# Desplegar El Pueblo Oculto en Render

Estado: **preparado para publicar, todavía no desplegado**. Esta guía crea un único Web Service gratuito. No crea base de datos, Redis, disco ni servicios adicionales.

## 1. Requisitos

- Node.js 20 o posterior y npm.
- Un repositorio GitHub dedicado. En este proyecto, la raíz esperada es `C:\Dev\Web\HideTown` y el remoto revisado es `https://github.com/Galindo1206/hidetown.git`.
- Todas las comprobaciones locales de `PRODUCTION_CHECKLIST.md` aprobadas.
- El archivo `render.yaml` en la raíz de la rama que se publicará.

No publiques un `.env`; Render recibirá sus variables desde el Blueprint o el panel.

## 2. Subir a GitHub

Revisa primero, sin copiar tokens ni datos de partidas:

```powershell
git rev-parse --show-toplevel
git remote -v
git status --short
git ls-files .env node_modules logs
npm ci
npm run check
npm test
npm run test:production
npm run smoke:production
```

Cuando decidas publicar, realiza el commit y push manualmente. Esta preparación no los ejecuta.

## 3. Crear el Web Service

1. Abre Render y elige **New > Blueprint**.
2. Conecta el repositorio `Galindo1206/hidetown` o el repositorio dedicado que confirmes.
3. Selecciona la rama que contiene esta versión.
4. Indica la ruta de Blueprint `render.yaml`.
5. Si Render solicita **Root Directory**, déjalo vacío porque `package.json` está en la raíz. Si mueves el juego a una subcarpeta, usa la ruta relativa de esa subcarpeta.
6. Revisa el único servicio antes de aplicar el Blueprint.

Configuración esperada:

| Campo | Valor |
| --- | --- |
| Type | Web Service |
| Name | `el-pueblo-oculto` |
| Runtime | Node |
| Instance type | Free |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Auto deploy | Off |
| Shutdown delay | 30 segundos |
| Instances | 1; Free no permite escalado horizontal |

Conservar `plan: free` en el Blueprint es intencional: si se omite `plan`, Render puede asignar `starter` a un servicio nuevo. No agregues servicios, discos ni datastores.

## 4. Variables

El Blueprint define:

```text
NODE_ENV=production
LOG_LEVEL=info
```

Render proporciona `PORT`; no lo agregues ni fijes manualmente. El servidor fuerza `HOST=0.0.0.0` en producción.

Los valores restantes pueden usar sus predeterminados validados. Si quieres hacerlos explícitos en el panel:

```text
RECONNECTION_GRACE_SECONDS=30
ROOM_INACTIVITY_MINUTES=60
ROOM_CLEANUP_INTERVAL_MINUTES=5
EXPLORATION_DURATION_SECONDS=90
DISCUSSION_DURATION_SECONDS=240
RECONSTRUCTION_REQUIRED_SCORE=4
VOTING_DURATION_SECONDS=60
TIEBREAKER_DURATION_SECONDS=30
RATE_LIMIT_WINDOW_MS=10000
RATE_LIMIT_MAX_ACTIONS=8
```

No contienen secretos.

## 5. URL y orígenes

1. Aplica el Blueprint y espera el primer despliegue.
2. Copia la URL HTTPS real `https://…onrender.com`.
3. Con frontend y Socket.IO en ese mismo dominio, deja `ALLOWED_ORIGINS` vacío: el servidor acepta el mismo origen comprobando `Origin` y `Host`.
4. Solo si agregas otro frontend permitido, define `ALLOWED_ORIGINS` con orígenes completos separados por comas, por ejemplo `https://juego.example,https://pruebas.example`.
5. Guarda la variable y ejecuta un redespliegue manual.

Nunca uses `*`, una ruta, una barra final ni una URL HTTP para el servicio público.

## 6. Verificación posterior

```powershell
$url = 'https://URL_REAL.onrender.com'
Invoke-RestMethod "$url/health"
```

Debe responder con estado `ok` y la versión pública. Después:

1. Revisa que el build haya usado `npm ci --omit=dev` y el arranque `npm start`.
2. Comprueba los logs `server_started` sin variables, nombres o datos privados.
3. Abre `$url`; verifica CSS, JavaScript, favicon y `/vendor/phaser.js` sin 404.
4. Confirma Socket.IO por polling y WebSocket/WSS desde el mismo origen.
5. Crea una sala con 3–6 navegadores y completa historia, rol, Phaser, una pista, reconstrucción, chat, votación, resultado y volver a jugar.
6. Recarga un cliente dentro del plazo de reconexión y confirma que no se duplica.
7. Repite desde datos móviles y escritorio.
8. Registra URL, fecha y evidencia segura en `PRODUCTION_CHECKLIST.md`.

## 7. Logs y cierre

En un redespliegue o suspensión, Render envía `SIGTERM`. Deben aparecer `server_shutdown` y `server_stopped`; Socket.IO, HTTP, intervalos, salas y timers se cierran. Si aparece `SIGKILL` o código 137, revisa el shutdown antes de una sesión pública.

No despliegues mientras haya una partida en curso.

## 8. Limitaciones aceptadas

- Todas las salas viven en memoria de una sola instancia.
- Reiniciar, desplegar, hacer rollback o suspender el servicio elimina las partidas.
- El servicio gratuito puede suspenderse después de 15 minutos sin tráfico HTTP ni mensajes WebSocket y tardar cerca de un minuto en despertar.
- No debe activarse escalado horizontal: otra instancia tendría salas diferentes.
- Render puede reiniciar una instancia gratuita en cualquier momento.
- Estas limitaciones son aceptables únicamente para la beta con amigos.

Referencias oficiales: [Blueprint YAML](https://render.com/docs/blueprint-spec), [Web Services](https://render.com/docs/web-services), [Free instances](https://render.com/docs/free), [Health checks](https://render.com/docs/health-checks), [WebSockets](https://render.com/docs/websocket) y [graceful shutdown](https://render.com/docs/deploys#graceful-shutdown).
