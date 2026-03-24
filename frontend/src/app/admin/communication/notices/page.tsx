'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip, Megaphone } from 'lucide-react';
import {
  buildAudienceFilters,
  emptyHub,
  type NoticeItem,
  type UploadedFile,
  fetchCommunicationJson,
  postCommunicationJson,
  uploadCommunicationAttachment,
} from '@/lib/communication';

export default function CommunicationNoticesPage() {
  const [targets, setTargets] = useState(emptyHub.targets);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    notice_type: 'General',
    audience_type: 'AllResidents',
    publish_at: '',
    is_pinned: false,
    requires_read_receipt: true,
    block_name: '',
    occupancy_type: '',
    committee_id: '',
  });

  const loadPage = async () => {
    try {
      const [hubData, noticesData] = await Promise.all([
        fetchCommunicationJson<{ success: boolean; targets: typeof emptyHub.targets; overview: typeof emptyHub.overview; inbox: [] }>('/hub'),
        fetchCommunicationJson<{ success: boolean; notices: NoticeItem[] }>('/notices'),
      ]);

      if (hubData.success) setTargets(hubData.targets || emptyHub.targets);
      if (noticesData.success) setNotices(noticesData.notices || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void loadPage();
  }, []);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadCommunicationAttachment(file);
      if (data.success && data.file) {
        setUploads((current) => [...current, data.file as UploadedFile]);
      } else {
        alert(data.message || 'Unable to upload attachment');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await postCommunicationJson<{ success: boolean; message?: string }>('/notices', {
        ...form,
        body: form.content,
        audience_filters: buildAudienceFilters(
          form.audience_type,
          form.block_name,
          form.occupancy_type,
          form.committee_id ? [Number(form.committee_id)] : [],
        ),
        attachments: uploads,
      });

      if (!data.success) {
        alert(data.message || 'Unable to create notice');
        return;
      }

      setForm({
        title: '',
        content: '',
        notice_type: 'General',
        audience_type: 'AllResidents',
        publish_at: '',
        is_pinned: false,
        requires_read_receipt: true,
        block_name: '',
        occupancy_type: '',
        committee_id: '',
      });
      setUploads([]);
      await loadPage();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[0.4fr,0.6fr] items-start">
      {/* Create Notice Form */}
      <div className="sticky top-28 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <Megaphone className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Broadcast Notice</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Publish community updates.</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Notice Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Scheduled Water Maintenance" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950/50 dark:text-white dark:focus:bg-slate-900" required />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Message Content</label>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the full details here..." className="h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 custom-scrollbar dark:border-slate-700 dark:bg-slate-950/50 dark:text-white dark:focus:bg-slate-900" required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Category</label>
                <select value={form.notice_type} onChange={(e) => setForm({ ...form, notice_type: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-white custom-select">
                  {targets.segments.notice_types.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Target Audience</label>
                <select value={form.audience_type} onChange={(e) => setForm({ ...form, audience_type: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-white custom-select">
                  {targets.segments.audience_types.filter(t => t !== 'CustomUsers').map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>

              {form.audience_type === 'Tower' && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Select Tower</label>
                  <select value={form.block_name} onChange={(e) => setForm({ ...form, block_name: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-white custom-select">
                    <option value="">Select a tower</option>
                    {targets.towers.map((tower) => <option key={tower}>{tower}</option>)}
                  </select>
                </div>
              )}
              {form.audience_type === 'Occupancy' && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Occupancy Type</label>
                  <select value={form.occupancy_type} onChange={(e) => setForm({ ...form, occupancy_type: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-white custom-select">
                    <option value="">Select occupancy</option>
                    {targets.segments.occupancy_types.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </div>
              )}
              {form.audience_type === 'Committee' && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Committee</label>
                  <select value={form.committee_id} onChange={(e) => setForm({ ...form, committee_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-white custom-select">
                    <option value="">Select committee</option>
                    {targets.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <label className="flex cursor-pointer items-center gap-3 group">
                <div className="relative flex items-center">
                  <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-slate-300 checked:border-brand-500 checked:bg-brand-500 transition-all dark:border-slate-600 outline-none" />
                  <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-white">Pin to Feed Top</span>
              </label>
              
              <label className="flex cursor-pointer items-center gap-3 group">
                <div className="relative flex items-center">
                  <input type="checkbox" checked={form.requires_read_receipt} onChange={(e) => setForm({ ...form, requires_read_receipt: e.target.checked })} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-slate-300 checked:border-brand-500 checked:bg-brand-500 transition-all dark:border-slate-600 outline-none" />
                  <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors dark:text-slate-300 dark:group-hover:text-white">Track Reads</span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-5 border-t border-slate-100 dark:border-slate-800">
              <label className="w-full sm:w-auto inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:bg-brand-900/10 dark:hover:text-brand-400">
                <Paperclip className="h-4 w-4" />
                {uploading ? 'Uploading...' : uploads.length ? `${uploads.length} Attached` : 'Attach File'}
                <input type="file" className="hidden" onChange={handleUpload} />
              </label>
              <button type="submit" disabled={saving} className="w-full sm:w-auto rounded-xl bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-500 hover:shadow-lg focus:ring-4 focus:ring-brand-500/20 disabled:opacity-70 disabled:shadow-none hover:-translate-y-0.5">
                {saving ? 'Publishing...' : 'Publish Notice'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Notice Feed */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between pl-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Live Notice Feed</h2>
          <span className="rounded-full bg-slate-200/50 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{notices.length} Published</span>
        </div>

        <div className="grid gap-4">
          {notices.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <Megaphone className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-4 text-sm font-medium text-slate-500">No active notices. Broadcast a message to your community.</p>
            </div>
          ) : (
            notices.map((notice) => (
              <div key={notice.id} className="group flex flex-col sm:flex-row gap-4 sm:gap-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {notice.is_pinned && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shadow-sm border border-amber-200/50 dark:border-amber-800/50">Pinned</span>}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-300">{notice.notice_type}</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">{notice.audience_type}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors">{notice.title}</h3>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">{notice.content}</p>
                  
                  <div className="mt-5 flex items-center gap-4 text-xs font-semibold text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>{notice.status}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span>{notice.read_count} Total Reads</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
