import { API_BASE_URL } from '../config/env';

let tokenGetter: (() => string | null) | null = null;

type RequestConfig = {
  headers?: Record<string, string>;
};

type ApiResponse<T> = {
  data: T;
};

type ApiErrorShape = {
  message?: string;
  status?: number;
  data?: unknown;
};

class ApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function setApiTokenGetter(getToken: () => string | null) {
  tokenGetter = getToken;
}

function isFormDataLike(value: unknown) {
  return !!value && typeof value === 'object' && 'append' in (value as Record<string, unknown>);
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  config?: RequestConfig,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(config?.headers || {}),
  };

  const token = tokenGetter?.();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    if (isFormDataLike(body)) {
      if (headers['Content-Type']) {
        delete headers['Content-Type'];
      }
      init.body = body as BodyInit;
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      init.body = JSON.stringify(body);
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, init);
  const text = await response.text();
  const data = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in data && typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Request failed with status ${response.status}`);
    throw new ApiError(message, response.status, data);
  }

  return { data: data as T };
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const api = {
  get: <T>(path: string, config?: RequestConfig) => request<T>('GET', path, undefined, config),
  post: <T>(path: string, body?: unknown, config?: RequestConfig) => request<T>('POST', path, body, config),
  put: <T>(path: string, body?: unknown, config?: RequestConfig) => request<T>('PUT', path, body, config),
  delete: <T>(path: string, config?: RequestConfig) => request<T>('DELETE', path, undefined, config),
};

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof (error as ApiErrorShape).message === 'string') {
    return (error as ApiErrorShape).message || fallback;
  }

  return fallback;
}
