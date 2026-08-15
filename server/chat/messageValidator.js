import { AppError } from "../utils/errors.js";

export const MAX_CHAT_MESSAGE_LENGTH = 300;

export function validateChatMessage(value) {
  if (typeof value !== "string") throw new AppError("INVALID_PAYLOAD");
  const text = value.normalize("NFKC").trim();
  if (!text) throw new AppError("CHAT_EMPTY");
  if (text.length > MAX_CHAT_MESSAGE_LENGTH) throw new AppError("CHAT_TOO_LONG");
  return text;
}
