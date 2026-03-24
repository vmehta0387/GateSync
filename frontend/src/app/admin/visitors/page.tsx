'use client';

import { motion } from 'framer-motion';
import { BellRing, CarFront, Search, ShieldCheck, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { subscribeToVisitorLiveUpdates } from '@/lib/socket';

type VisitorLog = {
  id: number;
  visitor_id: number;
  visitor_name: string;
  visitor_phone: string;
  visitor_photo_url: string;
  block_name: string;
  flat_number: string;
  flat_id: number;
  purpose: 'Guest' | 'Delivery' | 'Cab' | 'Service' | 'Unknown';
  status: 'Pending' | 'Approved' | 'Denied' | 'CheckedIn' | 'CheckedOut';
  passcode: string | null;
  entry_time: string | null;
  exit_time: string | null;
  expected_time: string | null;
  delivery_company?: string;
  vehicle_number?: string;
  entry_method?: string;
  duration_minutes?: number | null;
  is_vip?: boolean;
  is_blacklisted?: boolean;
  is_watchlisted?: boolean;
  watchlist_reason?: string;
};

type VisitorRules = {
  visitorApprovalRequired: boolean;
  deliveryAutoEntry: boolean;
  cabApprovalRequired: boolean;
  serviceApprovalRequired: boolean;
  nightEntryRestriction: boolean;
  contactlessDeliveryEnabled: boolean;
  smsFallbackEnabled: boolean;
};

const DEFAULT_RULES: VisitorRules = {
  visitorApprovalRequired: true,
  deliveryAutoEntry: false,
  cabApprovalRequired: true,
  serviceApprovalRequired: true,
  nightEntryRestriction: false,
  contactlessDeliveryEnabled: false,
  smsFallbackEnabled: false,
};

export default function VisitorsPage() {
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [rules, setRules] = useState<VisitorRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const fetchPageData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('gatepulse_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [logsRes, rulesRes] = await Promise.all([
        fetch('http://localhost:5000/api/v1/visitors/logs?limit=200', { headers }),
        fetch('http://localhost:5000/api/v1/visitors/rules', { headers }),
      ]);

      const [logsData, rulesData] = await Promise.all([logsRes.json(), rulesRes.json()]);
      if (logsData.success) {
        setLogs(logsData.logs);
      }
      if (rulesData.success) {
        setRules({ ...DEFAULT_RULES, ...rulesData.rules });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    const { user } = getStoredSession();
    if (!user?.society_id) {
      return;
    }

    return subscribeToVisitorLiveUpdates([`society_${user.society_id}_admins`], () => {
      void fetchPageData();
    });
  }, [fetchPageData]);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesSearch = !normalizedSearch || [
        log.visitor_name,
        log.visitor_phone,
        log.block_name,
        log.flat_number,
        log.delivery_company || '',
        log.vehicle_number || '',
        log.passcode || '',
      ].join(' ').toLowerCase().includes(normalizedSearch);

      const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || log.purpose === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [logs, search, statusFilter, typeFilter]);

  const stats = [
    { label: 'Pending Approvals', value: logs.filter((log) => log.status === 'Pending').length, icon: BellRing, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300' },
    { label: 'Inside Campus', value: logs.filter((log) => log.status === 'CheckedIn').length, icon: ShieldCheck, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' },
    { label: 'Deliveries Today', value: logs.filter((log) => log.purpose === 'Delivery').length, icon: Truck, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300' },
    { label: 'Vehicle Entries', value: logs.filter((log) => log.vehicle_number).length, icon: CarFront, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300' },
  ];

  const saveRules = async (updates: Partial<VisitorRules>) => {
    const nextRules = { ...rules, ...updates };
    setRules(nextRules);
    setSavingRules(true);
    try {
      const token = localStorage.getItem('gatepulse_token');
      await fetch('http://localhost:5000/api/v1/visitors/rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rules: nextRules }),
      });
    } catch (error) {
      console.error(error);
    } finally {
      setSavingRules(false);
    }
  };

  const updateVisitorFlags = async (log: VisitorLog, updates: Partial<Pick<VisitorLog, 'is_vip' | 'is_blacklisted' | 'is_watchlisted' | 'watchlist_reason'>>) => {
    try {
      const token = localStorage.getItem('gatepulse_token');
      const response = await fetch('http://localhost:5000/api/v1/visitors/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          visitor_id: log.visitor_id,
          is_vip: updates.is_vip ?? log.is_vip ?? false,
          is_blacklisted: updates.is_blacklisted ?? log.is_blacklisted ?? false,
          is_watchlisted: updates.is_watchlisted ?? log.is_watchlisted ?? false,
          watchlist_reason: updates.watchlist_reason ?? log.watchlist_reason ?? '',
        }),
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Unable to update visitor flags');
        return;
      }
      await fetchPageData();
    } catch (error) {
      console.error(error);
      alert('Unable to update visitor flags right now.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-slate-300">
            Visitor Management
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Monitor entries, configure approval logic, and manage blacklist/watchlist behaviour across GateSync.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {savingRules ? 'Saving rules...' : 'Rules synced'}
        </span>
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
              <div className={`rounded-xl p-3 ${stat.tone}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Security Rules Engine</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { key: 'visitorApprovalRequired', label: 'All visitors require approval', description: 'Walk-ins trigger resident approval by default.' },
            { key: 'deliveryAutoEntry', label: 'Delivery auto-entry', description: 'Let deliveries bypass approval when allowed.' },
            { key: 'cabApprovalRequired', label: 'Cab approval required', description: 'Require resident approval for Uber/Ola visits.' },
            { key: 'serviceApprovalRequired', label: 'Service approval required', description: 'Require approval for electricians, plumbers, and similar visits.' },
            { key: 'nightEntryRestriction', label: 'Night restrictions', description: 'Prevent auto-entry during late-night hours.' },
            { key: 'contactlessDeliveryEnabled', label: 'Contactless delivery', description: 'Allow leave-at-gate delivery handling.' },
            { key: 'smsFallbackEnabled', label: 'SMS fallback approval links', description: 'Send residents secure approve and deny links over SMS when a walk-in needs approval.' },
          ].map((rule) => (
            <div key={rule.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{rule.label}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rule.description}</p>
                </div>
                <button
                  onClick={() => saveRules({ [rule.key]: !rules[rule.key as keyof VisitorRules] } as Partial<VisitorRules>)}
                  className={`relative h-6 w-12 rounded-full transition-colors ${rules[rule.key as keyof VisitorRules] ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <motion.div className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm" animate={{ left: rules[rule.key as keyof VisitorRules] ? '26px' : '2px' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Visitor Logs & History</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Filter by status, type, flat, vehicle, and search terms.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search visitor, flat, phone..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900">
              <option value="ALL">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Denied">Denied</option>
              <option value="CheckedIn">Checked In</option>
              <option value="CheckedOut">Checked Out</option>
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-900">
              <option value="ALL">All visitor types</option>
              <option value="Guest">Guest</option>
              <option value="Delivery">Delivery</option>
              <option value="Cab">Cab</option>
              <option value="Service">Service</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Visitor</th>
                <th className="px-4 py-3 font-medium">Flat</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Vehicle / Delivery</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timeline</th>
                <th className="px-4 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading visitor logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No visitor records match the current filters.</td></tr>
              ) : filteredLogs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{log.visitor_name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{log.visitor_phone}</p>
                      {log.passcode && <p className="mt-2 font-mono text-xs text-brand-600 dark:text-brand-300">{log.passcode}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-200">{log.block_name}-{log.flat_number}</td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{log.purpose}</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{log.entry_method || 'WalkIn'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                    <div className="space-y-1">
                      <p>{log.vehicle_number || 'No vehicle captured'}</p>
                      <p>{log.delivery_company || 'No delivery company'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      log.status === 'CheckedIn'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : log.status === 'Pending'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : log.status === 'Denied'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                    <div className="space-y-1">
                      <p>Expected: {log.expected_time ? new Date(log.expected_time).toLocaleString() : 'Walk-in'}</p>
                      <p>Entry: {log.entry_time ? new Date(log.entry_time).toLocaleString() : 'Not entered yet'}</p>
                      <p>Exit: {log.exit_time ? new Date(log.exit_time).toLocaleString() : 'Still inside / not applicable'}</p>
                      <p>Duration: {log.duration_minutes ? `${log.duration_minutes} min` : 'Not complete'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={!!log.is_vip} onChange={(event) => updateVisitorFlags(log, { is_vip: event.target.checked })} />
                        VIP
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={!!log.is_watchlisted} onChange={(event) => updateVisitorFlags(log, { is_watchlisted: event.target.checked, watchlist_reason: log.watchlist_reason || 'Manual watchlist flag' })} />
                        Watchlist
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={!!log.is_blacklisted} onChange={(event) => updateVisitorFlags(log, { is_blacklisted: event.target.checked })} />
                        Blacklist
                      </label>
                      {log.watchlist_reason && (
                        <p className="text-[11px] text-orange-600 dark:text-orange-300">{log.watchlist_reason}</p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
