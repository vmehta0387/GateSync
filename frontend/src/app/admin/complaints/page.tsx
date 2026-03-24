'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertTriangle, Clock3, MessageSquare, PlusCircle, Ticket, Search, Filter, CheckCircle2, History, UserPlus, MoreVertical, Send, Paperclip, LayoutDashboard } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import {
  type ComplaintCategory,
  type ComplaintDashboardSummary,
  type ComplaintDetailResponse,
  type ComplaintSummaryItem,
  fetchComplaintsJson,
  postComplaintsJson,
  putComplaintsJson,
  deleteComplaintsJson,
  uploadComplaintAttachment,
} from '@/lib/complaints';
import { fetchCommitteesJson, type CommitteeSummary } from '@/lib/committees';
import { subscribeToComplaintLiveUpdates } from '@/lib/socket';
import { Trash2, Edit2, X, Check } from 'lucide-react';

type StaffOption = { id: number; name: string; type: string };
type AdminOption = { id: number; name: string; role: string };

export default function AdminComplaintsPage() {
  const session = getStoredSession();
  const [summary, setSummary] = useState<ComplaintDashboardSummary | null>(null);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [complaints, setComplaints] = useState<ComplaintSummaryItem[]>([]);
  const [detail, setDetail] = useState<ComplaintDetailResponse | null>(null);
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [adminOptions, setAdminOptions] = useState<AdminOption[]>([]);
  const [committeeOptions, setCommitteeOptions] = useState<CommitteeSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', default_priority: 'Medium', sla_hours: '24' });
  const [updateForm, setUpdateForm] = useState({ status: 'Open', priority: 'Medium', resolution_note: '' });
  const [messageForm, setMessageForm] = useState({ message: '', sender_staff_id: '', attachments: [] as Array<{ file_name?: string; file_path: string }> });
  const [assigneeDrafts, setAssigneeDrafts] = useState<Array<{ assignee_type: 'User' | 'Staff' | 'Committee'; user_id?: number; staff_id?: number; committee_id?: number; label: string }>>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'interaction' | 'admin'>('interaction');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const loadBase = useCallback(async () => {
    const token = session.token;
    if (!token || !session.user?.society_id) return;

    const [summaryData, categoriesData, complaintsData, staffRes, committeesData] = await Promise.all([
      fetchComplaintsJson<{ success: boolean; summary: ComplaintDashboardSummary }>('/summary'),
      fetchComplaintsJson<{ success: boolean; categories: ComplaintCategory[] }>('/categories'),
      fetchComplaintsJson<{ success: boolean; complaints: ComplaintSummaryItem[] }>('/'),
      fetch('http://localhost:5000/api/v1/staff', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()) as Promise<{ success: boolean; staff: StaffOption[] }>,
      fetchCommitteesJson<{ success: boolean; committees: CommitteeSummary[]; available_members: AdminOption[] }>('/'),
    ]);

    if (summaryData.success) setSummary(summaryData.summary);
    if (categoriesData.success) setCategories(categoriesData.categories || []);
    if (complaintsData.success) setComplaints(complaintsData.complaints || []);
    if (staffRes.success) setStaffOptions(staffRes.staff || []);
    if (committeesData.success) {
      setCommitteeOptions(committeesData.committees || []);
      setAdminOptions((committeesData.available_members || []).filter((member) => member.role === 'ADMIN'));
    }

    if (!selectedComplaintId && complaintsData.success && complaintsData.complaints?.length) {
      setSelectedComplaintId(complaintsData.complaints[0].id);
    }
  }, [selectedComplaintId, session.token, session.user?.society_id]);

  const loadDetail = useCallback(async (complaintId: number) => {
    const data = await fetchComplaintsJson<ComplaintDetailResponse>(`/${complaintId}`);
    if (!data.success) return;
    setDetail(data);
    setUpdateForm({
      status: data.complaint.status,
      priority: data.complaint.priority,
      resolution_note: '',
    });
    setAssigneeDrafts(
      data.assignees.map((assignee) => ({
        assignee_type: assignee.assignee_type,
        user_id: assignee.user_id || undefined,
        staff_id: assignee.staff_id || undefined,
        committee_id: assignee.committee_id || undefined,
        label: `${assignee.name} / ${assignee.role_label}`,
      })),
    );
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
    if (!session.user?.society_id) return;
    const unsubscribe = subscribeToComplaintLiveUpdates([`society_${session.user.society_id}_admins`], () => {
      void loadBase();
      if (selectedComplaintId) {
        void loadDetail(selectedComplaintId);
      }
    });
    return unsubscribe;
  }, [loadBase, loadDetail, selectedComplaintId, session.user?.society_id]);

  const visibleComplaints = useMemo(
    () => complaints.filter((complaint) => statusFilter === 'ALL' || complaint.status === statusFilter),
    [complaints, statusFilter],
  );

  const addAssigneeDraft = (draft: { assignee_type: 'User' | 'Staff' | 'Committee'; user_id?: number; staff_id?: number; committee_id?: number; label: string }) => {
    setAssigneeDrafts((current) => {
      const exists = current.some((item) => item.assignee_type === draft.assignee_type && item.user_id === draft.user_id && item.staff_id === draft.staff_id && item.committee_id === draft.committee_id);
      return exists ? current : [...current, draft];
    });
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = await postComplaintsJson<{ success: boolean; message?: string }>('/categories', {
      ...categoryForm,
      sla_hours: Number(categoryForm.sla_hours || 24),
      is_active: true,
    });
    if (data.success) {
      setCategoryForm({ name: '', description: '', default_priority: 'Medium', sla_hours: '24' });
      void loadBase();
    } else {
      alert(data.message || 'Failed to add category');
    }
  };

  const deleteCategory = async (categoryId: number) => {
    const data = await deleteComplaintsJson<{ success: boolean; message?: string }>(`/categories/${categoryId}`);
    if (data.success) {
      void loadBase();
      setDeleteConfirmId(null);
    } else {
      alert(data.message || 'Failed to delete category');
    }
  };

  const updateCategory = async (cat: ComplaintCategory) => {
    const data = await putComplaintsJson<{ success: boolean; message?: string }>(`/categories/${cat.id}`, cat);
    if (data.success) {
      setEditingCategoryId(null);
      void loadBase();
    } else {
      alert(data.message || 'Failed to update category');
    }
  };

  const saveComplaintUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedComplaintId) return;
    const data = await putComplaintsJson<{ success: boolean; message?: string }>(`/${selectedComplaintId}`, updateForm);
    if (data.success) {
      void loadBase();
      void loadDetail(selectedComplaintId);
    }
  };

  const saveAssignments = async () => {
    if (!selectedComplaintId) return;
    const data = await postComplaintsJson<{ success: boolean }>(`/${selectedComplaintId}/assign`, {
      assignees: assigneeDrafts,
    });
    if (data.success) {
      void loadBase();
      void loadDetail(selectedComplaintId);
    }
  };

  const saveMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedComplaintId || !messageForm.message.trim()) return;
    const data = await postComplaintsJson<{ success: boolean }>(`/${selectedComplaintId}/messages`, messageForm);
    if (data.success) {
      setMessageForm({ message: '', sender_staff_id: '', attachments: [] });
      void loadDetail(selectedComplaintId);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await uploadComplaintAttachment(file);
    if (data.success && data.file) {
      setMessageForm((current) => ({
        ...current,
        attachments: [...current.attachments, data.file!],
      }));
    }
    event.target.value = '';
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[700px] rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Sidebar: Ticket Queue */}
      <div className="flex w-full flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 lg:w-96 shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Ticket className="h-5 w-5 text-brand-500" />
              Queue
            </h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { void loadBase(); if (selectedComplaintId) void loadDetail(selectedComplaintId); }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                title="Refresh"
              >
                <Clock3 className="h-4 w-4" />
              </button>
              <button 
                onClick={() => { setSelectedComplaintId(null); setStatusFilter('ALL'); }}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${!selectedComplaintId ? 'bg-brand-100 text-brand-600 dark:bg-brand-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                title="Dashboard Overview"
              >
                <LayoutDashboard className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input 
                value={search} 
                onChange={(event) => setSearch(event.target.value)} 
                placeholder="Search tickets..." 
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900" 
              />
            </div>
            
            <div className="flex gap-1 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {['ALL', 'Open', 'InProgress', 'OnHold', 'Resolved', 'Closed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${statusFilter === status ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-200/50 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1">
          {visibleComplaints.filter(c => !search || c.ticket_id.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800 mb-4 text-slate-400">
                <Ticket className="h-8 w-8 opacity-20" />
              </div>
              <p className="text-sm font-bold text-slate-500">No tickets found</p>
              <p className="mt-1 text-xs text-slate-400">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            visibleComplaints.filter(c => !search || c.ticket_id.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase())).map((complaint) => (
              <button 
                key={complaint.id} 
                type="button" 
                onClick={() => setSelectedComplaintId(complaint.id)} 
                className={`group w-full border-b border-slate-100 p-5 text-left transition-all last:border-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selectedComplaintId === complaint.id ? 'bg-white shadow-sm ring-1 ring-brand-500/20 border-l-4 border-l-brand-500 dark:bg-slate-800/80 dark:ring-slate-700/50 dark:border-l-brand-400' : 'border-l-4 border-l-transparent'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xs font-bold tracking-wider ${selectedComplaintId === complaint.id ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 uppercase'}`}>#{complaint.ticket_id.split('-').pop()}</p>
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 ${
                    complaint.status === 'Open' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                    complaint.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                     {complaint.status}
                  </span>
                </div>
                <p className={`font-bold line-clamp-1 ${selectedComplaintId === complaint.id ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>{complaint.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    <span className="truncate max-w-[100px]">{complaint.category_name}</span>
                    <span className="opacity-30">•</span>
                    <span>{complaint.block_name}-{complaint.flat_number}</span>
                  </div>
                  {complaint.is_overdue && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col bg-slate-50/50 dark:bg-slate-950/20">
        {!selectedComplaintId ? (
          <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-8 dark:border-slate-800">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <LayoutDashboard className="h-3 w-3" /> Command Center
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Helpdesk Hub</h1>
                <p className="max-w-md text-slate-500 dark:text-slate-400">
                  Manage resident tickets, track staff performance, and define service level protocols.
                </p>
              </div>
              
              <div className="flex shrink-0 items-center justify-end gap-3 rounded-3xl border border-slate-100 bg-white/50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/50 backdrop-blur-sm">
                <form onSubmit={saveCategory} className="flex flex-col sm:flex-row items-center gap-2">
                  <input 
                    value={categoryForm.name} 
                    onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} 
                    placeholder="Quick Categorization..." 
                    className="h-10 rounded-xl border border-slate-100 bg-white px-4 text-xs font-bold outline-none ring-brand-500/10 focus:ring-4 dark:border-slate-800 dark:bg-slate-950 dark:text-white sm:w-48"
                    required 
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 items-center gap-1 rounded-xl bg-slate-50 px-3 dark:bg-slate-800">
                      <Clock3 className="h-3 w-3 text-slate-400" />
                      <input 
                        type="number" 
                        value={categoryForm.sla_hours} 
                        onChange={(event) => setCategoryForm({ ...categoryForm, sla_hours: event.target.value })} 
                        className="w-8 bg-transparent text-[11px] font-black outline-none dark:text-white" 
                        title="SLA"
                      />
                    </div>
                    <button type="submit" className="flex h-10 items-center justify-center rounded-xl bg-slate-900 px-6 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-brand-600 active:scale-95 shadow-md dark:bg-white dark:text-slate-900 dark:hover:bg-brand-500 dark:hover:text-white">
                      Build
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Open Incidents', value: summary?.open_tickets || 0, icon: Ticket, sub: 'Unresolved', trend: (summary?.open_tickets || 0) > 0 ? 'Needs Dispatch' : 'Clear Queue', col: 'brand' }, 
                { label: 'SLA Breach', value: summary?.overdue_tickets || 0, icon: AlertTriangle, sub: 'Critical Risk', trend: (summary?.overdue_tickets || 0) > 0 ? 'Immediate Action' : 'All within SLA', col: 'rose' }, 
                { label: 'Active Force', value: summary?.staff_performance.length || 0, icon: Clock3, sub: 'Staff Online', trend: (summary?.staff_performance.length || 0) > 0 ? 'Optimizing Load' : 'Awaiting Dispatch', col: 'amber' }, 
                { label: 'Success Rate', value: summary?.success_rate || '100%', icon: CheckCircle2, sub: 'Historical Average', trend: 'System Health', col: 'emerald' }
              ].map((item) => (
                <div key={item.label} className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 border-b-4 border-b-slate-100 hover:border-b-brand-500 dark:border-b-slate-800 dark:hover:border-b-brand-400">
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl shadow-inner transition-colors ${
                    item.col === 'rose' ? 'bg-rose-50 text-rose-500 dark:bg-rose-500/10' : 
                    item.col === 'amber' ? 'bg-amber-50 text-amber-500 dark:bg-amber-500/10' : 
                    item.col === 'emerald' ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10' : 
                    'bg-brand-50 text-brand-500 dark:bg-brand-500/10'
                  }`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                  <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">{item.value}</p>
                  <div className="mt-3 border-t border-slate-50 pt-3 dark:border-slate-800">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.trend}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
              <div className="lg:col-span-12 xl:col-span-7 space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-50 dark:border-slate-800">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">System Categories</h3>
                      <p className="text-xs font-medium text-slate-500">Service Level protocols for routing tickets.</p>
                    </div>
                    <span className="rounded-2xl bg-slate-100 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800">{categories.length} protocols</span>
                  </div>
                  
                  <div className="space-y-4">
                    {categories.map((cat) => {
                      const isEditing = editingCategoryId === cat.id;
                      const insight = summary?.category_breakdown.find(i => i.label === cat.name);
                      
                      return (
                        <div key={cat.id} className={`group relative overflow-hidden rounded-3xl border transition-all p-6 ${isEditing ? 'border-brand-500 bg-brand-50/20 shadow-lg dark:bg-brand-500/10' : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-lg dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/80'}`}>
                          {isEditing ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="sm:col-span-2 space-y-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Title</label>
                                  <input 
                                    defaultValue={cat.name} 
                                    onBlur={(e) => updateCategory({ ...cat, name: e.target.value })}
                                    className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-bold shadow-sm outline-none dark:bg-slate-900 dark:text-white" 
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">SLA (Hrs)</label>
                                  <input 
                                    type="number" 
                                    defaultValue={cat.sla_hours} 
                                    onBlur={(e) => updateCategory({ ...cat, sla_hours: Number(e.target.value) })}
                                    className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-bold shadow-sm outline-none dark:bg-slate-900 dark:text-white" 
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Internal Description</label>
                                <textarea 
                                  defaultValue={cat.description} 
                                  onBlur={(e) => updateCategory({ ...cat, description: e.target.value })}
                                  className="w-full resize-none rounded-xl bg-white px-4 py-2.5 text-xs font-medium shadow-sm outline-none dark:bg-slate-900 dark:text-white" 
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setEditingCategoryId(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all">Cancel</button>
                                <button onClick={() => setEditingCategoryId(null)} className="rounded-xl bg-brand-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md hover:bg-brand-500 transition-all">Done</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-black tracking-tight text-slate-900 dark:text-white">{cat.name}</span>
                                    <span className={`rounded-xl px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter ${
                                      cat.default_priority === 'High' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400' : 
                                      cat.default_priority === 'Medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' : 
                                      'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                      {cat.default_priority}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-1">{cat.description || 'Global service level defined.'}</p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={() => setEditingCategoryId(cat.id)} className="p-2 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors" title="Edit Protocol"><Edit2 className="h-4 w-4" /></button>
                                  {deleteConfirmId === cat.id ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => void deleteCategory(cat.id)} className="rounded-lg bg-rose-600 px-3 py-1 text-[9px] font-black uppercase text-white shadow-md">Confirm</button>
                                      <button onClick={() => setDeleteConfirmId(null)} className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"><X className="h-3 w-3" /></button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setDeleteConfirmId(cat.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors" title="Retire Protocol"><Trash2 className="h-4 w-4" /></button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-6">
                                   <div className="flex flex-col">
                                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Queue Load</span>
                                     <span className="text-sm font-black text-slate-900 dark:text-white">{insight?.total || 0} Open</span>
                                   </div>
                                   <div className="flex flex-col border-l border-slate-200 pl-6 dark:border-slate-800">
                                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Response Target</span>
                                     <span className="text-sm font-black text-brand-600 dark:text-brand-400">{cat.sla_hours}H</span>
                                   </div>
                                </div>
                                <div className="flex-1 max-w-[140px] pt-1">
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                    <div 
                                      className="h-full rounded-full bg-slate-900 dark:bg-slate-100 transition-all duration-700" 
                                      style={{ width: `${Math.min(100, ((insight?.total || 0) / (summary?.open_tickets || 1)) * 100)}%` }} 
                                    />
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-12 xl:col-span-5 space-y-8">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-6 border-b border-slate-50 dark:border-slate-800 pb-4">Personnel Efficiency</h3>
                  <div className="space-y-6">
                    {(summary?.staff_performance || []).slice(0, 6).map((item, idx) => (
                      <div key={`${item.name}-${item.type}`} className="flex items-center gap-5 transition-all hover:translate-x-1">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-black shadow-inner ${
                          idx === 0 ? 'bg-amber-100 text-amber-600' :
                          idx === 1 ? 'bg-slate-100 text-slate-600' :
                          'bg-slate-50 text-slate-400 dark:bg-slate-800'
                        }`}>
                          {item.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-black text-slate-900 dark:text-white">{item.name}</p>
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{Math.round((item.resolved_count / (item.total_assigned || 1)) * 100)}% Match</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.type}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-200" />
                            <span className="text-[9px] font-bold text-slate-500">{item.resolved_count} / {item.total_assigned} Operations</span>
                          </div>
                          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div 
                              className={`h-full rounded-full transition-all duration-1000 ${idx === 0 ? 'bg-brand-600' : 'bg-slate-900 dark:bg-slate-100'}`} 
                              style={{ width: `${(item.resolved_count / (item.total_assigned || 1)) * 100}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!summary?.staff_performance?.length) && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="rounded-full bg-slate-50 p-4 dark:bg-slate-800/50 mb-4">
                          <Clock3 className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest italic">Awaiting Field Operations</p>
                        <p className="mt-1 text-[10px] text-slate-400 font-medium">No active ticket assignments found for staff.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : detail ? (
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-slate-100 bg-white/80 px-6 py-6 dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-md z-10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Ticket #{detail.complaint.ticket_id.split('-').pop()}</h2>
                    <span className={`rounded-xl px-3 py-1 text-[11px] font-black uppercase tracking-widest ${
                      detail.complaint.priority === 'High' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                      detail.complaint.priority === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                      'bg-slate-100 text-slate-600 dark:bg-slate-800'
                    }`}>
                      {detail.complaint.priority} Priority
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                    {detail.complaint.category_name} • {detail.complaint.block_name}-{detail.complaint.flat_number} • Raised by <span className="text-slate-900 dark:text-slate-200 font-bold">{detail.complaint.resident_name || 'Resident'}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 shadow-sm border border-emerald-100 dark:border-emerald-500/20 uppercase tracking-widest">{detail.complaint.status}</span>
                  {detail.complaint.escalation_level > 0 && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-100 dark:border-amber-500/20 uppercase tracking-widest">Escalated L{detail.complaint.escalation_level}</span>}
                </div>
              </div>
              
              {/* Premium Segmented Navigation Tabs */}
              <div className="mt-8 flex w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-950 max-w-md">
                {(['interaction', 'admin'] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800 dark:text-white dark:ring-white/10' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'}`}>
                    {tab === 'interaction' ? 'Conversation' : 'Administration'}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Tabs */}
            <div className="flex-1 p-6 lg:p-10 bg-slate-50/30 dark:bg-slate-950/20">
              {activeTab === 'interaction' && (
                <div className="flex h-full flex-col max-w-5xl mx-auto rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex-1 p-6 space-y-8 bg-slate-50/50 dark:bg-slate-950/30">
                    {/* Complaint Original Post */}
                    <div className="flex justify-start">
                      <div className="flex max-w-[85%] gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700 mt-1 dark:bg-brand-500/20 dark:text-brand-400">
                          {detail.complaint.resident_name?.charAt(0).toUpperCase() || 'R'}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 mb-2 px-1">
                            <span className="text-xs font-black text-slate-900 dark:text-white">{detail.complaint.resident_name || 'Resident'}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Issue</span>
                          </div>
                          <div className="px-6 py-4 shadow-sm text-sm leading-relaxed border border-slate-200 bg-white rounded-3xl rounded-tl-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {detail.complaint.description}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-slate-50 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:bg-slate-950/30">Conversation Started</span>
                      </div>
                    </div>

                    {detail.messages.map((message) => {
                      const isMine = message.sender_type === 'Admin';
                      return (
                        <div key={message.id} className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className="flex max-w-[85%] gap-4">
                            {!isMine && (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500 mt-1 dark:bg-slate-800">
                                {message.sender_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <div className={`flex items-center gap-2 mb-2 px-1 ${isMine ? 'justify-end' : ''}`}>
                                <span className="text-xs font-black text-slate-900 dark:text-white">{message.sender_name}</span>
                                <span className="text-[10px] font-bold text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Now'}</span>
                              </div>
                              <div className={`px-6 py-4 shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${isMine ? 'rounded-3xl rounded-tr-sm bg-brand-600 text-white' : 'rounded-3xl rounded-tl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
                                {message.message}
                              </div>
                            </div>
                            {isMine && (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-600 mt-1 dark:bg-brand-500/10 dark:text-brand-400">
                                AD
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 shadow-lg">
                    <form onSubmit={saveMessage} className="relative rounded-3xl border border-slate-200 bg-slate-50 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 transition-all">
                      <div className="flex items-center gap-3 px-5 pt-3 border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Replying as:</span>
                        <select 
                          value={messageForm.sender_staff_id} 
                          onChange={(event) => setMessageForm({ ...messageForm, sender_staff_id: event.target.value })} 
                          className="bg-transparent text-[10px] font-black uppercase tracking-widest text-brand-600 outline-none dark:text-brand-400"
                        >
                          <option value="">Society Admin</option>
                          {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} ({staff.type})</option>)}
                        </select>
                      </div>
                      <textarea 
                        value={messageForm.message} 
                        onChange={(event) => setMessageForm({ ...messageForm, message: event.target.value })} 
                        placeholder="Share an update with the resident..." 
                        className="h-24 w-full resize-none bg-transparent px-6 py-4 text-sm font-medium outline-none dark:text-white" 
                        required 
                      />
                      <div className="flex items-center justify-between px-4 py-3 border-slate-200/50 dark:border-slate-800/50">
                        <div className="flex items-center gap-2">
                          <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800">
                            <Paperclip className="h-5 w-5" />
                            <input type="file" className="hidden" onChange={handleUpload} />
                          </label>
                          {messageForm.attachments.length > 0 && (
                            <span className="text-[10px] font-black text-brand-600 dark:text-brand-400">{messageForm.attachments.length} attached</span>
                          )}
                        </div>
                        <button type="submit" disabled={!messageForm.message.trim()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-2.5 text-sm font-black text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
                          <Send className="h-4 w-4" /> Send Update
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {activeTab === 'admin' && (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 max-w-7xl mx-auto w-full">
                  <div className="lg:col-span-8 space-y-8">
                    {/* Status & Priority Controls */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-slate-400" /> Ticket Controls
                      </h3>
                      <form onSubmit={saveComplaintUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Current Status</label>
                          <select 
                            value={updateForm.status} 
                            onChange={(event) => setUpdateForm({ ...updateForm, status: event.target.value })} 
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            {['Open', 'InProgress', 'OnHold', 'Resolved', 'Closed'].map((status) => <option key={status}>{status}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Urgency Level</label>
                          <select 
                            value={updateForm.priority} 
                            onChange={(event) => setUpdateForm({ ...updateForm, priority: event.target.value })} 
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            {['Low', 'Medium', 'High'].map((priority) => <option key={priority}>{priority}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Resolution Summary / Note</label>
                          <textarea 
                            value={updateForm.resolution_note} 
                            onChange={(event) => setUpdateForm({ ...updateForm, resolution_note: event.target.value })} 
                            placeholder="Detail the steps taken or final resolution outcome..." 
                            className="h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm font-medium outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" 
                          />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                          <button type="submit" className="rounded-2xl bg-brand-600 px-8 py-3.5 text-sm font-black text-white shadow-lg transition-all hover:bg-brand-500 hover:scale-105 active:scale-95">
                            Update Ticket State
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Timeline */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-2">
                        <History className="h-5 w-5 text-slate-400" /> Audit Timeline
                      </h3>
                      <div className="relative pl-8 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                        {detail.history.map((entry) => (
                          <div key={entry.id} className="relative group">
                            <div className="absolute -left-[2.1rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300 ring-4 ring-white transition-all group-hover:bg-brand-500 dark:border-slate-900 dark:bg-slate-700 dark:ring-slate-900" />
                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                              <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-widest">{entry.status}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">{entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Now'}</p>
                            </div>
                            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{entry.note || `Status transitioned to ${entry.status}`}</p>
                            <p className="mt-2 text-[10px] font-black text-slate-400 uppercase">Actor: {entry.changed_by_name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4 space-y-8">
                    {/* Ownership/Assignees */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-slate-400" /> Case Owners
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {assigneeDrafts.map((assignee) => (
                            <div key={`${assignee.assignee_type}-${assignee.user_id || assignee.staff_id || assignee.committee_id}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white">{assignee.label.split('/')[0]}</span>
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{assignee.label.split('/')[1] || assignee.assignee_type}</span>
                              </div>
                              <button type="button" onClick={() => setAssigneeDrafts((current) => current.filter((item) => item !== assignee))} className="text-slate-400 transition-colors hover:text-rose-500">
                                <PlusCircle className="h-4 w-4 rotate-45" />
                              </button>
                            </div>
                          ))}
                          {assigneeDrafts.length === 0 && (
                            <p className="text-xs text-slate-500 py-4 text-center italic border border-dashed border-slate-200 rounded-2xl dark:border-slate-800">No active owners</p>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                          <select 
                            onChange={(event) => { 
                              const user = adminOptions.find((item) => item.id === Number(event.target.value)); 
                              if (user) addAssigneeDraft({ assignee_type: 'User', user_id: user.id, label: `${user.name} / Admin` }); 
                              event.target.value = ''; 
                            }} 
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          >
                            <option value="">+ Assign Admin</option>
                            {adminOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                          </select>
                          <select 
                            onChange={(event) => { 
                              const staff = staffOptions.find((item) => item.id === Number(event.target.value)); 
                              if (staff) addAssigneeDraft({ assignee_type: 'Staff', staff_id: staff.id, label: `${staff.name} / ${staff.type}` }); 
                              event.target.value = ''; 
                            }} 
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          >
                            <option value="">+ Assign Staff</option>
                            {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} ({staff.type})</option>)}
                          </select>
                        </div>
                        
                        <button 
                          type="button" 
                          onClick={() => void saveAssignments()} 
                          className="w-full rounded-2xl bg-slate-900 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:shadow-lg dark:bg-white dark:text-slate-900"
                        >
                          Sync Owners
                        </button>
                      </div>
                    </div>

                    {/* Meta Insights */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-slate-400" /> Case Intelligence
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-500">Recurring Profile</p>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${detail.recurring_count > 1 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                            {detail.recurring_count > 1 ? 'High Frequency' : 'Standard'}
                          </span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-400 font-medium">This flat has reported similar issues <span className="text-slate-900 dark:text-white font-black">{detail.recurring_count} times</span> in the past 6 months.</p>
                        
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                           <p className="text-xs font-medium text-slate-500 mb-2">SLA Status</p>
                           <div className="flex items-center gap-2">
                             <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                               <div className="h-full bg-emerald-500 w-[70%]" />
                             </div>
                             <span className="text-[10px] font-black text-emerald-600">Active</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 mb-6 dark:bg-slate-900 transition-transform hover:scale-110">
                <Ticket className="h-10 w-10 text-slate-300" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Select a Ticket</p>
              <p className="mt-3 text-sm font-medium text-slate-500 leading-relaxed dark:text-slate-400">
                Choose a record from the queue to start communication or update internal records.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
