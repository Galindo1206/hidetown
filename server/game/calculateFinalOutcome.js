export const OUTCOME_DETAILS = Object.freeze({
  VILLAGE_COMPLETED_BOTH_OBJECTIVES: Object.freeze({
    winnerTeam: "village",
    message: "El pueblo reconstruyó la verdad y descubrió a la criatura antes de que volviera a caer la noche."
  }),
  CREATURE_SABOTAGED_STORY: Object.freeze({
    winnerTeam: "creature",
    message: "El pueblo descubrió quién ocultaba su verdadera identidad, pero la historia quedó incompleta. Sin comprender lo ocurrido, no pudieron expulsar a la criatura."
  }),
  CREATURE_EVADED_VOTE: Object.freeze({
    winnerTeam: "creature",
    message: "El pueblo reconstruyó lo sucedido, pero acusó a la persona equivocada. La criatura continúa oculta entre la neblina."
  }),
  CREATURE_TOTAL_DECEPTION: Object.freeze({
    winnerTeam: "creature",
    message: "La historia fue alterada y un inocente recibió la acusación. La criatura consiguió confundir completamente al pueblo."
  }),
  CREATURE_WON_BY_PERSISTENT_TIE: Object.freeze({
    winnerTeam: "creature",
    message: "El pueblo no identificó a un único sospechoso. La indecisión permitió que la criatura permaneciera oculta entre la neblina."
  })
});

export function calculateFinalOutcome({
  reconstructionScore,
  requiredScore,
  accusedPlayerId,
  creaturePlayerId,
  persistentTie = false
}) {
  if (!Number.isInteger(reconstructionScore) || reconstructionScore < 0 || reconstructionScore > 5) {
    throw new TypeError("La puntuación de reconstrucción no es válida.");
  }
  if (!Number.isInteger(requiredScore) || requiredScore < 1 || requiredScore > 5) {
    throw new TypeError("El requisito de reconstrucción no es válido.");
  }
  if (typeof creaturePlayerId !== "string" || !creaturePlayerId) throw new TypeError("La criatura no es válida.");
  if (accusedPlayerId !== null && (typeof accusedPlayerId !== "string" || !accusedPlayerId)) throw new TypeError("La acusación no es válida.");
  if (typeof persistentTie !== "boolean") throw new TypeError("El estado de empate no es válido.");

  const reconstructionPassed = reconstructionScore >= requiredScore;
  const creatureIdentified = !persistentTie && accusedPlayerId === creaturePlayerId;
  let outcomeCode;
  if (persistentTie) outcomeCode = "CREATURE_WON_BY_PERSISTENT_TIE";
  else if (reconstructionPassed && creatureIdentified) outcomeCode = "VILLAGE_COMPLETED_BOTH_OBJECTIVES";
  else if (!reconstructionPassed && creatureIdentified) outcomeCode = "CREATURE_SABOTAGED_STORY";
  else if (reconstructionPassed) outcomeCode = "CREATURE_EVADED_VOTE";
  else outcomeCode = "CREATURE_TOTAL_DECEPTION";

  return {
    winnerTeam: OUTCOME_DETAILS[outcomeCode].winnerTeam,
    outcomeCode,
    reconstructionScore,
    reconstructionRequiredScore: requiredScore,
    reconstructionPassed,
    creatureIdentified,
    accusedPlayerId,
    persistentTie
  };
}
