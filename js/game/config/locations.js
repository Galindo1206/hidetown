(function () {
  "use strict";
  const game = window.HideTownGame = window.HideTownGame || {};
  game.palette = Object.freeze({ night: 0x081923, mist: 0x9babad, pine: 0x17372f, adobe: 0x76553f, paper: 0xe7ddc2, gold: 0xd6ad57, warm: 0xffd77a, danger: 0x7f2833 });
  game.playerColors = Object.freeze([0x4f8ea8, 0xa76f57, 0x728f64, 0x8b6fa5, 0xb18a48, 0x567d78]);
  game.sceneKey = (sceneId) => ({ village: "VillageScene", church: "ChurchScene", "caretaker-house": "CaretakerHouseScene", "bell-tower": "BellTowerScene" })[sceneId];
  game.objectNames = (room) => new Map((room?.exploration?.zones || []).flatMap((zone) => zone.objects.map((item) => [item.id, item.name])));
  game.getSceneDefinition = (room, sceneId) => room?.exploration?.world?.scenes?.find((item) => item.id === sceneId) || null;
})();
