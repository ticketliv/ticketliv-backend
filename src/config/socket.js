const { Server } = require('socket.io');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {

    // Join event room for seat updates
    socket.on('joinEvent', (eventId) => {
      socket.join(`event:${eventId}`);
    });

    socket.on('leaveEvent', (eventId) => {
      socket.leave(`event:${eventId}`);
    });

    // Join scanner room for entry stats
    socket.on('joinScanner', (eventId) => {
      socket.join(`scanner:${eventId}`);
    });

    socket.on('disconnect', () => {
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// Emit seat update to all clients watching an event
const emitSeatUpdate = (eventId, seatData) => {
  if (io) {
    io.to(`event:${eventId}`).emit('seatUpdate', seatData);
  }
};

// Emit scan event to scanner dashboard
const emitScanEvent = (eventId, scanData) => {
  if (io) {
    io.to(`scanner:${eventId}`).emit('scanEvent', scanData);
  }
};

module.exports = { initSocket, getIO, emitSeatUpdate, emitScanEvent };
