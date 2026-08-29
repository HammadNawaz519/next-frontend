'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { 
  updateName, 
  getProfileDetails,
  getOtherUserProfile,
  toggleFollowUser,
} from './actions';
import dynamic from 'next/dynamic';
import SocialChat from '@/components/SocialChat';
import { useTheme } from '@/app/components/ThemeProvider';
import { triggerHaptic } from '@/lib/haptics';
import { DeviceAccountStore } from '@/lib/deviceAccountStore';

import ProfilePanel from '@/components/ProfilePanel';

const CallsView = dynamic(() => import('@/components/CallsView'), {
  ssr: false,
});

export default function DashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isClosingProfile, setIsClosingProfile] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<any>(null);
  
  const [fullUser, setFullUser] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('cached_profile_details');
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return null;
  });
  const [activeView, setActiveView] = useState<'chat' | 'calls'>('chat');
  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);

  const chatComponentRef = useRef<{ closeChat: () => void; silentReset: () => void } | null>(null);
  const navTransitionInProgress = useRef(false);

  const runProfileTransition = (action: () => void, _x?: number, _y?: number, _reverse = false) => {
    action();
  };
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [isChatLongPressActive, setIsChatLongPressActive] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isStoryEditorOpen, setIsStoryEditorOpen] = useState(false);

  // Auto-register account immediately on every successful session mount
  useEffect(() => {
    const sessionUser = session?.user as any;
    if (!sessionUser?.email || !sessionUser?.id) return;

    const meta = DeviceAccountStore.metaFromSession(sessionUser);

    DeviceAccountStore.addOrUpdateAccount(meta, true).then(() => {
      DeviceAccountStore.setCurrentAccountId(meta.userId);

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

    // Layer 1: Account Switcher Sheet
    if (isAccountSheetOpen) {
      setIsAccountSheetOpen(false);
      return true;
    }

    // Layer 2: User Profile Panel (Self or Other User)
    if (isProfileOpen || selectedProfileUser) {
      setIsProfileOpen(false);
      setSelectedProfileUser(null);
      return true;
    }

    // Layer 3: Social Chat internal view / active chat
    if (activeView === 'chat') {
      if (selectedChatUser) {
        if (chatComponentRef.current?.closeChat) {
          chatComponentRef.current.closeChat();
        } else {
          setSelectedChatUser(null);
        }
        return true;
      }
      return false;
    }

    setActiveView('chat');
    return true;
  };

  // Push history state whenever any overlay opens
  useEffect(() => {
    const hasAnyOverlay = isAccountSheetOpen || isProfileOpen || !!selectedProfileUser || !!selectedChatUser;
    
    if (hasAnyOverlay && typeof window !== 'undefined') {
      window.history.pushState({ appNav: true }, '', window.location.href);
    }
  }, [isAccountSheetOpen, isProfileOpen, selectedProfileUser, selectedChatUser]);

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
  }, [isAccountSheetOpen, isProfileOpen, selectedProfileUser, selectedChatUser]);

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

  // Load User Details for Profile Panel on-demand when profile is opened (cached)
  const hasLoadedUser = useRef(false);
  const refreshProfile = () => {
    if (status === 'authenticated') {
      getProfileDetails().then(data => {
        if (data) {
          setFullUser(data);
          try {
            localStorage.setItem('cached_profile_details', JSON.stringify(data));
          } catch {}
        }
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (isProfileOpen && !hasLoadedUser.current) {
      hasLoadedUser.current = true;
      if (!fullUser) {
        refreshProfile();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProfileOpen, status, fullUser]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  // Fast, optimistic session from local storage
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

  if (!hasMounted || (!displaySession && status === 'loading')) {
    return null;
  }

  if (!displaySession) {
    return null;
  }

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
    <div className="main-layout flex h-[100dvh] overflow-hidden font-sans font-light text-[0.95em] md:p-3 md:gap-3" style={{ background: 'var(--dm-bg-page)', color: 'var(--dm-text-primary)' }}>
      
      {/* Desktop Sidebar */}
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
              { 
                id: 'chat', 
                name: 'Messages', 
                renderIcon: (active: boolean) => (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path 
                      d="M4 6.5C4 4.567 5.567 3 7.5 3h9C18.433 3 20 4.567 20 6.5v7c0 1.933-1.567 3.5-3.5 3.5H9.414a1 1 0 00-.707.293L5.414 20.586A1 1 0 013.707 19.88V6.5A3.5 3.5 0 014 6.5z" 
                      fill={active ? '#D5C7FF' : 'currentColor'} 
                    />
                    <circle cx="8.5" cy="10" r="1.1" fill={active ? '#1A1A1E' : (isDark ? '#000000' : '#FFFFFF')} />
                    <circle cx="12" cy="10" r="1.1" fill={active ? '#1A1A1E' : (isDark ? '#000000' : '#FFFFFF')} />
                    <circle cx="15.5" cy="10" r="1.1" fill={active ? '#1A1A1E' : (isDark ? '#000000' : '#FFFFFF')} />
                  </svg>
                )
              },
              { 
                id: 'calls', 
                name: 'Calls', 
                renderIcon: (active: boolean) => (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2}>
                    <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
                  </svg>
                )
              }
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
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center" style={{ color: isItemActive ? 'var(--dm-text-primary)' : 'var(--dm-text-muted)' }}>
                    {item.renderIcon(isItemActive)}
                  </div>
                  <span className="text-[12px] font-light opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden" style={{ color: isItemActive ? 'var(--dm-text-primary)' : 'var(--dm-text-secondary)' }}>
                    {item.name}
                  </span>
                </div>
              );
            })}
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
                    : <img src="/Avatar.png" alt="profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
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
                localStorage.removeItem('social_contacts_cache');
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

      {/* Main Container (Messages / Calls) */}
      <div className="main-container flex-1 flex flex-col overflow-hidden relative md:rounded-[40px] shadow-sm md:border" style={{ background: 'var(--dm-bg-main)', borderColor: 'var(--dm-border-main)' }}>
        
        {/* Messages View */}
        <div className={`w-full h-full flex flex-col min-h-0 relative ${activeView === 'chat' ? 'flex' : 'hidden'}`}>
          <SocialChat 
            isActive={activeView === 'chat'} 
            onStatusChange={setIsConnected} 
            onChatChange={setSelectedChatUser}
            onBack={() => {}}
            onCallStateChange={setIsCallActive}
            initialUser={selectedChatUser}
            ref={chatComponentRef as any}
            onOpenProfile={(targetUser) => {
              setSelectedProfileUser(targetUser);
              setIsProfileOpen(true);
            }}
            onLongPressChatChange={setIsChatLongPressActive}
            onSearchActiveChange={setIsSearchActive}
            onStoryEditorChange={setIsStoryEditorOpen}
          />
        </div>

        {/* Calls History View */}
        <div className={`w-full h-full flex flex-col min-h-0 relative ${activeView === 'calls' ? 'flex' : 'hidden'}`}>
          <CallsView 
            currentUserId={(displaySession.user as any)?.id}
            isActive={activeView === 'calls'}
            onOpenChat={(targetUser) => {
              setSelectedChatUser({ ...targetUser, _openTs: Date.now() });
              setActiveView('chat');
            }}
            onNavigate={(v) => setActiveView(v)}
            onOpenProfile={() => setIsProfileOpen(true)}
            onStartCall={(targetUser, callType) => {
              setSelectedChatUser({ ...targetUser, _startCallType: callType, _openTs: Date.now() });
              setActiveView('chat');
            }}
            onSearchActiveChange={setIsSearchActive}
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
        />
      </div>

      {/* Mobile Bottom Navigation — single unified bottom bar: Messages (left), Calls (center), Profile (right) */}
      {(!selectedChatUser && !isCallActive && !isSearchActive && !isStoryEditorOpen && !isProfileOpen) && (
        <nav className={`mobile-nav ${(isAccountSheetOpen || isChatLongPressActive || isProfileOpen) ? 'mobile-nav-hidden' : ''}`}>
          {/* 1. Messages (Leftmost) */}
          <button
            onClick={(e) => handleNavClick('chat', e)}
            className="flex flex-col items-center justify-center gap-1 transition-all active:scale-95 px-4 py-1 outline-none cursor-pointer"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path 
                  fillRule="evenodd" 
                  clipRule="evenodd" 
                  d="M3.0132 9.15129C3 9.69022 3 10.3021 3 11V13C3 15.8284 3 17.2426 3.87868 18.1213C4.75736 19 6.17157 19 9 19H15C17.8284 19 19.2426 19 20.1213 18.1213C21 17.2426 21 15.8284 21 13V11C21 10.3021 21 9.69022 20.9868 9.15129L12.9713 13.6044C12.3672 13.9399 11.6328 13.9399 11.0287 13.6044L3.0132 9.15129ZM3.24297 7.02971C3.32584 7.05052 3.4074 7.08237 3.48564 7.12584L12 11.856L20.5144 7.12584C20.5926 7.08237 20.6742 7.05052 20.757 7.02971C20.6271 6.55619 20.4276 6.18491 20.1213 5.87868C19.2426 5 17.8284 5 15 5H9C6.17157 5 4.75736 5 3.87868 5.87868C3.57245 6.18491 3.37294 6.55619 3.24297 7.02971Z" 
                  fill={!isProfileOpen && activeView === 'chat' ? '#D8B4E2' : 'rgba(255,255,255,0.45)'}
                />
              </svg>
            </div>
            <span className={`text-[10px] tracking-tight ${!isProfileOpen && activeView === 'chat' ? 'text-[#D8B4E2] font-semibold' : 'text-zinc-400 font-medium'}`}>
              Messages
            </span>
          </button>

          {/* 2. Calls (Center) */}
          <button
            onClick={(e) => handleNavClick('calls', e)}
            className="flex flex-col items-center justify-center gap-1 transition-all active:scale-95 px-4 py-1 outline-none cursor-pointer"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path 
                  d="M10.0376 5.31617L10.6866 6.4791C11.2723 7.52858 11.0372 8.90532 10.1147 9.8278C10.1147 9.8278 10.1147 9.8278 10.1147 9.8278C10.1146 9.82792 8.99588 10.9468 11.0245 12.9755C13.0525 15.0035 14.1714 13.8861 14.1722 13.8853C14.1722 13.8853 14.1722 13.8853 14.1722 13.8853C15.0947 12.9628 16.4714 12.7277 17.5209 13.3134L18.6838 13.9624C20.2686 14.8468 20.4557 17.0692 19.0628 18.4622C18.2258 19.2992 17.2004 19.9505 16.0669 19.9934C14.1588 20.0658 10.9183 19.5829 7.6677 16.3323C4.41713 13.0817 3.93421 9.84122 4.00655 7.93309C4.04952 6.7996 4.7008 5.77423 5.53781 4.93723C6.93076 3.54428 9.15317 3.73144 10.0376 5.31617Z" 
                  stroke={!isProfileOpen && activeView === 'calls' ? '#D8B4E2' : 'rgba(255,255,255,0.45)'} 
                  strokeWidth="1.8" 
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className={`text-[10px] tracking-tight ${!isProfileOpen && activeView === 'calls' ? 'text-[#D8B4E2] font-semibold' : 'text-zinc-400 font-medium'}`}>
              Calls
            </span>
          </button>

          {/* 3. Profile (Right) */}
          <button
            onClick={(e) => runProfileTransition(() => setIsProfileOpen(true), e.clientX, e.clientY, false)}
            className="flex flex-col items-center justify-center gap-1 transition-all active:scale-95 px-4 py-1 outline-none cursor-pointer"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke={isProfileOpen ? '#D8B4E2' : 'rgba(255,255,255,0.45)'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span className={`text-[10px] tracking-tight ${isProfileOpen ? 'text-[#D8B4E2] font-semibold' : 'text-zinc-400 font-medium'}`}>
              Profile
            </span>
          </button>
        </nav>
      )}
    </div>
  );
}
