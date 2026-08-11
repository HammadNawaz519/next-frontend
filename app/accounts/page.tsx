'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical, Trash2, UserPlus, LogIn, Lock, Eye, EyeOff, X, ArrowLeft,
  ChevronRight, Check, ShieldCheck, Smartphone, Key, History, Activity,
  Download, CreditCard, Sliders, Globe, RefreshCw, AlertCircle
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/app/components/ThemeProvider';
import {
  getAccountsCenterOverview,
  updateProfileSyncAction,
  toggleTwoFactorAction,
  revokeActiveSessionAction,
  clearOffPlatformDataAction,
  clearSearchHistoryAction,
  requestDataExportAction,
  updateAdPreferencesAction,
  addPaymentVaultTokenAction,
} from './actions';

const GrainGradient = dynamic(
  () => import('@paper-design/shaders-react').then((mod) => mod.GrainGradient),
  { ssr: false }
);

interface SavedAccount {
  email: string;
  username?: string;
  name?: string;
  image?: string;
  provider?: string;
  isCurrent?: boolean;
}

export default function AccountsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'accounts' | 'security' | 'privacy' | 'preferences'>('accounts');
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'remove'>('list');
  const [showDropdown, setShowDropdown] = useState(false);

  // Backend state from Prisma
  const [overviewData, setOverviewData] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Form states
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('connected_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const removedStr = localStorage.getItem('removed_accounts');
          const removedList: string[] = removedStr ? JSON.parse(removedStr) : [];
          const cleanAccounts = parsed.filter(
            (acc: SavedAccount) => acc && acc.email && typeof acc.email === 'string' && !removedList.includes(acc.email.toLowerCase().trim())
          );
          setAccounts(cleanAccounts);
        }
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
  }, []);

  const loadOverview = async () => {
    if (!session?.user?.email) return;
    setLoadingOverview(true);
    try {
      const data = await getAccountsCenterOverview();
      setOverviewData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      loadOverview();
    }
  }, [session?.user?.email]);

  const curEmail = session?.user?.email ? session.user.email.toLowerCase().trim() : '';

  const displayAccounts = React.useMemo(() => {
    const map = new Map<string, SavedAccount>();
    if (session?.user?.email) {
      const email = session.user.email.toLowerCase().trim();
      const username = (session.user as any).username || email.split('@')[0];
      map.set(email, {
        email,
        username,
        name: session.user.name || 'User',
        image: session.user.image || '',
        isCurrent: true
      });
    }
    accounts.forEach((acc) => {
      if (!acc || !acc.email) return;
      const key = acc.email.toLowerCase().trim();
      const isCurrent = key === curEmail;
      if (!map.has(key)) {
        map.set(key, { ...acc, isCurrent });
      } else {
        map.set(key, { ...acc, ...map.get(key), isCurrent: true });
      }
    });
    return Array.from(map.values());
  }, [session, accounts, curEmail]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!mounted) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505]' : 'bg-[#f3f4f6]'}`}>
        <div className={`w-8 h-8 border-2 rounded-full animate-spin ${isDark ? 'border-white/20 border-t-white' : 'border-black/20 border-t-black'}`} />
      </div>
    );
  }

  const handleRemoveAccount = (email: string) => {
    try {
      const targetEmail = email.toLowerCase().trim();
      const updated = accounts.filter(acc => acc.email.toLowerCase().trim() !== targetEmail);
      setAccounts(updated);
      if (updated.length > 0) {
        localStorage.setItem('connected_accounts', JSON.stringify(updated));
      } else {
        localStorage.removeItem('connected_accounts');
      }

      const removedStr = localStorage.getItem('removed_accounts');
      let removedList: string[] = removedStr ? JSON.parse(removedStr) : [];
      if (!Array.isArray(removedList)) removedList = [];
      if (!removedList.includes(targetEmail)) {
        removedList.push(targetEmail);
        localStorage.setItem('removed_accounts', JSON.stringify(removedList));
      }
      if (updated.length === 0) setViewMode('list');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAccountClick = async (acc: SavedAccount) => {
    if (acc.provider === 'google') {
      setLoading(true);
      setError('');
      try {
        await signIn('google', { callbackUrl: '/dashboard' });
      } catch (err) {
        setError('Failed to log in with Google.');
        setLoading(false);
      }
    } else {
      setSelectedAccount(acc);
      setPassword('');
      setError('');
      setShowPassword(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setLoading(true);
    setError('');
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: selectedAccount.email,
        password: password,
      });

      if (res?.error) {
        setError('Incorrect password.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (acc: SavedAccount) => {
    if (acc.username) return acc.username.slice(0, 2).toUpperCase();
    if (acc.name) return acc.name.slice(0, 2).toUpperCase();
    return acc.email.slice(0, 2).toUpperCase();
  };

  const showToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(''), 3000);
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 font-sans ${isDark ? 'bg-[#09090b] text-white' : 'bg-[#f8f9fa] text-gray-900'}`}>
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="fixed top-5 right-5 z-[999] bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-300">
          <Check className="w-4 h-4 stroke-[3]" />
          {actionSuccess}
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header Navigation */}
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-500/20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className={`p-2.5 rounded-full border transition-all active:scale-95 ${
                isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300' : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-700'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Accounts Center</h1>
              <p className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Manage connected experiences, security, privacy & Meta Pay across linked accounts.
              </p>
            </div>
          </div>
        </div>

        {/* System Module Navigation Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
          {[
            { id: 'accounts', label: 'Profiles & Sync', icon: Globe },
            { id: 'security', label: 'Security & Sessions', icon: ShieldCheck },
            { id: 'privacy', label: 'Data & Privacy', icon: History },
            { id: 'preferences', label: 'Ads & Payments', icon: CreditCard },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl text-xs font-extrabold transition-all active:scale-98 border ${
                  isActive
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/25'
                    : isDark
                      ? 'bg-zinc-900/40 border-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-900'
                      : 'bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* MODULE 1: PROFILES & CONNECTED EXPERIENCES */}
        {activeTab === 'accounts' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">Connected Profiles ({displayAccounts.length})</h2>
                <button
                  onClick={() => setViewMode(viewMode === 'list' ? 'remove' : 'list')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                    isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {viewMode === 'list' ? 'Manage Devices' : 'Done'}
                </button>
              </div>

              <div className="space-y-3">
                {displayAccounts.map((acc) => {
                  const accountName = acc.name || acc.username || acc.email.split('@')[0];
                  const rawUsername = acc.username || acc.email.split('@')[0];
                  const displayUsername = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
                  const isActive = acc.isCurrent;

                  return (
                    <div
                      key={acc.email}
                      onClick={() => !isActive && handleAccountClick(acc)}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        isActive
                          ? isDark ? 'border-blue-500/40 bg-blue-500/10' : 'border-blue-300 bg-blue-50'
                          : isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 cursor-pointer' : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        {acc.image ? (
                          <img src={acc.image} alt={accountName} className="w-11 h-11 rounded-full object-cover border border-zinc-700" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                            {getInitials(acc)}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{accountName}</span>
                            {isActive && (
                              <span className="text-[10px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase">
                                Active Session
                              </span>
                            )}
                          </div>
                          <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{displayUsername}</span>
                        </div>
                      </div>

                      {viewMode === 'remove' && !isActive ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveAccount(acc.email); }}
                          className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        isActive && (
                          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Profile Metadata Sync Control */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h2 className="text-base font-bold mb-1">Profile Metadata Syncing</h2>
              <p className={`text-xs mb-5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Automatically sync your Name, Bio, and Avatar across Instagram, Facebook, and Threads.
              </p>

              <div className="space-y-4">
                {[
                  { key: 'syncName', title: 'Sync Name & Display Username', desc: 'Keep name identical on all linked accounts' },
                  { key: 'syncBio', title: 'Sync Bio Description', desc: 'Sync bio updates across all profiles' },
                  { key: 'syncAvatar', title: 'Sync Profile Picture', desc: 'Sync avatar photo changes instantly' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-2 border-b border-zinc-500/10">
                    <div>
                      <div className="text-xs font-bold">{item.title}</div>
                      <div className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{item.desc}</div>
                    </div>
                    <button
                      onClick={async () => {
                        const cur = overviewData?.profileSync?.[item.key] ?? true;
                        await updateProfileSyncAction({
                          syncPolicy: 'FULL_SYNC',
                          syncName: item.key === 'syncName' ? !cur : (overviewData?.profileSync?.syncName ?? true),
                          syncBio: item.key === 'syncBio' ? !cur : (overviewData?.profileSync?.syncBio ?? true),
                          syncAvatar: item.key === 'syncAvatar' ? !cur : (overviewData?.profileSync?.syncAvatar ?? true),
                        });
                        loadOverview();
                        showToast('Profile sync settings updated');
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                        overviewData?.profileSync?.[item.key] !== false ? 'bg-blue-600' : isDark ? 'bg-zinc-800' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        overviewData?.profileSync?.[item.key] !== false ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODULE 2: SECURITY & SESSION HUB */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* 2FA Section */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Two-Factor Authentication (2FA)</h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                    Protect all linked accounts with TOTP authenticator apps or security keys.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const current = overviewData?.securitySetting?.isTwoFactorEnabled ?? false;
                    await toggleTwoFactorAction(!current);
                    loadOverview();
                    showToast(!current ? '2FA Enabled successfully' : '2FA Disabled');
                  }}
                  className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                    overviewData?.securitySetting?.isTwoFactorEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  {overviewData?.securitySetting?.isTwoFactorEnabled ? '2FA Active' : 'Enable 2FA'}
                </button>
              </div>
            </div>

            {/* Global Sessions Manager */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h2 className="text-base font-bold mb-1">Where You&apos;re Logged In</h2>
              <p className={`text-xs mb-5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Review active device sessions and revoke unauthorized access remotely.
              </p>

              <div className="space-y-3">
                {overviewData?.activeSessions?.map((sess: any) => (
                  <div key={sess.id} className={`flex items-center justify-between p-4 rounded-2xl border ${isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-blue-500" />
                      <div>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          {sess.deviceName}
                          {sess.isCurrent && (
                            <span className="text-[9px] bg-emerald-500 text-white font-extrabold px-1.5 py-0.5 rounded-full">
                              This Device
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                          {sess.locationCity}, {sess.locationCountry} • IP: {sess.ipAddress}
                        </div>
                      </div>
                    </div>

                    {!sess.isCurrent && (
                      <button
                        onClick={async () => {
                          await revokeActiveSessionAction(sess.id);
                          loadOverview();
                          showToast('Session revoked remotely');
                        }}
                        className="text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-xl border border-rose-500/20 hover:bg-rose-500/10 transition-colors"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODULE 3: USER DATA & PRIVACY CONTROLS */}
        {activeTab === 'privacy' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Off-Platform Activity */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">Off-Platform Data & Telemetry</h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                    Clear history of activity shared by partners off Meta services.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await clearOffPlatformDataAction();
                    loadOverview();
                    showToast('Off-platform telemetry cleared');
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-2xl transition-all"
                >
                  Clear Off-Platform History
                </button>
              </div>
            </div>

            {/* Unified Search History */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">Unified Search History</h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                    Logs of searches performed across linked Instagram and Facebook accounts.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await clearSearchHistoryAction();
                    loadOverview();
                    showToast('Search history cleared');
                  }}
                  className={`px-4 py-2 border rounded-2xl text-xs font-bold transition-all ${
                    isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  Clear All Search Logs
                </button>
              </div>
            </div>

            {/* Data Export & Portability */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h2 className="text-base font-bold mb-1">Download Your Information</h2>
              <p className={`text-xs mb-4 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Export a copy of your posts, media, messages, and settings.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    await requestDataExportAction('JSON');
                    loadOverview();
                    showToast('JSON Export job initiated');
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-2xl transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Request JSON Archive
                </button>
                <button
                  onClick={async () => {
                    await requestDataExportAction('HTML');
                    loadOverview();
                    showToast('HTML Export job initiated');
                  }}
                  className={`px-4 py-2.5 border text-xs font-bold rounded-2xl transition-all flex items-center gap-2 ${
                    isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Request HTML Archive
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODULE 4: AD PREFERENCES & META PAY */}
        {activeTab === 'preferences' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Sensitive Ad Topics Filter */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <h2 className="text-base font-bold mb-1">Cross-Account Ad Topics</h2>
              <p className={`text-xs mb-4 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Filter sensitive ad topics across linked Instagram and Facebook accounts.
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                {['Gambling', 'Politics', 'Alcohol', 'Financial Services', 'Pets'].map((topic) => {
                  const isHidden = overviewData?.adPreference?.sensitiveTopicsHidden?.includes(topic);
                  return (
                    <button
                      key={topic}
                      onClick={async () => {
                        const currentList: string[] = overviewData?.adPreference?.sensitiveTopicsHidden || [];
                        const newList = isHidden ? currentList.filter(t => t !== topic) : [...currentList, topic];
                        await updateAdPreferencesAction(newList, overviewData?.adPreference?.usePartnerData ?? true);
                        loadOverview();
                        showToast(`Ad topic preference updated: ${topic}`);
                      }}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold border transition-all ${
                        isHidden
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-gray-100 border-gray-200 text-gray-700'
                      }`}
                    >
                      {isHidden ? `Hidden: ${topic}` : `Show: ${topic}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Meta Pay Vaulted Tokens */}
            <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">Meta Pay Token Vault</h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                    Vaulted payment tokens synced across Instagram Shop and Meta Horizon.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await addPaymentVaultTokenAction({ cardBrand: 'Visa', cardLast4: '4242', expiryMonth: 12, expiryYear: 2028 });
                    loadOverview();
                    showToast('Vaulted new payment method');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl transition-all"
                >
                  + Add Payment Method
                </button>
              </div>

              <div className="space-y-3">
                {overviewData?.paymentTokens?.map((tok: any) => (
                  <div key={tok.id} className={`flex items-center justify-between p-4 rounded-2xl border ${isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-blue-500" />
                      <div>
                        <div className="text-xs font-bold">{tok.cardBrand} ending in •••• {tok.cardLast4}</div>
                        <div className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                          Expires {tok.expiryMonth}/{tok.expiryYear} • Vault ID: {tok.vaultedTokenId}
                        </div>
                      </div>
                    </div>
                    {tok.isDefault && (
                      <span className="text-[10px] bg-blue-600 text-white font-extrabold px-2.5 py-1 rounded-full uppercase">
                        Default Meta Pay
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Password Modal */}
      {selectedAccount && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className={`w-full max-w-sm border rounded-3xl p-6 shadow-2xl relative ${isDark ? 'bg-[#16161a] border-zinc-800' : 'bg-white border-gray-200'}`}>
            <button
              onClick={() => setSelectedAccount(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold mb-4">Enter Password for @{selectedAccount.username}</h3>
            {error && <div className="text-rose-400 text-xs font-bold mb-3">{error}</div>}
            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className={`w-full p-3 rounded-2xl border text-xs outline-none ${
                  isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-100 border-gray-200 text-gray-900'
                }`}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl transition-all"
              >
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
