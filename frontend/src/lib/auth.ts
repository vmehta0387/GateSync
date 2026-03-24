import { useSyncExternalStore } from 'react';

export type GateSyncRole = 'SUPERADMIN' | 'ADMIN' | 'MANAGER' | 'GUARD' | 'RESIDENT';

export type StoredUser = {
  id: number;
  name?: string;
  role: GateSyncRole;
  phone_number: string;
  society_id: number | null;
  society_name?: string;
};

const subscribe = () => () => {};

export function useClientReady() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function getStoredSession(): { token: string | null; user: StoredUser | null } {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  const token = localStorage.getItem('gatepulse_token');
  const rawUser = localStorage.getItem('gatepulse_user');

  if (!token || !rawUser) {
    return { token: null, user: null };
  }

  try {
    return { token, user: JSON.parse(rawUser) as StoredUser };
  } catch {
    return { token: null, user: null };
  }
}

export function clearStoredSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('gatepulse_token');
    localStorage.removeItem('gatepulse_user');
  }
}
