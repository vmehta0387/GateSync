'use client';

import { getStoredSession } from '@/lib/auth';

export const FACILITIES_API_BASE = 'http://localhost:5000/api/v1/facilities';

export type Facility = {
  id: number;
  society_id: number;
  name: string;
  type: string;
  description: string;
  capacity: number;
  rules: string;
  max_booking_hours: number;
  advance_booking_days: number;
  cancellation_hours: number;
  pricing: number;
  is_paid: boolean;
  is_active: boolean;
  created_at: string | null;
  upcoming_bookings: number;
  confirmed_guests_today: number;
  maintenance_blocks: number;
};

export type FacilityBooking = {
  id: number;
  society_id: number;
  facility_id: number;
  facility_name: string;
  facility_type: string;
  user_id: number;
  user_name: string;
  user_phone: string;
  guest_count: number;
  total_amount: number;
  payment_status: 'NotRequired' | 'Pending' | 'Paid' | 'Failed';
  notes: string;
  start_time: string | null;
  end_time: string | null;
  status: 'Confirmed' | 'Cancelled' | 'Rejected' | 'Completed';
  cancelled_at: string | null;
  created_at: string | null;
  flat_summary: string;
  is_cancellable: boolean;
};

export type FacilityMaintenanceBlock = {
  id: number;
  facility_id: number;
  facility_name: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
  created_by_name: string;
  created_at: string | null;
};

export type FacilitySummary = {
  total_facilities: number;
  active_facilities: number;
  upcoming_bookings: number;
  active_now: number;
  scheduled_maintenance: number;
  revenue_generated: number;
  top_facilities: Array<{ id: number; name: string; total_bookings: number; revenue: number }>;
  peak_hours: Array<{ hour_label: string; total: number }>;
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

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function fetchFacilitiesJson<T>(path: string): Promise<T> {
  const response = await fetch(`${FACILITIES_API_BASE}${path}`, {
    headers: getHeaders(false),
  });

  return readJson<T>(response);
}

export async function postFacilitiesJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${FACILITIES_API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });

  return readJson<T>(response);
}

export async function putFacilitiesJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(`${FACILITIES_API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(payload),
  });

  return readJson<T>(response);
}

export async function deleteFacilitiesJson<T>(path: string): Promise<T> {
  const response = await fetch(`${FACILITIES_API_BASE}${path}`, {
    method: 'DELETE',
    headers: getHeaders(false),
  });

  return readJson<T>(response);
}
