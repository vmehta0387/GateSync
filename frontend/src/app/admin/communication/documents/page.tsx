'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip } from 'lucide-react';
import { buildAudienceFilters, type DocumentItem, emptyHub, fetchCommunicationJson, postCommunicationJson, uploadCommunicationAttachment } from '@/lib/communication';

export default function CommunicationDocumentsPage() {
  const [targets, setTargets] = useState(emptyHub.targets);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'Rules', target_scope: 'AllResidents', file_url: '', is_pinned: false, committee_id: '' });

  const loadPage = async () => {
    try {
      const [hubData, documentsData] = await Promise.all([
        fetchCommunicationJson<{ success: boolean; targets: typeof emptyHub.targets; overview: typeof emptyHub.overview; inbox: [] }>('/hub'),
        fetchCommunicationJson<{ success: boolean; documents: DocumentItem[] }>('/documents'),
      ]);
      if (hubData.success) setTargets(hubData.targets || emptyHub.targets);
      if (documentsData.success) setDocuments(documentsData.documents || []);
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
        setForm((current) => ({ ...current, file_url: data.file!.file_path }));
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
      const data = await postCommunicationJson<{ success: boolean; message?: string }>('/documents', {
        ...form,
        target_filters: buildAudienceFilters(form.target_scope, '', '', form.committee_id ? [Number(form.committee_id)] : []),
      });
      if (!data.success) {
        alert(data.message || 'Unable to share document');
        return;
      }

      setForm({ title: '', description: '', category: 'Rules', target_scope: 'AllResidents', file_url: '', is_pinned: false, committee_id: '' });
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Document title" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Document notes" className="h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
          <div className="grid gap-4 md:grid-cols-2">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              {['Rules', 'Minutes', 'Bills', 'Forms', 'Other'].map((category) => <option key={category}>{category}</option>)}
            </select>
            <select value={form.target_scope} onChange={(event) => setForm({ ...form, target_scope: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              {targets.segments.audience_types.filter((type) => type !== 'CustomUsers').map((type) => <option key={type}>{type}</option>)}
            </select>
          </div>
          {form.target_scope === 'Committee' && (
            <select value={form.committee_id} onChange={(event) => setForm({ ...form, committee_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <option value="">Select committee</option>
              {targets.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}
            </select>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <Paperclip className="h-4 w-4" />
            {uploading ? 'Uploading...' : form.file_url ? 'Replace file' : 'Upload document'}
            <input type="file" className="hidden" onChange={handleUpload} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={form.is_pinned} onChange={(event) => setForm({ ...form, is_pinned: event.target.checked })} /> Pin document</label>
          <button type="submit" disabled={saving} className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? 'Sharing...' : 'Share Document'}
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Document Library</h2>
        <div className="mt-4 space-y-3">
          {documents.map((document) => (
            <div key={document.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="font-semibold text-slate-900 dark:text-white">{document.title}</p>
              <p className="mt-2 text-sm text-slate-500">{document.category} / {document.target_scope}</p>
              <a href={`https://api.gatesync.in${document.file_url}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-brand-600 hover:text-brand-700">Open file</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
