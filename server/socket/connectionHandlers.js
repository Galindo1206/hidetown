import { registerRoomHandlers } from "./roomHandlers.js";

export function registerConnectionHandlers({ io, roomService, rateLimiter, actionRateLimiter, logger = console }) {
  io.on("connection", (socket) => {
    logger.info?.("client_connected", { transport: socket.conn.transport.name });
    socket.on("disconnect", (reason) => logger.info?.("client_connection_closed", { reason }));
    socket.emit("connection:ready", { connected: true });
    registerRoomHandlers({ io, socket, roomService, rateLimiter, actionRateLimiter, logger });
  });
}
