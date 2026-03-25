'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Siren,
  Users,
} from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import {
  subscribeToComplaintLiveUpdates,
  subscribeToFacilityLiveUpdates,
  subscribeToSecurityLiveUpdates,
  subscribeToVisitorLiveUpdates,
} from '@/lib/socket';

const API_BASE_URL = 'https://api.gatesync.in';

type DashboardSummary = {
  overview: {
    residents_total: number;
    occupied_flats: number;
    pending_kyc: number;
    unpaid_invoices: number;
    pending_dues_amount: number;
  };
  gate: {
    visitors_today: number;
    inside_now: number;
    pending_approvals: number;
    deliveries_today: number;
    watchlist_alerts_today: number;
  };
  complaints: {
    open_tickets: number;
    overdue_tickets: number;
    high_priority_open: number;
    resolved_this_week: number;
  };
  security: {
    guards_on_duty: number;
    open_incidents: number;
    critical_incidents: number;
    patrols_today: number;
  };
  staff: {
    total_staff: number;
    inside_now: number;
    blacklisted: number;
    guard_enabled: number;
  };
  facilities: {
    active_facilities: number;
    upcoming_bookings: number;
    active_now: number;
    scheduled_maintenance: number;
  };
  communication: {
    urgent_notices: number;
    unread_messages: number;
    active_polls: number;
    scheduled_events: number;
  };
  recent_visitors: Array<{
    id: number;
    visitor_name: string;
    block_name: string;
    flat_number: string;
    purpose: string;
    status: string;
    passcode: string | null;
    vehicle_number: string;
    is_watchlisted: boolean;
    watchlist_reason: string;
    timeline_at: string | null;
  }>;
  urgent_complaints: Array<{
    id: number;
    ticket_id: string;
    category_name: string;
    resident_name: string;
    block_name: string;
    flat_number: string;
    priority: string;
    status: string;
    is_overdue: boolean;
    created_at: string | null;
  }>;
  active_incidents: Array<{
    id: number;
    title: string;
    category: string;
    severity: string;
    status: string;
    location: string;
    occurred_at: string | null;
  }>;
  upcoming_bookings: Array<{
    id: number;
    facility_name: string;
    resident_name: string;
    start_time: string | null;
    end_time: string | null;
    status: string;
    payment_status: string;
  }>;
};

type DashboardResponse = {
  success: boolean;
  summary: DashboardSummary;
  message?: string;
};

function formatDateTime(value: string | null) {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not scheduled';
  return parsed.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number) {
  return `Rs ${Number(value || 0).toLocaleString()}`;
}

function statusTone(status: string) {
  if (['CheckedIn', 'OnDuty', 'Resolved', 'Paid', 'Published'].includes(status)) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (['Pending', 'Open', 'InReview', 'Scheduled', 'Draft'].includes(status)) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }
  if (['Critical', 'Denied', 'Blacklisted', 'Overdue', 'Failed'].includes(status)) {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function MetricCard({
  title,
  value,
  helper,
  tone,
  icon,
}: {
  title: string;
  value: string | number;
  helper: string;
  tone: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const Icon = icon;

  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <div className={`rounded-2xl p-3 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  helper,
  href,
  cta,
  children,
}: {
  title: string;
  helper: string;
  href: string;
  cta: string;
  children: ReactNode;
}) {
  return (
    <div className="glass-panel rounded-3xl p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <Link
          href={href}
          className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {cta}
        </Link>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      {text}
    </div>
  );
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const loadDashboard = useCallback(async (background = false) => {
    const { token } = getStoredSession();
    if (!token) return;

    if (!background) {
      setLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: DashboardResponse = await response.json();
      if (data.success) {
        setSummary(data.summary);
        setLastSynced(new Date().toISOString());
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const intervalId = window.setInterval(() => {
      void loadDashboard(true);
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  useEffect(() => {
    const { user } = getStoredSession();
    if (!user?.society_id) return;

    const rooms = [`society_${user.society_id}_admins`];
    const refresh = () => {
      void loadDashboard(true);
    };

    const unsubscribeVisitors = subscribeToVisitorLiveUpdates(rooms, refresh);
    const unsubscribeComplaints = subscribeToComplaintLiveUpdates(rooms, refresh);
    const unsubscribeFacilities = subscribeToFacilityLiveUpdates([`society_${user.society_id}_facilities`], refresh);
    const unsubscribeSecurity = subscribeToSecurityLiveUpdates([`society_${user.society_id}_security`], refresh);

    return () => {
      unsubscribeVisitors();
      unsubscribeComplaints();
      unsubscribeFacilities();
      unsubscribeSecurity();
    };
  }, [loadDashboard]);

  const actionItems = useMemo(() => {
    if (!summary) return [];

    return [
      {
        label: `${summary.gate.pending_approvals} visitor approvals waiting`,
        helper: 'Guard has walk-ins waiting for resident/admin clearance.',
        href: '/admin/visitors',
        tone: summary.gate.pending_approvals > 0 ? 'amber' : 'slate',
      },
      {
        label: `${summary.complaints.overdue_tickets} overdue complaints`,
        helper: 'Tickets breaching SLA need immediate review.',
        href: '/admin/complaints',
        tone: summary.complaints.overdue_tickets > 0 ? 'rose' : 'slate',
      },
      {
        label: `${summary.security.critical_incidents} critical security incidents`,
        helper: 'Escalate anything marked critical or still open.',
        href: '/admin/security',
        tone: summary.security.critical_incidents > 0 ? 'rose' : 'slate',
      },
      {
        label: `${summary.facilities.scheduled_maintenance} facility blocks scheduled`,
        helper: 'Residents may need proactive notice before closures.',
        href: '/admin/facilities',
        tone: summary.facilities.scheduled_maintenance > 0 ? 'amber' : 'slate',
      },
    ];
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="glass-panel rounded-3xl p-10 text-center text-slate-500 dark:text-slate-400">
        Dashboard data is not available right now.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">GatePulse Operations Dashboard</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Live command center for gate movement, complaints, staff, facilities, and society operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {lastSynced ? `Last synced ${formatDateTime(lastSynced)}` : 'Waiting for sync'}
          </span>
          <Link href="/admin/communication/notices" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800">
            Send Notice
          </Link>
          <Link href="/admin/visitors" className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600">
            Open Gate Ops
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Residents"
          value={summary.overview.residents_total}
          helper={`${summary.overview.occupied_flats} occupied flats / ${summary.overview.pending_kyc} pending KYC`}
          tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
          icon={Users}
        />
        <MetricCard
          title="Gate Activity"
          value={summary.gate.visitors_today}
          helper={`${summary.gate.inside_now} inside / ${summary.gate.pending_approvals} approvals waiting`}
          tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
          icon={ShieldCheck}
        />
        <MetricCard
          title="Helpdesk"
          value={summary.complaints.open_tickets}
          helper={`${summary.complaints.overdue_tickets} overdue / ${summary.complaints.high_priority_open} high priority`}
          tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
          icon={AlertTriangle}
        />
        <MetricCard
          title="Pending Collections"
          value={formatCurrency(summary.overview.pending_dues_amount)}
          helper={`${summary.overview.unpaid_invoices} unpaid invoices`}
          tone="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"
          icon={CreditCard}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Security"
          value={summary.security.guards_on_duty}
          helper={`${summary.security.open_incidents} open incidents / ${summary.security.patrols_today} patrols today`}
          tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          icon={Siren}
        />
        <MetricCard
          title="Staff"
          value={summary.staff.inside_now}
          helper={`${summary.staff.total_staff} total / ${summary.staff.guard_enabled} guard logins enabled`}
          tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
          icon={Users}
        />
        <MetricCard
          title="Facilities"
          value={summary.facilities.upcoming_bookings}
          helper={`${summary.facilities.active_facilities} active / ${summary.facilities.scheduled_maintenance} maintenance blocks`}
          tone="bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300"
          icon={Building2}
        />
        <MetricCard
          title="Communication"
          value={summary.communication.urgent_notices}
          helper={`${summary.communication.unread_messages} unread messages / ${summary.communication.active_polls} live polls`}
          tone="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300"
          icon={MessageSquare}
        />
      </div>

      <div className="glass-panel rounded-3xl p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Action Center</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Fast lane for the items that can create resident friction if they sit too long.
            </p>
          </div>
          <Link href="/admin/security" className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800">
            Review escalations
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {actionItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-2xl border border-slate-200 bg-white/70 p-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.tone === 'rose' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : item.tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                  Focus
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.helper}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Recent Gate Watch" helper="Latest visitor movement across the society." href="/admin/visitors" cta="Open visitors">
          <div className="space-y-3">
            {summary.recent_visitors.length === 0 ? (
              <EmptyState text="No recent visitor movement yet." />
            ) : (
              summary.recent_visitors.map((visitor) => (
                <div key={visitor.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{visitor.visitor_name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {visitor.purpose} / {visitor.block_name}-{visitor.flat_number}
                      </p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(visitor.timeline_at)}
                        {visitor.passcode ? ` / ${visitor.passcode}` : ''}
                        {visitor.vehicle_number ? ` / ${visitor.vehicle_number}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(visitor.status)}`}>
                        {visitor.status}
                      </span>
                      {visitor.is_watchlisted ? (
                        <span className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                          Watchlist
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {visitor.is_watchlisted && visitor.watchlist_reason ? (
                    <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{visitor.watchlist_reason}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Complaint Pressure" helper="Tickets that should not sit in the queue." href="/admin/complaints" cta="Open helpdesk">
          <div className="space-y-3">
            {summary.urgent_complaints.length === 0 ? (
              <EmptyState text="No open complaints need attention right now." />
            ) : (
              summary.urgent_complaints.map((complaint) => (
                <div key={complaint.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{complaint.ticket_id}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {complaint.category_name} / {complaint.resident_name} / {complaint.block_name}-{complaint.flat_number}
                      </p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(complaint.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(complaint.priority === 'High' ? 'Critical' : complaint.priority)}`}>
                        {complaint.priority}
                      </span>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(complaint.is_overdue ? 'Overdue' : complaint.status)}`}>
                        {complaint.is_overdue ? 'Overdue' : complaint.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Security Pulse" helper="Current open incidents and guard-side risk surface." href="/admin/security" cta="Open security">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Critical incidents</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.security.critical_incidents}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Guards on duty</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.security.guards_on_duty}</p>
            </div>
          </div>
          <div className="space-y-3">
            {summary.active_incidents.length === 0 ? (
              <EmptyState text="No active incidents are open right now." />
            ) : (
              summary.active_incidents.map((incident) => (
                <div key={incident.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{incident.title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {incident.category} / {incident.location || 'Security zone'}
                      </p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(incident.occurred_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(incident.severity)}`}>
                        {incident.severity}
                      </span>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(incident.status)}`}>
                        {incident.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Facility Queue" helper="Upcoming amenity usage and payment-sensitive bookings." href="/admin/facilities" cta="Open facilities">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Bookings ahead</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.facilities.upcoming_bookings}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Live usage now</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.facilities.active_now}</p>
            </div>
          </div>
          <div className="space-y-3">
            {summary.upcoming_bookings.length === 0 ? (
              <EmptyState text="No upcoming facility bookings yet." />
            ) : (
              summary.upcoming_bookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{booking.facility_name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{booking.resident_name}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(booking.start_time)} to {formatDateTime(booking.end_time)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(booking.status)}`}>
                        {booking.status}
                      </span>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(booking.payment_status)}`}>
                        {booking.payment_status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <SectionCard title="Staff & Access" helper="Quick view of the workforce currently operating in the community." href="/admin/staff" cta="Open staff">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total staff</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.staff.total_staff}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Inside campus</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.staff.inside_now}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Guard-enabled staff</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.staff.guard_enabled}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Blacklisted staff</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.staff.blacklisted}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Communication Snapshot" helper="Signals from notices, messages, polls, and upcoming community events." href="/admin/communication" cta="Open communication">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Urgent notices</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.communication.urgent_notices}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Unread messages</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.communication.unread_messages}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Active polls</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.communication.active_polls}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Scheduled events</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary.communication.scheduled_events}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/communication/notices" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Notices
            </Link>
            <Link href="/admin/communication/messages" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Messages
            </Link>
            <Link href="/admin/communication/polls" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Polls
            </Link>
            <Link href="/admin/communication/events" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Events
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
