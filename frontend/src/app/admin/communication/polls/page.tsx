'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { buildAudienceFilters, type PollItem, emptyHub, fetchCommunicationJson, postCommunicationJson } from '@/lib/communication';

export default function CommunicationPollsPage() {
  const [targets, setTargets] = useState(emptyHub.targets);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', poll_type: 'YesNo', options: 'Yes,No', target_scope: 'AllResidents', starts_at: '', ends_at: '', committee_id: '' });

  const loadPage = async () => {
    try {
      const [hubData, pollsData] = await Promise.all([
        fetchCommunicationJson<{ success: boolean; targets: typeof emptyHub.targets; overview: typeof emptyHub.overview; inbox: [] }>('/hub'),
        fetchCommunicationJson<{ success: boolean; polls: PollItem[] }>('/polls'),
      ]);
      if (hubData.success) setTargets(hubData.targets || emptyHub.targets);
      if (pollsData.success) setPolls(pollsData.polls || []);
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
      const data = await postCommunicationJson<{ success: boolean; message?: string }>('/polls', {
        ...form,
        options: form.options.split(',').map((item) => item.trim()).filter(Boolean),
        target_filters: buildAudienceFilters(form.target_scope, '', '', form.committee_id ? [Number(form.committee_id)] : []),
      });
      if (!data.success) {
        alert(data.message || 'Unable to create poll');
        return;
      }

      setForm({ title: '', description: '', poll_type: 'YesNo', options: 'Yes,No', target_scope: 'AllResidents', starts_at: '', ends_at: '', committee_id: '' });
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Polls & Surveys</h1>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Poll question" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Poll context" className="h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <div className="grid gap-4 md:grid-cols-2">
            <select value={form.poll_type} onChange={(event) => setForm({ ...form, poll_type: event.target.value, options: event.target.value === 'YesNo' ? 'Yes,No' : '' })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <option value="YesNo">Yes / No</option>
              <option value="SingleChoice">Single Choice</option>
            </select>
            <select value={form.target_scope} onChange={(event) => setForm({ ...form, target_scope: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              {targets.segments.audience_types.filter((type) => type !== 'CustomUsers').map((type) => <option key={type}>{type}</option>)}
            </select>
            <input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
            <input type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          </div>
          {form.target_scope === 'Committee' && (
            <select value={form.committee_id} onChange={(event) => setForm({ ...form, committee_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <option value="">Select committee</option>
              {targets.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}
            </select>
          )}
          {form.poll_type === 'SingleChoice' && (
            <input value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} placeholder="Comma separated options" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          )}
          <button type="submit" disabled={saving} className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? 'Creating...' : 'Create Poll'}
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Active Polls</h2>
        <div className="mt-4 space-y-3">
          {polls.map((poll) => (
            <div key={poll.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="font-semibold text-slate-900 dark:text-white">{poll.title}</p>
              <p className="mt-2 text-sm text-slate-500">{(poll.options || []).map((option) => option.option_text).join(' / ')}</p>
              <p className="mt-2 text-xs text-slate-400">{poll.response_count} responses</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
