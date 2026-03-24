import * as SecureStore from 'expo-secure-store';
import { StoredSession } from '../types/auth';

const SESSION_KEY = 'gatesync_mobile_session';
const INSTALLATION_ID_KEY = 'gatesync_mobile_installation_id';
const PUSH_REGISTRATION_KEY = 'gatesync_mobile_push_registration';

type PushRegistration = {
  expoPushToken: string;
  installationId: string;
  userId: number;
};

export async function readStoredSession() {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function writeStoredSession(session: StoredSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

function createInstallationId() {
  return `gs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextValue = createInstallationId();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, nextValue);
  return nextValue;
}

export async function readPushRegistration() {
  const raw = await SecureStore.getItemAsync(PUSH_REGISTRATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PushRegistration;
  } catch {
    return null;
  }
}

export async function writePushRegistration(registration: PushRegistration) {
  await SecureStore.setItemAsync(PUSH_REGISTRATION_KEY, JSON.stringify(registration));
}

export async function clearPushRegistration() {
  await SecureStore.deleteItemAsync(PUSH_REGISTRATION_KEY);
}
