'use client';

import { getStoredSession } from '@/lib/auth';

export const COMMITTEES_API_BASE = 'http://localhost:5000/api/v1/committees';

export type CommitteeTemplate = {
  key: string;
  label: string;
  description: string;
  default_roles: string[];
};

export type CommitteeCandidate = {
  id: number;
  name: string;
  phone_number: string;
  email: string | null;
  role: string;
  block_name: string;
  flat_number: string;
};

export type CommitteeSummary = {
  id: number;
  committee_type: string;
  name: string;
  description: string;
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string | null;
  created_by_name: string;
  member_count: number;
  open_task_count: number;
  live_vote_count: number;
  document_count: number;
};

export type CommitteeMember = {
  id?: number;
  user_id: number;
  name?: string;
  phone_number?: string;
  email?: string | null;
  user_role?: string;
  role_title: string;
  permission_scope: string;
  permissions?: Record<string, boolean>;
  tenure_start_date: string | null;
  tenure_end_date: string | null;
  is_primary_contact: boolean;
  status?: string;
};

export type CommitteeMessage = {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_role_title: string;
  content: string;
  attachments: Array<{ file_name?: string; file_path: string }>;
  is_decision_log: boolean;
  created_at: string | null;
};

export type CommitteeTask = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string | null;
  assigned_member_id: number | null;
  assigned_to_name: string | null;
  assigned_role_title: string | null;
};

export type CommitteeVote = {
  id: number;
  title: string;
  description: string;
  decision_type: string;
  status: string;
  closes_at: string | null;
  created_at: string | null;
  created_by_name: string;
  selected_option_id: number | null;
  options: Array<{ id: number; option_text: string; response_count: number }>;
};

export type CommitteeDocument = {
  id: number;
  title: string;
  category: string;
  file_url: string;
  uploaded_by_name: string;
  created_at: string | null;
};

export type CommitteeDetail = {
  committee: CommitteeSummary;
  members: CommitteeMember[];
  messages: CommitteeMessage[];
  tasks: CommitteeTask[];
  votes: CommitteeVote[];
  documents: CommitteeDocument[];
};

function getHeaders(includeJson = true) {
  const { token } = getStoredSession();
  if (!token) {
    throw new Error('Authentication required');
  }

  return includeJson
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    : {
        Authorization: `Bearer ${token}`,
      };
}

export async function fetchCommitteesJson<T>(path: string): Promise<T> {
  const response = await fetch(`${COMMITTEES_API_BASE}${path}`, {
    headers: getHeaders(false),
  });
  return response.json() as Promise<T>;
}

export async function postCommitteesJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${COMMITTEES_API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<T>;
}

export async function putCommitteesJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${COMMITTEES_API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<T>;
}

export async function patchCommitteesJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${COMMITTEES_API_BASE}${path}`, {
    method: 'PATCH',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });
  return response.json() as Promise<T>;
}
