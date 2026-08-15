import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}
