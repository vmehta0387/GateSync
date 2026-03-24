'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserCheck, ShieldAlert, FileText, Clock3, Copy, CheckCircle2 } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import { subscribeToVisitorLiveUpdates } from '@/lib/socket';

type ResidentFlat = {
  flat_id: number;
  type: string;
  block_name: string;
  flat_number: string;
};

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
  approval_requested_at?: string | null;
  delivery_company?: string;
  vehicle_number?: string;
  contactless_delivery?: boolean;
  is_watchlisted?: boolean;
  watchlist_reason?: string;
};

type Invoice = {
  amount: string;
  status: 'Paid' | 'Unpaid';
};

type PassResult = {
  passcode: string;
  visitorName: string;
};

const initialForm = {
  name: '',
  phone_number: '',
  purpose: 'Guest',
  flat_id: '',
  expected_time: '',
  delivery_company: '',
  vehicle_number: '',
  contactless_delivery: false,
};

async function loadResidentDashboard(
  token: string,
  onFlats: (flats: ResidentFlat[]) => void,
  onLogs: (logs: VisitorLog[]) => void,
  onPendingApprovals: (logs: VisitorLog[]) => void,
  onPendingDues: (dues: number) => void,
): Promise<ResidentFlat[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const [flatRes, logRes, pendingRes, billingRes] = await Promise.all([
    fetch('http://localhost:5000/api/v1/residents/me/flats', { headers }),
    fetch('http://localhost:5000/api/v1/visitors/logs?limit=50', { headers }),
    fetch('http://localhost:5000/api/v1/visitors/pending', { headers }),
    fetch('http://localhost:5000/api/v1/billing', { headers }),
  ]);

  const [flatData, logData, pendingData, billingData] = await Promise.all([
    flatRes.json(),
    logRes.json(),
    pendingRes.json(),
    billingRes.json(),
  ]);

  const residentFlats: ResidentFlat[] = flatData.success ? flatData.flats : [];
  onFlats(residentFlats);
  onLogs(logData.success ? logData.logs : []);
  onPendingApprovals(pendingData.success ? pendingData.approvals : []);

  const invoices: Invoice[] = billingData.success ? billingData.invoices : [];
  const dues = invoices
    .filter((invoice) => invoice.status === 'Unpaid')
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  onPendingDues(dues);
  return residentFlats;
}

export default function ResidentDashboard() {
  const [flats, setFlats] = useState<ResidentFlat[]>([]);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<VisitorLog[]>([]);
  const [pendingDues, setPendingDues] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPreApprove, setShowPreApprove] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [lastPass, setLastPass] = useState<PassResult | null>(null);

  const refreshDashboard = useCallback(async () => {
    const { token } = getStoredSession();
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const residentFlats = await loadResidentDashboard(token, setFlats, setLogs, setPendingApprovals, setPendingDues);

      if (residentFlats.length > 0 && !form.flat_id) {
        setForm((current) => ({ ...current, flat_id: String(residentFlats[0].flat_id) }));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [form.flat_id]);

  useEffect(() => {
    void refreshDashboard();
    const intervalId = window.setInterval(() => {
      void refreshDashboard();
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, [refreshDashboard]);

  useEffect(() => {
    const { user } = getStoredSession();
    if (!user) {
      return;
    }

    return subscribeToVisitorLiveUpdates(
      [`resident_${user.id}`, ...flats.map((flat) => `flat_${flat.flat_id}`)],
      () => {
        void refreshDashboard();
      },
    );
  }, [flats, refreshDashboard]);

  const upcomingVisitors = logs.filter((log) => log.status === 'Approved');
  const activeVisitors = logs.filter((log) => log.status === 'CheckedIn');

  const stats = [
    { label: 'Upcoming Visitors', value: upcomingVisitors.length, icon: UserCheck, color: 'text-brand-500', bg: 'bg-brand-50 dark:bg-brand-500/10' },
    { label: 'Approval Requests', value: pendingApprovals.length, icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
    { label: 'Pending Dues', value: `Rs ${pendingDues.toLocaleString()}`, icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  ];

  const handlePreApprove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { token } = getStoredSession();
    if (!token) {
      return;
    }

    setSubmitting(true);
    setCopied(false);

    try {
      const response = await fetch('http://localhost:5000/api/v1/visitors/pre-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          flat_id: Number(form.flat_id),
          expected_time: form.expected_time || null,
          delivery_company: form.delivery_company || null,
          vehicle_number: form.vehicle_number || null,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to generate visitor pass');
        return;
      }

      setLastPass({ passcode: data.passcode, visitorName: form.name });
      setForm((current) => ({ ...initialForm, flat_id: current.flat_id }));
      await refreshDashboard();
    } catch (error) {
      console.error(error);
      alert('Unable to reach the server right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPasscode = async () => {
    if (!lastPass?.passcode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(lastPass.passcode);
      setCopied(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleVisitorDecision = async (logId: number, decision: 'approve' | 'deny') => {
    const { token } = getStoredSession();
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/v1/visitors/${decision}/${logId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || `Unable to ${decision} visitor`);
        return;
      }

      await refreshDashboard();
    } catch (error) {
      console.error(error);
      alert('Unable to update visitor approval right now.');
    }
  };

  return (
    <div className="space-y-8 relative">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Resident Portal</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Pre-approve visitors, track current entries, and keep your gate access flowing smoothly.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-panel p-6 rounded-2xl flex items-start justify-between group hover:border-brand-300 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
              <h3 className="text-3xl font-bold mt-2 text-slate-800 dark:text-slate-100">
                {loading ? '...' : stat.value}
              </h3>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
              <stat.icon className="w-6 h-6" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-8">
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Visitor Pass Center</h2>
              <p className="text-sm text-slate-500 mt-1">Generate a passcode before your guest reaches the gate.</p>
            </div>
            <button
              onClick={() => setShowPreApprove((current) => !current)}
              className="px-5 py-3 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors shadow-md shadow-brand-500/20"
            >
              {showPreApprove ? 'Close Form' : 'Pre-Approve Visitor'}
            </button>
          </div>

          {showPreApprove && (
            <form onSubmit={handlePreApprove} className="space-y-4 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white/70 dark:bg-slate-900/40 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Visitor Name</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Swiggy Delivery"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone Number</label>
                  <input
                    value={form.phone_number}
                    onChange={(event) => setForm({ ...form, phone_number: event.target.value.replace(/\D/g, '') })}
                    className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="9876543210"
                    maxLength={10}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Purpose</label>
                  <select
                    value={form.purpose}
                    onChange={(event) => setForm({ ...form, purpose: event.target.value })}
                    className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Guest">Guest</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Cab">Cab</option>
                    <option value="Service">Service</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Flat</label>
                  <select
                    value={form.flat_id}
                    onChange={(event) => setForm({ ...form, flat_id: event.target.value })}
                    className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  >
                    {flats.map((flat) => (
                      <option key={flat.flat_id} value={flat.flat_id}>
                        {flat.block_name}-{flat.flat_number} / {flat.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Expected Arrival</label>
                  <input
                    type="datetime-local"
                    value={form.expected_time}
                    onChange={(event) => setForm({ ...form, expected_time: event.target.value })}
                    className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Vehicle Number</label>
                  <input
                    value={form.vehicle_number}
                    onChange={(event) => setForm({ ...form, vehicle_number: event.target.value.toUpperCase() })}
                    className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Optional vehicle number"
                  />
                </div>
                {form.purpose === 'Delivery' && (
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Delivery Company</label>
                    <input
                      value={form.delivery_company}
                      onChange={(event) => setForm({ ...form, delivery_company: event.target.value })}
                      className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Amazon, Swiggy, Zomato..."
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || flats.length === 0}
                className="w-full bg-brand-500 text-white rounded-xl py-3 font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Generating Visitor Pass...' : 'Generate Gate Pass'}
              </button>
            </form>
          )}

          {lastPass && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 dark:border-emerald-900 p-5 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 className="w-5 h-5" />
                    Pass ready for {lastPass.visitorName}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Share this code with the visitor or the guard at the gate.</p>
                  <p className="text-3xl font-bold tracking-[0.25em] text-slate-900 dark:text-white mt-3">{lastPass.passcode}</p>
                </div>
                <button
                  onClick={copyPasscode}
                  className="px-4 py-2 rounded-xl border border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/20 transition-colors flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white">Upcoming Visitor Passes</h3>
              <span className="text-sm text-slate-500">{upcomingVisitors.length} awaiting arrival</span>
            </div>

            {loading ? (
              <p className="text-slate-500">Loading visitor passes...</p>
            ) : upcomingVisitors.length === 0 ? (
              <p className="text-slate-500">No pending visitor passes yet.</p>
            ) : (
              upcomingVisitors.slice(0, 5).map((log) => (
                <div key={log.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-brand-600 dark:text-brand-400">{log.visitor_name}</h4>
                      <p className="text-sm mt-1 text-slate-600 dark:text-slate-300">{log.purpose} / {log.block_name}-{log.flat_number}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                        <Clock3 className="w-3.5 h-3.5" />
                        {log.expected_time ? new Date(log.expected_time).toLocaleString() : 'No arrival time set'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs uppercase tracking-wide text-slate-500">Passcode</span>
                      <p className="font-mono font-semibold text-slate-900 dark:text-white mt-1">{log.passcode || 'Pending'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4">Active Visitors Inside</h2>
            {loading ? (
              <p className="text-slate-500">Loading live entries...</p>
            ) : activeVisitors.length === 0 ? (
              <p className="text-slate-500">No visitors are currently checked in.</p>
            ) : (
              <div className="space-y-3">
                {activeVisitors.map((log) => (
                  <div key={log.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{log.visitor_name}</p>
                        <p className="text-sm text-slate-500 mt-1">{log.purpose} / {log.block_name}-{log.flat_number}</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Checked In
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4">Approval Requests</h2>
            {loading ? (
              <p className="text-slate-500">Loading pending approvals...</p>
            ) : pendingApprovals.length === 0 ? (
              <p className="text-slate-500">No guard requests are waiting for your decision.</p>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.slice(0, 5).map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{log.visitor_name}</p>
                        <p className="text-sm text-slate-500 mt-1">
                          {log.purpose} / {log.block_name}-{log.flat_number}
                          {log.delivery_company ? ` / ${log.delivery_company}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          {log.vehicle_number ? `Vehicle: ${log.vehicle_number}` : 'No vehicle number'} / Requested at {log.approval_requested_at ? new Date(log.approval_requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                        </p>
                        {log.is_watchlisted && (
                          <p className="text-xs text-orange-600 mt-2">Watchlist alert: {log.watchlist_reason || 'Frequent monitored visitor'}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleVisitorDecision(log.id, 'approve')}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleVisitorDecision(log.id, 'deny')}
                          className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                    {log.visitor_photo_url && (
                      <div className="mt-3">
                        <div
                          aria-label={`${log.visitor_name} photo`}
                          role="img"
                          className="h-16 w-16 rounded-xl border border-slate-200 bg-cover bg-center dark:border-slate-700"
                          style={{ backgroundImage: `url(http://localhost:5000${log.visitor_photo_url})` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
