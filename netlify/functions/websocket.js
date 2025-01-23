import { Server } from "socket.io";

const rooms = {};

export async function handler(event, context) {
  const io = new Server(event.httpMethod === 'GET' ? { path: '/ws' } : undefined);

  io.on('connection', (socket) => {
    const roomId = socket.handshake.query.room;

    socket.join(roomId);
    
    socket.on('signal', (data) => {
      socket.to(roomId).emit('signal', data);
    });

    socket.on('disconnect', () => {
      socket.leave(roomId);
    });
  });

  return {
    statusCode: 200,
    body: 'WebSocket connected'
  };
}