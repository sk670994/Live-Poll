import React, { useState, useEffect } from 'react';
import socket from '../services/socket';
import Chat from '../Chat';

const Student = ({ currentPoll }) => {
  const [studentName, setStudentName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollResults, setPollResults] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connected');

  useEffect(() => {
    // Check if already registered from previous session
    const savedName = sessionStorage.getItem('studentName');
    if (savedName) {
      setStudentName(savedName);
      attemptRegistration(savedName);
    }

    // Socket event listeners
    socket.on('poll:started', (poll) => {
      setSelectedAnswer('');
      setHasSubmitted(false);
      setShowResults(false);
      setTimeLeft(poll.timeLeft || 0);
      setPollResults({});
    });

    socket.on('poll:ended', (data) => {
      setPollResults(data.results || {});
      setShowResults(true);
      setTimeLeft(0);
    });

    socket.on('poll:results_update', (data) => {
      if (hasSubmitted) {
        setPollResults(data.results || {});
        setShowResults(true);
      }
    });

    socket.on('student:removed', () => {
      alert('You have been removed from the session by the teacher.');
      sessionStorage.removeItem('studentName');
      setIsRegistered(false);
      setStudentName('');
      setConnectionStatus('removed');
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
      // Re-register if we have a saved name
      const savedName = sessionStorage.getItem('studentName');
      if (savedName && !isRegistered) {
        attemptRegistration(savedName);
      }
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    return () => {
      socket.off('poll:started');
      socket.off('poll:ended');
      socket.off('poll:results_update');
      socket.off('student:removed');
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [isRegistered, hasSubmitted]);

  // Timer effect for countdown
  useEffect(() => {
    if (!currentPoll || timeLeft <= 0 || hasSubmitted) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        console.log('⏱️ Timer update:', newTime);
        
        if (newTime <= 0) {
          console.log('⏰ Time up!');
          setShowResults(true);
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentPoll, timeLeft, hasSubmitted]);

  // Update timer when currentPoll changes
  useEffect(() => {
    if (currentPoll && currentPoll.serverTime) {
      const serverTime = currentPoll.serverTime;
      const clientTime = Date.now();
      const timeDiff = serverTime - clientTime;
      const accurateEndTime = currentPoll.endTime + timeDiff;
      const timeLeftMs = Math.max(0, accurateEndTime - Date.now());
      const timeLeftSeconds = Math.floor(timeLeftMs / 1000);
      
      console.log('📊 Poll updated, time left:', timeLeftSeconds);
      setTimeLeft(timeLeftSeconds);
      
      if (timeLeftSeconds <= 0) {
        setShowResults(true);
      }
    }
  }, [currentPoll]);

  const attemptRegistration = (name) => {
    setIsRegistering(true);
    socket.emit('student:register', { name }, (response) => {
      setIsRegistering(false);
      if (response.success) {
        setIsRegistered(true);
        sessionStorage.setItem('studentName', name);
        setConnectionStatus('registered');
      } else {
        alert(response.message);
        sessionStorage.removeItem('studentName');
      }
    });
  };

  const handleRegister = () => {
    if (!studentName.trim()) {
      alert('Please enter your name');
      return;
    }

    if (studentName.trim().length < 2) {
      alert('Name must be at least 2 characters long');
      return;
    }

    if (studentName.trim().length > 30) {
      alert('Name must be less than 30 characters');
      return;
    }

    attemptRegistration(studentName.trim());
  };

  const handleSubmitAnswer = () => {
    if (!selectedAnswer) {
      alert('Please select an answer');
      return;
    }

    if (!currentPoll) {
      alert('No active poll');
      return;
    }

    setIsSubmitting(true);
    socket.emit('student:submit_answer', {
      pollId: currentPoll.id,
      answer: selectedAnswer
    }, (response) => {
      setIsSubmitting(false);
      if (response.success) {
        setHasSubmitted(true);
        setShowResults(true);
      } else {
        alert(response.message);
      }
    });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalVotes = Object.values(pollResults).reduce((sum, count) => sum + count, 0);

  if (connectionStatus === 'disconnected') {
    return (
      <div className="student-container">
        <div className="connection-error">
          <div className="error-icon">⚠️</div>
          <h3>Connection Lost</h3>
          <p>Trying to reconnect...</p>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'removed') {
    return (
      <div className="student-container">
        <div className="removed-message">
          <div className="error-icon">❌</div>
          <h3>Session Ended</h3>
          <p>You have been removed from the session by the teacher.</p>
          <button 
            onClick={() => {
              setConnectionStatus('connected');
              setStudentName('');
            }}
            className="rejoin-btn"
          >
            Join Again
          </button>
        </div>
      </div>
    );
  }

  if (!isRegistered) {
    return (
      <div className="student-container">
        <div className="registration-form">
          <div className="registration-card">
            <h2>Join the Session</h2>
            <p>Enter your name to participate in live polls</p>
            
            <div className="form-group">
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
                placeholder="Enter your name..."
                className="form-input"
                maxLength={30}
                disabled={isRegistering}
              />
            </div>
            
            <button
              onClick={handleRegister}
              disabled={isRegistering || !studentName.trim()}
              className="register-btn"
            >
              {isRegistering ? 'Joining...' : 'Join Session'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="student-container">
      <div className="student-main">
        <div className="student-header">
          <div className="student-info">
            <h2>Welcome, {studentName}! 👋</h2>
            <div className="status-indicator">
              <span className="status-dot connected"></span>
              Connected
            </div>
          </div>
        </div>

        {!currentPoll ? (
          <div className="waiting-state">
            <div className="waiting-card">
              <div className="waiting-icon">⏳</div>
              <h3>Waiting for Poll</h3>
              <p>Your teacher hasn't started a poll yet. Please wait...</p>
            </div>
          </div>
        ) : (
          <div className="poll-section">
            <div className="poll-header">
              <h3 className="poll-question">{currentPoll.question}</h3>
              
              {timeLeft > 0 && !hasSubmitted && (
                <div className="timer">
                  <div className="timer-icon">⏱️</div>
                  <span className="timer-text">{formatTime(timeLeft)}</span>
                </div>
              )}
            </div>

            {!hasSubmitted && timeLeft > 0 ? (
              <div className="answer-section">
                <h4>Choose your answer:</h4>
                <div className="options-list">
                  {currentPoll.options.map((option, index) => (
                    <label key={option} className="option-item">
                      <input
                        type="radio"
                        name="poll-option"
                        value={option}
                        checked={selectedAnswer === option}
                        onChange={(e) => setSelectedAnswer(e.target.value)}
                        disabled={isSubmitting}
                      />
                      <span className="option-text">{option}</span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleSubmitAnswer}
                  disabled={!selectedAnswer || isSubmitting}
                  className="submit-answer-btn"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Answer'}
                </button>
              </div>
            ) : showResults ? (
              <div className="results-section">
                <h4>Poll Results ({totalVotes} total votes)</h4>
                
                {currentPoll.options.map((option) => {
                  const count = pollResults[option] || 0;
                  const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                  const isMyAnswer = selectedAnswer === option;
                  
                  return (
                    <div key={option} className={`result-item ${isMyAnswer ? 'my-answer' : ''}`}>
                      <div className="result-header">
                        <span className="option-text">
                          {option}
                          {isMyAnswer && <span className="my-choice-indicator"> (Your choice)</span>}
                        </span>
                        <span className="vote-count">{count} votes ({Math.round(percentage)}%)</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
                
                {hasSubmitted && (
                  <div className="submission-status">
                    <div className="success-icon">✅</div>
                    <span>Your answer has been recorded!</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="time-up-state">
                <div className="time-up-icon">⏰</div>
                <h4>Time's Up!</h4>
                <p>Waiting for results...</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chat-section">
        <button
          onClick={() => setShowChat(!showChat)}
          className={`chat-toggle ${showChat ? 'active' : ''}`}
        >
          💬 Chat {showChat ? '✕' : ''}
        </button>
        
        {showChat && (
          <Chat userType="student" userName={studentName} />
        )}
      </div>
    </div>
  );
};

export default Student;