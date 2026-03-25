'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock3, ScanLine, Search, ShieldCheck, UploadCloud, UserPlus } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import { subscribeToSecurityLiveUpdates, subscribeToVisitorLiveUpdates } from '@/lib/socket';
import { type GuardShift, type SecurityIncident, fetchSecurityJson, postSecurityJson, uploadSecurityIncidentAttachment } from '@/lib/security';

type VisitorLog = {
  id: number;
  visitor_id: number;
  visitor_name: string;
  visitor_phone: string;
  visitor_photo_url: string;
  block_name: string;
  flat_number: string;
  flat_id: number;
  purpose: string;
  status: 'Approved' | 'CheckedIn' | 'CheckedOut' | 'Pending' | 'Denied';
  passcode: string | null;
  expected_time: string | null;
  entry_time: string | null;
  exit_time?: string | null;
  delivery_company?: string;
  vehicle_number?: string;
  entry_method?: string;
  approval_requested_at?: string | null;
  is_watchlisted?: boolean;
  watchlist_reason?: string;
};

const initialAdHocForm = {
  name: '',
  phone_number: '',
  purpose: 'Guest',
  block_name: '',
  flat_number: '',
  delivery_company: '',
  vehicle_number: '',
  visitor_photo_url: '',
};

const initialIncidentForm = {
  title: '',
  category: 'Visitor',
  severity: 'Medium',
  location: '',
  description: '',
  attachments: [] as Array<{ file_name?: string; file_path: string; url?: string }>,
};

const API_BASE_URL = 'https://api.gatesync.in';

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">{text}</p>;
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return 'Schedule pending';
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleString()} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function GuardDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'visitors' | 'incidents'>('overview');
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [passcode, setPasscode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [adHocLoading, setAdHocLoading] = useState(false);
  const [adHocForm, setAdHocForm] = useState(initialAdHocForm);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [shifts, setShifts] = useState<GuardShift[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [incidentForm, setIncidentForm] = useState(initialIncidentForm);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [uploadingIncidentFile, setUploadingIncidentFile] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    const { token } = getStoredSession();
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch('https://api.gatesync.in/api/v1/visitors/logs?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    const [shiftsData, incidentsData] = await Promise.all([
      fetchSecurityJson<{ success: boolean; shifts: GuardShift[] }>('/shifts'),
      fetchSecurityJson<{ success: boolean; incidents: SecurityIncident[] }>('/incidents'),
    ]);

    if (shiftsData.success) setShifts(shiftsData.shifts || []);
    if (incidentsData.success) setIncidents(incidentsData.incidents || []);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchLogs();
      void loadSecurity();
    }, 0);
    const intervalId = window.setInterval(() => {
      void fetchLogs();
      void loadSecurity();
    }, 60000);

    return () => {
      window.clearTimeout(handle);
      window.clearInterval(intervalId);
    };
  }, [fetchLogs, loadSecurity]);

  useEffect(() => {
    const { user } = getStoredSession();
    if (!user?.society_id) return;

    const cleanupVisitor = subscribeToVisitorLiveUpdates([`society_${user.society_id}_guards`], () => {
      void fetchLogs();
    });

    const cleanupSecurity = subscribeToSecurityLiveUpdates([`society_${user.society_id}_security`], () => {
      void loadSecurity();
    });

    return () => {
      cleanupVisitor();
      cleanupSecurity();
    };
  }, [fetchLogs, loadSecurity]);

  const approvedArrivals = logs.filter((log) => log.status === 'Approved');
  const activeVisitors = logs.filter((log) => log.status === 'CheckedIn');
  const checkedOutVisitors = logs.filter((log) => log.status === 'CheckedOut');

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return logs;

    return logs.filter((log) => {
      const haystack = [
        log.visitor_name,
        log.visitor_phone,
        log.block_name,
        log.flat_number,
        log.passcode || '',
        log.status,
      ].join(' ').toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [logs, search]);

  const activeShift = shifts.find((shift) => shift.status === 'OnDuty') || null;
  const upcomingShift = shifts.find((shift) => shift.status === 'Scheduled') || null;
  const openIncidents = incidents.filter((incident) => incident.status === 'Open' || incident.status === 'InReview');

  const handlePasscodeCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { token } = getStoredSession();
    if (!token) return;

    setScanLoading(true);
    try {
      const response = await fetch('https://api.gatesync.in/api/v1/visitors/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ passcode: passcode.trim().toUpperCase() }),
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Passcode was not accepted');
        return;
      }

      setPasscode('');
      await fetchLogs();
    } catch (error) {
      console.error(error);
      alert('Unable to reach the server right now.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleAdHocCheckIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { token } = getStoredSession();
    if (!token) return;

    setAdHocLoading(true);
    try {
      const response = await fetch('https://api.gatesync.in/api/v1/visitors/walk-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(adHocForm),
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to log this visitor');
        return;
      }

      alert(data.approval_required
        ? (data.sms_fallback?.sent
            ? `Resident approval request sent. SMS fallback delivered to ${data.sms_fallback.sent} resident contact(s).`
            : 'Resident approval request sent.')
        : 'Visitor logged successfully.');
      setAdHocForm(initialAdHocForm);
      await fetchLogs();
    } catch (error) {
      console.error(error);
      alert('Unable to reach the server right now.');
    } finally {
      setAdHocLoading(false);
    }
  };

  const handleCheckOut = async (logId: number) => {
    const { token } = getStoredSession();
    if (!token) return;

    try {
      const response = await fetch('https://api.gatesync.in/api/v1/visitors/check-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ log_id: logId }),
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to check the visitor out');
        return;
      }

      await fetchLogs();
    } catch (error) {
      console.error(error);
      alert('Unable to reach the server right now.');
    }
  };

  const handleApprovedCheckIn = async (logId: number) => {
    const { token } = getStoredSession();
    if (!token) return;

    try {
      const response = await fetch('https://api.gatesync.in/api/v1/visitors/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ log_id: logId }),
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to check this visitor in');
        return;
      }

      await fetchLogs();
    } catch (error) {
      console.error(error);
      alert('Unable to reach the server right now.');
    }
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const { token } = getStoredSession();
    if (!token) return;

    setUploadingPhoto(true);
    try {
      const payload = new FormData();
      payload.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/v1/visitors/upload/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      });
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Unable to upload visitor photo');
        return;
      }

      setAdHocForm((current) => ({ ...current, visitor_photo_url: data.file.file_path }));
    } catch (error) {
      console.error(error);
      alert('Unable to upload visitor photo right now.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  };

  const logQuickActivity = async (action_type: 'Patrol' | 'Mistake') => {
    setActivityLoading(true);
    try {
      const data = await postSecurityJson<{ success: boolean; message?: string }>('/activity', {
        action_type,
        description: activityNote,
      });
      if (!data.success) {
        alert(data.message || 'Unable to log activity');
        return;
      }
      setActivityNote('');
      await loadSecurity();
    } finally {
      setActivityLoading(false);
    }
  };

  const startShift = async () => {
    if (!upcomingShift) return;
    const data = await postSecurityJson<{ success: boolean; message?: string }>(`/shifts/${upcomingShift.id}/start`, {});
    if (!data.success) {
      alert(data.message || 'Unable to start shift');
      return;
    }
    await loadSecurity();
  };

  const endShift = async () => {
    if (!activeShift) return;
    const data = await postSecurityJson<{ success: boolean; message?: string }>(`/shifts/${activeShift.id}/end`, {});
    if (!data.success) {
      alert(data.message || 'Unable to end shift');
      return;
    }
    await loadSecurity();
  };

  const uploadIncidentFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingIncidentFile(true);
    try {
      const data = await uploadSecurityIncidentAttachment(file);
      if (!data.success || !data.file) {
        alert(data.message || 'Unable to upload incident evidence');
        return;
      }
      setIncidentForm((current) => ({ ...current, attachments: [...current.attachments, data.file!] }));
    } finally {
      setUploadingIncidentFile(false);
      event.target.value = '';
    }
  };

  const submitIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIncidentLoading(true);
    try {
      const data = await postSecurityJson<{ success: boolean; message?: string }>('/incidents', incidentForm);
      if (!data.success) {
        alert(data.message || 'Unable to report incident');
        return;
      }
      setIncidentForm(initialIncidentForm);
      await loadSecurity();
    } finally {
      setIncidentLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-slate-300">
          Security Terminal
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Handle visitor flow, track your duty shift, and report incidents without leaving the gate screen.</p>
      </div>

      <div className="glass-panel rounded-2xl p-2">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'visitors', label: 'Visitors' },
            { id: 'incidents', label: 'Incidents' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as 'overview' | 'visitors' | 'incidents')}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm font-medium text-slate-500">Current Shift</p>
          <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{activeShift ? activeShift.shift_label : upcomingShift ? upcomingShift.shift_label : 'No shift assigned'}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {activeShift ? formatDateRange(activeShift.scheduled_start, activeShift.scheduled_end) : upcomingShift ? `Next: ${formatDateRange(upcomingShift.scheduled_start, upcomingShift.scheduled_end)}` : 'Admin has not scheduled a duty window yet.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {activeShift ? <button onClick={() => void endShift()} className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-600">End Duty</button> : null}
            {!activeShift && upcomingShift ? <button onClick={() => void startShift()} className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600">Start Duty</button> : null}
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm font-medium text-slate-500">Security Snapshot</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-slate-500">Open Incidents</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{openIncidents.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-slate-500">Awaiting Arrival</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{approvedArrivals.length}</p>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm font-medium text-slate-500">Quick Guard Log</p>
          <textarea value={activityNote} onChange={(event) => setActivityNote(event.target.value)} placeholder="Checkpoint done, gate mismatch, suspicious movement..." className="mt-4 h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <div className="mt-4 flex gap-3">
            <button disabled={activityLoading} onClick={() => void logQuickActivity('Patrol')} className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">Log Patrol</button>
            <button disabled={activityLoading} onClick={() => void logQuickActivity('Mistake')} className="flex-1 rounded-2xl border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/20 disabled:opacity-60">Log Mistake</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          { label: 'Awaiting Arrival', value: approvedArrivals.length, icon: Clock3, tone: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
          { label: 'Inside Campus', value: activeVisitors.length, icon: ShieldCheck, tone: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Checked Out', value: checkedOutVisitors.length, icon: CheckCircle2, tone: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel flex items-center justify-between rounded-2xl p-5">
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{loading ? '...' : stat.value}</p>
            </div>
            <div className={`rounded-xl p-3 ${stat.bg} ${stat.tone}`}>
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <div className="glass-panel rounded-3xl p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Open Security Incidents</h3>
          <div className="mt-4 space-y-3">
            {openIncidents.slice(0, 5).map((incident) => (
              <div key={incident.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{incident.title}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{incident.category} / {incident.location || 'Security zone'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${incident.severity === 'Critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : incident.severity === 'High' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {incident.severity}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{incident.description}</p>
              </div>
            ))}
            {!openIncidents.length ? <EmptyText text="No open incidents right now." /> : null}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold">Visitor Movement Snapshot</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {filteredLogs.length} records
            </span>
          </div>
          <div className="space-y-3">
            {filteredLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{log.visitor_name}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{log.block_name}-{log.flat_number} / {log.purpose}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${log.status === 'CheckedIn' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : log.status === 'Pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : log.status === 'Approved' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {log.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{log.entry_time ? new Date(log.entry_time).toLocaleString() : log.expected_time ? new Date(log.expected_time).toLocaleString() : 'Walk-in'}</p>
              </div>
            ))}
            {!filteredLogs.length ? <EmptyText text="No recent visitor movement available." /> : null}
          </div>
        </div>
      </div>
        </>
      ) : null}

      {activeTab === 'visitors' ? (
        <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          { label: 'Awaiting Arrival', value: approvedArrivals.length, icon: Clock3, tone: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
          { label: 'Inside Campus', value: activeVisitors.length, icon: ShieldCheck, tone: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Checked Out', value: checkedOutVisitors.length, icon: CheckCircle2, tone: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel flex items-center justify-between rounded-2xl p-5">
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{loading ? '...' : stat.value}</p>
            </div>
            <div className={`rounded-xl p-3 ${stat.bg} ${stat.tone}`}>
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handlePasscodeCheckIn} className="rounded-3xl bg-brand-600 p-8 text-white shadow-xl shadow-brand-500/20">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
            <ScanLine className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-bold">Scan Passcode</h2>
          <p className="mb-6 mt-2 text-brand-100">Check in a visitor who already has a resident-issued gate pass.</p>
          <input value={passcode} onChange={(event) => setPasscode(event.target.value.toUpperCase())} placeholder="GP000123" className="w-full rounded-2xl px-4 py-3 font-semibold text-slate-900 outline-none" required />
          <button type="submit" disabled={scanLoading} className="mt-4 w-full rounded-2xl bg-slate-950/20 py-3 font-semibold hover:bg-slate-950/30 disabled:opacity-60">
            {scanLoading ? 'Checking In...' : 'Check In With Passcode'}
          </button>
        </motion.form>

        <motion.form initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} onSubmit={handleAdHocCheckIn} className="glass-panel rounded-3xl border border-brand-200 p-8 dark:border-brand-900">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-brand-500 dark:bg-slate-800">
            <UserPlus className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">New Walk-In Visitor</h2>
          <p className="mb-6 mt-2 text-slate-500">Log a walk-in guest when there is no pre-approved pass yet.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input value={adHocForm.name} onChange={(event) => setAdHocForm({ ...adHocForm, name: event.target.value })} placeholder="Visitor Name" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" required />
            <input value={adHocForm.phone_number} onChange={(event) => setAdHocForm({ ...adHocForm, phone_number: event.target.value.replace(/\D/g, '') })} placeholder="Phone Number" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" maxLength={10} required />
            <select value={adHocForm.purpose} onChange={(event) => setAdHocForm({ ...adHocForm, purpose: event.target.value })} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900">
              <option value="Guest">Guest</option>
              <option value="Delivery">Delivery</option>
              <option value="Cab">Cab</option>
              <option value="Service">Service</option>
              <option value="Unknown">Unknown</option>
            </select>
            <input value={adHocForm.block_name} onChange={(event) => setAdHocForm({ ...adHocForm, block_name: event.target.value })} placeholder="Tower / Block" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" required />
            <input value={adHocForm.flat_number} onChange={(event) => setAdHocForm({ ...adHocForm, flat_number: event.target.value })} placeholder="Flat Number" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 md:col-span-2 dark:border-slate-800 dark:bg-slate-900" required />
            <input value={adHocForm.vehicle_number} onChange={(event) => setAdHocForm({ ...adHocForm, vehicle_number: event.target.value.toUpperCase() })} placeholder="Vehicle Number (optional)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" />
            {adHocForm.purpose === 'Delivery' ? <input value={adHocForm.delivery_company} onChange={(event) => setAdHocForm({ ...adHocForm, delivery_company: event.target.value })} placeholder="Delivery Company" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" /> : null}
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${adHocForm.purpose === 'Delivery' ? 'md:col-span-2' : ''}`}>
              <UploadCloud className="h-4 w-4" />
              {uploadingPhoto ? 'Uploading photo...' : adHocForm.visitor_photo_url ? 'Photo uploaded' : 'Upload visitor photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>
          <button type="submit" disabled={adHocLoading} className="mt-4 w-full rounded-2xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {adHocLoading ? 'Logging Visitor...' : 'Log Walk-In Visitor'}
          </button>
        </motion.form>
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-bold">Visitor Movement</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="text" placeholder="Search visitor, phone, flat, passcode..." className="w-72 rounded-lg border-none bg-slate-100 py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-brand-500 dark:bg-slate-800" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800">
                <th className="pb-3 font-semibold">Visitor</th>
                <th className="pb-3 font-semibold">Flat</th>
                <th className="pb-3 font-semibold">Purpose</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Passcode / Vehicle</th>
                <th className="pb-3 font-semibold">Arrival / Entry</th>
                <th className="pb-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan={7} className="py-6 text-center text-slate-500">Loading visitor logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-slate-500">No visitor entries match the current search.</td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-900/50">
                    <td className="py-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{log.visitor_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{log.visitor_phone}</div>
                    </td>
                    <td className="py-4 text-slate-500">{log.block_name}-{log.flat_number}</td>
                    <td className="py-4 text-slate-700 dark:text-slate-300">{log.purpose}</td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${log.status === 'CheckedIn' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : log.status === 'Pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : log.status === 'Approved' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {log.status}
                        </span>
                        {log.is_watchlisted ? <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">Watchlist</span> : null}
                      </div>
                    </td>
                    <td className="py-4 text-xs text-slate-500">
                      <div className="space-y-1">
                        <p className="font-mono">{log.passcode || 'Walk-in'}</p>
                        <p>{log.vehicle_number || 'No vehicle'}</p>
                      </div>
                    </td>
                    <td className="py-4 text-slate-500">
                      <div className="space-y-1">
                        <p>{log.entry_time ? new Date(log.entry_time).toLocaleString() : log.expected_time ? new Date(log.expected_time).toLocaleString() : 'Walk-in'}</p>
                        {log.delivery_company ? <p className="text-xs">{log.delivery_company}</p> : null}
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      {log.status === 'CheckedIn' ? <button onClick={() => void handleCheckOut(log.id)} className="font-semibold text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300">Check Out</button> : null}
                      {log.status === 'Approved' ? <button onClick={() => void handleApprovedCheckIn(log.id)} className="font-semibold text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300">Check In</button> : null}
                      {log.status === 'Pending' ? <span className="font-medium text-orange-500">Waiting approval</span> : null}
                      {log.status !== 'CheckedIn' && log.status !== 'Approved' && log.status !== 'Pending' ? <span className="text-slate-400">No action</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : null}

      {activeTab === 'incidents' ? (
        <>
      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <form onSubmit={submitIncident} className="glass-panel rounded-3xl p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Report Incident</h2>
            <p className="mt-2 text-slate-500 dark:text-slate-400">Capture suspicious activity, access issues, and security incidents with evidence.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input value={incidentForm.title} onChange={(event) => setIncidentForm({ ...incidentForm, title: event.target.value })} placeholder="Incident title" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" required />
            <input value={incidentForm.location} onChange={(event) => setIncidentForm({ ...incidentForm, location: event.target.value })} placeholder="Location" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900" />
            <select value={incidentForm.category} onChange={(event) => setIncidentForm({ ...incidentForm, category: event.target.value })} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900">
              {['Access', 'Visitor', 'Patrol', 'Safety', 'Equipment', 'Emergency', 'Other'].map((option) => <option key={option}>{option}</option>)}
            </select>
            <select value={incidentForm.severity} onChange={(event) => setIncidentForm({ ...incidentForm, severity: event.target.value })} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-800 dark:bg-slate-900">
              {['Low', 'Medium', 'High', 'Critical'].map((option) => <option key={option}>{option}</option>)}
            </select>
            <textarea value={incidentForm.description} onChange={(event) => setIncidentForm({ ...incidentForm, description: event.target.value })} placeholder="What happened, who was involved, and what action has been taken so far?" className="h-32 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 md:col-span-2 dark:border-slate-800 dark:bg-slate-900" required />
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600 md:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <UploadCloud className="h-4 w-4" />
              {uploadingIncidentFile ? 'Uploading evidence...' : incidentForm.attachments.length ? `${incidentForm.attachments.length} file(s) attached` : 'Upload incident evidence'}
              <input type="file" className="hidden" onChange={uploadIncidentFile} disabled={uploadingIncidentFile} />
            </label>
          </div>
          <button type="submit" disabled={incidentLoading} className="mt-4 w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 disabled:opacity-60">
            {incidentLoading ? 'Reporting Incident...' : 'Report Incident'}
          </button>
        </form>

        <div className="glass-panel rounded-3xl p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Open Security Incidents</h3>
            <span className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{openIncidents.length} active</span>
          </div>
          <div className="mt-4 space-y-3">
            {openIncidents.slice(0, 6).map((incident) => (
              <div key={incident.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{incident.title}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{incident.category} / {incident.location || 'Security zone'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${incident.severity === 'Critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : incident.severity === 'High' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {incident.severity}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{incident.description}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Status: {incident.status} / Assigned: {incident.assigned_guard_name || 'Pending admin review'}</p>
              </div>
            ))}
            {!openIncidents.length ? <EmptyText text="No open incidents right now." /> : null}
          </div>
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
