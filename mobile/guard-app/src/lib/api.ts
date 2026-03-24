import axios from 'axios';
import { API_BASE_URL } from '../config/env';

let tokenGetter: (() => string | null) | null = null;

export function setApiTokenGetter(getToken: () => string | null) {
  tokenGetter = getToken;
}

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = tokenGetter?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message || fallback;
  }

  return fallback;
}
