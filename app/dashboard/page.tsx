'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { askAI, getChatHistory, saveChatMessage, getUserDetails, updateUsername, updateName } from './actions';
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
  const [isCallActive, setIsCallActive] = useState(false);
  
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
  
  // PWA Manual Installation Trigger
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      alert("To download/install:\n\n1. Open this app in your browser (Safari / Chrome).\n2. Tap the 'Share' or 'Menu' button (icon with an arrow pointing up, or three dots).\n3. Select 'Add to Home Screen' (📲) to install it directly!");
      return;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('Error triggering PWA install prompt:', err);
    }
  };

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
    } else if (activeView !== 'home') {
      setActiveView('home');
    }
  };

  // Intercept browser back swipe/button — navigate within app instead of going to login
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleMobileBack();
      // Push a new state so the next back press still fires this handler
      window.history.pushState(null, '', window.location.href);
    };
    // Push an initial state so we can detect the first back press
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, selectedChatUser]);

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

  const handleSaveName = async () => {
    if (!usernameInput.trim() || usernameInput.trim().length < 2) {
      setUsernameError('Name must be at least 2 characters');
      return;
    }
    setUsernameSaving(true);
    try {
      const res = await updateName(usernameInput);
      if (res.error) {
        setUsernameError(res.error);
      } else {
        setEditingUsername(false);
        // Instant UI update
        if (fullUser) setFullUser({ ...fullUser, name: res.name || usernameInput });
      }
    } catch {
      setUsernameError('Failed to save name');
    } finally {
      setUsernameSaving(false);
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
    <div className="main-layout flex h-[100dvh] overflow-hidden font-sans font-light text-[0.95em] md:p-3 md:gap-3 animate-in fade-in slide-in-from-left-full duration-700 ease-[var(--ease-premium)]" style={{ background: 'var(--dm-bg-page)', color: 'var(--dm-text-primary)' }}>
      {/* Fully Adaptive Sidebar */}
      <div className="main-sidebar w-[88px] hover:w-72 h-full flex flex-col justify-between p-4 transition-[width,box-shadow] duration-500 ease-[var(--ease-premium)] will-change-[width] group z-20 overflow-hidden border-r md:border md:rounded-[40px] shadow-sm" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border-main)' }}>
        <div className="flex flex-col h-full">
          {/* Logo */}
            <div className="mb-8 flex items-center justify-start gap-0 group-hover:gap-3 px-1 h-12 transition-[gap] duration-500 ease-[var(--ease-premium)]">
              <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <img 
                  src="/connect-logo.png" 
                  alt="Connect Logo" 
                  className="w-10 h-10 rounded-xl object-contain transition-transform duration-300 hover:scale-105 drop-shadow-sm" 
                  style={{ filter: isDark ? 'invert(1) drop-shadow(0 0 8px rgba(255,255,255,0.2))' : 'none' }} 
                />
              </div>
              <span className="font-extrabold text-base tracking-tight opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap overflow-hidden" style={{ color: 'var(--dm-text-primary)' }}>
                Connect
              </span>
            </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { id: 'home', name: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'chat', name: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
              { id: 'assistant', name: 'Assistant', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              { id: 'practice', name: 'Practice', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' }
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
      <div className="main-container flex-1 flex flex-col overflow-hidden relative md:rounded-[40px] shadow-sm md:border" style={{ background: activeView === 'home' ? 'transparent' : 'var(--dm-bg-main)', borderColor: 'var(--dm-border-main)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.02\'/%3E%3C/svg%3E")', opacity: 0.4, pointerEvents: 'none' }} />



        {/* Content Views */}
        {/* Content Views */}
        {activeView === 'home' && (
          <div className="relative w-full h-full flex flex-col min-h-0 overflow-hidden">

            {/* Full-page animated blob background */}
            <div className="home-blob-bg">
              <div className="home-blob home-blob-1" />
              <div className="home-blob home-blob-2" />
              <div className="home-blob home-blob-3" />
            </div>

            {/* Top glass pill — status + theme */}
            <div className="relative z-10 px-5 pt-5">
              <div
                className="flex items-center justify-between px-4 py-2.5 rounded-full"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.60)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.85)',
                  boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)' : '0 4px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
                }}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>
                    {isConnected ? 'Online' : 'Connecting...'}
                  </span>
                </div>
                <ThemeToggle />
              </div>
            </div>

            {/* Welcome glass card */}
            <div className="relative z-10 px-5 pt-4 animate-in fade-in slide-in-from-top-4 duration-700">
              <div
                className="flex flex-col items-center gap-3 w-full py-10 rounded-[2rem]"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(28px)',
                  WebkitBackdropFilter: 'blur(28px)',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.90)',
                  boxShadow: isDark
                    ? '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)'
                    : '0 8px 40px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
                }}
              >
                <h1 className="text-2xl font-bold tracking-tight text-center" style={{ color: isDark ? '#fff' : '#1e1b4b' }}>
                  Welcome back 👋
                </h1>
                <p className="text-base mt-0.5" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)' }}>
                  {session.user?.name?.split(' ')[0] || 'there'}
                </p>
              </div>
            </div>

          </div>
        )}


        {activeView === 'assistant' && (
          <div className="w-full h-full flex flex-col min-h-0" style={{ background: 'var(--dm-bg-main)' }}>

            {/* Clean header */}
            <div className="flex items-center px-4 flex-shrink-0 relative" style={{ minHeight: '60px', borderBottom: '1px solid var(--dm-border)', background: 'var(--dm-bg-sidebar)' }}>
              <button
                onClick={(e) => handleNavClick('home', e, true)}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 z-10"
                style={{ background: 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-muted)' }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
              <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2">
                  <div style={{ width: '7px', height: '7px', background: '#6366f1', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                  <h2 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: 'var(--dm-text-secondary)', margin: 0 }}>AI Assistant</h2>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-6 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center gap-5 pb-12 animate-in fade-in duration-700">
                  <div
                    className="w-20 h-20 rounded-3xl flex items-center justify-center"
                    style={{ background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.10)', border: isDark ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(99,102,241,0.20)', boxShadow: '0 0 30px rgba(99,102,241,0.2)' }}
                  >
                    <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#6366f1' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold" style={{ color: isDark ? '#fff' : '#1e1b4b' }}>How can I help?</p>
                    <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(99,102,241,0.7)' }}>Ask me anything — I'll do my best.</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div
                    className={`max-w-[82%] px-4 py-3 text-[0.88rem] leading-relaxed ${
                      msg.role === 'user' ? 'rounded-[1.4rem] rounded-tr-md' : 'rounded-[1.4rem] rounded-tl-md'
                    }`}
                    style={msg.role === 'user'
                      ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }
                      : { background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)', color: isDark ? 'rgba(255,255,255,0.9)' : '#1e1b4b', border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(99,102,241,0.12)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isAiTyping && (
                <div className="flex justify-start">
                  <div className="px-5 py-3.5 rounded-[1.4rem] rounded-tl-md flex gap-1.5 items-center" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)', border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(99,102,241,0.12)', backdropFilter: 'blur(12px)' }}>
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#6366f1', animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#8b5cf6', animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#a855f7', animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="relative z-10 flex-shrink-0 px-4 md:px-8 py-3" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(99,102,241,0.10)', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.60)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
              <form onSubmit={handleSendMessage} className="relative">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask me anything..."
                  className="w-full h-12 pl-5 pr-14 rounded-full focus:outline-none text-sm"
                  style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.90)', border: isDark ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(99,102,241,0.25)', color: isDark ? '#fff' : '#1e1b4b', backdropFilter: 'blur(12px)' }}
                  disabled={isAiTyping}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isAiTyping}
                  onTouchStart={(e) => { if (inputValue.trim() && !isAiTyping) { e.preventDefault(); handleSendMessage(e); } }}
                  className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </form>
            </div>
          </div>
        )}

        <SocialChat 
          isActive={activeView === 'chat'} 
          onStatusChange={setIsConnected} 
          onChatChange={setSelectedChatUser}
          onBack={() => setActiveView('home')}
          onCallStateChange={setIsCallActive}
          ref={chatComponentRef as any}
        />

        {/* Profile Side Panel */}
        {isProfileOpen && (
          <div
            className="absolute right-0 top-0 bottom-0 w-full md:w-[400px] z-50 flex flex-col md:m-3 md:h-[calc(100%-24px)] md:rounded-[40px] md:overflow-hidden"
            style={{
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              background: isDark
                ? 'rgba(12, 12, 18, 0.72)'
                : 'rgba(255, 255, 255, 0.62)',
              borderLeft: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.75)',
              boxShadow: isDark
                ? '-20px 0 60px rgba(0,0,0,0.70), inset 1px 0 0 rgba(255,255,255,0.06)'
                : '-20px 0 60px rgba(0,0,0,0.10), inset 1px 0 0 rgba(255,255,255,0.90)',
              animation: isClosingProfile
                ? 'slideToLeft 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
                : 'slideFromLeft 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
            }}
          >
            {/* Header / Avatar Section — premium glowing mesh gradient */}
            <div
              className="relative flex flex-col items-center justify-end pb-8 pt-10 overflow-hidden"
              style={{
                minHeight: '250px',
                background: 'linear-gradient(135deg, hsl(245, 80%, 55%), hsl(285, 75%, 50%), hsl(205, 85%, 45%))',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {/* Glass background noise / grain overlay */}
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.08\'/%3E%3C/svg%3E")', backgroundSize: 'cover', opacity: 0.4 }} />
              
              {/* Decorative premium glass circles */}
              <div style={{ position: 'absolute', width: '220px', height: '220px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', top: '-60px', right: '-60px', border: '1px solid rgba(255,255,255,0.15)' }} />
              <div style={{ position: 'absolute', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)', bottom: '-30px', left: '-50px', border: '1px solid rgba(255,255,255,0.1)' }} />
              
              <button
                onClick={handleCloseProfile}
                className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(12px)',
                  border: '1.5px solid rgba(255,255,255,0.3)',
                  color: 'white'
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              {/* Avatar */}
              <div className="relative z-10 mb-4">
                <div 
                  className="transition-transform duration-500 hover:scale-105"
                  style={{ 
                    width: '90px', 
                    height: '90px', 
                    borderRadius: '50%', 
                    background: 'rgba(255,255,255,0.2)', 
                    backdropFilter: 'blur(16px)', 
                    border: '3px solid rgba(255,255,255,0.5)', 
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 0 20px rgba(255,255,255,0.2)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '34px', 
                    fontWeight: 200, 
                    color: 'white' 
                  }}
                >
                  {fullUser?.name?.slice(0, 1).toUpperCase() || 'U'}
                </div>
                <div style={{ position: 'absolute', bottom: 3, right: 3, width: '20px', height: '20px', borderRadius: '50%', background: '#10b981', border: '3.5px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }} />
              </div>
              
              <h3 style={{ color: 'white', fontSize: '22px', fontWeight: 600, margin: '0 0 4px', zIndex: 10, textShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>{fullUser?.name || session.user?.name || 'User'}</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0, zIndex: 10, fontWeight: 300 }}>{fullUser?.email || session.user?.email || ''}</p>
            </div>

            {/* Content — luxurious glass info cards */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto" style={{ background: isDark ? 'rgba(12,12,18,0.25)' : 'rgba(255,255,255,0.25)' }}>
              {/* Account Statistics Grid */}
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div style={{ padding: '16px', borderRadius: '20px', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.8)', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--dm-text-muted)', fontWeight: 600 }}>Account Status</p>
                  <p style={{ margin: '6px 0 0', fontSize: '14px', fontWeight: 700, color: '#6366f1' }}>PRO USER</p>
                </div>
                <div style={{ padding: '16px', borderRadius: '20px', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.8)' , background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--dm-text-muted)', fontWeight: 600 }}>Connection</p>
                  <p style={{ margin: '6px 0 0', fontSize: '14px', fontWeight: 700, color: '#10b981' }}>SECURE</p>
                </div>
              </div>

              {/* Name Edit Row */}
              <div style={{ padding: '18px', borderRadius: '24px', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.85)', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.15)' : '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)', border: isDark ? '1px solid rgba(99,102,241,0.2)' : '1px solid rgba(99,102,241,0.12)', color: '#6366f1' }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, color: 'var(--dm-text-muted)' }}>Display Name</span>
                    </div>
                    {!editingUsername && (
                      <button onClick={() => { setUsernameInput(fullUser?.name || ''); setEditingUsername(true); setUsernameError(''); }} style={{ fontSize: '11px', padding: '6px 14px', borderRadius: '20px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>Change</button>
                    )}
                  </div>
                  {!editingUsername ? (
                    <div style={{ paddingLeft: '46px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dm-text-primary)', letterSpacing: '-0.02em' }}>
                        {fullUser?.name || session.user?.name || 'User'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '0' }}>
                      <input
                        autoFocus
                        value={usernameInput}
                        onChange={e => { setUsernameInput(e.target.value); setUsernameError(''); }}
                        onKeyDown={async e => { if (e.key === 'Enter') { e.preventDefault(); await handleSaveName(); } if (e.key === 'Escape') setEditingUsername(false); }}
                        style={{ flex: 1, width: '100%', padding: '8px 14px', borderRadius: '14px', border: '1px solid var(--dm-border)', background: 'var(--dm-bg-input)', color: 'var(--dm-text-primary)', fontSize: '13px', outline: 'none', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
                        placeholder="Display Name"
                      />
                      <button onClick={handleSaveName} disabled={usernameSaving} style={{ fontSize: '11px', padding: '8px 16px', borderRadius: '14px', background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', opacity: usernameSaving ? 0.6 : 1, fontWeight: 600 }}>{usernameSaving ? '...' : 'Save'}</button>
                      <button onClick={() => setEditingUsername(false)} style={{ fontSize: '11px', padding: '8px 12px', borderRadius: '14px', background: 'var(--dm-bg-active)', border: '1px solid var(--dm-border)', color: 'var(--dm-text-muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  )}
                </div>
                {usernameError && <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', marginLeft: '46px' }}>{usernameError}</p>}
              </div>

              {/* Mail Channel Row */}
              <div style={{ padding: '18px', borderRadius: '24px', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.85)', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.15)' : '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div className="flex flex-col gap-3">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'rgba(244,63,94,0.15)' : 'rgba(244,63,94,0.08)', border: isDark ? '1px solid rgba(244,63,94,0.2)' : '1px solid rgba(244,63,94,0.12)', color: '#f43f5e' }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, color: 'var(--dm-text-muted)' }}>Registered Email</span>
                  </div>
                  <div style={{ paddingLeft: '46px' }}>
                    <span className="text-[15px] font-medium truncate block max-w-[280px]" style={{ color: 'var(--dm-text-primary)' }}>{fullUser?.email}</span>
                  </div>
                </div>
              </div>

              {/* Download Mobile App Button */}
              <button
                onClick={handleInstallApp}
                className="w-full flex items-center justify-between px-6 py-4 rounded-[20px] transition-all hover:scale-[1.02] active:scale-98 cursor-pointer mt-4"
                style={{ 
                  border: '1px solid rgba(99, 102, 241, 0.25)', 
                  background: 'rgba(99, 102, 241, 0.06)', 
                  boxShadow: '0 4px 16px rgba(99, 102, 241, 0.08)' 
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-indigo-500 shadow-xs" style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <span className="text-[11px] uppercase tracking-widest font-extrabold text-indigo-600 dark:text-indigo-400">Download Mobile App</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'rgba(99, 102, 241, 0.5)' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
              </button>

              {/* Sign Out Button (Replaces Joined Date) */}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="w-full flex items-center justify-between px-6 py-4 rounded-[20px] transition-all hover:scale-[1.02] active:scale-98 cursor-pointer mt-4"
                style={{ 
                  border: '1px solid rgba(239, 68, 68, 0.25)', 
                  background: 'rgba(239, 68, 68, 0.06)', 
                  boxShadow: '0 4px 16px rgba(239, 68, 68, 0.08)' 
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-red-500 shadow-xs" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <span className="text-[11px] uppercase tracking-widest font-extrabold text-red-500">Sign Out of Account</span>
                </div>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'rgba(239, 68, 68, 0.5)' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation — home + chat list only (not AI view, not inside conversation, not during call) */}
      {(activeView === 'home' || (activeView === 'chat' && !selectedChatUser)) && !isCallActive && (
        <nav className="mobile-nav">
          {[
            { id: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'chat', label: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
            { id: 'assistant', label: 'AI', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
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
