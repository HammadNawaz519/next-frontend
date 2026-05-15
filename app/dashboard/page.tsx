'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { askAI, getChatHistory, saveChatMessage, getUserDetails } from './actions';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [fullUser, setFullUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (isProfileOpen && !fullUser) {
      getUserDetails().then(setFullUser);
    }
  }, [isProfileOpen, fullUser]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  if (status === 'loading' || isHistoryLoading) return (
    <div className="h-screen w-full flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-4 border-gray-100 border-t-black rounded-full animate-spin" />
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

  return (
    <div className="flex h-screen bg-gray-100 p-4 gap-4 overflow-hidden text-gray-900 font-sans font-light text-[0.95em]">
      {/* Fully Adaptive Sidebar */}
      <div className="w-[88px] hover:w-72 h-full border border-gray-300 flex flex-col justify-between p-4 bg-white rounded-[2rem] shadow-[0_4px_25px_rgb(0,0,0,0.05)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-[width] group z-20 overflow-hidden">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="mb-8 flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-0 group-hover:px-4 h-12 transition-all duration-500">
            <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
              <div className="w-11 h-11 bg-black rounded-2xl shadow-sm flex items-center justify-center text-white font-bold text-xs" />
            </div>
            <span className="font-normal text-base tracking-tight opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap overflow-hidden">
              Platform
            </span>
          </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { name: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { name: 'Projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2z' },
              { name: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-0 group-hover:px-4 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-all group/item overflow-hidden">
                <div className="w-12 h-10 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-300 group-hover/item:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <span className="text-[12px] font-light text-gray-400 group-hover/item:text-black opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden">
                  {item.name}
                </span>
              </div>
            ))}
            
            <div className="pt-6">
              <div 
                className="flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-0 group-hover:px-4 py-1.5 rounded-xl text-indigo-600 cursor-default transition-all duration-500"
              >
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-indigo-100 shadow-sm flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L9.09 8.26 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-7.09-1.01L12 2z"/>
                    </svg>
                  </div>
                </div>
                <span className="text-[10px] font-normal uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden">
                  Assistant
                </span>
              </div>
            </div>
          </nav>

          {/* Profile Section */}
          <div className="mt-auto pt-6 border-t border-gray-200 pb-8">
            <div 
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-0 group-hover:px-4 cursor-pointer group/profile active:scale-95 transition-all duration-500"
            >
              <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <div className="w-11 h-11 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-400 font-normal text-sm shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover/profile:border-black/10">
                  {session.user?.name?.slice(0, 1).toUpperCase() || 'U'}
                </div>
              </div>
              <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">
                <p className="text-[13px] font-normal text-gray-900 truncate group-hover/profile:text-indigo-600 transition-colors">
                  {session.user?.name || 'User'}
                </p>
                <p className="text-[10px] text-gray-400 truncate uppercase tracking-widest mt-0.5">
                  View Profile
                </p>
              </div>
            </div>
          </div>
            
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-0 group-hover:px-4 py-3.5 text-gray-400 hover:text-red-500 transition-all rounded-2xl hover:bg-red-50/50 border border-transparent hover:border-red-100 overflow-hidden duration-500"
            >
              <div className="w-12 h-6 flex-shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="flex-1 flex flex-col bg-white rounded-[2.5rem] border border-gray-300 shadow-[0_4px_30px_rgb(0,0,0,0.05)] overflow-hidden relative">
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.02\'/%3E%3C/svg%3E")', opacity: 0.4, pointerEvents: 'none' }} />

        {/* Chat Header */}
        <div className="h-20 border-b border-gray-50 flex items-center px-10 justify-between bg-white/60 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
            <h2 className="text-[11px] font-light text-gray-500 uppercase tracking-[0.4em]">Intelligence Core</h2>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-12 space-y-10 relative">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in duration-700">
              <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center shadow-inner">
                <svg className="w-10 h-10 text-gray-200" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L9.09 8.26 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-7.09-1.01L12 2z"/>
                </svg>
              </div>
              <p className="text-xl font-extralight tracking-tight text-gray-900">How can I assist you today?</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-[2rem] p-6 shadow-sm transition-all duration-300 ${
                msg.role === 'user' 
                ? 'bg-black text-white rounded-tr-none shadow-lg' 
                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none backdrop-blur-sm'
              }`}>
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-xl bg-gray-900 flex items-center justify-center shadow-md">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L9.09 8.26 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-7.09-1.01L12 2z"/>
                      </svg>
                    </div>
                    <span className="text-[9px] font-normal uppercase tracking-[0.2em] text-indigo-500/80">Analysis Result</span>
                  </div>
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-light tracking-tight">{msg.content}</p>
              </div>
            </div>
          ))}

          {isAiTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-[2rem] rounded-tl-none p-6 flex gap-2 items-center shadow-sm">
                <div className="w-2 h-2 bg-indigo-100 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-indigo-100 rounded-full animate-pulse [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-indigo-100 rounded-full animate-pulse [animation-delay:0.4s]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-12 pt-0 bg-transparent relative z-10">
          <form onSubmit={handleSendMessage} className="relative group">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Start a new discussion..."
              className="w-full h-18 px-8 bg-white border border-gray-100 rounded-[2.25rem] focus:outline-none focus:ring-1 focus:ring-black/5 focus:border-gray-200 transition-all text-sm font-light placeholder:text-gray-300 shadow-[0_10px_30px_rgba(0,0,0,0.02)]"
              disabled={isAiTyping}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isAiTyping}
              className="absolute right-4 top-4 w-10 h-10 bg-black text-white rounded-[1.25rem] flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-5 shadow-xl"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </form>
        </div>

        {/* Profile Side Panel */}
        {isProfileOpen && (
          <div 
            className="absolute left-2 top-2 bottom-2 w-[calc(50%-1rem)] z-50 bg-white/95 backdrop-blur-2xl border border-gray-100 shadow-[20px_0_50px_rgba(0,0,0,0.03)] animate-in slide-in-from-left duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col rounded-[2.5rem]"
          >
            {/* Header / Avatar Section */}
            <div className="relative h-[30%] bg-white flex flex-col items-center justify-center overflow-hidden border-b border-gray-100 rounded-t-[2.5rem]">
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
              <button 
                onClick={() => setIsProfileOpen(false)}
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-black transition-colors shadow-sm z-10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="relative w-22 h-22 bg-gray-50 rounded-[2.25rem] border border-gray-200 shadow-sm flex items-center justify-center text-3xl font-light text-gray-900 mb-4 z-10">
                {fullUser?.name?.slice(0, 1).toUpperCase() || 'U'}
              </div>
              <h3 className="text-xl font-normal tracking-tight text-gray-900 z-10">{fullUser?.name || 'User'}</h3>
              <p className="text-[10px] text-indigo-500 uppercase tracking-[0.4em] mt-1 font-medium z-10">Access Tier: Pro</p>
            </div>

            {/* Content */}
            <div className="flex-1 p-10 space-y-3.5 overflow-hidden">
              {[
                { label: 'Identifier', value: `@${fullUser?.username || 'user'}`, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                { label: 'Mail Channel', value: fullUser?.email, icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                { label: 'Joined Date', value: fullUser?.createdAt ? new Date(fullUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '---', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
              ].map((detail) => (
                <div key={detail.label} className="py-4 px-5 border border-gray-100 bg-gray-50/30 flex items-center justify-between group/item hover:bg-white hover:border-gray-200 hover:shadow-sm rounded-2xl transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-indigo-500 shadow-xs">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={detail.icon} />
                      </svg>
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">{detail.label}</span>
                  </div>
                  <span className="text-[14px] text-gray-800 font-light truncate max-w-[160px]">{detail.value}</span>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
