import React, { useState, useEffect } from 'react';
import socket from '../services/socket';
import Chat from '../Chat';

const Teacher = ({ currentPoll }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState(60);
  const [connectedStudents, setConnectedStudents] = useState([]);
  const [pollResults, setPollResults] = useState({});
  const [answeredCount, setAnsweredCount] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [pollHistory, setPollHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [timeLeft] = useState(0);

  useEffect(() => {
    // Listen for student updates
    socket.on('teacher:students_update', (students) => {
      setConnectedStudents(students);
    });

    // Listen for poll results updates
    socket.on('poll:results_update', (data) => {
      setPollResults(data.results);
      setAnsweredCount(data.answeredCount);
    });

    // Listen for poll ended
    socket.on('poll:ended', () => {
      // Refresh history when poll ends
      socket.emit('teacher:get_poll_history', (response) => {
        if (response.success) {
          setPollHistory(response.history);
        }
      });
    });

    // Get initial data
    socket.emit('teacher:get_poll_history', (response) => {
      if (response.success) {
        setPollHistory(response.history);
      }
    });

    return () => {
      socket.off('teacher:students_update');
      socket.off('poll:results_update');
      socket.off('poll:ended');
    };
  }, []);

  const canCreatePoll = () => {
    return !currentPoll || (connectedStudents.length > 0 && connectedStudents.every(s => s.hasAnswered));
  };

  const handleCreatePoll = () => {
    if (!question.trim()) {
      alert('Please enter a question');
      return;
    }

    const validOptions = options.filter(opt => opt.trim() !== '');
    if (validOptions.length < 2) {
      alert('Please enter at least 2 options');
      return;
    }

    if (duration < 10 || duration > 300) {
      alert('Duration must be between 10 and 300 seconds');
      return;
    }

    setIsCreating(true);
    socket.emit('teacher:create_poll', {
      question: question.trim(),
      options: validOptions,
      duration: duration
    }, (response) => {
      setIsCreating(false);
      if (!response.success) {
        alert(response.message);
      } else {
        // Clear form
        setQuestion('');
        setOptions(['', '']);
        setDuration(60);
        setPollResults({});
        setAnsweredCount(0);
      }
    });
  };

  const handleEndPoll = () => {
    if (window.confirm('Are you sure you want to end the current poll?')) {
      socket.emit('teacher:end_poll', (response) => {
        if (!response.success) {
          alert(response.message);
        }
      });
    }
  };

  const handleRemoveStudent = (studentName) => {
    if (window.confirm(`Remove ${studentName} from the session?`)) {
      socket.emit('teacher:remove_student', { studentName }, (response) => {
        if (!response.success) {
          alert(response.message);
        }
      });
    }
  };

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const totalVotes = Object.values(pollResults).reduce((sum, count) => sum + count, 0);

  return (
    <div className="teacher-container">
      <div className="teacher-main">
        <div className="teacher-section">
          <h2 className="section-title">Poll Management</h2>
          
          {!currentPoll ? (
            <div className="poll-creation">
              <div className="form-group">
                <label htmlFor="question">Question</label>
                <input
                  id="question"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Enter your poll question..."
                  className="form-input"
                  maxLength={200}
                />
              </div>

              <div className="form-group">
                <label>Options</label>
                {options.map((option, index) => (
                  <div key={index} className="option-input-group">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}...`}
                      className="form-input"
                      maxLength={100}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="remove-option-btn"
                        title="Remove option"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                
                {options.length < 6 && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="add-option-btn"
                  >
                    + Add Option
                  </button>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="duration">Duration (seconds)</label>
                <input
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                  min="10"
                  max="300"
                  className="form-input"
                />
              </div>

              <button
                onClick={handleCreatePoll}
                disabled={isCreating || !canCreatePoll()}
                className={`create-poll-btn ${!canCreatePoll() ? 'disabled' : ''}`}
              >
                {isCreating ? 'Creating...' : 'Create Poll'}
              </button>
              
              {!canCreatePoll() && currentPoll && (
                <p className="poll-status-message">
                  Wait for all students to answer before creating a new poll
                </p>
              )}
            </div>
          ) : (
            <div className="active-poll">
              <h3 className="poll-question">Active Poll: {currentPoll.question}</h3>
              
              <div className="poll-stats">
                <div className="stat-item">
                  <span className="stat-label">Answered:</span>
                  <span className="stat-value">{answeredCount} / {connectedStudents.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Time Left:</span>
                  <span className="stat-value">{Math.max(0, timeLeft)}s</span>
                </div>
              </div>

              <div className="poll-results">
                <h4>Live Results ({totalVotes} votes)</h4>
                {currentPoll.options.map((option) => {
                  const count = pollResults[option] || 0;
                  const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                  
                  return (
                    <div key={option} className="result-item">
                      <div className="result-header">
                        <span className="option-text">{option}</span>
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
              </div>

              <button
                onClick={handleEndPoll}
                className="end-poll-btn"
              >
                End Poll
              </button>
            </div>
          )}
        </div>

        <div className="teacher-section">
          <h2 className="section-title">Connected Students ({connectedStudents.length})</h2>
          
          {connectedStudents.length === 0 ? (
            <p className="no-students">No students connected</p>
          ) : (
            <div className="students-list">
              {connectedStudents.map((student) => (
                <div key={student.name} className="student-item">
                  <div className="student-info">
                    <span className="student-name">{student.name}</span>
                    <span className={`student-status ${student.hasAnswered ? 'answered' : 'pending'}`}>
                      {student.hasAnswered ? '✓ Answered' : '⏳ Pending'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveStudent(student.name)}
                    className="remove-student-btn"
                    title="Remove student"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="teacher-section">
          <h2 className="section-title">
            Poll History ({pollHistory.length})
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="toggle-btn"
            >
              {showHistory ? 'Hide' : 'Show'}
            </button>
          </h2>
          
          {showHistory && (
            <div className="poll-history">
              {pollHistory.length === 0 ? (
                <p>No polls conducted yet</p>
              ) : (
                pollHistory.slice().reverse().map((poll, index) => (
                  <div key={poll.id} className="history-item">
                    <h4>#{pollHistory.length - index}: {poll.question}</h4>
                    <div className="history-results">
                      {poll.options.map((option) => {
                        const count = poll.results[option] || 0;
                        const total = Object.values(poll.results).reduce((sum, c) => sum + c, 0);
                        const percentage = total > 0 ? (count / total) * 100 : 0;
                        
                        return (
                          <div key={option} className="history-result">
                            <span>{option}: {count} votes ({Math.round(percentage)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                    <small className="history-date">
                      {new Date(poll.endedAt).toLocaleString()}
                    </small>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="chat-section">
        <button
          onClick={() => setShowChat(!showChat)}
          className={`chat-toggle ${showChat ? 'active' : ''}`}
        >
          💬 Chat {showChat ? '✕' : ''}
        </button>
        
        {showChat && (
          <Chat userType="teacher" userName="Teacher" />
        )}
      </div>
    </div>
  );
};

export default Teacher;