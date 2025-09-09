import { io } from 'socket.io-client';

// Socket connection configuration
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 
                   (process.env.NODE_ENV === 'production' 
                     ? window.location.origin 
                     : 'http://localhost:5000');

console.log('🔗 Connecting to:', SOCKET_URL);

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true
});

// Connection event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server with ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected from server:', reason);
});

socket.on('connect_error', (error) => {
  console.error('🔴 Connection error:', error.message);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Reconnected to server after', attemptNumber, 'attempts');
});

socket.on('reconnect_error', (error) => {
  console.error('🔴 Reconnection error:', error.message);
});

socket.on('reconnect_failed', () => {
  console.error('🔴 Failed to reconnect to server after maximum attempts');
});

// Global error handler
socket.on('error', (error) => {
  console.error('🔴 Socket error:', error);
});

// Debug all socket events in development
if (process.env.NODE_ENV === 'development') {
  const originalEmit = socket.emit;
  const originalOn = socket.on;
  
  socket.emit = function(event, ...args) {
    console.log('📤 Emitting:', event, args);
    return originalEmit.apply(socket, arguments);
  };
  
  socket.on = function(event, callback) {
    const wrappedCallback = function(...args) {
      console.log('📥 Received:', event, args);
      return callback.apply(this, args);
    };
    return originalOn.call(socket, event, wrappedCallback);
  };
}

export default socket;