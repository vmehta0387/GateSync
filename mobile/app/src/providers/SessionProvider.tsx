import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBiometricSupport, promptForBiometricUnlock } from '../lib/biometrics';
import { setApiTokenGetter } from '../lib/api';
import { unregisterPushRegistration } from '../lib/notifications';
import { clearStoredSession, readBiometricSettings, readStoredSession, writeStoredSession } from '../lib/storage';
import { StoredSession } from '../types/auth';

type SessionContextValue = {
  hydrated: boolean;
  session: StoredSession | null;
  biometricLocked: boolean;
  biometricLabel: string;
  signIn: (nextSession: StoredSession) => Promise<void>;
  signOut: () => Promise<void>;
  unlockSavedSession: () => Promise<boolean>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = await readStoredSession();
      const biometricSettings = await readBiometricSettings();
      const support = await getBiometricSupport();

      if (!cancelled) {
        setBiometricLabel(support.label);
      }

      if (!stored) {
        if (!cancelled) {
          setApiTokenGetter(() => null);
          setSession(null);
          setBiometricLocked(false);
          setHydrated(true);
        }
        return;
      }

      if (biometricSettings.enabled && support.available) {
        const unlocked = await promptForBiometricUnlock(support.label);
        if (!cancelled) {
          if (unlocked) {
            setApiTokenGetter(() => stored.token || null);
            setSession(stored);
            setBiometricLocked(false);
          } else {
            setApiTokenGetter(() => null);
            setSession(null);
            setBiometricLocked(true);
          }
          setHydrated(true);
        }
        return;
      }

      if (!cancelled) {
        setApiTokenGetter(() => stored?.token || null);
        setSession(stored);
        setBiometricLocked(false);
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
    biometricLocked,
    biometricLabel,
    signIn: async (nextSession) => {
      setApiTokenGetter(() => nextSession.token || null);
      setSession(nextSession);
      setBiometricLocked(false);
      await writeStoredSession(nextSession);
    },
    signOut: async () => {
      const currentSession = session;
      const biometricSettings = await readBiometricSettings();
      const support = await getBiometricSupport();

      setApiTokenGetter(() => null);
      setSession(null);
      await unregisterPushRegistration(currentSession);

      if (biometricSettings.enabled && support.available) {
        setBiometricLabel(support.label);
        setBiometricLocked(true);
        return;
      }

      setBiometricLocked(false);
      await clearStoredSession();
    },
    unlockSavedSession: async () => {
      const stored = await readStoredSession();
      if (!stored) {
        return false;
      }

      const support = await getBiometricSupport();
      setBiometricLabel(support.label);
      if (!support.available) {
        return false;
      }

      const unlocked = await promptForBiometricUnlock(support.label);
      if (!unlocked) {
        return false;
      }

      setApiTokenGetter(() => stored.token || null);
      setSession(stored);
      setBiometricLocked(false);
      return true;
    },
  }), [biometricLabel, biometricLocked, hydrated, session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return context;
}
