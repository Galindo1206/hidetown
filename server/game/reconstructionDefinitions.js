export const reconstructionSteps = Object.freeze([
  Object.freeze({ id: 1, title: "Llegada" }),
  Object.freeze({ id: 2, title: "Entrada" }),
  Object.freeze({ id: 3, title: "Campanas" }),
  Object.freeze({ id: 4, title: "Advertencia" }),
  Object.freeze({ id: 5, title: "Suplantación" })
]);

export const reconstructionTruth = Object.freeze([
  Object.freeze({ id: 1, text: "La presencia llegó desde la plaza." }),
  Object.freeze({ id: 2, text: "Entró por la ventana occidental." }),
  Object.freeze({ id: 3, text: "Las campanas sonaron sin utilizar el mecanismo." }),
  Object.freeze({ id: 4, text: "El cuidador había dejado advertencias." }),
  Object.freeze({ id: 5, text: "La criatura adoptó una apariencia humana." })
]);

export function evaluateReconstruction(board, findClue, reason, finalVersion, requiredScore = 4) {
  if (!Number.isInteger(requiredScore) || requiredScore < 1 || requiredScore > 5) throw new TypeError("El requisito de reconstrucción no es válido.");
  const correctSlots = [];
  const incorrectSlots = [];
  const usedClues = [];

  for (const step of reconstructionSteps) {
    const placement = board.get(step.id);
    if (!placement) {
      incorrectSlots.push(step.id);
      continue;
    }
    const clue = findClue(placement.ownerId, placement.clueId);
    const correct = Boolean(clue?.isAuthentic && clue.canonicalStep === step.id);
    (correct ? correctSlots : incorrectSlots).push(step.id);
    usedClues.push({
      clueId: placement.clueId,
      ownerId: placement.ownerId,
      slot: step.id,
      isAuthentic: Boolean(clue?.isAuthentic),
      canonicalStep: clue?.canonicalStep ?? null
    });
  }

  const score = correctSlots.length;
  return {
    score,
    passed: score >= requiredScore,
    requiredScore,
    correctSlots,
    incorrectSlots,
    usedClues,
    finalVersion,
    reason
  };
}
