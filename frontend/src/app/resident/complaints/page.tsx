'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertCircle, PlusCircle } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import {
  type ComplaintCategory,
  type ComplaintDetailResponse,
  type ComplaintSummaryItem,
  fetchComplaintsJson,
  postComplaintsJson,
  uploadComplaintAttachment,
} from '@/lib/complaints';
import { subscribeToComplaintLiveUpdates } from '@/lib/socket';

type FlatOption = { flat_id: number; block_name: string; flat_number: string; type: string };

export default function ResidentComplaintsPage() {
  const session = getStoredSession();
  const [flats, setFlats] = useState<FlatOption[]>([]);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [complaints, setComplaints] = useState<ComplaintSummaryItem[]>([]);
  const [detail, setDetail] = useState<ComplaintDetailResponse | null>(null);
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);
  const [form, setForm] = useState({ flat_id: '', category_id: '', priority: 'Medium', description: '', attachments: [] as Array<{ file_name?: string; file_path: string }> });
  const [messageForm, setMessageForm] = useState({ message: '', attachments: [] as Array<{ file_name?: string; file_path: string }> });
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadBase = useCallback(async () => {
    const token = session.token;
    if (!token) return;

    const [flatsRes, categoriesRes, complaintsRes] = await Promise.all([
      fetch('http://localhost:5000/api/v1/residents/me/flats', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()) as Promise<{ success: boolean; flats: FlatOption[] }>,
      fetchComplaintsJson<{ success: boolean; categories: ComplaintCategory[] }>('/categories'),
      fetchComplaintsJson<{ success: boolean; complaints: ComplaintSummaryItem[] }>('/'),
    ]);

    if (flatsRes.success) setFlats(flatsRes.flats || []);
    if (categoriesRes.success) setCategories(categoriesRes.categories || []);
    if (complaintsRes.success) setComplaints(complaintsRes.complaints || []);
    if (!selectedComplaintId && complaintsRes.success && complaintsRes.complaints?.length) {
      setSelectedComplaintId(complaintsRes.complaints[0].id);
    }
  }, [selectedComplaintId, session.token]);

  const loadDetail = useCallback(async (complaintId: number) => {
    const data = await fetchComplaintsJson<ComplaintDetailResponse>(`/${complaintId}`);
    if (data.success) setDetail(data);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadBase();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadBase]);

  useEffect(() => {
    if (!selectedComplaintId) return;
    const handle = window.setTimeout(() => {
      void loadDetail(selectedComplaintId);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadDetail, selectedComplaintId]);

  useEffect(() => {
    if (!session.user?.id) return;
    const unsubscribe = subscribeToComplaintLiveUpdates([`resident_${session.user.id}`], () => {
      void loadBase();
      if (selectedComplaintId) {
        void loadDetail(selectedComplaintId);
      }
    });
    return unsubscribe;
  }, [loadBase, loadDetail, selectedComplaintId, session.user?.id]);

  const visibleComplaints = useMemo(
    () => complaints.filter((complaint) => statusFilter === 'ALL' || complaint.status === statusFilter),
    [complaints, statusFilter],
  );

  const uploadForForm = async (event: ChangeEvent<HTMLInputElement>, target: 'form' | 'thread') => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await uploadComplaintAttachment(file);
    if (data.success && data.file) {
      if (target === 'form') {
        setForm((current) => ({ ...current, attachments: [...current.attachments, data.file!] }));
      } else {
        setMessageForm((current) => ({ ...current, attachments: [...current.attachments, data.file!] }));
      }
    }
    event.target.value = '';
  };

  const createComplaint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = await postComplaintsJson<{ success: boolean; complaint?: ComplaintSummaryItem; message?: string }>('/', {
      ...form,
      flat_id: Number(form.flat_id),
      category_id: Number(form.category_id),
    });
    if (!data.success) {
      alert(data.message || 'Unable to raise complaint');
      return;
    }
    setForm({ flat_id: '', category_id: '', priority: 'Medium', description: '', attachments: [] });
    await loadBase();
    if (data.complaint?.id) {
      setSelectedComplaintId(data.complaint.id);
    }
  };

  const addMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedComplaintId || !messageForm.message.trim()) return;
    const data = await postComplaintsJson<{ success: boolean }>(`/${selectedComplaintId}/messages`, messageForm);
    if (data.success) {
      setMessageForm({ message: '', attachments: [] });
      await loadDetail(selectedComplaintId);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Helpdesk & Complaints</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Raise issues, attach proof, and follow every update until resolution.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr,1.2fr]">
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <PlusCircle className="h-5 w-5 text-brand-500" />
              <p className="font-semibold text-slate-900 dark:text-white">Raise New Complaint</p>
            </div>
            <form onSubmit={createComplaint} className="mt-4 space-y-4">
              <select value={form.flat_id} onChange={(event) => setForm({ ...form, flat_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <option value="">Select flat</option>
                {flats.map((flat) => <option key={flat.flat_id} value={flat.flat_id}>{flat.block_name}-{flat.flat_number} / {flat.type}</option>)}
              </select>
              <select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <option value="">Select category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                {['Low', 'Medium', 'High'].map((priority) => <option key={priority}>{priority}</option>)}
              </select>
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the problem in detail..." className="h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
              <div className="flex items-center gap-3">
                <label className="rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Upload photo/video
                  <input type="file" className="hidden" onChange={(event) => void uploadForForm(event, 'form')} />
                </label>
                <button type="submit" className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Submit Ticket</button>
              </div>
            </form>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-slate-900 dark:text-white">My Tickets</p>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                {['ALL', 'Open', 'InProgress', 'OnHold', 'Resolved', 'Closed'].map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            <div className="space-y-3">
              {visibleComplaints.map((complaint) => (
                <button key={complaint.id} type="button" onClick={() => setSelectedComplaintId(complaint.id)} className={`w-full rounded-xl border p-4 text-left ${selectedComplaintId === complaint.id ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10' : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/40'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900 dark:text-white">{complaint.ticket_id}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{complaint.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{complaint.category_name}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{complaint.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {detail ? (
            <>
              <div className="glass-panel rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{detail.complaint.ticket_id}</h2>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{detail.complaint.category_name} / {detail.complaint.block_name}-{detail.complaint.flat_number}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{detail.complaint.priority}</span>
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{detail.complaint.status}</span>
                    {detail.complaint.is_overdue && <span className="rounded-full bg-rose-100 px-3 py-1.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">SLA delayed</span>}
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{detail.complaint.description}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="text-slate-500">Assigned</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-white">{detail.assignees.length ? detail.assignees.map((assignee) => assignee.name).join(', ') : 'Awaiting assignment'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="text-slate-500">SLA</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-white">{detail.complaint.sla_deadline ? new Date(detail.complaint.sla_deadline).toLocaleString() : 'Not set'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="text-slate-500">Recurring</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-white">{detail.recurring_count} similar flat issues</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Conversation</h3>
                  <div className="mt-4 space-y-3">
                    {detail.messages.map((message) => (
                      <div key={message.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{message.sender_name}</p>
                          <p className="text-xs text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleString() : 'Now'}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message.message}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={addMessage} className="mt-5 space-y-3">
                    <textarea value={messageForm.message} onChange={(event) => setMessageForm({ ...messageForm, message: event.target.value })} placeholder="Add a follow-up, clarification, or proof..." className="h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
                    <div className="flex items-center gap-3">
                      <label className="rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        Attach proof
                        <input type="file" className="hidden" onChange={(event) => void uploadForForm(event, 'thread')} />
                      </label>
                      <button type="submit" className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Post Update</button>
                    </div>
                  </form>
                </div>

                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Timeline</h3>
                  <div className="mt-4 space-y-3">
                    {detail.history.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/40">
                        <p className="font-semibold text-slate-900 dark:text-white">{entry.status}</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">{entry.note || 'Update recorded'}</p>
                        <p className="mt-1 text-xs text-slate-400">{entry.changed_by_name} / {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Now'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-panel rounded-2xl p-10 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Select a ticket to view the thread, assignment status, and resolution progress.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
