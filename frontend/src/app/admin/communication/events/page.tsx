'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { buildAudienceFilters, type EventItem, emptyHub, fetchCommunicationJson, postCommunicationJson } from '@/lib/communication';

export default function CommunicationEventsPage() {
  const [targets, setTargets] = useState(emptyHub.targets);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', venue: '', target_scope: 'AllResidents', start_at: '', end_at: '', rsvp_required: true, committee_id: '' });

  const loadPage = async () => {
    try {
      const [hubData, eventsData] = await Promise.all([
        fetchCommunicationJson<{ success: boolean; targets: typeof emptyHub.targets; overview: typeof emptyHub.overview; inbox: [] }>('/hub'),
        fetchCommunicationJson<{ success: boolean; events: EventItem[] }>('/events'),
      ]);
      if (hubData.success) setTargets(hubData.targets || emptyHub.targets);
      if (eventsData.success) setEvents(eventsData.events || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void loadPage();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await postCommunicationJson<{ success: boolean; message?: string }>('/events', {
        ...form,
        target_filters: buildAudienceFilters(form.target_scope, '', '', form.committee_id ? [Number(form.committee_id)] : []),
      });
      if (!data.success) {
        alert(data.message || 'Unable to create event');
        return;
      }

      setForm({ title: '', description: '', venue: '', target_scope: 'AllResidents', start_at: '', end_at: '', rsvp_required: true, committee_id: '' });
      await loadPage();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.88fr,1.12fr]">
      <div className="glass-panel rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Events</h1>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Event title" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Event details" className="h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <div className="grid gap-4 md:grid-cols-2">
            <input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} placeholder="Venue" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <select value={form.target_scope} onChange={(event) => setForm({ ...form, target_scope: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              {targets.segments.audience_types.filter((type) => type !== 'CustomUsers').map((type) => <option key={type}>{type}</option>)}
            </select>
            <input type="datetime-local" value={form.start_at} onChange={(event) => setForm({ ...form, start_at: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <input type="datetime-local" value={form.end_at} onChange={(event) => setForm({ ...form, end_at: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          </div>
          {form.target_scope === 'Committee' && (
            <select value={form.committee_id} onChange={(event) => setForm({ ...form, committee_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <option value="">Select committee</option>
              {targets.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={form.rsvp_required} onChange={(event) => setForm({ ...form, rsvp_required: event.target.checked })} /> Track RSVPs</label>
          <button type="submit" disabled={saving} className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? 'Saving...' : 'Create Event'}
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Upcoming Events</h2>
        <div className="mt-4 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="font-semibold text-slate-900 dark:text-white">{event.title}</p>
              <p className="mt-2 text-sm text-slate-500">{event.venue || 'Society venue'} / {event.start_at ? new Date(event.start_at).toLocaleString() : 'TBD'}</p>
              <p className="mt-2 text-xs text-slate-400">Going {event.rsvp_summary?.Going || 0} / Maybe {event.rsvp_summary?.Maybe || 0} / Not going {event.rsvp_summary?.NotGoing || 0}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
