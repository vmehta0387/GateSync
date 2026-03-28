import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  socketUrl?: string;
  frontendBaseUrl?: string;
};

const defaultBaseUrl = Platform.select({
  android: 'http://10.0.2.2:5000',
  default: 'http://localhost:5000',
});

export const API_BASE_URL = extra.apiBaseUrl || defaultBaseUrl || 'http://localhost:5000';
export const SOCKET_URL = extra.socketUrl || API_BASE_URL;
export const FRONTEND_BASE_URL = (extra.frontendBaseUrl || 'https://gatesync.in').replace(/\/+$/, '');
