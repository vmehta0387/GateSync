export type ResidentFlat = {
  flat_id: number;
  type: string;
  block_name: string;
  flat_number: string;
};

export type VisitorType = 'Guest' | 'Delivery' | 'Cab' | 'Service' | 'Unknown';

export type VisitorLog = {
  id: number;
  visitor_id: number;
  visitor_name: string;
  visitor_phone: string;
  visitor_photo_url: string;
  block_name: string;
  flat_number: string;
  flat_id: number;
  purpose: VisitorType;
  visitor_type: VisitorType;
  status: 'Approved' | 'CheckedIn' | 'CheckedOut' | 'Pending' | 'Denied';
  passcode: string | null;
  entry_method?: string;
  expected_time: string | null;
  entry_time: string | null;
  exit_time: string | null;
  approval_requested_at?: string | null;
  delivery_company?: string;
  vehicle_number?: string;
  contactless_delivery?: boolean;
  is_watchlisted?: boolean;
  watchlist_reason?: string;
};

export type VisitorPassPayload = {
  name: string;
  phone_number: string;
  purpose: VisitorType;
  flat_id: number;
  expected_time?: string | null;
  delivery_company?: string | null;
  vehicle_number?: string | null;
  contactless_delivery?: boolean;
};

export type Invoice = {
  id: number;
  flat_id: number;
  block_name: string;
  flat_number: string;
  amount: string;
  month_year: string;
  status: 'Paid' | 'Unpaid';
  due_date: string | null;
};

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
  attachments: Array<{ file_name?: string; file_path: string; url?: string }>;
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
  attachments: Array<{ file_name?: string; file_path: string; url?: string }>;
  created_at: string | null;
};

export type ComplaintHistory = {
  id: number;
  status: string;
  note: string;
  changed_by_name: string;
  created_at: string | null;
};

export type ComplaintDetail = {
  complaint: ComplaintSummaryItem;
  assignees: ComplaintAssignee[];
  messages: ComplaintMessage[];
  history: ComplaintHistory[];
  recurring_count: number;
};

export type ComplaintPayload = {
  flat_id: number;
  category_id: number;
  priority: 'Low' | 'Medium' | 'High';
  description: string;
  attachments: Array<{ file_name?: string; file_path: string; url?: string }>;
};

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

export type BookingPayload = {
  facility_id: number;
  guest_count: number;
  notes: string;
  start_time: string;
  end_time: string;
};

export type CommitteeMember = {
  id: number;
  user_id: number;
  name: string;
  phone_number: string;
  email: string;
  user_role: string;
  role_title: string;
  permission_scope: string;
  permissions: Record<string, boolean>;
  tenure_start_date: string | null;
  tenure_end_date: string | null;
  is_primary_contact: boolean;
  status: string;
};

export type CommitteeDirectoryItem = {
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
  members: CommitteeMember[];
};

export type NoticeItem = {
  id: number;
  title: string;
  content: string;
  notice_type: string;
  audience_type?: string;
  audience_filters?: Record<string, unknown>;
  attachments?: Array<{ file_name?: string; file_path: string; url?: string }>;
  publish_at?: string | null;
  published_at?: string | null;
  is_pinned?: boolean;
  requires_read_receipt?: boolean;
  status?: string;
  created_at?: string | null;
  created_by_name?: string;
  read_count?: number;
};

export type SharedDocument = {
  id: number;
  title: string;
  description: string;
  category: string;
  file_url: string;
  target_scope?: string;
  is_pinned?: boolean;
  created_at?: string | null;
  created_by_name?: string;
};

export type ResidentStaffDirectoryItem = {
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
