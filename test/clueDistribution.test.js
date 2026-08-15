import test from "node:test";
import assert from "node:assert/strict";
import { distributeClues } from "../server/game/distributeClues.js";
import { trueClues } from "../server/game/clueDefinitions.js";

function rolesFor(count) {
  const ids = Array.from({ length: count }, (_, index) => `player-${index}`);
  return { ids, roles: new Map(ids.map((id, index) => [id, index === 0 ? "creature" : index === 1 ? "investigator" : "inhabitant"])) };
}

test("distribuye pistas correctas por rol entre 3 y 6 jugadores", () => {
  for (let count = 3; count <= 6; count += 1) {
    const { ids, roles } = rolesFor(count);
    const assignments = distributeClues(ids, roles, () => 0);
    assert.equal(assignments.size, count);
    assert.equal(assignments.get(ids[0]).cards.length, 1);
    assert.equal(assignments.get(ids[0]).cards[0].id, "fragmented-memory");
    assert.equal(assignments.get(ids[1]).cards.length, 2);
    assert.equal(assignments.get(ids[1]).observation.id, "investigator-analysis");
    ids.slice(2).forEach((id) => assert.equal(assignments.get(id).cards.length, 1));
  }
});

test("no repite pistas verdaderas cuando hay suficientes", () => {
  const { ids, roles } = rolesFor(6);
  const assignments = distributeClues(ids, roles, () => 0);
  const trueIds = ids.slice(1).flatMap((id) => assignments.get(id).cards.map((card) => card.id));
  assert.equal(trueIds.length, 6);
  assert.equal(new Set(trueIds).size, 6);
  assert.ok(trueIds.every((id) => trueClues.some((clue) => clue.id === id)));
});

test("cada nueva distribución puede cambiar las pistas sin alterar su contenido", () => {
  const { ids, roles } = rolesFor(4);
  const first = distributeClues(ids, roles, () => 0);
  const second = distributeClues(ids, roles, (min, max) => max - 1);
  assert.notDeepEqual(first.get(ids[1]).cards.map((card) => card.id), second.get(ids[1]).cards.map((card) => card.id));
});
