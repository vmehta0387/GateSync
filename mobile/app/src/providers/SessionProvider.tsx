import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setApiTokenGetter } from '../lib/api';
import { unregisterPushRegistration } from '../lib/notifications';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../lib/storage';
import { StoredSession } from '../types/auth';

type SessionContextValue = {
  hydrated: boolean;
  session: StoredSession | null;
  signIn: (nextSession: StoredSession) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = await readStoredSession();
      if (!cancelled) {
        setApiTokenGetter(() => stored?.token || null);
        setSession(stored);
        setHydrated(true);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setApiTokenGetter(() => session?.token || null);
  }, [session]);

  const value = useMemo<SessionContextValue>(() => ({
    hydrated,
    session,
    signIn: async (nextSession) => {
      setApiTokenGetter(() => nextSession.token || null);
      setSession(nextSession);
      await writeStoredSession(nextSession);
    },
    signOut: async () => {
      const currentSession = session;
      setApiTokenGetter(() => null);
      setSession(null);
      await unregisterPushRegistration(currentSession);
      await clearStoredSession();
    },
  }), [hydrated, session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return context;
}
