export type SessionUser = {
  id: number;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'GUARD' | 'RESIDENT';
  phone_number: string;
  society_id: number | null;
};

export type StoredSession = {
  token: string;
  user: SessionUser;
};

export type AuthResponse = {
  success: boolean;
  message?: string;
  token?: string;
  user?: SessionUser;
};
