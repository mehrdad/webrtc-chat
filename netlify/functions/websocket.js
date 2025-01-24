const { Server } = require("socket.io");

exports.handler = async (event) => {
  const io = new Server({
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    const roomId = socket.handshake.query.room;
    socket.join(roomId);

    socket.on('signal', (data) => {
      socket.to(roomId).emit('signal', data);
    });
  });

  return {
    statusCode: 200,
    body: 'Socket.IO ready'
  };
};