# Contrato de la Fase 4B

## Estado inicial revisado

Antes de Fase 4B, `ready_for_exploration` esperaba confirmaciones y `exploration` mantenía un único `startedAt`/`endsAt` del servidor. El cliente elegía una de cinco zonas mediante tarjetas, enviaba `exploration:move { zoneId }` y luego `exploration:investigate { objectId }`. `RoomService` comprobaba que el objeto perteneciera a `location`, iniciaba una búsqueda cercana a tres segundos y entregaba la pista únicamente al jugador. La reconexión restauraba zona, objetos investigados, máximo de dos pistas, análisis único y búsqueda; al vencer el reloj cancelaba búsquedas y avanzaba a reconstrucción/conversación.

Interfaces preservadas:

- Estados `ready_for_exploration`, `exploration`, `exploration_finished` y `ready_for_discussion`.
- Los cinco IDs de zona y los quince IDs de objeto de `explorationDefinitions.js`.
- `exploration:investigate`, `exploration:analyze`, `exploration:search-started` y `exploration:clue-found`.
- DTO privado del cuaderno, variantes por rol, metadatos de reconstrucción y límite de dos pistas.
- Reloj único, final automático, reconexión, administrador de audio y salida a la mesa.

## Sustitución visual y espacial

`exploration:move` fue retirado porque permitía cambiar de zona sin desplazamiento. Lo sustituyen:

- `exploration:position { sceneId, x, y, direction, isMoving }`, limitado y validado por el servidor.
- `exploration:transition { targetSceneId }`, aceptado solo cerca de una puerta declarada.
- `exploration:player-state` y `exploration:scene-changed`, que contienen únicamente estado visual público.

La investigación mantiene el mismo resultado privado, pero ahora valida una distancia de 92 px contra la última posición aceptada. El servidor publica el mundo sin textos secretos y conserva posición exacta para reconexión. Phaser existe solamente mientras la sala está en `exploration`; HTML conserva todas las demás fases.
