export type VisitorLog = {
  id: number;
  visitor_id: number;
  visitor_name: string;
  visitor_phone: string;
  visitor_photo_url: string;
  block_name: string;
  flat_number: string;
  flat_id: number;
  purpose: 'Guest' | 'Delivery' | 'Cab' | 'Service' | 'Unknown';
  visitor_type: 'Guest' | 'Delivery' | 'Cab' | 'Service' | 'Unknown';
  status: 'Approved' | 'CheckedIn' | 'CheckedOut' | 'Pending' | 'Denied';
  passcode: string | null;
  entry_method?: string;
  expected_time: string | null;
  entry_time: string | null;
  exit_time?: string | null;
  delivery_company?: string;
  vehicle_number?: string;
  approval_requested_at?: string | null;
  is_watchlisted?: boolean;
  watchlist_reason?: string;
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
  occurred_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StaffMember = {
  id: number;
  type: string;
  assignment_scope: 'SOCIETY' | 'FLAT_SPECIFIC';
  name: string;
  phone: string;
  profile_photo_url: string;
  is_blacklisted: boolean;
  blacklist_reason: string;
  shift_timing: string;
  work_start_time: string;
  work_end_time: string;
  assigned_flats: Array<{ id: number; block_name: string; flat_number: string; label: string }>;
  total_visits: number;
  late_entries: number;
  active_log_id: number | null;
  active_entry_time: string | null;
  last_entry_time: string | null;
  last_exit_time: string | null;
  is_inside: boolean;
};

export type FlatOption = {
  id: number;
  block_name: string;
  flat_number: string;
  label: string;
};

export type WalkInPayload = {
  name: string;
  phone_number: string;
  purpose: 'Guest' | 'Delivery' | 'Cab' | 'Service' | 'Unknown';
  block_name: string;
  flat_number: string;
  flat_ids?: number[];
  delivery_company?: string;
  vehicle_number?: string;
  visitor_photo_url?: string;
};

export type IncidentPayload = {
  title: string;
  category: SecurityIncident['category'];
  severity: SecurityIncident['severity'];
  location: string;
  description: string;
  attachments: Array<{ file_name?: string; file_path: string; url?: string }>;
};
