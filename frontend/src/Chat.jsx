import React, { useState, useEffect, useRef } from 'react';
import socket from './services/socket';

const Chat = ({ userType, userName }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    // Get chat history when component mounts
    socket.emit('chat:get_history', (response) => {
      if (response.success) {
        setMessages(response.messages);
      }
    });

    // Listen for new messages
    socket.on('chat:new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      socket.off('chat:new_message');
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || isSending) return;

    const messageText = newMessage.trim();
    setIsSending(true);
    
    socket.emit('chat:send_message', {
      message: messageText,
      sender: userName,
      senderType: userType
    });

    setNewMessage('');
    setIsSending(false);
    
    // Focus back on input
    chatInputRef.current?.focus();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>💬 Live Chat</h3>
        <div className="chat-info">
          <span className="user-indicator">
            {userType === 'teacher' ? '👩‍🏫' : '👨‍🎓'} {userName}
          </span>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">
            <div className="no-messages-icon">💬</div>
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${
                message.sender === userName ? 'own-message' : 'other-message'
              } ${message.senderType}-message`}
            >
              <div className="message-content">
                <div className="message-header">
                  <span className="sender-name">
                    {message.senderType === 'teacher' ? '👩‍🏫' : '👨‍🎓'} {message.sender}
                    {message.sender === userName && <span className="you-indicator"> (You)</span>}
                  </span>
                  <span className="message-time">
                    {formatMessageTime(message.timestamp)}
                  </span>
                </div>
                <div className="message-text">{message.message}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-section">
        <div className="chat-input-group">
          <input
            ref={chatInputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="chat-input"
            maxLength={500}
            disabled={isSending}
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            className="send-button"
            title="Send message"
          >
            {isSending ? '⏳' : '📤'}
          </button>
        </div>
        <div className="chat-input-hint">
          Press Enter to send • Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default Chat;