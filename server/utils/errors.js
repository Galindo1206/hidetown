const DEFAULT_MESSAGES = {
  INVALID_NAME: "El nombre debe tener entre 2 y 20 caracteres válidos.",
  INVALID_CODE: "El código de sala no es válido.",
  ROOM_NOT_FOUND: "La sala no existe o ya fue cerrada.",
  RESOURCE_NOT_FOUND: "El recurso solicitado no existe.",
  ROOM_FULL: "La sala ya tiene el máximo de 6 jugadores.",
  ROOM_STARTED: "La partida ya comenzó y no admite nuevos jugadores.",
  DUPLICATE_NAME: "Ese nombre ya está siendo utilizado en la sala.",
  NOT_ENOUGH_PLAYERS: "Se necesitan al menos 3 jugadores para iniciar.",
  PLAYERS_DISCONNECTED: "Todos los jugadores deben estar conectados para iniciar.",
  NOT_HOST: "Solamente el anfitrión puede realizar esta acción.",
  INVALID_STATE: "La sala no se encuentra en el estado correcto para esta acción.",
  GAME_CANCELLED: "La partida fue cancelada porque un jugador abandonó la sala.",
  INVALID_SESSION: "No fue posible recuperar la sesión anterior.",
  RECONNECTION_FAILED: "No fue posible verificar la sesión anterior.",
  SESSION_EXPIRED: "La sesión anterior ya no está disponible.",
  ALREADY_IN_ROOM: "Ya estás participando en una sala.",
  RATE_LIMITED: "Demasiados intentos. Espera unos segundos antes de continuar.",
  INVALID_PAYLOAD: "Los datos enviados no son válidos.",
  CHAT_EMPTY: "Escribe un mensaje antes de enviarlo.",
  CHAT_TOO_LONG: "El mensaje no puede superar los 300 caracteres.",
  CHAT_RATE_LIMITED: "Estás enviando mensajes demasiado rápido. Espera un momento.",
  CHAT_CLOSED: "La conversación no está disponible en este momento.",
  EXPLORATION_CLOSED: "La exploración ya no está disponible.",
  INVALID_ZONE: "La zona seleccionada no existe.",
  INVALID_SCENE: "La escena de exploración no es válida.",
  INVALID_POSITION: "La posición enviada no es válida.",
  POSITION_OUT_OF_BOUNDS: "No puedes salir de los límites del mapa.",
  MOVEMENT_TOO_FAST: "El servidor rechazó un movimiento imposible.",
  INVALID_TRANSITION: "Debes estar junto a una puerta válida para entrar o salir.",
  INVALID_OBJECT: "El objeto seleccionado no existe.",
  OBJECT_TOO_FAR: "Debes acercarte más para investigar ese objeto.",
  OBJECT_NOT_IN_ZONE: "Ese objeto no pertenece a tu zona actual.",
  OBJECT_ALREADY_INVESTIGATED: "Ya investigaste ese objeto.",
  SEARCH_IN_PROGRESS: "Ya estás investigando otro objeto.",
  CLUE_LIMIT_REACHED: "Ya encontraste el máximo de dos pistas.",
  ABILITY_NOT_AVAILABLE: "Tu rol no dispone de esa habilidad.",
  ABILITY_ALREADY_USED: "Ya utilizaste tu análisis durante esta exploración.",
  CLUE_NOT_FOUND: "La pista seleccionada no pertenece a tu cuaderno.",
  RECONSTRUCTION_CLOSED: "La mesa de reconstrucción ya no admite cambios.",
  INVALID_RECONSTRUCTION_SLOT: "La etapa seleccionada no es válida.",
  SLOT_OCCUPIED: "Esa etapa ya contiene una pista.",
  CLUE_ALREADY_PLACED: "Esa pista ya está colocada en la mesa.",
  NOT_CLUE_OWNER: "Solamente el dueño de la pista puede modificarla.",
  STALE_BOARD_VERSION: "La mesa cambió. Revisa su estado antes de intentarlo otra vez.",
  VOTE_CLOSED: "La votación no está disponible en este momento.",
  INVALID_CANDIDATE: "El sospechoso seleccionado no es válido para esta ronda.",
  SELF_VOTE: "No puedes votar por ti mismo.",
  VOTE_ALREADY_SUBMITTED: "Tu voto ya fue confirmado y no puede modificarse.",
  INTERNAL_ERROR: "Ocurrió un error inesperado. Inténtalo nuevamente."
};

const NON_RECOVERABLE_CODES = new Set(["SESSION_EXPIRED", "RECONNECTION_FAILED", "INVALID_SESSION"]);

export class AppError extends Error {
  constructor(code, message = DEFAULT_MESSAGES[code], { recoverable, cause } = {}) {
    super(message || DEFAULT_MESSAGES.INTERNAL_ERROR, { cause });
    this.name = "AppError";
    this.code = Object.hasOwn(DEFAULT_MESSAGES, code) ? code : "INTERNAL_ERROR";
    this.recoverable = recoverable ?? !NON_RECOVERABLE_CODES.has(this.code);
  }
}

export function toPublicError(error) {
  if (error instanceof AppError) return { code: error.code, message: error.message, recoverable: error.recoverable };
  return { code: "INTERNAL_ERROR", message: DEFAULT_MESSAGES.INTERNAL_ERROR, recoverable: true };
}
