import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/env';
import { api, getApiErrorMessage } from './api';
import {
  clearPushRegistration,
  getOrCreateInstallationId,
  readPushRegistration,
  writePushRegistration,
} from './storage';
import { StoredSession } from '../types/auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type PushSyncResult = {
  success: boolean;
  message?: string;
  token?: string;
};

function isExpoGoEnvironment() {
  return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
}

function resolveProjectId() {
  const extraProjectId = Constants.expoConfig?.extra?.projectId;
  const easProjectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  const projectId = easProjectId || extraProjectId;

  if (!projectId || String(projectId).startsWith('REPLACE_WITH_')) {
    return null;
  }

  return String(projectId);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function getExpoPushToken() {
  if (isExpoGoEnvironment()) {
    return {
      success: false,
      message: 'Remote push notifications are not available in Expo Go. Use a development build to test push.',
    } satisfies PushSyncResult;
  }

  if (!Device.isDevice) {
    return { success: false, message: 'Push notifications require a physical device.' } satisfies PushSyncResult;
  }

  await ensureAndroidChannel();

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return { success: false, message: 'Push notification permission was not granted.' } satisfies PushSyncResult;
  }

  const projectId = resolveProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return { success: true, token: tokenResponse.data } satisfies PushSyncResult;
}

export async function syncPushRegistration(session: StoredSession | null): Promise<PushSyncResult> {
  if (!session || !['RESIDENT', 'GUARD'].includes(session.user.role)) {
    return { success: false, message: 'Push registration is only enabled for resident and guard roles.' };
  }

  try {
    const tokenResult = await getExpoPushToken();
    if (!tokenResult.success || !tokenResult.token) {
      return tokenResult;
    }

    const installationId = await getOrCreateInstallationId();
    const existingRegistration = await readPushRegistration();
    if (
      existingRegistration?.expoPushToken === tokenResult.token &&
      existingRegistration.userId === session.user.id &&
      existingRegistration.installationId === installationId
    ) {
      return { success: true, token: tokenResult.token };
    }

    await api.post<{ success: boolean; message?: string }>('/auth/push-token', {
      expo_push_token: tokenResult.token,
      installation_id: installationId,
      platform: Platform.OS,
      app_role: session.user.role,
      device_name: Device.deviceName || Device.modelName || `${Device.osName || 'Mobile'} ${Device.osVersion || ''}`.trim(),
    });

    await writePushRegistration({
      expoPushToken: tokenResult.token,
      installationId,
      userId: session.user.id,
    });

    return { success: true, token: tokenResult.token };
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to register push notifications right now.'),
    };
  }
}

export async function unregisterPushRegistration(session: StoredSession | null) {
  const registration = await readPushRegistration();
  if (!registration) {
    return;
  }

  if (!session?.token) {
    await clearPushRegistration();
    return;
  }

  try {
    await fetch(`${API_BASE_URL}/api/v1/auth/push-token`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        installation_id: registration.installationId,
        expo_push_token: registration.expoPushToken,
      }),
    });
  } catch {
    // Swallow network errors on sign-out cleanup.
  } finally {
    await clearPushRegistration();
  }
}
