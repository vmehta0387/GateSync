'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Clock3, ShieldCheck, Siren, Users, Wrench } from 'lucide-react';
import {
  type GuardLog,
  type GuardShift,
  type SecurityGuard,
  type SecurityIncident,
  type SecuritySummary,
  fetchSecurityJson,
  postSecurityJson,
  putSecurityJson,
} from '@/lib/security';
import { getStoredSession } from '@/lib/auth';
import { subscribeToSecurityLiveUpdates } from '@/lib/socket';

function getInitialShiftForm() {
  if (typeof window === 'undefined') {
    return {
      security_staff_id: '',
      shift_label: 'Day Shift',
      scheduled_start: '',
      scheduled_end: '',
      notes: '',
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    security_staff_id: params.get('security_staff_id') || '',
    shift_label: params.get('shift_label') || 'Day Shift',
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
  };
}

const INITIAL_SHIFT_FORM = {
  security_staff_id: '',
  shift_label: 'Day Shift',
  scheduled_start: '',
  scheduled_end: '',
  notes: '',
};

const INITIAL_INCIDENT_UPDATE = {
  incident_id: 0,
  assigned_guard_user_id: '',
  status: 'Open',
  resolution_note: '',
};

export default function SecurityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = getStoredSession();
  const initialTab = (searchParams.get('tab') as 'overview' | 'shifts' | 'incidents' | 'activity' | null) || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'shifts' | 'incidents' | 'activity'>(initialTab);
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [guards, setGuards] = useState<SecurityGuard[]>([]);
  const [logs, setLogs] = useState<GuardLog[]>([]);
  const [shifts, setShifts] = useState<GuardShift[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [shiftForm, setShiftForm] = useState(getInitialShiftForm);
  const [incidentUpdate, setIncidentUpdate] = useState(INITIAL_INCIDENT_UPDATE);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const activeGuardOptions = useMemo(
    () => guards.filter((guard) => guard.has_guard_login && guard.guard_status === 'ACTIVE'),
    [guards],
  );

  const loadSecurity = useCallback(async () => {
    const [summaryData, metaData, logsData, shiftsData, incidentsData] = await Promise.all([
      fetchSecurityJson<{ success: boolean; summary: SecuritySummary }>('/summary'),
      fetchSecurityJson<{ success: boolean; guards: SecurityGuard[] }>('/meta'),
      fetchSecurityJson<{ success: boolean; logs: GuardLog[] }>('/logs'),
      fetchSecurityJson<{ success: boolean; shifts: GuardShift[] }>('/shifts'),
      fetchSecurityJson<{ success: boolean; incidents: SecurityIncident[] }>('/incidents'),
    ]);

    if (summaryData.success) setSummary(summaryData.summary);
    if (metaData.success) setGuards(metaData.guards || []);
    if (logsData.success) setLogs(logsData.logs || []);
    if (shiftsData.success) setShifts(shiftsData.shifts || []);
    if (incidentsData.success) {
      const nextIncidents = incidentsData.incidents || [];
      setIncidents(nextIncidents);
      if (!incidentUpdate.incident_id && nextIncidents.length) {
        const first = nextIncidents[0];
        setIncidentUpdate({
          incident_id: first.id,
          assigned_guard_user_id: first.assigned_guard_user_id ? String(first.assigned_guard_user_id) : '',
          status: first.status,
          resolution_note: first.resolution_note || '',
        });
      }
    }
  }, [incidentUpdate.incident_id]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadSecurity();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadSecurity]);

  useEffect(() => {
    if (!session.user?.society_id) return;
    const unsubscribe = subscribeToSecurityLiveUpdates(
      [`society_${session.user.society_id}_security`],
      () => {
        void loadSecurity();
      },
    );
    return unsubscribe;
  }, [loadSecurity, session.user?.society_id]);

  const activeIncidents = useMemo(
    () => incidents.filter((incident) => statusFilter === 'ALL' || incident.status === statusFilter),
    [incidents, statusFilter],
  );

  const selectedIncident = incidents.find((incident) => incident.id === incidentUpdate.incident_id) || null;

  const createShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await postSecurityJson<{ success: boolean; message?: string }>('/shifts', shiftForm);
    if (!response.success) {
      alert(response.message || 'Unable to create shift');
      return;
    }

    setShiftForm(INITIAL_SHIFT_FORM);
    if (searchParams.get('security_staff_id') || searchParams.get('tab') || searchParams.get('shift_label')) {
      router.replace('/admin/security');
    }
    await loadSecurity();
  };

  const updateIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!incidentUpdate.incident_id) return;

    const response = await putSecurityJson<{ success: boolean; message?: string }>(`/incidents/${incidentUpdate.incident_id}`, {
      assigned_guard_user_id: incidentUpdate.assigned_guard_user_id || null,
      status: incidentUpdate.status,
      resolution_note: incidentUpdate.resolution_note,
    });
    if (!response.success) {
      alert(response.message || 'Unable to update incident');
      return;
    }

    await loadSecurity();
  };

  const markShift = async (shiftId: number, status: GuardShift['status']) => {
    const shift = shifts.find((item) => item.id === shiftId);
    if (!shift) return;

    const response = await putSecurityJson<{ success: boolean; message?: string }>(`/shifts/${shiftId}`, {
      security_staff_id: shift.security_staff_id,
      guard_user_id: shift.guard_user_id,
      shift_label: shift.shift_label,
      scheduled_start: shift.scheduled_start,
      scheduled_end: shift.scheduled_end,
      status,
      notes: shift.notes,
    });
    if (!response.success) {
      alert(response.message || 'Unable to update shift');
      return;
    }

    await loadSecurity();
  };

  const updateTab = (nextTab: 'overview' | 'shifts' | 'incidents' | 'activity') => {
    setActiveTab(nextTab);
    if (searchParams.get('tab') || searchParams.get('security_staff_id') || searchParams.get('shift_label')) {
      router.replace(nextTab === 'overview' ? '/admin/security' : `/admin/security?tab=${nextTab}`);
    }
  };

  const resolveMediaUrl = (value: string) => {
    if (!value) return '';
    return value.startsWith('http://') || value.startsWith('https://') ? value : `http://localhost:5000${value}`;
  };

  const renderGuardAvatar = (name: string, profilePhotoUrl?: string) => (
    profilePhotoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveMediaUrl(profilePhotoUrl)}
        alt={name}
        className="h-11 w-11 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
      />
    ) : (
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {name.charAt(0)}
      </div>
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Guard & Security Control</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Schedule guard duty, monitor live incidents, and audit patrol activity from a single admin console.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<Users className="h-5 w-5" />} label="Guards On Duty" value={summary?.guards_on_duty ?? 0} tone="blue" />
        <SummaryCard icon={<Clock3 className="h-5 w-5" />} label="Shifts Today" value={summary?.shifts_today ?? 0} tone="slate" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label="Open Incidents" value={summary?.open_incidents ?? 0} tone="amber" />
        <SummaryCard icon={<Siren className="h-5 w-5" />} label="Critical Incidents" value={summary?.critical_incidents ?? 0} tone="rose" />
      </div>

      <div className="glass-panel rounded-2xl p-2">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'shifts', label: 'Shifts' },
            { id: 'incidents', label: 'Incidents' },
            { id: 'activity', label: 'Activity' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => updateTab(tab.id as 'overview' | 'shifts' | 'incidents' | 'activity')}
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
        <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <div className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Shift Snapshot</h2>
            <div className="mt-4 space-y-3">
              {shifts.slice(0, 6).map((shift) => (
                <div key={shift.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {renderGuardAvatar(shift.guard_name, shift.profile_photo_url)}
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{shift.guard_name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{shift.shift_label}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateRange(shift.scheduled_start, shift.scheduled_end)}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${shift.status === 'OnDuty' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : shift.status === 'Missed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {shift.status}
                    </span>
                  </div>
                </div>
              ))}
              {!shifts.length ? <EmptyState text="No guard shifts scheduled yet." /> : null}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Incident Snapshot</h2>
            <div className="mt-4 space-y-3">
              {activeIncidents.slice(0, 6).map((incident) => (
                <div key={incident.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{incident.title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{incident.category} / {incident.location || 'Gate / campus'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={`rounded-full px-3 py-1.5 ${incident.severity === 'Critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : incident.severity === 'High' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{incident.severity}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{incident.status}</span>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{incident.description}</p>
                </div>
              ))}
              {!activeIncidents.length ? <EmptyState text="No incidents match the selected filter." /> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'shifts' ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <form onSubmit={createShift} className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-brand-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create Security Shift</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Schedule from security staff directly. Guard login is optional for roster creation.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={shiftForm.security_staff_id}
              onChange={(event) => {
                const nextStaffId = event.target.value;
                const selectedGuard = guards.find((guard) => String(guard.staff_id) === nextStaffId);
                setShiftForm((current) => ({
                  ...current,
                  security_staff_id: nextStaffId,
                  shift_label: current.shift_label === INITIAL_SHIFT_FORM.shift_label || !current.shift_label
                    ? selectedGuard?.shift_timing || current.shift_label
                    : current.shift_label,
                }));
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="">Select security staff</option>
              {guards.map((guard) => (
                <option key={guard.staff_id} value={guard.staff_id}>
                  {guard.name}{guard.shift_timing ? ` / ${guard.shift_timing}` : ''}{guard.has_guard_login && guard.guard_status === 'ACTIVE' ? ' / login active' : ' / roster only'}
                </option>
              ))}
            </select>
            <input value={shiftForm.shift_label} onChange={(event) => setShiftForm({ ...shiftForm, shift_label: event.target.value })} placeholder="Shift label" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <input type="datetime-local" value={shiftForm.scheduled_start} onChange={(event) => setShiftForm({ ...shiftForm, scheduled_start: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <input type="datetime-local" value={shiftForm.scheduled_end} onChange={(event) => setShiftForm({ ...shiftForm, scheduled_end: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <textarea value={shiftForm.notes} onChange={(event) => setShiftForm({ ...shiftForm, notes: event.target.value })} placeholder="Gate, beat area, special instruction..." className="h-24 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm md:col-span-2 dark:border-slate-800 dark:bg-slate-900" />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600">Create Shift</button>
          </div>
        </form>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Shift Roster</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track who is on duty, who completed, and what needs escalation.</p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Missed {summary?.missed_shifts ?? 0}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {shifts.slice(0, 8).map((shift) => (
              <div key={shift.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {renderGuardAvatar(shift.guard_name, shift.profile_photo_url)}
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{shift.guard_name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{shift.shift_label}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateRange(shift.scheduled_start, shift.scheduled_end)}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Staff phone: {guards.find((guard) => guard.staff_id === shift.security_staff_id)?.phone_number || 'Not set'}
                        {shift.guard_login_phone ? ` / Login phone: ${shift.guard_login_phone}` : ' / Login phone not linked'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${shift.status === 'OnDuty' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : shift.status === 'Missed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {shift.status}
                    </span>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${shift.has_guard_login ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {shift.has_guard_login ? 'Login linked' : 'Roster only'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {shift.status !== 'Completed' && shift.status !== 'Cancelled' ? (
                    <button onClick={() => void markShift(shift.id, 'Missed')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 dark:border-rose-900/60 dark:text-rose-300">
                      Mark Missed
                    </button>
                  ) : null}
                  {shift.status === 'Scheduled' ? (
                    <button onClick={() => void markShift(shift.id, 'Cancelled')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!shifts.length ? <EmptyState text="No guard shifts scheduled yet." /> : null}
          </div>
        </div>
        </div>
      ) : null}

      {activeTab === 'incidents' ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Incident Queue</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review security incidents raised by guards and assign owners fast.</p>
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              {['ALL', 'Open', 'InReview', 'Resolved', 'Closed'].map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {activeIncidents.map((incident) => (
              <button
                key={incident.id}
                type="button"
                onClick={() => setIncidentUpdate({
                  incident_id: incident.id,
                  assigned_guard_user_id: incident.assigned_guard_user_id ? String(incident.assigned_guard_user_id) : '',
                  status: incident.status,
                  resolution_note: incident.resolution_note || '',
                })}
                className={`w-full rounded-2xl border p-4 text-left ${incidentUpdate.incident_id === incident.id ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10' : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/40'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{incident.title}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{incident.category} / {incident.location || 'Gate / campus'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className={`rounded-full px-3 py-1.5 ${incident.severity === 'Critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : incident.severity === 'High' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{incident.severity}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{incident.status}</span>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{incident.description}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Reporter: {incident.reporter_name || 'System'} / Assigned: {incident.assigned_guard_name || 'Unassigned'}
                </p>
              </button>
            ))}
            {!activeIncidents.length ? <EmptyState text="No incidents match the selected filter." /> : null}
          </div>
        </div>

        <form onSubmit={updateIncident} className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <Wrench className="h-5 w-5 text-brand-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Incident Resolution</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Assign a guard and move the ticket through its lifecycle.</p>
            </div>
          </div>
          {selectedIncident ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="font-semibold text-slate-900 dark:text-white">{selectedIncident.title}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedIncident.description}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{selectedIncident.occurred_at ? new Date(selectedIncident.occurred_at).toLocaleString() : 'Now'}</p>
              </div>
              <select value={incidentUpdate.assigned_guard_user_id} onChange={(event) => setIncidentUpdate({ ...incidentUpdate, assigned_guard_user_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <option value="">Unassigned</option>
                {activeGuardOptions.map((guard) => <option key={guard.guard_user_id || guard.staff_id} value={guard.guard_user_id || ''}>{guard.name}</option>)}
              </select>
              <select value={incidentUpdate.status} onChange={(event) => setIncidentUpdate({ ...incidentUpdate, status: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                {['Open', 'InReview', 'Resolved', 'Closed'].map((status) => <option key={status}>{status}</option>)}
              </select>
              <textarea value={incidentUpdate.resolution_note} onChange={(event) => setIncidentUpdate({ ...incidentUpdate, resolution_note: event.target.value })} placeholder="Resolution notes, next action, or root cause..." className="h-32 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
              <button type="submit" className="w-full rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600">Save Incident Update</button>
            </div>
          ) : (
            <EmptyState text="Select an incident from the queue to manage assignment and resolution." />
          )}
        </form>
        </div>
      ) : null}

      {activeTab === 'activity' ? (
        <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Guard Activity</h2>
        <div className="mt-4 space-y-3">
          {logs.slice(0, 10).map((log) => (
            <div key={log.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-slate-900 dark:text-white">{log.action_type} / {log.guard_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Now'}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{log.description || 'No details provided.'}</p>
            </div>
          ))}
          {!logs.length ? <EmptyState text="No guard activity has been logged yet." /> : null}
        </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'blue' | 'slate' | 'amber' | 'rose' }) {
  const styles = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  }[tone];

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`rounded-xl p-2 ${styles}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">{text}</p>;
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return 'Schedule pending';
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleString()} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
