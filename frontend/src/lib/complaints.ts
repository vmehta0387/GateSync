'use client';

import { getStoredSession } from '@/lib/auth';

export const COMPLAINTS_API_BASE = 'http://localhost:5000/api/v1/complaints';

export type ComplaintCategory = {
  id: number;
  name: string;
  description: string;
  default_priority: 'Low' | 'Medium' | 'High';
  sla_hours: number;
  is_default: boolean;
  is_active: boolean;
};

export type ComplaintSummaryItem = {
  id: number;
  ticket_id: string;
  flat_id: number;
  block_name: string;
  flat_number: string;
  resident_name: string;
  category_id: number | null;
  category_name: string;
  description: string;
  attachments: Array<{ file_name?: string; file_path: string }>;
  status: 'Open' | 'InProgress' | 'OnHold' | 'Resolved' | 'Closed';
  priority: 'Low' | 'Medium' | 'High';
  sla_deadline: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  escalation_level: number;
  escalated_to_type: 'Admin' | 'Committee' | null;
  escalated_to_user_id: number | null;
  escalated_to_committee_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  is_overdue: boolean;
  is_mine: boolean;
  assigned_summary: string;
};

export type ComplaintAssignee = {
  id: number;
  assignee_type: 'User' | 'Staff' | 'Committee';
  user_id: number | null;
  staff_id: number | null;
  committee_id: number | null;
  is_primary: boolean;
  name: string;
  role_label: string;
  assigned_at: string | null;
};

export type ComplaintMessage = {
  id: number;
  sender_type: 'Resident' | 'Admin' | 'Staff' | 'System';
  sender_name: string;
  message: string;
  attachments: Array<{ file_name?: string; file_path: string }>;
  created_at: string | null;
};

export type ComplaintHistory = {
  id: number;
  status: string;
  note: string;
  changed_by_name: string;
  created_at: string | null;
};

export type ComplaintDetailResponse = {
  success: boolean;
  complaint: ComplaintSummaryItem;
  assignees: ComplaintAssignee[];
  messages: ComplaintMessage[];
  history: ComplaintHistory[];
  recurring_count: number;
};

export type ComplaintDashboardSummary = {
  open_tickets: number;
  overdue_tickets: number;
  total_tickets: number;
  success_rate: string;
  category_breakdown: Array<{ label: string; total: number }>;
  staff_performance: Array<{ name: string; type: string; total_assigned: number; resolved_count: number }>;
};

function getHeaders(includeJson = true) {
  const { token } = getStoredSession();
  if (!token) {
    throw new Error('Authentication required');
  }

  return includeJson
    ? ({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      } as Record<string, string>)
    : ({
        Authorization: `Bearer ${token}`,
      } as Record<string, string>);
}

export async function fetchComplaintsJson<T>(path: string): Promise<T> {
  const response = await fetch(`${COMPLAINTS_API_BASE}${path}`, {
    headers: getHeaders(false),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { success: false, message: error.message || 'Server error' } as unknown as T;
  }
  return response.json() as Promise<T>;
}

export async function postComplaintsJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${COMPLAINTS_API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { success: false, message: error.message || 'Server error' } as unknown as T;
  }
  return response.json() as Promise<T>;
}

export async function putComplaintsJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${COMPLAINTS_API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { success: false, message: error.message || 'Server error' } as unknown as T;
  }
  return response.json() as Promise<T>;
}

export async function deleteComplaintsJson<T>(path: string): Promise<T> {
  const response = await fetch(`${COMPLAINTS_API_BASE}${path}`, {
    method: 'DELETE',
    headers: getHeaders(false),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { success: false, message: error.message || 'Server error' } as unknown as T;
  }
  return response.json() as Promise<T>;
}

export async function uploadComplaintAttachment(file: File): Promise<{ success: boolean; file?: { file_name?: string; file_path: string }; message?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${COMPLAINTS_API_BASE}/upload/attachment`, {
    method: 'POST',
    headers: getHeaders(false),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { success: false, message: error.message || 'Upload failed' };
  }

  return response.json();
}
