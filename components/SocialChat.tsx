'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { 
  searchUsers, 
  getSocialMessages, 
  saveSocialMessage, 
  deleteSocialMessage, 
  reactToSocialMessage,
  getRecentChats,
  markMessagesAsSeen,
  askAI,
  saveCall
} from '@/app/dashboard/actions';
import CallInterface from './CallInterface';
import './SocialChat.css';

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  image?: string;
  online?: boolean;
  lastMessage?: string;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: string;
  createdAt: Date;
  isSeen?: boolean;
  reactions?: any[];
}

const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿']
};

export default function SocialChat() {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Call States
  const [incomingCall, setIncomingCall] = useState<{ from: any, type: 'audio' | 'video' } | null>(null);
  const [activeCall, setActiveCall] = useState<{ peer: any, type: 'audio' | 'video', isCaller: boolean } | null>(null);
  const [showAIMention, setShowAIMention] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  // Initialize Socket
  useEffect(() => {
    fetch('/api/socket');
    const newSocket = io({ path: "/api/socket" }); 
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected, identifying...');
    });

    newSocket.on('online_users_list', (emails: string[]) => {
      setOnlineEmails(new Set(emails));
    });

    newSocket.on('user_online', ({ email }) => {
      setOnlineEmails(prev => new Set(prev).add(email));
    });

    newSocket.on('user_offline', ({ email }) => {
      setOnlineEmails(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    });

    newSocket.on('receive_social_message', (msg: Message) => {
      setMessages((prev) => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // If we are currently chatting with this person, mark it as seen
      if (selectedUser && msg.senderId === selectedUser.id) {
        markMessagesAsSeen(selectedUser.id);
        newSocket.emit('mark_as_seen', { senderEmail: selectedUser.email });
      }
    });

    newSocket.on('receive_social_reaction', ({ messageId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          const existing = reactions.find(r => r.emoji === emoji);
          if (existing) {
             return { ...m, reactions: reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r) };
          }
          return { ...m, reactions: [...reactions, { emoji, count: 1 }] };
        }
        return m;
      }));
    });

    newSocket.on('receive_social_delete', ({ messageId }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return { ...m, content: "🚫 This message was deleted", type: "deleted" };
        }
        return m;
      }));
    });

    newSocket.on('messages_seen', () => {
      setMessages(prev => prev.map(m => ({ ...m, isSeen: true })));
    });

    // Call Listeners
    newSocket.on('incoming_call', (data) => {
      setIncomingCall(data);
    });

    newSocket.on('call_accepted', (data) => {
      setActiveCall(prev => prev ? { ...prev, connected: true } as any : null);
    });

    newSocket.on('call_rejected', () => {
      setActiveCall(null);
      alert('Call rejected');
    });

    newSocket.on('call_ended', () => {
      setActiveCall(null);
      setIncomingCall(null);
    });

    newSocket.on('user_typing', ({ email }) => {
      setTypingUsers(prev => new Set(prev).add(email));
    });

    newSocket.on('user_stop_typing', ({ email }) => {
      setTypingUsers(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    });

    return () => { 
      newSocket.disconnect();
    };
  }, [session?.user?.email]); 

  // Re-identify if session becomes available after connection
  useEffect(() => {
    if (socket?.connected && session?.user?.email) {
      socket.emit('identify', { email: session.user.email.toLowerCase().trim() });
    }
  }, [session?.user?.email, socket]);

  const handleCall = async (type: 'audio' | 'video') => {
    if (!selectedUser || !session?.user || !socket) return;

    // 1. Emit call event IMMEDIATELY for low latency
    const callTarget = selectedUser.email.toLowerCase().trim();
    socket.emit('call_user', {
      to: callTarget,
      from: session.user,
      type
    });

    // 2. Set local active call state
    setActiveCall({ peer: selectedUser, type, isCaller: true });

    // 3. Save call to DB in background
    try {
      const result = await saveCall(selectedUser.id, type, 'missed');
      if (result?.message && socket) {
        socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...result.message });
        setMessages(prev => [...prev, result.message as any]);
      }
    } catch (err) {
      console.error("Failed to log call:", err);
    }
  };

  const handleAcceptCall = () => {
    if (!incomingCall || !socket) return;
    
    const target = incomingCall.from.email.toLowerCase().trim();
    socket.emit('accept_call', {
      to: target,
      from: session?.user
    });

    setActiveCall({ peer: incomingCall.from, type: incomingCall.type, isCaller: false });
    setIncomingCall(null);
  };

  const handleRejectCall = async () => {
    if (!incomingCall || !socket) return;
    const target = incomingCall.from.email.toLowerCase().trim();
    socket.emit('reject_call', { to: target });
    // Save as rejected call
    const result = await saveCall(incomingCall.from.id, incomingCall.type, 'rejected');
    if (result?.message) {
      socket.emit('send_social_message', { receiverEmail: target, ...result.message });
      // If we are currently in that chat, add it
      if (selectedUser?.id === incomingCall.from.id) {
        setMessages(prev => [...prev, result.message as any]);
      }
    }
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    if (!activeCall || !socket) return;
    const target = activeCall.peer.email.toLowerCase().trim();
    socket.emit('end_call', { to: target });
    // Note: The onEnd callback in CallInterface will handle the database save
  };

  // Search or Load Recent
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const delayDebounce = setTimeout(async () => {
        const results = await searchUsers(searchQuery);
        setUsers(results as any);
      }, 300);
      return () => clearTimeout(delayDebounce);
    } else {
      getRecentChats().then(results => setUsers(results as any));
    }
  }, [searchQuery]);

  // Load messages
  useEffect(() => {
    async function loadMessages() {
      if (!selectedUser) return;
      setIsLoadingMessages(true);
      try {
        const history = await getSocialMessages(selectedUser.id);
        setMessages(history as any);
        // Mark as seen when opening the chat
        await markMessagesAsSeen(selectedUser.id);
        socket?.emit('mark_as_seen', { senderEmail: selectedUser.email });
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    }
    loadMessages();
  }, [selectedUser, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !selectedUser || !socket || !session?.user) return;

    const currentContent = inputValue;
    const senderId = (session.user as any).id;
    setInputValue('');
    setShowAIMention(false);

    if (currentContent.toLowerCase().startsWith('/ai ') || currentContent.toLowerCase().startsWith('@ai ')) {
      const prompt = currentContent.toLowerCase().startsWith('/ai ') ? currentContent.substring(4) : currentContent.substring(4);
      const userMsg: any = { id: 'ai-user-' + Date.now(), content: currentContent, senderId, createdAt: new Date(), type: 'text' };
      setMessages(prev => [...prev, userMsg]);

      const aiResponse = await askAI(prompt);
      const aiMsg: any = { id: 'ai-resp-' + Date.now(), content: aiResponse, senderId: 'ai', createdAt: new Date(), type: 'text' };
      setMessages(prev => [...prev, aiMsg]);
      return;
    }

    // Immediate Socket Emission & UI Update
    const stableId = (Math.random().toString(36) + Date.now().toString(36)).substring(2);
    const optimisticMsg: Message = {
      id: stableId,
      senderId: senderId,
      receiverId: selectedUser.id,
      content: currentContent,
      type: 'text',
      createdAt: new Date(),
      isSeen: false
    };

    setMessages(prev => [...prev, optimisticMsg]);
    socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...optimisticMsg });

    try {
      // Background DB Save
      const savedMsg = await saveSocialMessage(selectedUser.id, currentContent);
      if (savedMsg) {
        // Sync the ID if the backend assigned a different one (usually we'd want to keep the client ID if possible)
        setMessages(prev => prev.map(m => m.id === stableId ? { ...(savedMsg as any), id: (savedMsg as any).id || stableId } : m));
      }
    } catch (err) { 
      console.error("Failed to persist message:", err); 
      // Optionally show a "failed" icon next to the message instead of removing it
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (selectedUser && socket && session?.user) {
            const senderId = (session.user as any).id;
            const tempId = 'temp-voice-' + Date.now();
            
            // Immediate Update
            const stableId = 'voice-' + Date.now() + Math.random().toString(36).substring(7);
            const optimisticMsg: any = {
              id: stableId,
              senderId: senderId,
              receiverId: selectedUser.id,
              content: base64Audio,
              type: 'voice',
              createdAt: new Date(),
              isSeen: false
            };
            setMessages(prev => [...prev, optimisticMsg]);
            socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...optimisticMsg });

            try {
              const savedMsg = await saveSocialMessage(selectedUser.id, base64Audio, 'voice');
              if (savedMsg) {
                setMessages(prev => prev.map(m => m.id === stableId ? (savedMsg as any) : m));
              }
            } catch (err) {
              console.error("Failed to save voice message:", err);
            }
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser || !socket || !session?.user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      const senderId = (session.user as any).id;
      const tempId = 'temp-file-' + Date.now();

      const stableId = 'file-' + Date.now() + Math.random().toString(36).substring(7);
      const optimisticMsg: any = {
        id: stableId,
        senderId: senderId,
        receiverId: selectedUser.id,
        content: base64,
        type: type,
        createdAt: new Date(),
        isSeen: false
      };
      setMessages(prev => [...prev, optimisticMsg]);
      socket.emit('send_social_message', { receiverEmail: selectedUser.email, ...optimisticMsg });

      try {
        const savedMsg = await saveSocialMessage(selectedUser.id, base64, type);
        if (savedMsg) {
          setMessages(prev => prev.map(m => m.id === stableId ? (savedMsg as any) : m));
        }
      } catch (err) {
        console.error("Failed to save file:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReact = async (msgId: string, emoji: string) => {
    await reactToSocialMessage(msgId, emoji);
    socket?.emit('react_social_message', { messageId: msgId, emoji, receiverEmail: selectedUser?.email });
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        const reactions = m.reactions || [];
        return { ...m, reactions: [...reactions, { emoji, count: 1 }] };
      }
      return m;
    }));
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm("Delete for everyone?")) return;
    await deleteSocialMessage(msgId, 'everyone');
    socket?.emit('delete_social_message', { messageId: msgId, receiverEmail: selectedUser?.email });
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) return { ...m, content: "🚫 This message was deleted", type: "deleted" };
      return m;
    }));
  };

  const initiateCall = (type: 'audio' | 'video') => {
    if (!selectedUser) return;
    const url = `/call?id=${selectedUser.id}&type=${type}`;
    window.open(url, '_blank', 'width=1000,height=800');
  };

  return (
    <div className="social-chat-container">
      <div className="main-wrap">
        <aside className="sidebar">
          <div className="search-wrap">
            <input 
              type="text" 
              placeholder="Search contacts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
                <div className="list">
                  {users.map((user) => {
                    const isOnline = onlineEmails.has(user.email);
                    return (
                      <div key={user.id} className={`item ${selectedUser?.id === user.id ? 'active' : ''}`} onClick={() => setSelectedUser(user)}>
                        <div className="user-pfp">
                          {user.image ? <img src={user.image} alt={user.name} /> : <div>{user.name?.charAt(0)}</div>}
                        </div>
                        <div className="meta">
                          <b>{user.name} <span className={`online-dot ${isOnline ? 'online' : ''}`} /></b>
                          <small>{user.lastMessage || `@${user.username}`}</small>
                        </div>
                      </div>
                    );
                  })}
                  {users.length === 0 && searchQuery.length < 2 && (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <p>No recent conversations</p>
              </div>
            )}
          </div>
        </aside>

        <section className={`chat-area ${selectedUser ? 'active' : ''}`}>
          {selectedUser ? (
            <>
              <div className="chat-header">
                <div className="to">
                  <div className="avatar">
                    {selectedUser.image ? <img src={selectedUser.image} alt={selectedUser.name} /> : <div>{selectedUser.name?.charAt(0)}</div>}
                  </div>
                  <div className="info">
                    <div className="name">{selectedUser.name}</div>
                    <div className="status-text">
                      {typingUsers.has(selectedUser.email) ? (
                        <span className="typing-indicator">typing...</span>
                      ) : (
                        <>
                          <span className={`status-dot ${onlineEmails.has(selectedUser.email) ? 'online' : ''}`} />
                          {onlineEmails.has(selectedUser.email) ? 'online' : 'offline'}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="chat-header-right">
                  <button className="call-btn" onClick={() => handleCall('audio')} title="Audio Call">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                  </button>
                  <button className="call-btn" onClick={() => handleCall('video')} title="Video Call">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>
                  </button>
                </div>

              </div>

              <div className="messages">
                {messages.map((msg) => {
                  const isAI = msg.senderId === 'ai';
                  const currentUserId = (session?.user as any)?.id;
                  
                  // A message is "Sent" if the sender is the current user
                  const isSent = !isAI && String(msg.senderId) === String(currentUserId);
                  // A message is "Received" if the sender is the person we are chatting with
                  const isReceived = !isAI && !isSent && String(msg.senderId) === String(selectedUser?.id);


                  return (
                    <div key={msg.id} className={`msg-wrapper ${isSent ? 'sent' : isAI ? 'ai' : 'received'}`}>
                      <div className={`msg ${isSent ? 'sent' : isAI ? 'ai' : 'received'} ${msg.type === 'deleted' ? 'deleted-msg' : ''}`}>
                        {isAI && (
                          <div className="system-sender">AI Assistant</div>
                        )}
                        {msg.type === 'image' && <img src={msg.content} alt="media" onClick={() => window.open(msg.content, '_blank')} />}

                        {msg.type === 'video' && <video src={msg.content} controls />}
                        {msg.type === 'voice' && <audio src={msg.content} controls />}
                        {msg.type === 'call' && (
                          <div className="call-log-msg">
                            <div className={`call-icon ${msg.content.includes('Missed') ? 'missed' : msg.content.includes('rejected') ? 'rejected' : 'completed'}`}>
                              {msg.content.includes('video') ? (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                              ) : (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                              )}
                              {msg.content.includes('Missed') || msg.content.includes('rejected') ? (
                                <div className="call-status-badge">!</div>
                              ) : null}
                            </div>
                            <div className="call-details">
                              <span className="call-title">{msg.content.split(' • ')[0]}</span>
                              {msg.content.includes(' • ') && <span className="call-duration">{msg.content.split(' • ')[1]}</span>}
                            </div>
                          </div>
                        )}
                        {msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'voice' && msg.type !== 'file' && msg.type !== 'call' && <div>{msg.content}</div>}
                        
                        <div className="time-row">
                          <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                          {isSent && (
                            <span className={`seen-status ${msg.isSeen ? 'seen' : ''}`}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41z" />
                              </svg>
                            </span>
                          )}

                        </div>

                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="msg-reactions">
                            {msg.reactions.map((r, i) => (
                              <span key={i} className="reaction-badge">{r.emoji} {r.count}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {msg.type !== 'deleted' && (
                        <div className="msg-actions">
                          {['❤️', '😂', '😮', '😢', '👍'].map(em => (
                            <span key={em} className="quick-react" onClick={() => handleReact(msg.id, em)}>{em}</span>
                          ))}
                          {isSent && <span className="msg-action-btn" title="Delete" onClick={() => handleDelete(msg.id)}>🗑</span>}
                        </div>
                      )}
                    </div>

                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <footer className="footer">
                {!isRecording ? (
                  <div className="type-box">
                    <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Send Media">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                    </button>
                    <button className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>
                    </button>
                    <input 
                      type="text" 
                      placeholder="Write a message..." 
                      value={inputValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInputValue(val);
                        
                        // Typing Indicator Logic
                        if (socket && selectedUser) {
                          if (!typingTimeoutRef.current) {
                            socket.emit('typing', { receiverEmail: selectedUser.email });
                          } else {
                            clearTimeout(typingTimeoutRef.current);
                          }
                          typingTimeoutRef.current = setTimeout(() => {
                            socket.emit('stop_typing', { receiverEmail: selectedUser.email });
                            typingTimeoutRef.current = null;
                          }, 2000);
                        }

                        // Show popup if the last character is @ or if we're typing an @ mention
                        const lastWord = val.split(' ').pop() || '';
                        if (lastWord.startsWith('@')) {
                          setShowAIMention(true);
                        } else {
                          setShowAIMention(false);
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    {showAIMention && (
                      <div className="mention-popup animate-in slide-in-from-bottom-2 duration-200">
                        <div className="mention-item" onClick={() => { setInputValue(prev => prev + 'ai '); setShowAIMention(false); }}>
                          <div className="mention-avatar">AI</div>
                          <div className="mention-info">
                            <b>AI Assistant</b>
                            <span>Ask me anything</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="visualizer">
                    {[...Array(13)].map((_, i) => <div key={i} className="bar" style={{ animationDelay: `${-0.1 * (i % 7)}s` }} />)}
                  </div>
                )}
                
                <button 
                  className="send-btn" 
                  onClick={() => {
                    if (inputValue.trim()) {
                      handleSendMessage();
                    } else if (!isRecording) {
                      startRecording();
                    } else {
                      stopRecording();
                    }
                  }}
                >
                  {inputValue.trim() ? (
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  ) : isRecording ? (
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  )}
                </button>
              </footer>

              {showEmojiPicker && (
                <div className="emoji-popup">
                  <div className="emoji-grid">
                    {EMOJI_CATEGORIES.smileys.map(em => (
                      <span key={em} className="emoji-item" onClick={() => { setInputValue(prev => prev + em); setShowEmojiPicker(false); }}>{em}</span>
                    ))}
                  </div>
                </div>
              )}
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="*" />
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
                </svg>
              </div>
              <h3>Select a Chat</h3>
              <p>Choose a contact to start messaging or search for new people.</p>
            </div>
          )}

        </section>
      </div>

      {/* --- INCOMING CALL OVERLAY --- */}
      {incomingCall && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-xl animate-in fade-in duration-500">
          <div className="flex flex-col items-center gap-10 text-center p-14 bg-white border border-gray-100 rounded-[3.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.12)]">
            <div className="relative">
              <div className="absolute inset-0 bg-gray-100 rounded-full animate-ping [animation-duration:2s]" />
              <div className="relative w-36 h-36 rounded-full overflow-hidden border-[6px] border-white shadow-2xl bg-gray-50 flex items-center justify-center text-5xl font-bold text-black">
                {incomingCall.from.image ? <img src={incomingCall.from.image} className="w-full h-full object-cover" /> : incomingCall.from.name?.charAt(0)}
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold text-black tracking-tight">{incomingCall.from.name}</h2>
              <div className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold uppercase tracking-widest inline-block">
                Incoming {incomingCall.type} Call
              </div>
            </div>

            <div className="flex gap-8">
              <button 
                onClick={handleRejectCall}
                className="w-18 h-18 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white active:scale-90 transition-all shadow-lg"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button 
                onClick={handleAcceptCall}
                className="w-18 h-18 rounded-full bg-black text-white flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl shadow-black/20"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* --- ACTIVE CALL OVERLAY --- */}
      {activeCall && socket && (
        <CallInterface 
          socket={socket}
          peer={activeCall.peer}
          type={activeCall.type}
          isCaller={activeCall.isCaller}
          onEnd={async (duration) => {
            // Save call history on both ends if it was an active call
            // but prioritize the caller to save the authoritative record
            if (activeCall.isCaller) {
              const result = await saveCall(activeCall.peer.id, activeCall.type, duration && duration > 0 ? 'completed' : 'missed', duration);
              if (result?.message && socket) {
                socket.emit('send_social_message', { receiverEmail: activeCall.peer.email, ...result.message });
                setMessages(prev => [...prev, result.message as any]);
              }
            } else if (duration && duration > 0) {
              // Receiver can also save if it was a completed call they were part of
              // but we'll check if we need to emit (optional, usually caller handles it)
            }
            setActiveCall(null);
          }}
        />
      )}
    </div>
  );
}

