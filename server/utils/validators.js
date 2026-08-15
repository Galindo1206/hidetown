import { AppError } from "./errors.js";

const NAME_PATTERN = /^[\p{L}\p{N} ._'’-]+$/u;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5,6}$/;

export function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("INVALID_PAYLOAD");
  }
  return value;
}

export function requireExactObject(value, allowedKeys, requiredKeys = allowedKeys) {
  const object = requireObject(value);
  const keys = Object.keys(object);
  if (keys.some((key) => !allowedKeys.includes(key)) || requiredKeys.some((key) => !Object.hasOwn(object, key))) {
    throw new AppError("INVALID_PAYLOAD");
  }
  return object;
}

export function validateName(value) {
  if (typeof value !== "string") throw new AppError("INVALID_NAME");
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 20 || /[<>\u0000-\u001F\u007F]/u.test(name) || !NAME_PATTERN.test(name)) {
    throw new AppError("INVALID_NAME");
  }
  return name;
}

export function normalizeNameForComparison(value) {
  return validateName(value).toLocaleLowerCase("es").replace(/\s+/g, " ");
}

export function validateRoomCode(value) {
  if (typeof value !== "string") throw new AppError("INVALID_CODE");
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new AppError("INVALID_CODE");
  return code;
}

export function validateSessionIdentifiers(playerId, reconnectToken) {
  if (
    typeof playerId !== "string" || playerId.length < 30 || playerId.length > 50 ||
    typeof reconnectToken !== "string" || reconnectToken.length < 40 || reconnectToken.length > 100
  ) {
    throw new AppError("INVALID_SESSION");
  }
  return { playerId, reconnectToken };
}
