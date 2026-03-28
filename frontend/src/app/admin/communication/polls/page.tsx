'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { buildAudienceFilters, type PollItem, emptyHub, fetchCommunicationJson, postCommunicationJson } from '@/lib/communication';

export default function CommunicationPollsPage() {
  const [targets, setTargets] = useState(emptyHub.targets);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
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

  const selectedPoll = polls.find((poll) => poll.id === selectedPollId) || polls[0] || null;

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
      setSelectedPollId(null);
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
        {selectedPoll ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedPoll.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedPoll.created_by_name || 'Admin'}
                  {selectedPoll.starts_at ? ` / Starts ${new Date(selectedPoll.starts_at).toLocaleString()}` : ''}
                  {selectedPoll.ends_at ? ` / Ends ${new Date(selectedPoll.ends_at).toLocaleString()}` : ''}
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                {selectedPoll.response_count} responses
              </span>
            </div>
            {selectedPoll.description ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{selectedPoll.description}</p>
            ) : null}
            <div className="mt-4 space-y-3">
              {selectedPoll.options.map((option, index) => (
                <div key={`${selectedPoll.id}-${option.id || index}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900 dark:text-white">{option.option_text}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {option.response_count || 0} vote(s)
                    </span>
                  </div>
                  {option.respondents?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {option.respondents.map((respondent) => (
                        <span
                          key={`${selectedPoll.id}-${option.id}-${respondent.user_id}`}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {respondent.user_name}
                          {respondent.block_name && respondent.flat_number ? ` / ${respondent.block_name}-${respondent.flat_number}` : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">No responses for this option yet.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {polls.map((poll) => (
            <button
              key={poll.id}
              type="button"
              onClick={() => setSelectedPollId(poll.id)}
              className={`w-full rounded-xl border p-4 text-left transition ${
                selectedPoll?.id === poll.id
                  ? 'border-brand-300 bg-brand-50/70 dark:border-brand-700 dark:bg-brand-500/10'
                  : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/40'
              }`}
            >
              <p className="font-semibold text-slate-900 dark:text-white">{poll.title}</p>
              <p className="mt-2 text-sm text-slate-500">{(poll.options || []).map((option) => `${option.option_text} (${option.response_count || 0})`).join(' / ')}</p>
              <p className="mt-2 text-xs text-slate-400">{poll.response_count} total responses</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
