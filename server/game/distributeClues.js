import { randomInt } from "node:crypto";
import { shuffleSecurely } from "./assignRoles.js";
import { creatureFragment, investigatorObservation, trueClues } from "./clueDefinitions.js";

function toCard(clue) {
  return { id: clue.id, type: clue.type, title: clue.title, text: clue.text, reliability: clue.reliability };
}

export function distributeClues(playerIds, roleAssignments, randomInteger = randomInt) {
  if (!(roleAssignments instanceof Map) || !Array.isArray(playerIds)) throw new TypeError("Distribución inválida.");
  const cluePool = shuffleSecurely(trueClues, randomInteger);
  let cursor = 0;
  const assignments = new Map();

  for (const playerId of playerIds) {
    const role = roleAssignments.get(playerId);
    if (role === "investigator") {
      assignments.set(playerId, {
        cards: cluePool.slice(cursor, cursor + 2).map(toCard),
        observation: toCard(investigatorObservation),
        instructions: "Relaciona las pruebas y escucha con atención: alguien podría inventar o alterar su versión."
      });
      cursor += 2;
    } else if (role === "inhabitant") {
      assignments.set(playerId, {
        cards: [toCard(cluePool[cursor])],
        observation: null,
        instructions: "Recuerda esta pista y decide cuándo compartirla durante la conversación."
      });
      cursor += 1;
    } else if (role === "creature") {
      assignments.set(playerId, {
        cards: [toCard(creatureFragment)],
        observation: null,
        instructions: "No conoces las pruebas completas. Usa la evidencia pública, escucha, improvisa una versión creíble y no admitas que careces de información."
      });
    } else {
      throw new TypeError("Hay un jugador sin rol válido.");
    }
  }
  return assignments;
}

export function clonePrivateClues(assignment) {
  if (!assignment) return null;
  return {
    cards: assignment.cards.map((card) => ({ ...card })),
    observation: assignment.observation ? { ...assignment.observation } : null,
    instructions: assignment.instructions
  };
}
