import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/apiClient';
import type { PublicUser, StatusResponse, TrialInfo } from '../types/user';
import type { SubscriptionPlan } from '../shared/pricing';

const ENABLE_DEV_LOGIN = import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true';
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID || undefined;
const DEV_USER_NAME = import.meta.env.VITE_DEV_USER_NAME || undefined;
const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || undefined;

interface UserContextValue {
  user: PublicUser | null;
  plans: SubscriptionPlan[];
  razorpayKeyId?: string;
  isLoading: boolean;
  error?: string;
  initialize: () => Promise<void>;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  startTrial: () => Promise<TrialInfo>;
  storeTrialGuards: (userId: string, trial: TrialInfo) => void;
  setUserData: (user: PublicUser | null) => void;
  devLoginAvailable: boolean;
  devLogin?: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const TRIAL_STORAGE_KEY_PREFIX = 'trial-info';

const buildTrialStorageKey = (userId: string) => `${TRIAL_STORAGE_KEY_PREFIX}:${userId}`;

const setTrialCookie = (userId: string, expiresAt: number) => {
  const expiresDate = new Date(expiresAt).toUTCString();
  document.cookie = `${TRIAL_STORAGE_KEY_PREFIX}=${userId}:${expiresAt}; expires=${expiresDate}; path=/; SameSite=Lax`;
};

const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [razorpayKeyId, setRazorpayKeyId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | undefined>();

  const storeTrialGuards = useCallback((userId: string, trial: TrialInfo) => {
    const key = buildTrialStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(trial));
    setTrialCookie(userId, trial.expiresAt);
  }, []);

  const setUserData = useCallback((next: PublicUser | null) => {
    setUser(next);
    if (next?.trial) {
      storeTrialGuards(next.userId, next.trial);
    }
  }, [storeTrialGuards]);

  const applyStatus = useCallback((data: StatusResponse) => {
    setUserData(data.user);
    setPlans(data.plans);
    setRazorpayKeyId(data.razorpayKeyId);
    setError(undefined);
    if (data.user?.trial) {
      storeTrialGuards(data.user.userId, data.user.trial);
    }
  }, [setUserData, storeTrialGuards]);

  const hydrateStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<StatusResponse>('/status');
      applyStatus(data);
    } catch (err) {
      setError((err as Error).message);
      setUserData(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyStatus, setUserData]);

  useEffect(() => {
    void hydrateStatus();
  }, [hydrateStatus]);

  const login = useCallback(async (credential: string) => {
    setIsLoading(true);
    try {
      const data = await apiFetch<StatusResponse, { credential: string }>('/auth/google', {
        method: 'POST',
        body: { credential }
      });
      applyStatus(data);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applyStatus]);

  const devLogin = useCallback(async () => {
    if (!ENABLE_DEV_LOGIN) {
      throw new Error('Dev login disabled');
    }
    setIsLoading(true);
    try {
      const data = await apiFetch<StatusResponse, { userId?: string; name?: string; email?: string }>('/auth/dev-login', {
        method: 'POST',
        body: {
          userId: DEV_USER_ID,
          name: DEV_USER_NAME,
          email: DEV_USER_EMAIL
        }
      });
      applyStatus(data);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applyStatus]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      setUserData(null);
    }
  }, [setUserData]);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    await hydrateStatus();
  }, [hydrateStatus]);

  const startTrial = useCallback(async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    const result = await apiFetch<{ trial: TrialInfo }>('/subscription/start-trial', {
      method: 'POST'
    });
    setUser((prev) => prev ? { ...prev, trial: result.trial } : prev);
    storeTrialGuards(user.userId, result.trial);
    return result.trial;
  }, [user, storeTrialGuards]);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    await hydrateStatus();
  }, [hydrateStatus]);

  const value = useMemo(() => ({
    user,
    plans,
    razorpayKeyId,
    isLoading,
    error,
    initialize,
    login,
    logout,
    refreshStatus,
    startTrial,
    storeTrialGuards,
    setUserData,
    devLoginAvailable: ENABLE_DEV_LOGIN,
    devLogin: ENABLE_DEV_LOGIN ? devLogin : undefined
  }), [
    user,
    plans,
    razorpayKeyId,
    isLoading,
    error,
    initialize,
    login,
    logout,
    refreshStatus,
    startTrial,
    storeTrialGuards,
    setUserData,
    devLogin
  ]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
};

export default UserProvider;

