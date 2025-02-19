const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/sounds', express.static(path.join(__dirname, '../frontend/sounds')));

// Add this line before mongoose.connect
mongoose.set('strictQuery', false);

// Database connection with error handling
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/car-racing', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('joinGame', (data) => {
    // Handle player joining
    socket.join(data.gameId);
    io.to(data.gameId).emit('playerJoined', { playerId: socket.id });
  });

  socket.on('updatePosition', (data) => {
    // Broadcast player position to other players
    socket.broadcast.to(data.gameId).emit('playerMoved', {
      playerId: socket.id,
      position: data.position
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

const PORT = process.env.PORT || 8080;

// Start server with error handling
try {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} catch (error) {
  console.error('Server startup error:', error);
}

// Add this line to check if sound files are being served
app.get('/sounds/:file', (req, res, next) => {
    console.log(`Attempting to serve sound file: ${req.params.file}`);
    next();
}); 