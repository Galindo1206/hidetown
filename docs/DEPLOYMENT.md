# Despliegue de la beta en Render

La guía vigente y detallada está en [`DEPLOY_RENDER.md`](DEPLOY_RENDER.md). Este archivo se conserva como referencia histórica; ante cualquier diferencia, utiliza la guía nueva, que refleja el repositorio y Phaser 3.90.0 actuales.

## Estado de esta entrega

El proyecto está **preparado para publicar, pendiente de despliegue manual**. No se creó un servicio, URL pública, commit ni push. La revisión actual confirmó que la raíz es `C:/Dev/Web/HideTown` y que `origin` apunta a `Galindo1206/hidetown`.

## 1. Crear un repositorio dedicado

1. Crea en GitHub un repositorio vacío, por ejemplo `el-pueblo-oculto`.
2. Desde `HideTown`, inicializa un repositorio propio con `git init`.
3. Comprueba `git status` y confirma que solo aparecen archivos de este proyecto.
4. Ejecuta `npm ci`, `npm run check`, `npm test` y `npm run test:production`.
5. Revisa que `.env`, `node_modules`, logs y credenciales no estén incluidos.
6. Crea el commit inicial y conecta **el nuevo remoto** únicamente después de verificar su URL con `git remote -v`.
7. Sube la rama elegida a GitHub.

Estos pasos son deliberadamente manuales: crear el repositorio, hacer commit y publicar cambian estado externo y requieren autorización explícita.

## 2. Crear el Web Service

1. En Render, elige **New > Blueprint** y conecta el repositorio dedicado.
2. Selecciona el `render.yaml` de la raíz.
3. Confirma antes de aplicar:
   - tipo: Web Service;
   - runtime: Node;
   - plan: Free;
   - build: `npm ci --omit=dev`;
   - start: `npm start`;
   - health check: `/health`;
   - auto deploy: desactivado;
   - una sola instancia.
4. No agregues base de datos, disco, Docker ni servicios de pago.
5. Espera el primer despliegue y guarda la URL `https://…onrender.com` que Render asigne. No inventes ni anticipes esa URL.

El servidor toma `PORT` de Render y escucha en `0.0.0.0`. Express, Socket.IO, frontend y `/health` comparten el mismo proceso y origen. Render termina TLS, por lo que el navegador usa HTTPS y Socket.IO negocia WSS automáticamente sin URL fija.

## 3. Variables

El Blueprint establece:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |

Render proporciona `PORT`. No lo fijes manualmente. `ALLOWED_ORIGINS` puede quedar vacío para el cliente servido desde el mismo origen. Si en el futuro existe un frontend externo, agrega solo orígenes HTTPS completos, separados por comas. Un valor inválido detiene el arranque con un mensaje claro.

Nunca pegues secretos en el repositorio, el chat o los logs. Esta versión no necesita credenciales de aplicación.

## 4. Verificación posterior

Sustituye `URL_PUBLICA` por la URL real:

```powershell
Invoke-RestMethod https://URL_PUBLICA/health
```

La respuesta esperada es `{"status":"ok","version":"0.9.0-beta.1"}`. Después completa `PRODUCTION_CHECKLIST.md` desde al menos dos redes distintas. Solo cuando todas las verificaciones pasen puede registrarse el estado **Publicado y verificado** junto con la URL real y la fecha.

## Limitaciones del plan gratuito

Render puede suspender el servicio tras 15 minutos sin tráfico entrante. El siguiente acceso puede tardar cerca de un minuto mientras despierta. Render también puede reiniciar la instancia. Como las salas viven en memoria, una suspensión, reinicio o despliegue elimina todas las salas y partidas activas.

Referencias oficiales: [Blueprint YAML](https://render.com/docs/blueprint-spec), [Web Services gratuitos](https://render.com/docs/free), [Health checks](https://render.com/docs/health-checks) y [despliegue de Express](https://render.com/docs/deploy-node-express-app).
