import { randomInt } from "node:crypto";

export function shuffleSecurely(values, randomInteger = randomInt) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInteger(0, index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function assignRoles(playerIds, randomInteger = randomInt) {
  if (!Array.isArray(playerIds) || playerIds.length < 3 || playerIds.length > 6) {
    throw new RangeError("La distribución requiere entre 3 y 6 jugadores.");
  }
  const roles = ["creature", "investigator", ...Array(playerIds.length - 2).fill("inhabitant")];
  const shuffledRoles = shuffleSecurely(roles, randomInteger);
  return new Map(playerIds.map((playerId, index) => [playerId, shuffledRoles[index]]));
}
