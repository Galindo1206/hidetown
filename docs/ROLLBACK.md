# Rollback y apagado seguro

## Cuándo revertir

Revierte o suspende la beta si ocurre cualquiera de estos casos:

- filtración de roles, pistas, votos o datos de sesión;
- mezcla de datos entre salas;
- ganador incorrecto reproducible;
- bucle de caídas o reconexiones;
- imposibilidad general de crear, unir o completar partidas.

## Revertir en Render

1. En el servicio abre **Events** y localiza el último despliegue estable.
2. Usa la acción de rollback/redeploy disponible para ese despliegue anterior.
3. Comprueba `/health`, carga HTTPS y conexión Socket.IO.
4. Ejecuta la prueba mínima de 3 jugadores antes de volver a compartir la URL.
5. Registra fecha, despliegue afectado, código público y resultado sin copiar datos de partidas.

El plan gratuito conserva un historial de rollback limitado; si no hay versión estable disponible, desactiva el servicio o deja de compartir la URL hasta publicar una corrección revisada.

## Consecuencia esperada

Un rollback, reinicio, suspensión o nuevo despliegue pierde todas las salas en memoria. Comunícalo antes de actuar si hay una sesión coordinada; después, los grupos deben crear salas nuevas.

## Apagado local

`Ctrl+C` envía `SIGINT`; Render usa `SIGTERM`. Ambos cierran Socket.IO, salas, limitadores y temporizadores antes de terminar. Si el proceso no responde, Render puede forzarlo después del límite de 30 segundos configurado.

