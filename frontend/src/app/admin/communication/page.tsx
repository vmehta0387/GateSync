'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, FileStack, Megaphone, MessageSquare, Search, Vote, ArrowRight, ShieldAlert, FileText, Activity } from 'lucide-react';
import { emptyHub, type CommunicationHub, type InboxItem, fetchCommunicationJson } from '@/lib/communication';

export default function CommunicationOverviewPage() {
  const [hub, setHub] = useState<CommunicationHub>(emptyHub);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const hubData = await fetchCommunicationJson<{ success: boolean; overview: CommunicationHub['overview']; inbox: InboxItem[]; targets: CommunicationHub['targets'] }>('/hub');

        if (hubData.success) {
          setHub({
            overview: hubData.overview,
            inbox: hubData.inbox || [],
            targets: hubData.targets || emptyHub.targets,
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    void load();
  }, []);

  const filteredInbox = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hub.inbox;
    return hub.inbox.filter((item) => `${item.item_type} ${item.title} ${item.priority_label}`.toLowerCase().includes(q));
  }, [hub.inbox, search]);

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl font-extrabold bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent dark:from-white dark:to-slate-400 tracking-tight">
            Communication Command Center
          </h1>
        </div>
        <div className="relative w-full md:w-[350px] shrink-0 z-10">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search hub activity..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-4 pl-12 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white dark:focus:bg-slate-900"
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Active Notices', value: hub.overview.notice_count, icon: Megaphone, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-100 dark:border-blue-800/50' },
          { label: 'Unread Messages', value: hub.overview.unread_messages, icon: MessageSquare, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-800/50' },
          { label: 'Urgent Alerts', value: hub.overview.urgent_items, icon: ShieldAlert, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-100 dark:border-rose-800/50' },
          { label: 'Live Polls', value: hub.overview.active_polls, icon: Vote, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-800/50' },
          { label: 'Upcoming Events', value: hub.overview.scheduled_events, icon: CalendarDays, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-100 dark:border-violet-800/50' },
          { label: 'Secure Docs', value: hub.overview.document_count, icon: FileStack, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700' },
        ].map((stat) => (
          <div key={stat.label} className={`group relative overflow-hidden rounded-3xl border ${stat.border} bg-white dark:bg-slate-900 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md cursor-default`}>
            <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${stat.bg} opacity-50 blur-2xl transition-opacity group-hover:opacity-100`} />
            <div className="relative z-10 flex flex-col items-start gap-4">
              <div className={`rounded-2xl p-3 ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="mt-1 font-semibold text-slate-500 dark:text-slate-400 text-sm">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr,1.1fr]">
        {/* Quick Actions */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
              <Activity className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Workspace Portals</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { href: '/admin/communication/notices', title: 'Broadcast Notices', copy: 'Pin, schedule, and target community announcements.', icon: Megaphone },
              { href: '/admin/communication/messages', title: 'Direct Messages', copy: 'Private chat threads and resident follow-ups.', icon: MessageSquare },
              { href: '/admin/communication/alerts', title: 'Emergency Alerts', copy: 'Instantly push severe alerts to all devices.', icon: AlertTriangle },
              { href: '/admin/communication/polls', title: 'Opinion Polls', copy: 'Gather structured resident feedback effortlessly.', icon: Vote },
              { href: '/admin/communication/events', title: 'Community Events', copy: 'RSVP management for digital and physical gatherings.', icon: CalendarDays },
              { href: '/admin/communication/documents', title: 'Document Vault', copy: 'Secure housing for by-laws and compliance forms.', icon: FileText },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
              >
                <div className="mb-4">
                  <card.icon className="h-7 w-7 text-slate-400 transition-colors group-hover:text-brand-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{card.title}</h3>
                  <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">{card.copy}</p>
                </div>
                <div className="mt-6 flex items-center text-sm font-bold text-brand-600 dark:text-brand-400 opacity-0 -translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                  Open Portal <ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Global Inbox */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <FileStack className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Global Inbox</h2>
          </div>
          <div className="flex-1 rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 font-medium text-xs uppercase tracking-widest text-slate-500">
              Recent Activity Feed
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredInbox.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-medium">No recent activity matching your search.</div>
              ) : (
                filteredInbox.slice(0, 8).map((item) => (
                  <div key={`${item.item_type}-${item.id}`} className="group flex items-start gap-4 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">
                      {item.item_type.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{item.title}</p>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          item.priority_label === 'Urgent' || item.priority_label === 'Emergency' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                          item.priority_label === 'High' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {item.priority_label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <span className="uppercase tracking-wider opacity-80">{item.item_type}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                        <span>{item.created_at ? new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
