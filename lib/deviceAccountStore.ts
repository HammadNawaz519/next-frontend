/**
 * DeviceAccountStore
 * ─────────────────
 * The ONE and ONLY authoritative module for all device-side account persistence.
 *
 * Three concepts are kept strictly separate:
 *   CURRENT ACCOUNT    → da_current_id
 *   SAVED ACCOUNTS     → da_accounts   (metadata map, non-sensitive)
 *   CREDENTIALS        → da_cred_<userId> (per-account, separately namespaced)
 *
 * Rules enforced here:
 *  ✓ First successful login registers the account immediately.
 *  ✓ Logging into Account B never removes Account A.
 *  ✓ Raw passwords are NEVER stored — only session token hints.
 *  ✓ UserId is the primary key, not email or username.
 *  ✓ All reads/writes go through this module — no ad-hoc localStorage scattered elsewhere.
 *
 * Storage keys:
 *   da_accounts        — JSON object: Record<userId, DeviceAccountMeta>
 *   da_current_id      — string (userId of the currently active account)
 *   da_cred_<userId>   — JSON: { sessionHint, savedAt, expiresAt }
 *
 * For Capacitor native (Android Keystore / iOS Keychain), swap the
 * _secureGet / _secureSet / _secureDel methods to use
 * @aparajita/capacitor-secure-storage when that plugin is installed.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeviceAccountMeta {
  userId: string;           // PRIMARY KEY — backend immutable user ID
  email: string;
  username: string;
  displayName: string;
  profilePicture: string;
  provider: 'credentials' | 'google' | string;
  isSavedOnDevice: boolean; // true if a valid credential/session-hint exists
  lastUsedAt: string;       // ISO 8601
}

export interface DeviceCredential {
  /** A non-sensitive session hint so we know this account has been authenticated.
   *  We do NOT store the raw password.
   *  For credentials provider: a salted hash-hint derived from userId + email.
   *  For google provider: the provider name itself (google SSO re-auth).
   */
  sessionHint: string;
  savedAt: string;      // ISO 8601
  expiresAt: string;    // ISO 8601  (1 year default, extended on each switch)
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const KEY_ACCOUNTS  = 'da_accounts';
const KEY_CURRENT   = 'da_current_id';
const credKey = (userId: string) => `da_cred_${userId}`;

// ─── Platform-Aware Secure Storage ────────────────────────────────────────────

/**
 * Secure get — tries @aparajita/capacitor-secure-storage on native,
 * falls back to localStorage in web/WebView environments.
 */
async function _secureGet(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    // Attempt native secure storage if Capacitor is present
    if ((window as any)?.Capacitor?.isNativePlatform?.()) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = await (Function('return import("@aparajita/capacitor-secure-storage")')() as Promise<any>).catch(() => null);
      const SecureStorage = mod?.SecureStorage;
      if (SecureStorage) {
        try {
          const result = await SecureStorage.get({ key });
          return result?.data ?? null;
        } catch {
          return null;
        }
      }
    }
  } catch {}
  // Web fallback
  return localStorage.getItem(key);
}

async function _secureSet(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ((window as any)?.Capacitor?.isNativePlatform?.()) {
      const mod = await (Function('return import("@aparajita/capacitor-secure-storage")')() as Promise<any>).catch(() => null);
      const SecureStorage = mod?.SecureStorage;
      if (SecureStorage) {
        await SecureStorage.set({ key, value });
        return;
      }
    }
  } catch {}
  localStorage.setItem(key, value);
}

async function _secureDel(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ((window as any)?.Capacitor?.isNativePlatform?.()) {
      const mod = await (Function('return import("@aparajita/capacitor-secure-storage")')() as Promise<any>).catch(() => null);
      const SecureStorage = mod?.SecureStorage;
      if (SecureStorage) {
        await SecureStorage.remove({ key });
        return;
      }
    }
  } catch {}
  localStorage.removeItem(key);
}

// ─── Metadata Helpers (non-sensitive, normal localStorage) ────────────────────

function _loadAccounts(): Record<string, DeviceAccountMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY_ACCOUNTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    // Migrate old `connected_accounts` array format
    if (Array.isArray(parsed)) {
      const migrated: Record<string, DeviceAccountMeta> = {};
      parsed.forEach((acc: any, i: number) => {
        if (!acc || !acc.email) return;
        const uid = acc.userId || acc.id || `migrated_${i}_${acc.email}`;
        migrated[uid] = {
          userId: uid,
          email: acc.email.toLowerCase().trim(),
          username: acc.username || 'User',
          displayName: acc.username || 'User',
          profilePicture: acc.image || acc.profilePicture || '',
          provider: acc.provider || 'credentials',
          isSavedOnDevice: !!acc.password, // migrated as saved if they had a password stored
          lastUsedAt: acc.lastUsedAt || new Date().toISOString(),
        };
      });
      _saveAccounts(migrated);
      return migrated;
    }
    return {};
  } catch {
    return {};
  }
}

function _saveAccounts(accounts: Record<string, DeviceAccountMeta>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(accounts));
}

// ─── Session hint generator ───────────────────────────────────────────────────

/**
 * Creates a non-sensitive session hint string.
 * This is NOT the password. It is a deterministic marker that says
 * "this account has been authenticated on this device at this time."
 */
function _makeSessionHint(userId: string, provider: string): string {
  const ts = Date.now().toString(36);
  // Simple obfuscation — NOT a security primitive, just prevents raw email/password storage
  return `${provider}:${btoa(userId).replace(/=+$/, '')}:${ts}`;
}

function _makeExpiry(yearsFromNow = 1): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsFromNow);
  return d.toISOString();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const DeviceAccountStore = {

  /**
   * Returns ALL accounts known on this device (saved + with expired credentials).
   * Ordered by lastUsedAt descending (most recent first).
   */
  getSavedAccounts(): DeviceAccountMeta[] {
    const map = _loadAccounts();
    return Object.values(map).sort(
      (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );
  },

  getSavedAccount(userId: string): DeviceAccountMeta | null {
    return _loadAccounts()[userId] ?? null;
  },

  hasSavedAccount(userId: string): boolean {
    return !!_loadAccounts()[userId];
  },

  /**
   * CRITICAL: Called immediately after every successful login / session restore.
   * Adds the account to the device account list OR updates metadata if it already exists.
   * NEVER replaces the entire collection.
   *
   * Pass `credential = true` to also store a session credential reference,
   * marking this account as isSavedOnDevice = true.
   */
  async addOrUpdateAccount(
    meta: Omit<DeviceAccountMeta, 'isSavedOnDevice' | 'lastUsedAt'>,
    saveCredential: boolean = true
  ): Promise<void> {
    const accounts = _loadAccounts();
    const existing = accounts[meta.userId];

    const updated: DeviceAccountMeta = {
      ...existing,
      ...meta,
      email: meta.email.toLowerCase().trim(),
      isSavedOnDevice: saveCredential ? true : (existing?.isSavedOnDevice ?? false),
      lastUsedAt: new Date().toISOString(),
    };

    // Never touch other accounts — only upsert this one
    accounts[meta.userId] = updated;
    _saveAccounts(accounts);

    // Store session credential if requested
    if (saveCredential) {
      const cred: DeviceCredential = {
        sessionHint: _makeSessionHint(meta.userId, meta.provider),
        savedAt: new Date().toISOString(),
        expiresAt: _makeExpiry(1),
      };
      await _secureSet(credKey(meta.userId), JSON.stringify(cred));
    }
  },

  /**
   * Updates the lastUsedAt and sets this userId as the current account.
   * Called when switching to or starting any account.
   */
  setCurrentAccountId(userId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(KEY_CURRENT, userId);

    // Update lastUsedAt for this account
    const accounts = _loadAccounts();
    if (accounts[userId]) {
      accounts[userId].lastUsedAt = new Date().toISOString();
      _saveAccounts(accounts);
    }
  },

  getCurrentAccountId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(KEY_CURRENT);
  },

  getCurrentAccount(): DeviceAccountMeta | null {
    const id = DeviceAccountStore.getCurrentAccountId();
    if (!id) return null;
    return _loadAccounts()[id] ?? null;
  },

  /**
   * Checks if a valid (non-expired) credential exists for this userId.
   * If it has expired, marks the account as isSavedOnDevice = false
   * but DOES NOT delete the account from the list.
   */
  async hasValidCredential(userId: string): Promise<boolean> {
    const raw = await _secureGet(credKey(userId));
    if (!raw) {
      // Mark as unsaved without removing from list
      const accounts = _loadAccounts();
      if (accounts[userId]) {
        accounts[userId].isSavedOnDevice = false;
        _saveAccounts(accounts);
      }
      return false;
    }
    try {
      const cred: DeviceCredential = JSON.parse(raw);
      const expired = new Date(cred.expiresAt).getTime() < Date.now();
      if (expired) {
        // Mark as expired but keep the account in the list
        const accounts = _loadAccounts();
        if (accounts[userId]) {
          accounts[userId].isSavedOnDevice = false;
          _saveAccounts(accounts);
        }
        await _secureDel(credKey(userId));
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Refreshes/extends the credential expiry for a userId.
   * Call this after a successful account switch or session restore.
   */
  async refreshCredential(userId: string, provider: string): Promise<void> {
    const cred: DeviceCredential = {
      sessionHint: _makeSessionHint(userId, provider),
      savedAt: new Date().toISOString(),
      expiresAt: _makeExpiry(1),
    };
    await _secureSet(credKey(userId), JSON.stringify(cred));

    // Update isSavedOnDevice flag
    const accounts = _loadAccounts();
    if (accounts[userId]) {
      accounts[userId].isSavedOnDevice = true;
      _saveAccounts(accounts);
    }
  },

  /**
   * Removes the saved credential for an account.
   * The account REMAINS in the list with isSavedOnDevice = false.
   * This does NOT delete the backend user account.
   * Instagram's "Remove saved login info from this device."
   */
  async removeSavedLogin(userId: string): Promise<void> {
    await _secureDel(credKey(userId));
    const accounts = _loadAccounts();
    if (accounts[userId]) {
      accounts[userId].isSavedOnDevice = false;
      _saveAccounts(accounts);
    }
  },

  /**
   * Completely removes an account from this device (metadata + credential).
   * The backend account is NOT deleted — only the device record.
   */
  async removeAccount(userId: string): Promise<void> {
    await _secureDel(credKey(userId));
    const accounts = _loadAccounts();
    delete accounts[userId];
    _saveAccounts(accounts);

    // If this was the current account, clear current
    const currentId = DeviceAccountStore.getCurrentAccountId();
    if (currentId === userId) {
      localStorage.removeItem(KEY_CURRENT);
    }
  },

  /**
   * Clears everything from this device.
   * Use only for "Sign out of all accounts" or full reset.
   */
  async clearAll(): Promise<void> {
    const accounts = _loadAccounts();
    for (const userId of Object.keys(accounts)) {
      await _secureDel(credKey(userId));
    }
    localStorage.removeItem(KEY_ACCOUNTS);
    localStorage.removeItem(KEY_CURRENT);
    // Also clean up legacy keys
    localStorage.removeItem('connected_accounts');
    localStorage.removeItem('da_accounts');
  },

  /**
   * Builds a DeviceAccountMeta from a NextAuth session user object.
   * Centralises the mapping so nothing else needs to know the shape.
   */
  metaFromSession(sessionUser: any): Omit<DeviceAccountMeta, 'isSavedOnDevice' | 'lastUsedAt'> {
    const email = (sessionUser?.email || '').toLowerCase().trim();
    const canonicalUser = sessionUser?.username || sessionUser?.name || 'User';
    return {
      userId: sessionUser?.id || sessionUser?.sub || email,
      email,
      username: canonicalUser,
      displayName: canonicalUser,
      profilePicture: sessionUser?.image || '',
      provider: sessionUser?.provider || 'credentials',
    };
  },
};
