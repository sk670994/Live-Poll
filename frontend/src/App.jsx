import React, { useState, useEffect } from 'react';
import Teacher from './components/Teacher';
import Student from './components/Student';
import socket from './services/socket';
import './styles.css';

function App() {
  const [userType, setUserType] = useState(null); // 'teacher' or 'student'
  const [currentPoll, setCurrentPoll] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Socket connection handlers
    socket.on('connect', () => {
      console.log('✅ Connected to server');
      setIsConnected(true);
      
      // Get current state when connected
      socket.emit('get_current_state', (response) => {
        if (response.success) {
          console.log('🔄 Current state received:', response);
          setCurrentPoll(response.currentPoll);
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
    });

    socket.on('poll:started', (poll) => {
      console.log('📊 New poll started (App level):', poll);
      setCurrentPoll(poll);
    });

    socket.on('poll:ended', (data) => {
      console.log('📊 Poll ended (App level):', data);
      setCurrentPoll(null);
    });

    // Initial connection check
    if (socket.connected) {
      setIsConnected(true);
      socket.emit('get_current_state', (response) => {
        if (response.success) {
          setCurrentPoll(response.currentPoll);
        }
      });
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('poll:started');
      socket.off('poll:ended');
    };
  }, []);

  const handleRoleSelection = (role) => {
    setUserType(role);
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <div className="connection-status">
          <div className="spinner"></div>
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (!userType) {
    return (
      <div className="app-container">
        <div className="role-selection">
          <div className="role-selection-card">
            <h1 className="app-title">Live Polling System</h1>
            <p className="app-subtitle">Choose your role to continue</p>
            
            <div className="role-buttons">
              <button 
                className="role-button teacher-button"
                onClick={() => handleRoleSelection('teacher')}
              >
                <div className="role-icon">👩‍🏫</div>
                <h3>Teacher</h3>
                <p>Create and manage polls</p>
              </button>
              
              <button 
                className="role-button student-button"
                onClick={() => handleRoleSelection('student')}
              >
                <div className="role-icon">👨‍🎓</div>
                <h3>Student</h3>
                <p>Join and answer polls</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-logo">Live Polling System</h1>
        <div className="user-role-badge">
          <span className={`role-indicator ${userType}`}>
            {userType === 'teacher' ? '👩‍🏫' : '👨‍🎓'} {userType.charAt(0).toUpperCase() + userType.slice(1)}
          </span>
        </div>
        <button 
          className="change-role-btn"
          onClick={() => setUserType(null)}
          title="Change Role"
        >
          🔄
        </button>
      </div>

      <div className="app-content">
        {userType === 'teacher' ? (
          <Teacher currentPoll={currentPoll} />
        ) : (
          <Student currentPoll={currentPoll} />
        )}
      </div>

      <div className="app-footer">
        <p>Intervue.io - SDE Intern Assignment</p>
      </div>
    </div>
  );
}

export default App;