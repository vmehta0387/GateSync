'use client';

import { getStoredSession } from '@/lib/auth';

export const SECURITY_API_BASE = 'https://api.gatesync.in/api/v1/security';

export type GuardLog = {
  id: number;
  action_type: 'Patrol' | 'Incident' | 'Mistake' | 'ShiftStart' | 'ShiftEnd';
  guard_id: number;
  guard_name: string;
  description: string;
  timestamp: string | null;
};

export type GuardShift = {
  id: number;
  society_id: number;
  security_staff_id: number | null;
  guard_user_id: number | null;
  guard_name: string;
  profile_photo_url: string;
  guard_login_phone: string;
  has_guard_login: boolean;
  shift_label: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: 'Scheduled' | 'OnDuty' | 'Completed' | 'Missed' | 'Cancelled';
  notes: string;
  created_by_name: string;
  created_at: string | null;
  updated_at: string | null;
};

export type SecurityIncident = {
  id: number;
  society_id: number;
  reported_by_user_id: number | null;
  reporter_name: string;
  assigned_guard_user_id: number | null;
  assigned_guard_name: string;
  title: string;
  category: 'Access' | 'Visitor' | 'Patrol' | 'Safety' | 'Equipment' | 'Emergency' | 'Other';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'InReview' | 'Resolved' | 'Closed';
  location: string;
  description: string;
  attachments: Array<{ file_name?: string; file_path: string; url?: string }>;
  resolution_note: string;
  related_visitor_log_id: number | null;
  occurred_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SecuritySummary = {
  total_guards: number;
  active_guard_profiles: number;
  guards_on_duty: number;
  shifts_today: number;
  missed_shifts: number;
  open_incidents: number;
  critical_incidents: number;
  mistakes_today: number;
  patrols_today: number;
};

export type SecurityGuard = {
  staff_id: number;
  guard_user_id: number | null;
  name: string;
  phone_number: string;
  guard_login_phone: string;
  profile_photo_url: string;
  shift_timing: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  has_guard_login: boolean;
  guard_status: string;
};

function getHeaders(includeJson = true): Record<string, string> {
  const { token } = getStoredSession();
  if (!token) {
    throw new Error('Authentication required');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export async function fetchSecurityJson<T>(path: string): Promise<T> {
  const response = await fetch(`${SECURITY_API_BASE}${path}`, {
    headers: getHeaders(false),
  });
  return response.json() as Promise<T>;
}

export async function postSecurityJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${SECURITY_API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<T>;
}

export async function putSecurityJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${SECURITY_API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<T>;
}

export async function uploadSecurityIncidentAttachment(file: File): Promise<{ success: boolean; file?: { file_name?: string; file_path: string; url?: string }; message?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${SECURITY_API_BASE}/upload/incident-attachment`, {
    method: 'POST',
    headers: getHeaders(false),
    body: formData,
  });

  return response.json();
}
