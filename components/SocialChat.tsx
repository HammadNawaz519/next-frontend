'use client';

import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { 
  searchUsers, 
  getSocialMessages, 
  getSocialUser,
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

  lastMessage?: string;
  unseenCount?: number;
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

const MessageItem = memo(({ msg, currentUserId, selectedUser, onDelete }: any) => {
  const isAI = msg.senderId === 'ai';
  // A message is "Sent" if the sender is the current user
  const isSent = !isAI && String(msg.senderId) === String(currentUserId);
  
  return (
    <div className={`msg-wrapper ${isSent ? 'sent' : isAI ? 'ai' : 'received'} animate-in slide-in-from-bottom-2 duration-300`}>
      <div className={`msg ${isSent ? 'sent' : isAI ? 'ai' : 'received'} ${msg.type === 'deleted' ? 'deleted-msg' : ''}`}>
        {isAI && <div className="system-sender">AI Assistant</div>}
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
              {(msg.content.includes('Missed') || msg.content.includes('rejected')) && <div className="call-status-badge">!</div>}
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
      </div>
      
      {msg.type !== 'deleted' && msg.type !== 'call' && (
        <div className="msg-actions">
          <div className="msg-del-actions">
            <span className="msg-action-btn" title="Delete for me" onClick={() => onDelete(msg.id, 'me')}>🗑 Me</span>
            {isSent && <span className="msg-action-btn" title="Delete for everyone" onClick={() => onDelete(msg.id, 'everyone')}>🗑 All</span>}
          </div>
        </div>
      )}
    </div>
  );
});

const SidebarItem = memo(({ user, isActive, onClick }: { user: User, isActive: boolean, onClick: any }) => {
  return (
    <div className={`item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="user-pfp">
        {user.image && user.image.length > 5 ? (
          <img src={user.image} alt={user.name} referrerPolicy="no-referrer" />
        ) : (
          <span>{user.name?.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="meta">
        <b>
          {user.name} 
          <div className="side-meta">
            {user.unseenCount && user.unseenCount > 0 ? <span className="unseen-badge">{user.unseenCount}</span> : null}
          </div>
        </b>
        <small className="truncate">{user.lastMessage || `@${user.username || user.name?.toLowerCase().replace(/\s+/g, '')}`}</small>
      </div>
    </div>
  );
});

interface SocialChatProps {
  isActive?: boolean;
}

export default function SocialChat({ isActive = true }: SocialChatProps) {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('social_messages_cache');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  // Sync cache to session storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('social_messages_cache', JSON.stringify(messagesCache));
    }
  }, [messagesCache]);
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
  const [view, setView] = useState<'recent' | 'requests'>('recent');
  const [requests, setRequests] = useState<User[]>([]);
  const selectedUserRef = useRef<User | null>(null);
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneRef = useRef<AudioContext | null>(null);


  // Ringing effect for incoming calls
  useEffect(() => {
    let ringInterval: NodeJS.Timeout;
    let audioCtx: AudioContext;

    if (incomingCall && !activeCall) {
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        ringtoneRef.current = audioCtx;

        const playRing = () => {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
          gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 1.5);
        };

        playRing();
        ringInterval = setInterval(playRing, 3000);
      } catch (e) {
        console.error("Audio API blocked");
      }
    }

    return () => {
      if (ringInterval) clearInterval(ringInterval);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => { });
      }
    };
  }, [incomingCall, activeCall]);
  // 1. Stable Socket Instance
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const initSocket = async () => {
      const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://server-production-265c.up.railway.app';
      const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket connected');
        if (session?.user?.email) {
          newSocket.emit('identify', { email: session.user.email.toLowerCase().trim() });
        }
      });

      newSocket.on('receive_social_message', async (msg: Message) => {
        const partnerId = msg.senderId === (session?.user as any)?.id ? msg.receiverId : msg.senderId;
        
        // 1. Update Message Stream
        setMessages((prev) => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // 2. Update Sidebar (Users/Requests)
        const formatMsg = (m: Message) => {
          if (m.type === 'voice') return 'Voice Message';
          if (m.type === 'image') return 'Image';
          if (m.type === 'video') return 'Video';
          if (m.type === 'file') return 'Attachment';
          return m.content.length > 30 ? m.content.substring(0, 30) + '...' : m.content;
        };

        const updateSidebarList = async (prevList: User[]) => {
          const existingIndex = prevList.findIndex(u => u.id === partnerId);
          if (existingIndex > -1) {
            const updatedUser = { 
              ...prevList[existingIndex], 
              lastMessage: formatMsg(msg),
              unseenCount: (selectedUserRef.current?.id === partnerId) ? 0 : (prevList[existingIndex].unseenCount || 0) + 1
            };
            const newList = [...prevList];
            newList.splice(existingIndex, 1);
            return [updatedUser, ...newList];
          }
          
          // If NOT in list, fetch user and add as request
          if (msg.senderId !== (session?.user as any)?.id) {
            const newUser = await getSocialUser(msg.senderId);
            if (newUser) {
              return [{ 
                ...(newUser as any), 
                lastMessage: formatMsg(msg), 
                isRequest: true, 
                unseenCount: 1 
              }, ...prevList];
            }
          }
          return prevList;
        };

        setUsers(prev => {
          const existing = prev.find(u => u.id === partnerId);
          if (existing) {
            const index = prev.indexOf(existing);
            const updated = { ...existing, lastMessage: formatMsg(msg), unseenCount: (selectedUserRef.current?.id === partnerId) ? 0 : (existing.unseenCount || 0) + 1 };
            const next = [...prev];
            next.splice(index, 1);
            return [updated, ...next];
          }
          return prev;
        });

        setRequests(prev => {
          const existing = prev.find(u => u.id === partnerId);
          if (existing) {
            const index = prev.indexOf(existing);
            const updated = { ...existing, lastMessage: formatMsg(msg), unseenCount: (selectedUserRef.current?.id === partnerId) ? 0 : (existing.unseenCount || 0) + 1 };
            const next = [...prev];
            next.splice(index, 1);
            return [updated, ...next];
          }
          
          // If it's a completely new person who messaged us
          if (msg.senderId !== (session?.user as any)?.id && !users.some(u => u.id === msg.senderId)) {
            getSocialUser(msg.senderId).then(newUser => {
              if (newUser) {
                setRequests(current => {
                  if (current.some(u => u.id === newUser.id)) return current;
                  return [{ ...(newUser as any), lastMessage: formatMsg(msg), isRequest: true, unseenCount: 1 }, ...current];
                });
              }
            });
          }
          return prev;
        });

        // 3. Update Cache
        setMessagesCache(prev => {
          const current = prev[partnerId] || [];
          if (current.some(m => m.id === msg.id)) return prev;
          return { ...prev, [partnerId]: [...current, msg] };
        });

        // 4. Mark as seen if active
        if (selectedUserRef.current?.id === partnerId) {
          markMessagesAsSeen(partnerId);
          newSocket.emit('mark_as_seen', { senderEmail: selectedUserRef.current.email });
        }
      });

      newSocket.on('receive_social_delete', ({ messageId }) => {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) return { ...m, content: "🚫 This message was deleted", type: "deleted" };
          return m;
        }));
      });

      newSocket.on('messages_seen', () => {
        setMessages(prev => prev.map(m => ({ ...m, isSeen: true })));
      });

      newSocket.on('incoming_call', (data) => {
        console.log("Incoming call received:", data);
        setIncomingCall(data);
      });

      newSocket.on('call_accepted', (data) => {
        setActiveCall(prev => prev ? { ...prev, connected: true } as any : null);
      });

      newSocket.on('call_rejected', () => {
        setActiveCall(null);
        setIncomingCall(null);
        alert('Call was declined.');
      });

      newSocket.on('call_busy', () => {
        setActiveCall(null);
        alert('User is currently in another call.');
      });

      newSocket.on('call_ended', () => {
        console.log("Call ended by peer");
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
    };

    initSocket();

    return () => {
      console.log("Cleaning up socket...");
    };
  }, []); // MOUNT ONLY

  // 2. Identify whenever session becomes available + Heartbeat
  useEffect(() => {
    const identify = () => {
      if (socket && socket.connected && session?.user?.email) {
        socket.emit('identify', { email: session.user.email.toLowerCase().trim() });
      }
    };
    identify();
    const interval = setInterval(identify, 15000); // Re-identify every 15s to keep room alive
    return () => clearInterval(interval);
  }, [socket, session]);
  // Socket identity is handled in the connect event above

  const handleCall = async (type: 'audio' | 'video') => {
    if (!selectedUser || !session?.user || !socket) return;

    // 1. Emit call event IMMEDIATELY for low latency
    const callTarget = selectedUser.email?.toLowerCase().trim();
    if (!callTarget) return;

    socket.emit('call_user', {
      to: callTarget,
      from: session.user,
      type
    });

    // 2. Set local active call state
    setActiveCall({ peer: selectedUser, type, isCaller: true });
    
    // 3. Call is logged when it ends (onEnd) or is rejected (handleRejectCall)
  };

  const handleAcceptCall = () => {
    if (!incomingCall || !socket) return;
    
    const target = incomingCall.from.email?.toLowerCase().trim();
    if (!target) return;
    
    socket.emit('accept_call', {
      to: target,
      from: session?.user
    });

    setActiveCall({ peer: incomingCall.from, type: incomingCall.type, isCaller: false });
    setIncomingCall(null);
  };

  const handleRejectCall = async () => {
    if (!incomingCall || !socket) return;
    const target = incomingCall.from.email?.toLowerCase().trim();
    if (target) socket.emit('reject_call', { to: target });
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
    const target = activeCall.peer.email?.toLowerCase().trim();
    if (target) socket.emit('end_call', { to: target });
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
      getRecentChats().then(results => {
        const contacts: User[] = [];
        const reqs: User[] = [];
        
        results.forEach((u: any) => {
          if (u.isRequest) reqs.push(u);
          else contacts.push(u);
        });
        
        setUsers(contacts);
        setRequests(reqs.filter(r => !contacts.some(c => c.id === r.id)));

        // --- EAGER PREFETCH --- 
        // Instantly background load messages for all contacts to make clicking "flash" fast
        contacts.forEach(u => {
          if (!messagesCache[u.id]) {
            getSocialMessages(u.id).then(history => {
              setMessagesCache(prev => ({ ...prev, [u.id]: history as any }));
            }).catch(() => {});
          }
        });
      });
    }
  }, [searchQuery]);

  // Load messages
  useEffect(() => {
    async function loadMessages() {
      if (!selectedUser) return;
      
      const cached = messagesCache[selectedUser.id];
      if (cached) {
        setMessages(cached);
        setIsLoadingMessages(false);
      } else {
        setIsLoadingMessages(true);
        setMessages([]); // Clear while loading if no cache
      }
      
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, unseenCount: 0 } : u));

      try {
        const history = await getSocialMessages(selectedUser.id);
        const fresh = history as any[];
        
        // Fast update check
        if (!cached || fresh.length !== cached.length || (fresh.length > 0 && fresh[fresh.length-1].id !== cached[cached.length-1].id)) {
          setMessages(fresh);
          setMessagesCache(prev => ({ ...prev, [selectedUser.id]: fresh }));
        }
        
        await markMessagesAsSeen(selectedUser.id);
        socket?.emit('mark_as_seen', { senderEmail: selectedUser.email });
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    }
    loadMessages();
  }, [selectedUser?.id]); // Only re-run when ID changes, not the whole object

  // Smart Scrolling
  const lastMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > 0) {
      const behavior = messages.length - lastMsgCount.current === 1 ? 'smooth' : 'auto';
      messagesEndRef.current?.scrollIntoView({ behavior });
      lastMsgCount.current = messages.length;
    }
  }, [messages.length]);

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

  const handleDelete = async (msgId: string, type: 'me' | 'everyone') => {
    if (type === 'everyone' && !confirm("Delete for everyone?")) return;
    
    await deleteSocialMessage(msgId, type);
    if (type === 'everyone') {
      socket?.emit('delete_social_message', { messageId: msgId, receiverEmail: selectedUser?.email });
      setMessages(prev => prev.map(m => {
        if (m.id === msgId) return { ...m, content: "🚫 This message was deleted", type: "deleted" };
        return m;
      }));
    } else {
      // Local delete
      setMessages(prev => prev.filter(m => m.id !== msgId));
    }
  };

  const handleAcceptRequest = () => {
    if (!selectedUser) return;
    setUsers(prev => [...prev, { ...selectedUser, unseenCount: 0 }]);
    setRequests(prev => prev.filter(u => u.id !== selectedUser.id));
    setView('recent');
  };

  const initiateCall = (type: 'audio' | 'video') => {
    if (!selectedUser) return;
    const url = `/call?id=${selectedUser.id}&type=${type}`;
    window.open(url, '_blank', 'width=1000,height=800');
  };

  return (
    <>
    <div className="social-chat-container" style={{ display: isActive ? 'flex' : 'none', width: '100%', height: '100%' }}>
      <div className="main-wrap">
        <aside className="sidebar">
          <div className="search-wrap">
            <input 
              type="text" 
              placeholder="Search contacts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="view-toggle">
              <button className={view === 'recent' ? 'active' : ''} onClick={() => setView('recent')}>
                Chats
              </button>
              <button className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}>
                Requests {requests.length > 0 && <span className="count">{requests.length}</span>}
              </button>
            </div>
          </div>
          <div className="list">
            {(view === 'recent' ? users : requests).map((user) => (
              <SidebarItem 
                key={user.id} 
                user={user} 
                isActive={selectedUser?.id === user.id} 
                onClick={() => setSelectedUser(user)} 
              />
            ))}
            {(view === 'recent' ? users : requests).length === 0 && searchQuery.length < 2 && (
              <div className="empty-state">
                <p>{view === 'recent' ? 'No recent conversations' : 'No message requests'}</p>
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
                    {selectedUser.image && selectedUser.image.length > 5 ? (
                      <img src={selectedUser.image} alt={selectedUser.name} referrerPolicy="no-referrer" />
                    ) : (
                      <span>{selectedUser.name?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="info">
                    <div className="name">{selectedUser.name}</div>
                    <div className="status-text">
                      {typingUsers.has(selectedUser.email) && (
                        <span className="typing-indicator">typing...</span>
                      )}
                    </div>
                  </div>
                </div>
                  <div className="chat-header-right">
                  {requests.some(r => r.id === selectedUser.id) && (
                    <button className="accept-req-btn" onClick={handleAcceptRequest}>
                      Accept Request
                    </button>
                  )}
                  <button className="call-btn" onClick={() => handleCall('audio')} title="Audio Call">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                  </button>
                  <button className="call-btn" onClick={() => handleCall('video')} title="Video Call">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>
                  </button>
                </div>

              </div>

              <div className="messages">
                {messages.map((msg) => (
                  <MessageItem 
                    key={msg.id} 
                    msg={msg} 
                    currentUserId={(session?.user as any)?.id}
                    selectedUser={selectedUser}
                    onDelete={handleDelete}
                  />
                ))}
                {!isLoadingMessages && messages.length === 0 && (
                  <div className="empty-chat-state">
                    <div className="empty-chat-pfp">
                      {selectedUser.image && selectedUser.image.length > 5 ? (
                        <img src={selectedUser.image} alt={selectedUser.name} referrerPolicy="no-referrer" />
                      ) : (
                        <div className="avatar-initials">{selectedUser.name?.charAt(0).toUpperCase()}</div>
                      )}
                    </div>
                    <h3>Start a conversation</h3>
                    <p>Send a message to start chatting with <b>{selectedUser.name}</b></p>
                    <div className="empty-chat-hint">
                      Messages are encrypted and secure
                    </div>
                  </div>
                )}
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
              <h3>Select a Chat</h3>
              <p>Choose a contact to start messaging or search for new people.</p>
            </div>
          )}

        </section>
      </div>
    </div>

      {/* --- INCOMING CALL OVERLAY --- */}
      {incomingCall && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500 overflow-hidden font-sans" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="relative z-10 w-full h-full flex flex-col items-center justify-center" style={{ background: incomingCall.type === 'video' ? 'rgba(0,0,0,0.5)' : 'transparent' }}>
            
            <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700">
              <div className="relative">
                <div className="absolute inset-0 rounded-full animate-ping [animation-duration:2s]" style={{ background: 'var(--dm-bg-input)' }} />
                <div className="absolute -inset-6 rounded-full animate-pulse [animation-duration:3s]" style={{ background: 'var(--dm-bg-active)', opacity: 0.5 }} />
                <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 shadow-2xl flex items-center justify-center text-4xl font-bold" style={{ borderColor: 'var(--dm-bg-main)', background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)' }}>
                  {incomingCall.from.image ? <img src={incomingCall.from.image} className="w-full h-full object-cover" /> : incomingCall.from.name?.charAt(0)}
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--dm-text-heading)' }}>{incomingCall.from.name}</h2>
                <div className="flex items-center justify-center gap-2">
                  <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest" style={{ background: 'var(--dm-bg-active)', color: 'var(--dm-text-secondary)' }}>
                    Incoming {incomingCall.type} Call
                  </span>
                  <span className="font-medium text-base" style={{ color: 'var(--dm-text-muted)' }}>
                    Ringing...
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="absolute bottom-10 flex items-center gap-6 px-8 py-4 backdrop-blur-2xl rounded-full shadow-2xl z-30" style={{ background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)' }}>
              <button 
                onClick={handleRejectCall}
                className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                </svg>
              </button>
              
              <button 
                onClick={handleAcceptCall}
                className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl animate-bounce"
                style={{ background: '#22c55e', color: '#fff' }}
              >
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}


      {activeCall && socket && (
        <CallInterface 
          socket={socket}
          peer={activeCall.peer}
          type={activeCall.type}
          isCaller={activeCall.isCaller}
          isAccepted={(activeCall as any).connected}
          onEnd={(duration, wasConnected) => {
            const callData = activeCall;
            setActiveCall(null);
            setIncomingCall(null);
            
            if (callData) {
              (async () => {
                try {
                  if (callData.isCaller) {
                    const status = wasConnected ? 'completed' : 'missed';
                    const result = await saveCall(callData.peer.id, callData.type, status, duration);
                    if (result?.message && socket) {
                      socket.emit('send_social_message', { receiverEmail: callData.peer.email, ...result.message });
                      setMessages(prev => {
                        if (prev.some(m => m.id === (result.message as any).id)) return prev;
                        return [...prev, result.message as any];
                      });
                    }
                  } else if (duration && duration > 0) {
                    const result = await saveCall(callData.peer.id, callData.type, 'completed', duration);
                    if (result?.message && socket) {
                      setMessages(prev => {
                        if (prev.some(m => m.id === (result.message as any).id)) return prev;
                        return [...prev, result.message as any];
                      });
                    }
                  }
                } catch (e) { console.error("Call background save error:", e); }
              })();
            }
          }}
        />
      )}
    </>
  );
}

