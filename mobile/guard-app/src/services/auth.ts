import { api, getApiErrorMessage } from '../lib/api';
import { AuthResponse, StoredSession } from '../types/auth';

export async function sendOtp(phoneNumber: string) {
  try {
    const response = await api.post<AuthResponse>('/auth/send-otp', {
      phone_number: phoneNumber,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to send OTP right now.'),
    } satisfies AuthResponse;
  }
}

export async function verifyOtp(phoneNumber: string, otp: string) {
  try {
    const response = await api.post<AuthResponse>('/auth/verify-otp', {
      phone_number: phoneNumber,
      otp,
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, 'Unable to verify OTP right now.'),
    } satisfies AuthResponse;
  }
}

export function buildStoredSession(response: AuthResponse): StoredSession | null {
  if (!response.success || !response.token || !response.user) {
    return null;
  }

  if (response.user.role !== 'GUARD') {
    return null;
  }

  return {
    token: response.token,
    user: response.user,
  };
}
