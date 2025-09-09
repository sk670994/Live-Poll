const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Global state
let currentPoll = null;
let pollHistory = [];
let connectedStudents = {}; // { socketId: { name, socketId, hasAnswered } }
let pollTimeout = null;
let chatMessages = [];

// Helper functions
function calculateResults(poll) {
  if (!poll) return {};
  
  const results = {};
  poll.options.forEach(option => {
    results[option] = 0;
  });
  
  Object.values(connectedStudents).forEach(student => {
    if (student.answer && results[student.answer] !== undefined) {
      results[student.answer]++;
    }
  });
  
  return results;
}

function checkIfAllStudentsAnswered() {
  const totalStudents = Object.keys(connectedStudents).length;
  const answeredStudents = Object.values(connectedStudents).filter(s => s.hasAnswered).length;
  return totalStudents > 0 && answeredStudents === totalStudents;
}

function canCreateNewPoll() {
  // Can create new poll if no current poll OR all students have answered
  return !currentPoll || checkIfAllStudentsAnswered();
}

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // STUDENT EVENTS
  socket.on("student:register", ({ name }, callback) => {
    if (!name || !name.trim()) {
      return callback({ success: false, message: "Name is required" });
    }

    // Check if name already exists
    const existingStudent = Object.values(connectedStudents).find(s => s.name === name.trim());
    if (existingStudent) {
      return callback({ success: false, message: "Name already taken" });
    }

    connectedStudents[socket.id] = {
      name: name.trim(),
      socketId: socket.id,
      hasAnswered: false,
      answer: null
    };

    callback({ success: true });

    // Notify teacher about connected students
    io.emit("teacher:students_update", Object.values(connectedStudents).map(s => ({
      name: s.name,
      hasAnswered: s.hasAnswered
    })));

    // Send current poll if exists
    if (currentPoll) {
      const timeLeft = Math.max(0, currentPoll.endTime - Date.now());
      socket.emit("poll:started", {
        ...currentPoll,
        timeLeft: Math.floor(timeLeft / 1000)
      });
    }
  });

  socket.on("student:submit_answer", ({ pollId, answer }, callback) => {
    const student = connectedStudents[socket.id];
    
    if (!student) {
      return callback({ success: false, message: "Please register first" });
    }

    if (!currentPoll || currentPoll.id !== pollId) {
      return callback({ success: false, message: "Poll not active" });
    }

    if (student.hasAnswered) {
      return callback({ success: false, message: "Already answered" });
    }

    if (!currentPoll.options.includes(answer)) {
      return callback({ success: false, message: "Invalid answer" });
    }

    // Check if poll time has expired
    if (Date.now() > currentPoll.endTime) {
      return callback({ success: false, message: "Poll time expired" });
    }

    // Update student answer
    connectedStudents[socket.id].hasAnswered = true;
    connectedStudents[socket.id].answer = answer;

    callback({ success: true });

    // Send live results to teacher
    const results = calculateResults(currentPoll);
    const answeredCount = Object.values(connectedStudents).filter(s => s.hasAnswered).length;
    
    io.emit("poll:results_update", {
      results,
      answeredCount,
      totalStudents: Object.keys(connectedStudents).length
    });

    // Update students list for teacher
    io.emit("teacher:students_update", Object.values(connectedStudents).map(s => ({
      name: s.name,
      hasAnswered: s.hasAnswered
    })));

    // Check if all students answered
    if (checkIfAllStudentsAnswered()) {
      setTimeout(() => {
        endCurrentPoll();
      }, 1000); // Small delay to show final results
    }
  });

  // TEACHER EVENTS
  socket.on("teacher:create_poll", ({ question, options, duration = 60 }, callback) => {
    if (!canCreateNewPoll()) {
      return callback({ success: false, message: "Cannot create poll: Previous poll still active" });
    }

    if (!question || !question.trim()) {
      return callback({ success: false, message: "Question is required" });
    }

    if (!options || options.length < 2) {
      return callback({ success: false, message: "At least 2 options required" });
    }

    // Clear previous poll timeout
    if (pollTimeout) {
      clearTimeout(pollTimeout);
    }

    // Reset all students' answers
    Object.values(connectedStudents).forEach(student => {
      student.hasAnswered = false;
      student.answer = null;
    });

    // Create new poll
    const pollId = `poll_${Date.now()}`;
    currentPoll = {
      id: pollId,
      question: question.trim(),
      options: options.filter(opt => opt && opt.trim()).map(opt => opt.trim()),
      duration: duration * 1000,
      startTime: Date.now(),
      endTime: Date.now() + (duration * 1000),
      createdBy: socket.id
    };

    // Set timeout to end poll
    pollTimeout = setTimeout(() => {
      endCurrentPoll();
    }, duration * 1000);

    callback({ success: true, pollId });

    // Broadcast poll to all clients
    io.emit("poll:started", {
      ...currentPoll,
      timeLeft: duration
    });

    // Update students list
    io.emit("teacher:students_update", Object.values(connectedStudents).map(s => ({
      name: s.name,
      hasAnswered: s.hasAnswered
    })));
  });

  socket.on("teacher:end_poll", (callback) => {
    if (!currentPoll) {
      return callback({ success: false, message: "No active poll" });
    }

    endCurrentPoll();
    callback({ success: true });
  });

  socket.on("teacher:get_poll_history", (callback) => {
    callback({ success: true, history: pollHistory });
  });

  socket.on("teacher:remove_student", ({ studentName }, callback) => {
    const studentEntry = Object.entries(connectedStudents).find(([_, student]) => student.name === studentName);
    
    if (!studentEntry) {
      return callback({ success: false, message: "Student not found" });
    }

    const [socketId, student] = studentEntry;
    
    // Remove student
    delete connectedStudents[socketId];
    
    // Disconnect the student's socket
    const studentSocket = io.sockets.sockets.get(socketId);
    if (studentSocket) {
      studentSocket.emit("student:removed");
      studentSocket.disconnect();
    }

    callback({ success: true });

    // Update students list
    io.emit("teacher:students_update", Object.values(connectedStudents).map(s => ({
      name: s.name,
      hasAnswered: s.hasAnswered
    })));
  });

  // CHAT EVENTS
  socket.on("chat:send_message", ({ message, sender, senderType }) => {
    if (!message || !message.trim()) return;

    const chatMessage = {
      id: Date.now(),
      message: message.trim(),
      sender,
      senderType, // 'teacher' or 'student'
      timestamp: new Date().toISOString()
    };

    chatMessages.push(chatMessage);
    
    // Keep only last 100 messages
    if (chatMessages.length > 100) {
      chatMessages = chatMessages.slice(-100);
    }

    io.emit("chat:new_message", chatMessage);
  });

  socket.on("chat:get_history", (callback) => {
    callback({ success: true, messages: chatMessages });
  });

  // COMMON EVENTS
  socket.on("get_current_state", (callback) => {
    const student = connectedStudents[socket.id];
    let timeLeft = 0;
    
    if (currentPoll) {
      timeLeft = Math.max(0, Math.floor((currentPoll.endTime - Date.now()) / 1000));
    }
    
    const pollData = currentPoll ? {
      ...currentPoll,
      timeLeft,
      serverTime: Date.now() // Add server time for sync
    } : null;
    
    callback({
      success: true,
      currentPoll: pollData,
      isRegistered: !!student,
      studentName: student?.name || null,
      connectedStudents: Object.values(connectedStudents).map(s => ({
        name: s.name,
        hasAnswered: s.hasAnswered
      }))
    });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove student if exists
    if (connectedStudents[socket.id]) {
      delete connectedStudents[socket.id];
      
      // Update students list
      io.emit("teacher:students_update", Object.values(connectedStudents).map(s => ({
        name: s.name,
        hasAnswered: s.hasAnswered
      })));
    }
  });
});

// Helper function to end current poll
function endCurrentPoll() {
  if (!currentPoll) return;

  const results = calculateResults(currentPoll);
  const finalPoll = {
    ...currentPoll,
    results,
    endedAt: Date.now(),
    participants: Object.values(connectedStudents).map(s => ({
      name: s.name,
      answer: s.answer,
      hasAnswered: s.hasAnswered
    }))
  };

  // Add to history
  pollHistory.push(finalPoll);
  
  // Keep only last 50 polls in history
  if (pollHistory.length > 50) {
    pollHistory = pollHistory.slice(-50);
  }

  // Clear timeout
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }

  // Emit final results
  io.emit("poll:ended", {
    pollId: currentPoll.id,
    results,
    question: currentPoll.question,
    options: currentPoll.options
  });

  currentPoll = null;
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    connectedClients: io.sockets.sockets.size
  });
});

app.get("/", (req, res) => {
  res.json({ message: "Live Polling System Backend - Intervue.io Assignment" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Live Polling System Ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;