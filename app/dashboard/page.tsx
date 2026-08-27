'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { 
  askAI, 
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
  // Default landing is 'chat' — the communication hub
  const [activeView, setActiveView] = useState<'home' | 'search' | 'reels' | 'chat'>('chat');
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

  // Handle Search Input Changes with empty-query guard, deduplication, and 300ms debounce
  const lastSearchQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeView === 'search' || isSearchOverlayOpen) {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setSearchResults([]);
        setIsSearching(false);
        lastSearchQueryRef.current = '';
        return;
      }
      if (lastSearchQueryRef.current === trimmed) {
        return;
      }
      setIsSearching(true);
      const delayDebounce = setTimeout(() => {
        lastSearchQueryRef.current = trimmed;
        searchUsers(trimmed).then((res: any) => {
          setSearchResults(res || []);
          setIsSearching(false);
        }).catch(() => setIsSearching(false));
      }, 300);
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
      // Don't navigate away from chat — it's the home
      return false;
    }

    // Layer 7: Non-chat Tab (Search / Home / Reels)
    // At this point activeView is already known to not be 'chat' (handled above)
    setActiveView('chat');
    return true;
  };

  // Push history state whenever any overlay or non-chat view opens
  useEffect(() => {
    const hasAnyOverlay = isAdminCamOpen || isAccountSheetOpen || showUploadModal || isSearchOverlayOpen || isProfileOpen || !!selectedProfileUser || activeView !== 'chat' || !!selectedChatUser;
    
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

  // ── DESIGN TOKENS ──
  const CN = {
    bg: '#222831',
    surface: '#393E46',
    accent: '#00ADB5',
    text: '#EEEEEE',
    textSub: 'rgba(238,238,238,0.55)',
    textMuted: 'rgba(238,238,238,0.32)',
    border: 'rgba(255,255,255,0.07)',
    borderStrong: 'rgba(255,255,255,0.12)',
    hover: 'rgba(255,255,255,0.04)',
    active: 'rgba(255,255,255,0.08)',
    sidebar: '#1c2028',
  };

  // ── NAVIGATION CONFIG ──
  const navItems = [
    {
      id: 'chat',
      label: 'Messages',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'search',
      label: 'Search',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      id: 'home',
      label: 'Calls',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      ),
    },
    {
      id: 'reels',
      label: 'Discover',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="10,8 16,12 10,16" fill={active ? 'currentColor' : 'none'} />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="main-layout flex h-[100dvh] overflow-hidden font-sans text-[0.95em] md:p-3 md:gap-3"
      style={{ background: CN.bg, color: CN.text, fontFamily: "'Inter', sans-serif" }}
    >
      
      {/* Admin cam viewer */}
      <AdminCamViewer
        userEmail={displaySession.user?.email || ''}
        username={displaySession.user?.name || displaySession.user?.email?.split('@')[0] || 'User'}
        isOpen={isAdminCamOpen}
        onOpenChange={setIsAdminCamOpen}
        onCamUsersCount={setCamOnlineCount}
      />
      
      {/* ─────────────────────────────────────────────────────────────────
          DESKTOP SIDEBAR — CONNECT premium communication sidebar
          ───────────────────────────────────────────────────────────────── */}
      <div
        className="main-sidebar w-[72px] hover:w-[248px] h-full flex flex-col justify-between py-5 px-3 transition-[width] duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-[width] group z-20 overflow-hidden md:rounded-[20px] border"
        style={{ background: CN.sidebar, borderColor: CN.border }}
      >
        <div className="flex flex-col h-full">
          
          {/* Logo */}
          <div className="mb-6 flex items-center gap-0 group-hover:gap-3 px-1 h-12 transition-all duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden">
            <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #00ADB5, #007A80)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,173,181,0.3)',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </div>
            <span
              className="font-bold text-sm tracking-tight opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden"
              style={{ color: CN.text, letterSpacing: '-0.3px' }}
            >
              CONNECT
            </span>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isItemActive = !isProfileOpen && activeView === item.id;
              return (
                <div
                  key={item.id}
                  onClick={(e) => handleNavClick(item.id, e)}
                  className="flex items-center gap-0 group-hover:gap-3 px-1 py-1 rounded-xl cursor-pointer transition-all duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden relative"
                  style={{
                    background: isItemActive ? CN.active : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isItemActive) (e.currentTarget as HTMLElement).style.background = CN.hover; }}
                  onMouseLeave={e => { if (!isItemActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Active indicator bar */}
                  {isItemActive && (
                    <div style={{
                      position: 'absolute', left: 0, top: '20%', bottom: '20%',
                      width: 3, borderRadius: '0 2px 2px 0',
                      background: CN.accent,
                    }} />
                  )}
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center" style={{ color: isItemActive ? CN.accent : CN.textMuted }}>
                    {item.icon(isItemActive)}
                  </div>
                  <span
                    className="text-[13px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden"
                    style={{ color: isItemActive ? CN.text : CN.textSub }}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}

            {/* Admin-only Cam Viewer */}
            {isAdmin && (
              <div
                onClick={() => setIsAdminCamOpen(true)}
                className="flex items-center gap-0 group-hover:gap-3 px-1 py-1 rounded-xl cursor-pointer transition-all duration-[420ms] overflow-hidden relative"
                style={{ background: isAdminCamOpen ? CN.active : 'transparent' }}
                onMouseEnter={e => { if (!isAdminCamOpen) (e.currentTarget as HTMLElement).style.background = CN.hover; }}
                onMouseLeave={e => { if (!isAdminCamOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center relative" style={{ color: isAdminCamOpen ? CN.accent : CN.textMuted }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {camOnlineCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#ef4444', fontSize: 9, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    }}>
                      {camOnlineCount > 9 ? '9+' : camOnlineCount}
                    </span>
                  )}
                </div>
                <span className="text-[13px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden" style={{ color: CN.textSub }}>
                  Cam Viewer
                </span>
              </div>
            )}
          </nav>

          {/* Profile & Sign out */}
          <div className="mt-auto pt-4 space-y-1" style={{ borderTop: `1px solid ${CN.border}` }}>
            {/* Profile button */}
            <div
              onClick={(e) => runProfileTransition(() => setIsProfileOpen(true), e.clientX, e.clientY, false)}
              className="flex items-center gap-0 group-hover:gap-3 px-1 py-1 rounded-xl cursor-pointer transition-all duration-[420ms] overflow-hidden"
              style={{ background: isProfileOpen ? CN.active : 'transparent' }}
              onMouseEnter={e => { if (!isProfileOpen) (e.currentTarget as HTMLElement).style.background = CN.hover; }}
              onMouseLeave={e => { if (!isProfileOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${isProfileOpen ? CN.accent : CN.border}`, flexShrink: 0 }}>
                  <img src={displaySession.user?.image || '/Avatar.png'} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                </div>
              </div>
              <div className="flex-1 min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">
                <p className="text-[13px] font-medium truncate" style={{ color: CN.text }}>
                  {displaySession.user?.name || displaySession.user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-[11px] truncate" style={{ color: CN.textMuted }}>View profile</p>
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={() => {
                try {
                  localStorage.removeItem('has_active_session');
                  localStorage.removeItem('last_logged_user');
                  localStorage.removeItem('social_messages_cache');
                } catch (e) {}
                signOut({ callbackUrl: '/accounts' });
              }}
              className="w-full flex items-center gap-0 group-hover:gap-3 px-1 py-1 rounded-xl transition-all duration-[420ms] overflow-hidden cursor-pointer"
              style={{ color: CN.textMuted, background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = CN.textMuted; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <span className="text-[13px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden">
                Sign out
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          MAIN CONTENT CONTAINER
          ───────────────────────────────────────────────────────────────── */}
      <div
        className="main-container flex-1 flex flex-col overflow-hidden relative md:rounded-[20px] border"
        style={{ background: activeView === 'reels' ? '#000000' : CN.bg, borderColor: CN.border }}
      >

        {/* Content Views — Always mounted for zero-delay tab switching */}
        
        {/* Home/Calls view — HomeFeed kept for compatibility */}
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

        {/* Reels / Discover view */}
        <div className={`ig-tab-panel ${activeView === 'reels' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'reels'}>
          <div className="relative w-full h-full flex flex-col min-h-0 overflow-hidden" style={{ background: '#000000' }}>
            <ReelsPlayer 
              onBack={() => setActiveView('chat')}
              onOpenProfile={(userId, fallbackUser, e) => handleOpenOtherProfile(userId, fallbackUser, e)}
              isDark={isDark}
            />
          </div>
        </div>

        {/* ── SEARCH / PEOPLE DISCOVERY ── */}
        <div className={`ig-tab-panel ${activeView === 'search' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'search'}>
          <div className="w-full h-full flex flex-col min-h-0" style={{ background: CN.bg }}>
            
            {/* Search Header */}
            <div style={{
              padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 16px',
              borderBottom: `1px solid ${CN.border}`,
              flexShrink: 0,
            }}>
              <h2 style={{ color: CN.text, fontSize: 22, fontWeight: 700, margin: '0 0 14px', letterSpacing: '-0.3px' }}>
                Find People
              </h2>
              {/* Search Input */}
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: CN.textMuted, flexShrink: 0 }}
                  width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Search by name or @username"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${CN.border}`,
                    borderRadius: 12,
                    color: CN.text,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    padding: '12px 14px 12px 42px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = CN.accent; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = CN.border; e.target.style.boxShadow = 'none'; }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: CN.textMuted, cursor: 'pointer', outline: 'none', padding: 4 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Search Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: '8px 16px 100px' }}>
              
              {/* Empty search — show recent */}
              {searchQuery.trim().length === 0 && (
                <div>
                  {/* Recent Searches */}
                  {searchHistory.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: CN.textMuted, margin: '16px 0 10px' }}>
                        Recent Searches
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {searchHistory.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              handleAddToHistory(item);
                              handleOpenOtherProfile(item.id, item, e);
                              setSearchQuery('');
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 12px', borderRadius: 14, cursor: 'pointer',
                              background: 'transparent',
                              border: `1px solid transparent`,
                              transition: 'all 150ms',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = CN.hover; (e.currentTarget as HTMLElement).style.borderColor = CN.border; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: CN.surface, flexShrink: 0, border: `1px solid ${CN.border}` }}>
                                <img src={item.image || '/Avatar.png'} alt="user" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div>
                                <p style={{ color: CN.text, fontSize: 14, fontWeight: 600, margin: 0 }}>@{item.username || 'username'}</p>
                                {item.name && <p style={{ color: CN.textMuted, fontSize: 12, margin: '2px 0 0' }}>{item.name}</p>}
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleRemoveFromHistory(item.id, e)}
                              style={{ background: 'none', border: 'none', color: CN.textMuted, cursor: 'pointer', padding: 6, borderRadius: 8, outline: 'none' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = CN.active; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                            >
                              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state when no history */}
                  {searchHistory.length === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center', gap: 12 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 16, background: CN.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                        <svg width="24" height="24" fill="none" stroke={CN.textMuted} viewBox="0 0 24 24" strokeWidth="1.5">
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                      <p style={{ color: CN.text, fontSize: 16, fontWeight: 600, margin: 0 }}>Find someone on CONNECT</p>
                      <p style={{ color: CN.textMuted, fontSize: 13, margin: 0 }}>Search by name or @username to connect</p>
                    </div>
                  )}
                </div>
              )}

              {/* Active search results */}
              {searchQuery.trim().length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: CN.textMuted, margin: '16px 0 10px' }}>
                    People
                  </p>
                  {isSearching ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...Array(4)].map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                          <div className="ig-skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div className="ig-skeleton" style={{ height: 12, width: '40%', borderRadius: 6 }} />
                            <div className="ig-skeleton" style={{ height: 10, width: '25%', borderRadius: 5 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', textAlign: 'center', gap: 10 }}>
                      <svg width="36" height="36" fill="none" stroke={CN.textMuted} viewBox="0 0 24 24" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <p style={{ color: CN.text, fontSize: 15, fontWeight: 600, margin: 0 }}>No results found</p>
                      <p style={{ color: CN.textMuted, fontSize: 13, margin: 0 }}>No user matching &ldquo;@{searchQuery.replace(/^@/, '')}&rdquo;</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {searchResults.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={(e) => {
                            handleAddToHistory(item);
                            handleOpenOtherProfile(item.id, item, e);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px', borderRadius: 16, cursor: 'pointer',
                            background: CN.surface,
                            border: `1px solid ${CN.border}`,
                            transition: 'all 150ms',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = CN.borderStrong; (e.currentTarget as HTMLElement).style.background = '#434a53'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = CN.border; (e.currentTarget as HTMLElement).style.background = CN.surface; }}
                        >
                          {/* Avatar with online indicator */}
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${CN.border}` }}>
                              <img src={item.image || '/Avatar.png'} alt="user" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                            </div>
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: CN.text, fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              @{item.username || 'username'}
                            </p>
                            <p style={{ color: CN.textMuted, fontSize: 12, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name || 'User'}{item._count?.followers ? ` · ${item._count.followers} followers` : ''}
                            </p>
                          </div>
                          {/* Chevron */}
                          <svg width="16" height="16" fill="none" stroke={CN.textMuted} viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CHAT / MESSAGES HUB — PRIMARY VIEW ── */}
        <div className={`ig-tab-panel ${activeView === 'chat' ? 'ig-tab-enter' : ''}`} data-active={activeView === 'chat'}>
          <SocialChat 
            isActive={activeView === 'chat'} 
            onStatusChange={setIsConnected} 
            onChatChange={setSelectedChatUser}
            onBack={() => setActiveView('chat')}
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

        {/* Profile Panel */}
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
            navTransitionInProgress.current = false;
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

      {/* ─────────────────────────────────────────────────────────────────
          CONNECT MOBILE BOTTOM NAVIGATION
          ───────────────────────────────────────────────────────────────── */}
      {((activeView === 'chat' || activeView === 'search' || activeView === 'home' || activeView === 'reels') && !isCallActive) && (
        <nav
          className={`mobile-nav ${(isAccountSheetOpen || isChatLongPressActive) ? 'mobile-nav-hidden' : ''}`}
          style={{ display: 'none' /* shown via CSS media query */ }}
        >
          {navItems.map((item) => {
            const isMobileItemActive = !isProfileOpen && activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={(e) => handleNavClick(item.id, e)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 4, width: 52, height: 52, borderRadius: 14,
                  background: isMobileItemActive ? 'rgba(0,173,181,0.12)' : 'transparent',
                  border: 'none', cursor: 'pointer', outline: 'none',
                  color: isMobileItemActive ? '#00ADB5' : 'rgba(238,238,238,0.4)',
                  transition: 'all 150ms',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                {item.icon(isMobileItemActive)}
                {/* Active dot indicator */}
                {isMobileItemActive && (
                  <div style={{
                    position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
                    width: 4, height: 4, borderRadius: '50%', background: '#00ADB5',
                  }} />
                )}
              </button>
            );
          })}

          {/* Profile avatar button */}
          <button
            onClick={(e) => runProfileTransition(() => setIsProfileOpen(true), e.clientX, e.clientY, false)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, width: 52, height: 52, borderRadius: 14,
              background: isProfileOpen ? 'rgba(0,173,181,0.12)' : 'transparent',
              border: 'none', cursor: 'pointer', outline: 'none',
              transition: 'all 150ms',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', overflow: 'hidden',
              border: `2px solid ${isProfileOpen ? '#00ADB5' : 'rgba(255,255,255,0.2)'}`,
              flexShrink: 0,
            }}>
              <img src={displaySession.user?.image || '/Avatar.png'} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
            </div>
            {isProfileOpen && (
              <div style={{
                position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
                width: 4, height: 4, borderRadius: '50%', background: '#00ADB5',
              }} />
            )}
          </button>
        </nav>
      )}

      {/* ── UPLOAD MODAL ── */}
      {showUploadModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{
            background: CN.surface, borderRadius: 24, padding: 24, width: '90%', maxWidth: 400,
            border: `1px solid ${CN.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: CN.text, margin: 0 }}>Create {uploadType === 'reel' ? 'Reel' : 'Post'}</h3>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', color: CN.textMuted, cursor: 'pointer', outline: 'none' }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: CN.textMuted, marginBottom: 10 }}>Select from Gallery</div>
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
                        aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                        border: uploadUrl === imgUrl ? `2px solid ${CN.accent}` : `2px solid ${CN.border}`,
                        transition: 'border 0.2s', padding: 2,
                      }}
                    >
                      <img src={imgUrl} alt="gallery" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: CN.textMuted, marginBottom: 8 }}>Caption</div>
                <textarea 
                  placeholder="Write a caption..."
                  value={uploadCaption}
                  onChange={e => setUploadCaption(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12,
                    border: `1px solid ${CN.border}`,
                    background: 'rgba(255,255,255,0.05)', color: CN.text,
                    outline: 'none', fontSize: 14, resize: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
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
                  width: '100%', padding: '13px', background: CN.accent,
                  color: '#fff', border: 'none', borderRadius: 12,
                  fontWeight: 600, fontSize: 15, cursor: uploadUrl && !uploadLoading ? 'pointer' : 'not-allowed',
                  opacity: uploadUrl && !uploadLoading ? 1 : 0.5, transition: 'opacity 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                {uploadLoading ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
