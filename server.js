const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Cola de usuarios esperando pareja
let waitingQueue = [];

// Mapa de conexiones activas: socketId -> socketId
const pairs = {};

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Actualizar contador de usuarios online
  io.emit('onlineCount', io.engine.clientsCount);

  // Usuario busca chat
  socket.on('findChat', () => {
    // Si ya está emparejado, ignorar
    if (pairs[socket.id]) return;

    if (waitingQueue.length > 0) {
      // Emparejar con el primero en cola
      const partner = waitingQueue.shift();

      // Guardar pareja
      pairs[socket.id] = partner.id;
      pairs[partner.id] = socket.id;

      // Notificar a ambos
      socket.emit('chatStart', { role: 'B' });
      partner.emit('chatStart', { role: 'A' });
    } else {
      // Agregar a la cola
      waitingQueue.push(socket);
      socket.emit('waiting');
    }
  });

  // Mensaje enviado
  socket.on('message', (text) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('message', text);
    }
  });

  // Usuario escribe
  socket.on('typing', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) io.to(partnerId).emit('strangerTyping');
  });

  // Usuario dejó de escribir
  socket.on('stopTyping', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) io.to(partnerId).emit('strangerStopTyping');
  });

  // Usuario desconecta el chat (botón)
  socket.on('leaveChat', () => {
    disconnectPair(socket);
  });

  // Usuario cierra la pestaña
  socket.on('disconnect', () => {
    // Sacar de la cola si estaba esperando
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    disconnectPair(socket);
    io.emit('onlineCount', io.engine.clientsCount);
    console.log('Usuario desconectado:', socket.id);
  });

  function disconnectPair(socket) {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('strangerLeft');
      delete pairs[partnerId];
    }
    delete pairs[socket.id];
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
