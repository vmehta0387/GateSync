'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BellRing } from 'lucide-react';
import { buildAudienceFilters, emptyHub, fetchCommunicationJson, postCommunicationJson } from '@/lib/communication';

export default function CommunicationAlertsPage() {
  const [targets, setTargets] = useState(emptyHub.targets);
  const [form, setForm] = useState({ message: '', audience_type: 'AllResidents', block_name: '', committee_id: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCommunicationJson<{ success: boolean; targets: typeof emptyHub.targets; overview: typeof emptyHub.overview; inbox: [] }>('/hub');
        if (data.success) setTargets(data.targets || emptyHub.targets);
      } catch (error) {
        console.error(error);
      }
    };

    void load();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    try {
      const data = await postCommunicationJson<{ success: boolean; message?: string }>('/emergency', {
        message: form.message,
        audience_type: form.audience_type,
        audience_filters: buildAudienceFilters(
          form.audience_type,
          form.block_name,
          '',
          form.committee_id ? [Number(form.committee_id)] : [],
        ),
      });

      if (!data.success) {
        alert(data.message || 'Unable to send emergency alert');
        return;
      }

      setForm({ message: '', audience_type: 'AllResidents', block_name: '', committee_id: '' });
    } catch (error) {
      console.error(error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr,1.2fr]">
      <div className="glass-panel rounded-2xl border border-rose-200 p-5 dark:border-rose-900/40">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Emergency Alerts</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Keep critical alerts separate from routine notices so the workflow stays fast and deliberate.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <select value={form.audience_type} onChange={(event) => setForm({ ...form, audience_type: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            {targets.segments.audience_types.filter((type) => type !== 'CustomUsers' && type !== 'Occupancy').map((type) => <option key={type}>{type}</option>)}
          </select>
          {form.audience_type === 'Tower' && (
            <select value={form.block_name} onChange={(event) => setForm({ ...form, block_name: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <option value="">Select tower</option>
              {targets.towers.map((tower) => <option key={tower}>{tower}</option>)}
            </select>
          )}
          {form.audience_type === 'Committee' && (
            <select value={form.committee_id} onChange={(event) => setForm({ ...form, committee_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <option value="">Select committee</option>
              {targets.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}
            </select>
          )}
          <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Fire alert, security breach, evacuation notice..." className="h-36 w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm dark:border-rose-900 dark:bg-rose-950/20" />
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={sending} className="w-full sm:w-auto rounded-xl bg-rose-600 px-8 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-500/20 transition-all hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-lg focus:ring-4 focus:ring-rose-500/20 disabled:opacity-70 disabled:shadow-none">
              <BellRing className="mr-2 inline h-4 w-4" />
              {sending ? 'Sending...' : 'Send Emergency Alert'}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">When To Use This</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-500 dark:text-slate-400">
          <p>Use emergency alerts for fire, security breach, evacuation, or immediate life-safety events.</p>
          <p>Use Notices for planned maintenance, event announcements, society advisories, and general communication.</p>
          <p>Use Direct Messages for complaint follow-ups or resident-specific conversations.</p>
        </div>
      </div>
    </div>
  );
}
