// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let activePoll = null; // current poll
let pollTimeout = null;
const POLL_DURATION_MS = 60000;

function computeResults(poll) {
  if (!poll) return {};
  const counts = {};
  poll.options.forEach(o => (counts[o] = 0));
  Object.values(poll.answers).forEach(opt => {
    if (counts[opt] !== undefined) counts[opt]++;
  });
  return counts;
}

const students = {}; // { socket.id: name }

io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  // Register student
  socket.on("student:register", ({ name }, cb) => {
    if (!name || !name.trim()) return cb({ ok: false, message: "Invalid name" });
    socket.data.studentName = name.trim();
    students[socket.id] = name.trim();
    cb({ ok: true });
    // Notify teacher of connected students
    if (activePoll) io.to(activePoll.teacherSocketId).emit("teacher:connected_students", Object.values(students));
  });

  // Teacher creates poll
  socket.on("teacher:create_poll", ({ question, options, durationMs }) => {
    if (activePoll) return socket.emit("error_message", { message: "Poll already active" });

    const id = Date.now().toString();
    const duration = durationMs || POLL_DURATION_MS;
    activePoll = {
      id,
      question,
      options,
      answers: {}, // { studentName: option }
      startedAt: Date.now(),
      deadline: Date.now() + duration,
      teacherSocketId: socket.id
    };

    io.emit("poll_started", {
      id,
      question,
      options,
      deadline: activePoll.deadline
    });

    clearTimeout(pollTimeout);
    pollTimeout = setTimeout(() => {
      io.emit("poll_closed", { id, results: computeResults(activePoll) });
      activePoll = null;
      pollTimeout = null;
    }, duration);

    socket.emit("teacher_created", { id });
  });

  // Student submits vote
  socket.on("student:submit_vote", ({ pollId, option }, cb) => {
    const name = socket.data.studentName;
    if (!name) return cb({ ok: false, message: "Register name first" });
    if (!activePoll || activePoll.id !== pollId) return cb({ ok: false, message: "No active poll" });
    if (!activePoll.options.includes(option)) return cb({ ok: false, message: "Invalid option" });
    if (activePoll.answers[name]) return cb({ ok: false, message: "Already answered" });

    activePoll.answers[name] = option;

    // Send live update ONLY to teacher
    io.to(activePoll.teacherSocketId).emit("poll_update", {
      results: computeResults(activePoll),
      answeredCount: Object.keys(activePoll.answers).length
    });

    cb({ ok: true });
  });

  // Teacher closes poll manually
  socket.on("teacher:close_poll", () => {
    if (!activePoll) return;
    clearTimeout(pollTimeout);
    io.emit("poll_closed", { id: activePoll.id, results: computeResults(activePoll) });
    activePoll = null;
    pollTimeout = null;
  });

  // Teacher requests connected students
  socket.on("teacher:get_connected_students", cb => {
    cb(Object.values(students));
  });

  // Chat
  socket.on("chat:send", ({ sender, message }) => {
    io.emit("chat:receive", { sender, message });
  });

  socket.on("disconnect", () => {
    delete students[socket.id];
    if (activePoll) io.to(activePoll.teacherSocketId).emit("teacher:connected_students", Object.values(students));
  });
});

app.get("/", (req, res) => res.send("Live Poll Backend OK"));

server.listen(5000, () => console.log("Backend running on port 5000"));
