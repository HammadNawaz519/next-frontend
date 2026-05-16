'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { askAI, getChatHistory, saveChatMessage, getUserDetails, updateUsername } from './actions';
import SocialChat from '@/components/SocialChat';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/app/components/ThemeProvider';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export default function DashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  
  // Expose closeChat to parent via ref if needed
  const chatRef = useRef<{ closeChat: () => void } | null>(null);
  
  const [view, setView] = useState<'recent' | 'requests'>('recent');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isClosingProfile, setIsClosingProfile] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const handleCloseProfile = () => {
    setIsClosingProfile(true);
    setTimeout(() => {
      setIsProfileOpen(false);
      setIsClosingProfile(false);
    }, 450); // match animation duration slightly less to prevent blink
  };
  const [fullUser, setFullUser] = useState<any>(null);
  const [activeView, setActiveView] = useState<'home' | 'assistant' | 'chat'>('home');
  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
  const chatComponentRef = useRef<{ closeChat: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navTransitionInProgress = useRef(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  const handleSaveUsername = async () => {
    setUsernameSaving(true);
    setUsernameError('');
    const result = await updateUsername(usernameInput);
    setUsernameSaving(false);
    if ((result as any)?.error) {
      setUsernameError((result as any).error);
    } else {
      setEditingUsername(false);
      // Refresh user details
      getUserDetails().then(setFullUser);
    }
  };

  const handleMobileBack = () => {
    if (activeView === 'chat' && selectedChatUser) {
      chatComponentRef.current?.closeChat();
    } else {
      setActiveView('home');
    }
  };

  // Load History
  useEffect(() => {
    async function loadHistory() {
      if (status === 'authenticated') {
        try {
          const history = await getChatHistory();
          const formattedHistory: Message[] = history.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'ai',
            content: m.content,
            timestamp: new Date(m.createdAt)
          }));
          setMessages(formattedHistory);
        } catch (err) {
          console.error("Failed to load history:", err);
        } finally {
          setIsHistoryLoading(false);
        }
      }
    }
    loadHistory();
  }, [status]);

  // Eager load User Details for Profile Panel
  useEffect(() => {
    if (status === 'authenticated' && !fullUser) {
      getUserDetails().then(setFullUser);
    }
  }, [status, fullUser]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  const prevViewRef = useRef(activeView);
  
  useEffect(() => {
    const isViewChange = prevViewRef.current !== activeView;
    prevViewRef.current = activeView;
    messagesEndRef.current?.scrollIntoView({ behavior: isViewChange ? 'instant' : 'smooth' });
  }, [messages.length, isAiTyping, activeView]);

  // Render instantly if authenticated, background load data
  if (status === 'loading') return (
    <div className="h-screen w-full flex items-center justify-center" style={{ background: 'var(--dm-bg-page)' }}>
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--dm-border)', borderTopColor: 'var(--dm-text-primary)' }} />
    </div>
  );
  
  if (!session) return null;

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isAiTyping) return;

    const currentInput = inputValue;
    setInputValue('');

    // 1. Optimistically add user message to UI
    const tempUserId = Date.now().toString();
    const userMsg: Message = {
      id: tempUserId,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 2. Save user message to DB
    try {
      await saveChatMessage(currentInput, 'user');
    } catch (err) {
      console.error("Failed to save user message:", err);
    }

    setIsAiTyping(true);

    try {
      // 3. Get AI Response
      const aiResponse = await askAI(currentInput);
      
      // 4. Save AI response to DB
      const savedAiMsg = await saveChatMessage(aiResponse, 'ai');
      
      const aiMsg: Message = {
        id: savedAiMsg?.id || (Date.now() + 1).toString(),
        role: 'ai',
        content: aiResponse,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleNavClick = (viewId: any, e: React.MouseEvent, reverse = false) => {
    if (activeView === viewId && viewId !== 'chat') return;
    
    // Always show the chat list first when clicking the Chat nav button
    if (viewId === 'chat') {
      chatComponentRef.current?.closeChat();
      setSelectedChatUser(null);
      if (activeView === 'chat') return; // If already on chat list, don't re-animate
    }

    if (navTransitionInProgress.current || !(document as any).startViewTransition) {
      setActiveView(viewId);
      return;
    }
    
    navTransitionInProgress.current = true;

    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    let transition: any;
    try {
      transition = (document as any).startViewTransition(() => {
        flushSync(() => {
          setActiveView(viewId);
        });
      });
    } catch {
      setActiveView(viewId);
      navTransitionInProgress.current = false;
      return;
    }

    transition.ready
      .then(() => {
        const keyframes = reverse
          ? [{ clipPath: `circle(${endRadius}px at ${x}px ${y}px)` }, { clipPath: `circle(0px at ${x}px ${y}px)` }]
          : [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${endRadius}px at ${x}px ${y}px)` }];
        document.documentElement.animate(keyframes, {
          duration: 700,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          pseudoElement: reverse ? '::view-transition-old(root)' : '::view-transition-new(root)',
        });
      })
      .catch(() => {});
      
    transition.finished
      .then(() => { navTransitionInProgress.current = false; })
      .catch(() => { navTransitionInProgress.current = false; });
  };

  return (
    <div className="main-layout flex h-screen overflow-hidden font-sans font-light text-[0.95em] md:p-3 md:gap-3" style={{ background: 'var(--dm-bg-page)', color: 'var(--dm-text-primary)' }}>
      {/* Fully Adaptive Sidebar */}
      <div className="main-sidebar w-[88px] hover:w-72 h-full flex flex-col justify-between p-4 transition-[width,box-shadow] duration-500 ease-[var(--ease-premium)] will-change-[width] group z-20 overflow-hidden border-r md:border-none md:rounded-[40px] shadow-sm" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border-main)' }}>
        <div className="flex flex-col h-full">
          {/* Logo */}
            <div className="mb-8 flex items-center justify-start gap-0 group-hover:gap-4 px-1 h-12 transition-[gap] duration-500 ease-[var(--ease-premium)]">
              <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <div className="w-9 h-9 rounded-full shadow-sm flex items-center justify-center font-bold text-[10px]" style={{ background: 'var(--dm-thumb)', color: isDark ? '#0f0f1a' : '#fff' }}>P</div>
              </div>
              <span className="font-normal text-base tracking-tight opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap overflow-hidden">
                Platform
              </span>
            </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { id: 'home', name: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'chat', name: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
              { id: 'assistant', name: 'Assistant', icon: 'M13 10V3L4 14h7v7l9-11h-7z' }
            ].map((item) => (
              <div 
                key={item.name} 
                onClick={(e) => handleNavClick(item.id, e)}
                className={`flex items-center justify-start gap-0 group-hover:gap-4 px-1 py-1 rounded-full cursor-pointer transition-[gap] duration-500 ease-[var(--ease-premium)] group/item overflow-hidden`}
                style={{ background: activeView === item.id ? 'var(--dm-bg-active)' : 'transparent' }}
                onMouseEnter={e => { if (activeView !== item.id) (e.currentTarget as HTMLElement).style.background = 'var(--dm-bg-hover)'; }}
                onMouseLeave={e => { if (activeView !== item.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >

                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: activeView === item.id ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <span className="text-[12px] font-light opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden" style={{ color: activeView === item.id ? 'var(--dm-text-primary)' : 'var(--dm-text-secondary)' }}>
                  {item.name}
                </span>
              </div>
            ))}
            

          </nav>

          {/* Profile Section */}
          <div className="mt-auto pt-6 pb-8" style={{ borderTop: '1px solid var(--dm-border)' }}>
            <div 
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center justify-start gap-0 group-hover:gap-4 px-1 cursor-pointer group/profile active:scale-95 transition-[transform,gap] duration-500 ease-[var(--ease-premium)]"
            >
              <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-normal text-xs shadow-sm transition-transform duration-300 group-hover:scale-105" style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-secondary)' }}>
                  {session.user?.name?.slice(0, 1).toUpperCase() || 'U'}
                </div>
              </div>
              <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">
                <p className="text-[13px] font-normal truncate transition-colors" style={{ color: 'var(--dm-text-primary)' }}>
                  {session.user?.name || session.user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-[10px] truncate uppercase tracking-widest mt-0.5" style={{ color: 'var(--dm-text-muted)' }}>
                  View Profile
                </p>
              </div>
            </div>
          </div>
            
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full flex items-center justify-start gap-0 group-hover:gap-4 px-1 py-2 transition-[gap] duration-500 ease-[var(--ease-premium)] rounded-full overflow-hidden"
              style={{ color: 'var(--dm-text-muted)', border: '1px solid transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)'; (e.currentTarget as HTMLElement).style.borderColor = isDark ? 'rgba(239,68,68,0.3)' : '#fecaca'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--dm-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
            >

              <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'inherit' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <span className="text-[13px] font-light opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden">
                Sign out
              </span>
            </button>
          </div>
        </div>

      {/* Main Container */}
      <div className="main-container flex-1 flex flex-col overflow-hidden relative md:rounded-[40px] shadow-sm md:border" style={{ background: 'var(--dm-bg-main)', borderColor: 'var(--dm-border-main)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.02\'/%3E%3C/svg%3E")', opacity: 0.4, pointerEvents: 'none' }} />



        {/* Content Views */}
        {activeView === 'home' && (
          <div className="relative w-full h-full flex flex-col p-4 pt-4 md:p-12 z-10 overflow-y-auto scrollbar-hide">
            {/* Premium Header */}
            <div className="flex flex-col md:flex-row justify-between items-start w-full gap-8 md:gap-0 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-[0.2em] opacity-40">Dashboard</span>
                    <div className="h-[1px] w-8 bg-current opacity-20"></div>
                </div>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight" style={{ color: 'var(--dm-text-heading)' }}>
                  Welcome back, <br className="md:hidden" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--dm-text-primary)] to-[var(--dm-text-muted)]">{session.user?.name || 'User'}</span>
                </h1>
                
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest w-fit shadow-sm transition-all hover:scale-105 cursor-default" 
                     style={{ 
                        background: isConnected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', 
                        color: isConnected ? '#22c55e' : '#ef4444', 
                        border: `1px solid ${isConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}` 
                     }}>
                  <span className="relative flex h-2 w-2">
                    {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  </span>
                  {isConnected ? 'Real-time System Live' : 'System Connecting...'}
                </div>
              </div>
              <ThemeToggle />
            </div>
            {/* Mobile Profile Card */}
            <div className="md:hidden mt-8 p-6 rounded-[2.5rem] flex items-center gap-4 shadow-sm active:scale-95 transition-transform" style={{ background: 'var(--dm-bg-sidebar)', border: '1px solid var(--dm-border)' }} onClick={() => setIsProfileOpen(true)}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl shadow-inner" style={{ background: 'var(--dm-bg-active)', color: 'var(--dm-text-primary)', border: '1px solid var(--dm-border)' }}>
                    {session.user?.name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-lg tracking-tight">{session.user?.name}</h3>
                    <p className="text-xs uppercase tracking-widest opacity-40 font-bold">Personal Account</p>
                </div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)' }}>
                    <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
            </div>
          </div>
        )}

        {activeView === 'assistant' && (
          <>
            {/* Assistant Header - all screens */}
            <div className="flex items-center justify-center p-4 border-b relative z-50" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border)', minHeight: '64px' }}>
              <button 
                onClick={(e) => handleNavClick('home', e, true)}
                style={{ position: 'absolute', left: '16px', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-primary)', cursor: 'pointer', zIndex: 10 }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
                <div style={{ width: '8px', height: '8px', background: '#6366f1', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                <h2 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--dm-text-secondary)', margin: 0 }}>Intelligence Core</h2>
              </div>
              {/* Profile button - desktop only */}
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="hidden md:flex"
                style={{ position: 'absolute', right: '16px', width: '40px', height: '40px', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-muted)', cursor: 'pointer', zIndex: 10 }}
              >
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, background: 'var(--dm-bg-active)' }}>
                  {session.user?.name?.charAt(0) || 'U'}
                </div>
              </button>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.08, background: 'linear-gradient(45deg, #FF7A00, #007AFF, #7ED9D9)', filter: 'blur(20px)', pointerEvents: 'none' }} />
            </div>


            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-12 space-y-10 relative">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in duration-700">
                  <div className="w-24 h-24 rounded-[2.5rem] flex items-center justify-center shadow-inner" style={{ background: 'var(--dm-bg-active)' }}>
                    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--dm-border)' }}>
                      <path d="M12 2L9.09 8.26 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-7.09-1.01L12 2z"/>
                    </svg>
                  </div>
                  <p className="text-xl font-extralight tracking-tight" style={{ color: 'var(--dm-text-heading)' }}>How can I assist you today?</p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[75%] rounded-[1.5rem] px-5 py-3 shadow-sm transition-[transform,opacity,box-shadow] duration-300 ${
                    msg.role === 'user' ? 'rounded-tr-none shadow-md' : 'rounded-tl-none backdrop-blur-sm shadow-sm'
                  }`} style={msg.role === 'user'
                    ? { background: 'var(--dm-chat-sent-bg)', color: 'var(--dm-chat-sent-text)' }
                    : { background: 'var(--dm-chat-recv-bg)', color: 'var(--dm-chat-recv-text)', border: '1px solid var(--dm-input-border)' }
                  }>
                    {/* Removed 'AI Assistant' label from bubble as requested */}
                    <p className="text-[0.9rem] leading-relaxed whitespace-pre-wrap font-light tracking-tight">{msg.content}</p>
                  </div>
                </div>
              ))}



              {isAiTyping && (
                <div className="flex justify-start">
                  <div className="rounded-full rounded-tl-none px-6 py-4 flex gap-2 items-center shadow-sm" style={{ background: 'var(--dm-typing-bg)', border: '1px solid var(--dm-border)' }}>
                    <div className="w-2 h-2 bg-indigo-100 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-indigo-100 rounded-full animate-pulse [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-indigo-100 rounded-full animate-pulse [animation-delay:0.4s]" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 md:p-12 pt-0 bg-transparent relative z-10">
              <div className="max-w-4xl mx-auto w-full">
                <form onSubmit={handleSendMessage} className="relative group">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Start a new discussion..."
                    className="w-full h-14 md:h-18 px-8 md:px-10 rounded-full focus:outline-none transition-all text-sm font-light shadow-lg"
                    style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-primary)' }}
                    disabled={isAiTyping}
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isAiTyping}
                    className="absolute right-2 md:right-4 top-2 md:top-4 w-10 md:h-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-5 shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>

          </>
        )}

        {/* SocialChat Component */}
        <SocialChat 
          isActive={activeView === 'chat'} 
          onStatusChange={setIsConnected} 
          onChatChange={setSelectedChatUser}
          onBack={() => setActiveView('home')}
          ref={chatComponentRef as any}
        />

        {/* Profile Side Panel */}
        {isProfileOpen && (
          <div 
            className="absolute right-0 top-0 bottom-0 w-full md:w-[400px] z-50 backdrop-blur-xl flex flex-col border-l md:border md:rounded-[40px] md:m-3 md:h-[calc(100%-24px)]"
            style={{ 
              background: isDark ? 'rgba(22,22,42,0.97)' : 'rgba(255,255,255,0.97)', 
              borderColor: 'var(--dm-border-main)', 
              boxShadow: isDark ? '-20px 0 50px rgba(0,0,0,0.4)' : '-20px 0 50px rgba(0,0,0,0.03)',
              animation: isClosingProfile 
                ? 'slideToLeft 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
                : 'slideFromLeft 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
            }}
          >
            {/* Header / Avatar Section - Premium Minimal Design */}
            <div className="relative flex flex-col items-center justify-end pb-8 overflow-hidden" style={{ minHeight: '220px', background: 'var(--dm-bg-main)', borderBottom: '1px solid var(--dm-border)' }}>
              {/* Decorative circles - subtle theme-based rings */}
              <div style={{ position: 'absolute', width: '300px', height: '300px', borderRadius: '50%', border: '1px solid var(--dm-border)', top: '-100px', right: '-100px', opacity: 0.5 }} />
              <div style={{ position: 'absolute', width: '200px', height: '200px', borderRadius: '50%', border: '1px solid var(--dm-border)', top: '20px', left: '-80px', opacity: 0.3 }} />
              
              <button 
                onClick={handleCloseProfile}
                className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center z-10 transition-transform active:scale-90"
                style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-muted)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              {/* Avatar */}
              <div className="relative z-10 mb-3">
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--dm-bg-input)', border: '2px solid var(--dm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 300, color: 'var(--dm-text-primary)' }}>
                  {fullUser?.name?.slice(0, 1).toUpperCase() || 'U'}
                </div>
                <div style={{ position: 'absolute', bottom: 2, right: 2, width: '18px', height: '18px', borderRadius: '50%', background: '#10b981', border: '3px solid var(--dm-bg-main)' }} />
              </div>
              
              <h3 style={{ color: 'var(--dm-text-heading)', fontSize: '20px', fontWeight: 600, margin: '0 0 4px', zIndex: 10 }}>{fullUser?.name || session.user?.name || 'User'}</h3>
              <p style={{ color: 'var(--dm-text-secondary)', fontSize: '12px', margin: 0, zIndex: 10 }}>{fullUser?.email || session.user?.email || ''}</p>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 space-y-3 overflow-y-auto">
              {/* Username Edit Row */}
              <div style={{ padding: '16px', borderRadius: '16px', border: '1px solid var(--dm-border)', background: 'var(--dm-bg-hover)', marginBottom: '4px' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: '#6366f1' }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--dm-text-muted)' }}>Username</span>
                  </div>
                  {!editingUsername ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: 300, color: 'var(--dm-text-primary)' }}>
                        @{fullUser?.username || session.user?.name?.toLowerCase().replace(/\s+/g, '') || 'user'}
                      </span>
                      <button onClick={() => { setUsernameInput(fullUser?.username || ''); setEditingUsername(true); setUsernameError(''); }} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', background: 'var(--dm-bg-active)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-secondary)', cursor: 'pointer' }}>Edit</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                      <input
                        autoFocus
                        value={usernameInput}
                        onChange={e => { setUsernameInput(e.target.value); setUsernameError(''); }}
                        onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); await handleSaveUsername(); } if (e.key === 'Escape') setEditingUsername(false); }}
                        style={{ flex: 1, width: '100%', padding: '6px 10px', borderRadius: '20px', border: '1px solid var(--dm-border)', background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)', fontSize: '13px', outline: 'none' }}
                        placeholder="new_username"
                      />
                      <button onClick={handleSaveUsername} disabled={usernameSaving} style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '20px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', opacity: usernameSaving ? 0.6 : 1, flexShrink: 0 }}>{usernameSaving ? '...' : 'Save'}</button>
                      <button onClick={() => setEditingUsername(false)} style={{ fontSize: '11px', padding: '6px 10px', borderRadius: '20px', background: 'var(--dm-bg-active)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-muted)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                    </div>
                  )}
                </div>
                {usernameError && <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', marginLeft: '42px' }}>{usernameError}</p>}
              </div>
              {[
                { label: 'Username', value: `@${fullUser?.username || fullUser?.name?.toLowerCase().replace(/\s+/g, '') || fullUser?.email?.split('@')[0] || 'user'}`, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                { label: 'Mail Channel', value: fullUser?.email, icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                { label: 'Joined Date', value: fullUser?.createdAt ? new Date(fullUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '---', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
              ].map((detail) => (
                <div key={detail.label} className="py-4 px-5 flex items-center justify-between rounded-2xl transition-all" style={{ border: '1px solid var(--dm-border)', background: 'var(--dm-bg-hover)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-indigo-500 shadow-xs" style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)' }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={detail.icon} />
                      </svg>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--dm-text-muted)' }}>{detail.label}</span>
                  </div>
                  <span className="text-[14px] font-light truncate max-w-[160px]" style={{ color: 'var(--dm-text-primary)' }}>{detail.value}</span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-[var(--dm-border)]">
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl transition-all active:scale-95 text-red-500 font-medium"
                  style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation - always visible on mobile */}
      {/* Mobile Bottom Navigation - visible on home and chat list */}
      {(activeView === 'home' || (activeView === 'chat' && !selectedChatUser)) && (
        <nav className="mobile-nav">
          {[
            { id: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'chat', label: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
            { id: 'assistant', label: 'AI', icon: 'M13 10V3L4 14h7v7l9-11h-7z' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={(e) => handleNavClick(item.id, e)}
              className="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-full transition-all active:scale-90"
              style={{ 
                background: activeView === item.id ? 'var(--dm-bg-active)' : 'transparent',
                color: activeView === item.id ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)'
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className="text-[9px] font-semibold uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-full transition-all active:scale-90"
            style={{ color: 'var(--dm-text-muted)' }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--dm-bg-active)', border: '1px solid var(--dm-border)' }}>
              {session.user?.name?.charAt(0) || 'U'}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-widest">Profile</span>
          </button>
        </nav>
      )}

    </div>
  );
}
