'use client';

import { getStoredSession } from '@/lib/auth';

export const COMMUNICATION_API_BASE = 'https://api.gatesync.in/api/v1/communication';

export type InboxItem = {
  item_type: string;
  id: number;
  title: string;
  created_at: string;
  priority_label: string;
};

export type ResidentTarget = {
  id: number;
  name: string;
  phone_number: string;
  block_name: string;
  flat_number: string;
};

export type CommitteeTarget = {
  id: number;
  name: string;
  committee_type: string;
};

export type UploadedFile = {
  file_name: string;
  file_path: string;
};

export type NoticeItem = {
  id: number;
  title: string;
  content: string;
  notice_type: string;
  audience_type: string;
  status: string;
  read_count: number;
  is_pinned: boolean;
};

export type ConversationItem = {
  resident_id: number;
  resident_name: string;
  resident_phone: string;
  block_name: string;
  flat_number: string;
  last_message: string;
  unread_count: number;
};

export type ThreadMessage = {
  id: number;
  sender_id: number;
  subject: string;
  content: string;
  created_at: string | null;
};

export type PollItem = {
  id: number;
  title: string;
  response_count: number;
  options: Array<{ option_text: string }>;
};

export type EventItem = {
  id: number;
  title: string;
  venue: string;
  start_at: string | null;
  rsvp_summary?: {
    Going?: number;
    Maybe?: number;
    NotGoing?: number;
  };
};

export type DocumentItem = {
  id: number;
  title: string;
  category: string;
  target_scope: string;
  file_url: string;
};

export type CommunicationHub = {
  overview: {
    notice_count: number;
    unread_messages: number;
    urgent_items: number;
    active_polls: number;
    scheduled_events: number;
    document_count: number;
  };
  inbox: InboxItem[];
  targets: {
    towers: string[];
    residents: ResidentTarget[];
    committees: CommitteeTarget[];
    segments: {
      occupancy_types: string[];
      audience_types: string[];
      notice_types: string[];
    };
  };
};

export const emptyHub: CommunicationHub = {
  overview: {
    notice_count: 0,
    unread_messages: 0,
    urgent_items: 0,
    active_polls: 0,
    scheduled_events: 0,
    document_count: 0,
  },
  inbox: [],
  targets: {
    towers: [],
    residents: [],
    committees: [],
    segments: {
      occupancy_types: ['Owner', 'Tenant', 'Family', 'Co-owner'],
      audience_types: ['AllResidents', 'Tower', 'Flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers'],
      notice_types: ['General', 'Urgent', 'Event', 'Maintenance', 'Emergency'],
    },
  },
};

export function getCommunicationHeaders() {
  const { token } = getStoredSession();
  return token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    : null;
}

export async function fetchCommunicationJson<T>(path: string): Promise<T> {
  const headers = getCommunicationHeaders();
  if (!headers) {
    return { success: false, message: 'Authentication required' } as unknown as T;
  }

  try {
    const response = await fetch(`${COMMUNICATION_API_BASE}${path}`, {
      headers: {
        Authorization: headers.Authorization,
      },
    });
    
    if (!response.ok) {
      return { success: false, message: `API Error ${response.status}` } as unknown as T;
    }

    return await response.json() as Promise<T>;
  } catch (error) {
    console.warn(`[Network Error] Failed to GET ${path}:`, error);
    return { success: false, message: 'Backend unreachable' } as unknown as T;
  }
}

export async function postCommunicationJson<T>(path: string, payload: object): Promise<T> {
  const headers = getCommunicationHeaders();
  if (!headers) {
    return { success: false, message: 'Authentication required' } as unknown as T;
  }

  try {
    const response = await fetch(`${COMMUNICATION_API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, message: `API Error ${response.status}` } as unknown as T;
    }

    return await response.json() as Promise<T>;
  } catch (error) {
    console.warn(`[Network Error] Failed to POST ${path}:`, error);
    return { success: false, message: 'Backend unreachable' } as unknown as T;
  }
}

export async function uploadCommunicationAttachment(file: File): Promise<{ success: boolean; file?: UploadedFile; message?: string }> {
  const headers = getCommunicationHeaders();
  if (!headers) {
    return { success: false, message: 'Authentication required' };
  }

  const payload = new FormData();
  payload.append('file', file);

  try {
    const response = await fetch(`${COMMUNICATION_API_BASE}/upload/attachment`, {
      method: 'POST',
      headers: {
        Authorization: headers.Authorization,
      },
      body: payload,
    });

    if (!response.ok) {
      return { success: false, message: `API Error ${response.status}` };
    }

    return await response.json();
  } catch (error) {
    console.warn(`[Network Error] Failed to upload attachment:`, error);
    return { success: false, message: 'Backend unreachable' };
  }
}

export function buildAudienceFilters(audienceType: string, tower: string, occupancyType: string, committeeIds: number[] = []) {
  if (audienceType === 'Tower' && tower) {
    return { blocks: [tower] };
  }

  if (audienceType === 'Occupancy' && occupancyType) {
    return { occupancy_types: [occupancyType] };
  }

  if (audienceType === 'Committee' && committeeIds.length > 0) {
    return { committee_ids: committeeIds };
  }

  return {};
}
