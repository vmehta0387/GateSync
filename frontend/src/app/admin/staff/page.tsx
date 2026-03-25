'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Ban,
  Clock3,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  Phone,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  UploadCloud,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';

type FlatOption = {
  id: number;
  block_name: string;
  flat_number: string;
  label: string;
};

type StaffMember = {
  id: number;
  type: string;
  assignment_scope: 'SOCIETY' | 'FLAT_SPECIFIC';
  linked_user_id: number | null;
  has_guard_login: boolean;
  linked_guard_status: string;
  name: string;
  phone: string;
  guard_login_phone: string;
  profile_photo_url: string;
  is_blacklisted: boolean;
  blacklist_reason: string;
  shift_timing: string;
  work_start_time: string;
  work_end_time: string;
  work_days: string[];
  allow_entry_without_approval: boolean;
  require_daily_approval: boolean;
  auto_entry_enabled: boolean;
  validity_start_date: string;
  validity_end_date: string;
  id_type: string;
  id_number: string;
  id_document_url: string;
  emergency_name: string;
  emergency_phone: string;
  resident_entry_notification: boolean;
  missed_visit_alerts: boolean;
  assigned_flats: FlatOption[];
  assigned_flat_ids: number[];
  total_visits: number;
  late_entries: number;
  active_log_id: number | null;
  active_entry_time: string | null;
  last_entry_time: string | null;
  last_exit_time: string | null;
  is_inside: boolean;
};

type StaffLog = {
  id: number;
  staff_id: number;
  name: string;
  type: string;
  phone: string;
  entry_time: string | null;
  exit_time: string | null;
  work_start_time: string | null;
  is_late: boolean;
};

type StaffMeta = {
  staff_types: string[];
  assignment_scopes: ('SOCIETY' | 'FLAT_SPECIFIC')[];
  id_types: string[];
  weekdays: string[];
  flats: FlatOption[];
};

type StaffFormData = {
  type: string;
  assignment_scope: 'SOCIETY' | 'FLAT_SPECIFIC';
  name: string;
  phone: string;
  guard_login_phone: string;
  profile_photo_url: string;
  assigned_flat_ids: number[];
  shift_timing: string;
  work_start_time: string;
  work_end_time: string;
  work_days: string[];
  allow_entry_without_approval: boolean;
  require_daily_approval: boolean;
  auto_entry_enabled: boolean;
  validity_start_date: string;
  validity_end_date: string;
  id_type: string;
  id_number: string;
  id_document_url: string;
  emergency_name: string;
  emergency_phone: string;
  is_blacklisted: boolean;
  blacklist_reason: string;
  resident_entry_notification: boolean;
  missed_visit_alerts: boolean;
};

const EMPTY_FORM: StaffFormData = {
  type: 'Maid',
  assignment_scope: 'FLAT_SPECIFIC',
  name: '',
  phone: '',
  guard_login_phone: '',
  profile_photo_url: '',
  assigned_flat_ids: [],
  shift_timing: '',
  work_start_time: '',
  work_end_time: '',
  work_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  allow_entry_without_approval: false,
  require_daily_approval: false,
  auto_entry_enabled: false,
  validity_start_date: '',
  validity_end_date: '',
  id_type: 'Aadhaar',
  id_number: '',
  id_document_url: '',
  emergency_name: '',
  emergency_phone: '',
  is_blacklisted: false,
  blacklist_reason: '',
  resident_entry_notification: true,
  missed_visit_alerts: true,
};

const API_BASE_URL = 'https://api.gatesync.in';

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatTime(value: string) {
  if (!value) return 'Not set';
  return value.slice(0, 5);
}

function getToken() {
  return localStorage.getItem('gatepulse_token');
}

function resolveMediaUrl(value: string) {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `${API_BASE_URL}${value}`;
}

function fileNameFromPath(value: string) {
  if (!value) return 'No file uploaded';
  return value.split('/').pop() || value;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

export default function StaffPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLogs, setStaffLogs] = useState<StaffLog[]>([]);
  const [meta, setMeta] = useState<StaffMeta>({ staff_types: [], assignment_scopes: ['SOCIETY', 'FLAT_SPECIFIC'], id_types: [], weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], flats: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStaffId, setActiveStaffId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [presenceFilter, setPresenceFilter] = useState<'ALL' | 'INSIDE' | 'OUTSIDE' | 'BLACKLISTED'>('ALL');
  const [logFilter, setLogFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffFormData>(EMPTY_FORM);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  const fetchMeta = useCallback(async () => {
    const token = getToken();
    const response = await fetch('https://api.gatesync.in/api/v1/staff/meta', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.success) {
      setMeta(data.meta);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    const token = getToken();
    const response = await fetch('https://api.gatesync.in/api/v1/staff', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.success) {
      setStaffList(data.staff);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    const token = getToken();
    const response = await fetch('https://api.gatesync.in/api/v1/staff/logs', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.success) {
      setStaffLogs(data.logs);
    }
  }, []);

  const refreshModule = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchMeta(), fetchStaff(), fetchLogs()]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [fetchLogs, fetchMeta, fetchStaff]);

  useEffect(() => {
    refreshModule();
  }, [refreshModule]);

  const stats = useMemo(() => ([
    {
      label: 'Total Staff',
      value: staffList.length,
      icon: Users,
      accent: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300',
    },
    {
      label: 'Inside Right Now',
      value: staffList.filter((staff) => staff.is_inside).length,
      icon: LogIn,
      accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300',
    },
    {
      label: 'Approval Required',
      value: staffList.filter((staff) => staff.require_daily_approval).length,
      icon: ShieldAlert,
      accent: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300',
    },
    {
      label: 'Blacklisted',
      value: staffList.filter((staff) => staff.is_blacklisted).length,
      icon: Ban,
      accent: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300',
    },
  ]), [staffList]);

  const filteredStaff = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return staffList.filter((staff) => {
      const matchesSearch = !query || [
        staff.name,
        staff.phone,
        staff.type,
        ...staff.assigned_flats.map((flat) => flat.label),
      ].some((value) => value.toLowerCase().includes(query));

      const matchesType = typeFilter === 'ALL' || staff.type === typeFilter;
      const matchesPresence = presenceFilter === 'ALL'
        || (presenceFilter === 'INSIDE' && staff.is_inside)
        || (presenceFilter === 'OUTSIDE' && !staff.is_inside && !staff.is_blacklisted)
        || (presenceFilter === 'BLACKLISTED' && staff.is_blacklisted);

      return matchesSearch && matchesType && matchesPresence;
    });
  }, [presenceFilter, searchTerm, staffList, typeFilter]);

  const filteredLogs = useMemo(() => (
    logFilter === 'ALL'
      ? staffLogs
      : staffLogs.filter((log) => String(log.staff_id) === logFilter)
  ), [logFilter, staffLogs]);

  const openCreateModal = () => {
    setEditingStaff(null);
    setForm({
      ...EMPTY_FORM,
      type: meta.staff_types[0] || EMPTY_FORM.type,
      assignment_scope: 'FLAT_SPECIFIC',
      id_type: meta.id_types[0] || EMPTY_FORM.id_type,
    });
    setShowModal(true);
  };

  const openEditModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setForm({
      type: staff.type,
      assignment_scope: staff.assignment_scope,
      name: staff.name,
      phone: staff.phone,
      guard_login_phone: staff.guard_login_phone,
      profile_photo_url: staff.profile_photo_url,
      assigned_flat_ids: staff.assigned_flat_ids,
      shift_timing: staff.shift_timing,
      work_start_time: staff.work_start_time,
      work_end_time: staff.work_end_time,
      work_days: staff.work_days,
      allow_entry_without_approval: staff.allow_entry_without_approval,
      require_daily_approval: staff.require_daily_approval,
      auto_entry_enabled: staff.auto_entry_enabled,
      validity_start_date: staff.validity_start_date,
      validity_end_date: staff.validity_end_date,
      id_type: staff.id_type || (meta.id_types[0] || 'Aadhaar'),
      id_number: staff.id_number,
      id_document_url: staff.id_document_url,
      emergency_name: staff.emergency_name,
      emergency_phone: staff.emergency_phone,
      is_blacklisted: staff.is_blacklisted,
      blacklist_reason: staff.blacklist_reason,
      resident_entry_notification: staff.resident_entry_notification,
      missed_visit_alerts: staff.missed_visit_alerts,
    });
    setShowModal(true);
  };

  const updateForm = <K extends keyof StaffFormData>(key: K, value: StaffFormData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleWorkDay = (day: string) => {
    setForm((current) => ({
      ...current,
      work_days: current.work_days.includes(day)
        ? current.work_days.filter((item) => item !== day)
        : [...current.work_days, day],
    }));
  };

  const toggleAssignedFlat = (flatId: number) => {
    setForm((current) => ({
      ...current,
      assigned_flat_ids: current.assigned_flat_ids.includes(flatId)
        ? current.assigned_flat_ids.filter((id) => id !== flatId)
        : [...current.assigned_flat_ids, flatId],
    }));
  };

  const uploadStaffAsset = async (file: File, kind: 'photo' | 'document') => {
    const token = getToken();
    const payload = new FormData();
    payload.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/v1/staff/upload/${kind}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: payload,
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || `Unable to upload ${kind}`);
    }

    return data.file.file_path as string;
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const uploadedPath = await uploadStaffAsset(file, 'photo');
      updateForm('profile_photo_url', uploadedPath);
    } catch (error) {
      console.error(error);
      alert('Unable to upload staff photo right now.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const handleDocumentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingDocument(true);
    try {
      const uploadedPath = await uploadStaffAsset(file, 'document');
      updateForm('id_document_url', uploadedPath);
    } catch (error) {
      console.error(error);
      alert('Unable to upload KYC document right now.');
    } finally {
      setUploadingDocument(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const token = getToken();
      const response = await fetch(
        editingStaff ? `https://api.gatesync.in/api/v1/staff/${editingStaff.id}` : 'https://api.gatesync.in/api/v1/staff',
        {
          method: editingStaff ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to save staff member');
        return;
      }

      setShowModal(false);
      setEditingStaff(null);
      setForm(EMPTY_FORM);
      await refreshModule();
    } catch (error) {
      console.error(error);
      alert('Unable to save staff member right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (staff: StaffMember) => {
    if (!confirm(`Remove ${staff.name} from GateSync staff records?`)) return;

    setActiveStaffId(staff.id);
    try {
      const token = getToken();
      const response = await fetch(`https://api.gatesync.in/api/v1/staff/${staff.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Unable to remove staff member');
        return;
      }

      await refreshModule();
    } catch (error) {
      console.error(error);
      alert('Unable to remove staff member right now.');
    } finally {
      setActiveStaffId(null);
    }
  };

  const handleToggleBlacklist = async (staff: StaffMember) => {
    const blacklistReason = staff.is_blacklisted
      ? ''
      : prompt(`Why are you blacklisting ${staff.name}?`, staff.blacklist_reason || 'Security concern') || '';

    setActiveStaffId(staff.id);
    try {
      const token = getToken();
      const response = await fetch(`https://api.gatesync.in/api/v1/staff/${staff.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...staff,
          assigned_flat_ids: staff.assigned_flat_ids,
          is_blacklisted: !staff.is_blacklisted,
          blacklist_reason: staff.is_blacklisted ? '' : blacklistReason,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Unable to update blacklist status');
        return;
      }

      await refreshModule();
    } catch (error) {
      console.error(error);
      alert('Unable to update blacklist status right now.');
    } finally {
      setActiveStaffId(null);
    }
  };

  const handleCheckIn = async (staff: StaffMember) => {
    setActiveStaffId(staff.id);
    try {
      const token = getToken();
      const response = await fetch('https://api.gatesync.in/api/v1/staff/log-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ staff_id: staff.id }),
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Unable to check staff in');
        return;
      }

      await refreshModule();
    } catch (error) {
      console.error(error);
      alert('Unable to check staff in right now.');
    } finally {
      setActiveStaffId(null);
    }
  };

  const handleCheckOut = async (staff: StaffMember) => {
    setActiveStaffId(staff.id);
    try {
      const token = getToken();
      const response = await fetch('https://api.gatesync.in/api/v1/staff/log-exit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ staff_id: staff.id }),
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Unable to check staff out');
        return;
      }

      await refreshModule();
    } catch (error) {
      console.error(error);
      alert('Unable to check staff out right now.');
    } finally {
      setActiveStaffId(null);
    }
  };

  const handleToggleGuardLogin = async (staff: StaffMember) => {
    if (staff.type !== 'Security') {
      return;
    }

    setActiveStaffId(staff.id);
    try {
      const token = getToken();
      const endpoint = staff.has_guard_login ? 'disable-guard-login' : 'enable-guard-login';
      const response = await fetch(`https://api.gatesync.in/api/v1/staff/${staff.id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Unable to update guard login access');
        return;
      }

      await refreshModule();
    } catch (error) {
      console.error(error);
      alert('Unable to update guard login right now.');
    } finally {
      setActiveStaffId(null);
    }
  };

  const openSecurityShift = (staff: StaffMember) => {
    const params = new URLSearchParams({
      tab: 'shifts',
      security_staff_id: String(staff.id),
    });

    if (staff.shift_timing) {
      params.set('shift_label', staff.shift_timing);
    }

    router.push(`/admin/security?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-slate-300">
            Staff Access & Operations
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Manage staff identity, flat assignment, access rules, validity, KYC, blacklist control, and attendance in one place.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-medium text-white shadow-lg shadow-brand-500/20 transition-colors hover:bg-brand-600"
        >
          <UserPlus className="h-4 w-4" />
          Add Staff Member
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="glass-panel rounded-2xl p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                <h3 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{loading ? '...' : stat.value}</h3>
              </div>
              <div className={`rounded-xl p-3 ${stat.accent}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, phone, type, or assigned flat..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="ALL">All staff types</option>
              {meta.staff_types.map((staffType) => (
                <option key={staffType} value={staffType}>
                  {staffType}
                </option>
              ))}
            </select>
            <select
              value={presenceFilter}
              onChange={(event) => setPresenceFilter(event.target.value as 'ALL' | 'INSIDE' | 'OUTSIDE' | 'BLACKLISTED')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="ALL">All statuses</option>
              <option value="INSIDE">Inside right now</option>
              <option value="OUTSIDE">Outside</option>
              <option value="BLACKLISTED">Blacklisted</option>
            </select>
            <select
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="ALL">All attendance logs</option>
              {staffList.map((staff) => (
                <option key={staff.id} value={String(staff.id)}>
                  {staff.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Staff Directory</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Every profile includes security identity, assigned flats, work schedule, entry policy, and attendance status.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {filteredStaff.length} records
          </span>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Assigned Flats</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium">Entry Rules</th>
                <th className="px-4 py-3 font-medium">Validity & KYC</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading staff module...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No staff records match the current filters.
                  </td>
                </tr>
              ) : filteredStaff.map((staff) => (
                <tr key={staff.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-4">
                    <div className="flex gap-3">
      {staff.profile_photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveMediaUrl(staff.profile_photo_url)}
                          alt={staff.name}
                          className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 font-semibold text-slate-500 dark:bg-slate-800">
                          {staff.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{staff.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="rounded-full bg-brand-50 px-2 py-1 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                            {staff.type}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {staff.phone}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {staff.is_blacklisted ? (
                            <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                              Blacklisted
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                              Active
                            </span>
                          )}
                          {staff.is_inside && (
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                              Inside now
                            </span>
                          )}
                          {staff.type === 'Security' && staff.has_guard_login && (
                            <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                              Guard login {staff.linked_guard_status === 'INACTIVE' ? 'inactive' : 'enabled'}
                            </span>
                          )}
                          {staff.type === 'Security' && staff.guard_login_phone && (
                            <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                              Login phone {staff.guard_login_phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {staff.assignment_scope === 'SOCIETY' ? (
                      <div className="space-y-1">
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                          Society-wide staff
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Common area or gate-level access across the whole society</p>
                      </div>
                    ) : staff.assigned_flats.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">No flats assigned yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {staff.assigned_flats.map((flat) => (
                          <span key={flat.id} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {flat.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {staff.work_start_time || staff.work_end_time
                          ? `${formatTime(staff.work_start_time)} - ${formatTime(staff.work_end_time)}`
                          : staff.shift_timing || 'Not set'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {staff.work_days.length > 0 ? staff.work_days.join(', ') : 'No working days set'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {staff.auto_entry_enabled && (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Auto-entry
                        </span>
                      )}
                      {staff.allow_entry_without_approval && (
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          No approval
                        </span>
                      )}
                      {staff.require_daily_approval && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          Daily approval
                        </span>
                      )}
                      {!staff.auto_entry_enabled && !staff.allow_entry_without_approval && !staff.require_daily_approval && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Manual review
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1 text-sm">
                      <p className="text-slate-800 dark:text-slate-200">
                        Valid: {staff.validity_start_date || 'Open'} to {staff.validity_end_date || 'Open'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {staff.id_type ? `${staff.id_type}: ${staff.id_number || 'No number'}` : 'KYC pending'}
                      </p>
                      {staff.id_document_url && (
                        <a
                          href={resolveMediaUrl(staff.id_document_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
                        >
                          View document
                        </a>
                      )}
                      {staff.blacklist_reason && (
                        <p className="text-xs text-rose-600 dark:text-rose-300">
                          Flag: {staff.blacklist_reason}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{staff.total_visits} total visits</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{staff.late_entries} late entries</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Last in: {formatDateTime(staff.last_entry_time)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Last out: {formatDateTime(staff.last_exit_time)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      {staff.is_inside ? (
                        <button
                          onClick={() => handleCheckOut(staff)}
                          disabled={activeStaffId === staff.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-500/10 dark:text-amber-300"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Check Out
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCheckIn(staff)}
                          disabled={activeStaffId === staff.id || staff.is_blacklisted}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-500/10 dark:text-emerald-300"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Check In
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(staff)}
                        className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        title="Edit staff profile"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openSecurityShift(staff)}
                        disabled={staff.type !== 'Security'}
                        className={`rounded-lg p-2 transition-colors ${
                          staff.type !== 'Security'
                            ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300'
                        }`}
                        title={staff.type !== 'Security' ? 'Only security staff can be scheduled in security roster' : 'Create security shift'}
                      >
                        <Clock3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleGuardLogin(staff)}
                        disabled={activeStaffId === staff.id || staff.type !== 'Security'}
                        className={`rounded-lg p-2 transition-colors ${
                          staff.type !== 'Security'
                            ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                            : staff.has_guard_login
                              ? 'bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300'
                              : 'bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300'
                        }`}
                        title={staff.type !== 'Security' ? 'Only security staff can use guard login' : staff.has_guard_login ? 'Disable guard login' : 'Enable guard login'}
                      >
                        <ShieldAlert className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleBlacklist(staff)}
                        disabled={activeStaffId === staff.id}
                        className={`rounded-lg p-2 transition-colors ${
                          staff.is_blacklisted
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300'
                        }`}
                        title={staff.is_blacklisted ? 'Remove blacklist' : 'Blacklist staff'}
                      >
                        {staff.is_blacklisted ? <BadgeCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(staff)}
                        disabled={activeStaffId === staff.id}
                        className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        title="Delete staff"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Attendance & Activity</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              GateSync tracks every entry, exit, total visit, and late arrival against the defined work schedule.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {filteredLogs.length} logs
          </span>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Entry Time</th>
                <th className="px-4 py-3 font-medium">Exit Time</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading attendance logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No attendance logs found yet.
                  </td>
                </tr>
              ) : filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{log.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{log.type} Â· {log.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDateTime(log.entry_time)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDateTime(log.exit_time)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{log.work_start_time ? `Start by ${formatTime(log.work_start_time)}` : 'No start time set'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {!log.exit_time && (
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          Inside
                        </span>
                      )}
                      {log.exit_time && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Completed
                        </span>
                      )}
                      {log.is_late && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          Late entry
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="relative max-h-[92vh] w-full max-w-6xl overflow-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
            >
              <button
                onClick={() => setShowModal(false)}
                className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-6 pr-12">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {editingStaff ? 'Edit Staff Profile' : 'Add Staff Member'}
                </h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Capture identity, access policy, schedule, validity, assigned flats, KYC, blacklist, and notification preferences.
                </p>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Basic Details" description="Core identity used at the gate for fast recognition and access control." />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Full name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="Mobile number" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <select value={form.type} onChange={(event) => updateForm('type', event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900">
                      {meta.staff_types.map((staffType) => <option key={staffType} value={staffType}>{staffType}</option>)}
                    </select>
                    <select
                      value={form.assignment_scope}
                      onChange={(event) => {
                        const nextScope = event.target.value as 'SOCIETY' | 'FLAT_SPECIFIC';
                        setForm((current) => ({
                          ...current,
                          assignment_scope: nextScope,
                          assigned_flat_ids: nextScope === 'SOCIETY' ? [] : current.assigned_flat_ids,
                        }));
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <option value="FLAT_SPECIFIC">Flat-specific staff</option>
                      <option value="SOCIETY">Society-wide staff</option>
                    </select>
                    {form.type === 'Security' ? (
                      <div className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/20 dark:bg-sky-500/10">
                        <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Guard Login Phone</p>
                        <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">Use a separate unique phone for guard OTP login if the staff member&apos;s main contact already belongs to a resident or admin.</p>
                        <input
                          value={form.guard_login_phone}
                          onChange={(event) => updateForm('guard_login_phone', event.target.value.replace(/\D/g, ''))}
                          placeholder="Optional separate login phone"
                          className="mt-3 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-sky-900/50 dark:bg-slate-900"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Profile Photo</p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{fileNameFromPath(form.profile_photo_url)}</p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          <UploadCloud className="h-3.5 w-3.5" />
                          {uploadingPhoto ? 'Uploading...' : 'Upload'}
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                        </label>
                      </div>
                      {form.profile_photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveMediaUrl(form.profile_photo_url)}
                          alt="Staff preview"
                          className="mt-3 h-24 w-24 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Assignment Scope" description="Use society-wide for security and common housekeeping staff. Use flat-specific for residents' personal staff." />
                  {form.assignment_scope === 'SOCIETY' ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                      This staff member belongs to the society as a whole. No flat assignment is required.
                    </div>
                  ) : meta.flats.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No flats are available in this society yet.</p>
                  ) : (
                    <div className="grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
                      {meta.flats.map((flat) => (
                        <label key={flat.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${form.assigned_flat_ids.includes(flat.id) ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}>
                          <input type="checkbox" checked={form.assigned_flat_ids.includes(flat.id)} onChange={() => toggleAssignedFlat(flat.id)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                          <span>{flat.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Working Schedule" description="Used for gate operations, late-entry detection, and daily staff monitoring." />
                  <div className="grid gap-3 md:grid-cols-3">
                    <input value={form.shift_timing} onChange={(event) => updateForm('shift_timing', event.target.value)} placeholder="Shift label" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <input type="time" value={form.work_start_time} onChange={(event) => updateForm('work_start_time', event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <input type="time" value={form.work_end_time} onChange={(event) => updateForm('work_end_time', event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {meta.weekdays.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWorkDay(day)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${form.work_days.includes(day) ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Entry Rules" description="Define whether the person can enter freely, needs approval, or qualifies for trusted auto-entry." />
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={form.allow_entry_without_approval} onChange={(event) => updateForm('allow_entry_without_approval', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                      Allowed entry without approval
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={form.require_daily_approval} onChange={(event) => updateForm('require_daily_approval', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                      Require resident approval every day
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={form.auto_entry_enabled} onChange={(event) => updateForm('auto_entry_enabled', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                      Auto-entry for trusted staff
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Validity Period" description="Keep temporary staff under control and expire old permissions automatically." />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input type="date" value={form.validity_start_date} onChange={(event) => updateForm('validity_start_date', event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <input type="date" value={form.validity_end_date} onChange={(event) => updateForm('validity_end_date', event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Verification / KYC" description="Capture government ID details for compliance and security verification." />
                  <div className="grid gap-3 md:grid-cols-3">
                    <select value={form.id_type} onChange={(event) => updateForm('id_type', event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900">
                      {meta.id_types.map((idType) => <option key={idType} value={idType}>{idType}</option>)}
                    </select>
                    <input value={form.id_number} onChange={(event) => updateForm('id_number', event.target.value)} placeholder="ID number" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Document Upload</p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{fileNameFromPath(form.id_document_url)}</p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                          <UploadCloud className="h-3.5 w-3.5" />
                          {uploadingDocument ? 'Uploading...' : 'Upload'}
                          <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleDocumentUpload} disabled={uploadingDocument} />
                        </label>
                      </div>
                      {form.id_document_url && (
                        <a
                          href={resolveMediaUrl(form.id_document_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View uploaded document
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Emergency Contact" description="Needed when a staff incident happens inside the society." />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={form.emergency_name} onChange={(event) => updateForm('emergency_name', event.target.value)} placeholder="Emergency contact name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                    <input value={form.emergency_phone} onChange={(event) => updateForm('emergency_phone', event.target.value)} placeholder="Emergency contact phone" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Blacklist / Flagging" description="Blacklisted staff are blocked from entry and clearly highlighted to admin and gate teams." />
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={form.is_blacklisted} onChange={(event) => updateForm('is_blacklisted', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                      Mark this staff member as blacklisted
                    </label>
                    <textarea value={form.blacklist_reason} onChange={(event) => updateForm('blacklist_reason', event.target.value)} placeholder="Blacklist reason" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900" />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <SectionTitle title="Notifications" description="Control which staff events should notify residents or trigger follow-up alerts." />
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={form.resident_entry_notification} onChange={(event) => updateForm('resident_entry_notification', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                      Notify resident on entry
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
                      <input type="checkbox" checked={form.missed_visit_alerts} onChange={(event) => updateForm('missed_visit_alerts', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                      Missed visit alerts
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
                <button onClick={() => setShowModal(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900">
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={saving} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60">
                  {saving ? 'Saving...' : editingStaff ? 'Update Staff Profile' : 'Create Staff Profile'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
