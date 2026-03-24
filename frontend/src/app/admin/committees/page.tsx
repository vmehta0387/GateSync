'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { FileText, Landmark, MessageSquare, ShieldCheck, Vote, Plus, Users, LayoutDashboard, PenSquare } from 'lucide-react';
import {
  type CommitteeCandidate,
  type CommitteeDetail,
  type CommitteeMember,
  type CommitteeSummary,
  type CommitteeTemplate,
  fetchCommitteesJson,
  patchCommitteesJson,
  postCommitteesJson,
  putCommitteesJson,
} from '@/lib/committees';
import { uploadCommunicationAttachment } from '@/lib/communication';

const emptyCommitteeForm = {
  committee_type: 'CoreCommittee',
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  is_public: true,
  status: 'Active',
};

const emptyMemberDraft = {
  user_id: '',
  role_title: '',
  permission_scope: 'ViewOnly',
  tenure_start_date: '',
  tenure_end_date: '',
  is_primary_contact: false,
};

export default function CommitteeManagementPage() {
  const [templates, setTemplates] = useState<CommitteeTemplate[]>([]);
  const [permissionScopes, setPermissionScopes] = useState<string[]>([]);
  const [availableMembers, setAvailableMembers] = useState<CommitteeCandidate[]>([]);
  const [committees, setCommittees] = useState<CommitteeSummary[]>([]);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CommitteeDetail | null>(null);
  const [committeeForm, setCommitteeForm] = useState(emptyCommitteeForm);
  const [memberDraft, setMemberDraft] = useState(emptyMemberDraft);
  const [draftMembers, setDraftMembers] = useState<CommitteeMember[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'chat' | 'tasks' | 'votes' | 'documents'>('members');
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [savingCommittee, setSavingCommittee] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatUploads, setChatUploads] = useState<Array<{ file_name?: string; file_path: string }>>([]);
  const [decisionLog, setDecisionLog] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_member_id: '', due_date: '', priority: 'Medium' });
  const [voteForm, setVoteForm] = useState({ title: '', description: '', decision_type: 'YesNo', options: 'Yes,No', closes_at: '' });
  const [documentForm, setDocumentForm] = useState({ title: '', category: 'Minutes', file_url: '' });

  const loadCommittees = useCallback(async () => {
    const data = await fetchCommitteesJson<{
      success: boolean;
      templates: CommitteeTemplate[];
      permission_scopes: string[];
      committees: CommitteeSummary[];
      available_members: CommitteeCandidate[];
    }>('/');

    if (!data.success) return;

    setTemplates(data.templates || []);
    setPermissionScopes(data.permission_scopes || []);
    setAvailableMembers(data.available_members || []);
    setCommittees(data.committees || []);

    if (!selectedCommitteeId && data.committees?.length) {
      setSelectedCommitteeId(data.committees[0].id);
    }
  }, [selectedCommitteeId]);

  const loadDetail = useCallback(async (committeeId: number) => {
    const data = await fetchCommitteesJson<CommitteeDetail & { success: boolean }>(`/${committeeId}`);
    if (!data.success) return;

    setDetail(data);
    setCommitteeForm({
      committee_type: data.committee.committee_type,
      name: data.committee.name,
      description: data.committee.description || '',
      start_date: data.committee.start_date || '',
      end_date: data.committee.end_date || '',
      is_public: data.committee.is_public,
      status: data.committee.status,
    });
    setDraftMembers(
      (data.members || []).map((member) => ({
        user_id: member.user_id,
        role_title: member.role_title,
        permission_scope: member.permission_scope,
        tenure_start_date: member.tenure_start_date,
        tenure_end_date: member.tenure_end_date,
        is_primary_contact: member.is_primary_contact,
        name: member.name,
        phone_number: member.phone_number,
      })),
    );
  }, []);

  useEffect(() => {
    void loadCommittees();
  }, [loadCommittees]);

  useEffect(() => {
    if (!selectedCommitteeId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedCommitteeId);
  }, [loadDetail, selectedCommitteeId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === committeeForm.committee_type) || templates[0] || null,
    [committeeForm.committee_type, templates],
  );

  const selectedCommittee = useMemo(
    () => committees.find((committee) => committee.id === selectedCommitteeId) || null,
    [committees, selectedCommitteeId],
  );

  const resetForNewCommittee = () => {
    setSelectedCommitteeId(null);
    setDetail(null);
    setCommitteeForm(emptyCommitteeForm);
    setDraftMembers([]);
    setMemberDraft(emptyMemberDraft);
    setActiveTab('members');
    setIsCreating(true);
  };

  const addMemberDraft = () => {
    const userId = Number(memberDraft.user_id);
    if (!userId) return;
    const candidate = availableMembers.find((member) => member.id === userId);
    if (!candidate) return;

    setDraftMembers((current) => {
      const filtered = current.filter((member) => member.user_id !== userId);
      return [
        ...filtered,
        {
          user_id: userId,
          role_title: memberDraft.role_title || selectedTemplate?.default_roles[0] || 'Member',
          permission_scope: memberDraft.permission_scope,
          tenure_start_date: memberDraft.tenure_start_date || null,
          tenure_end_date: memberDraft.tenure_end_date || null,
          is_primary_contact: memberDraft.is_primary_contact,
          name: candidate.name,
          phone_number: candidate.phone_number,
        },
      ];
    });
    setMemberDraft(emptyMemberDraft);
  };

  const saveCommittee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingCommittee(true);
    try {
      const payload = {
        ...committeeForm,
        members: draftMembers,
      };

      const data = selectedCommitteeId
        ? await putCommitteesJson<{ success: boolean; message?: string }>(`/${selectedCommitteeId}`, payload)
        : await postCommitteesJson<{ success: boolean; message?: string; committee_id?: number }>('/', payload);

      if (!data.success) {
        alert(data.message || 'Unable to save committee');
        return;
      }

      await loadCommittees();
        if (!selectedCommitteeId && 'committee_id' in data && data.committee_id) {
          setSelectedCommitteeId(data.committee_id as number);
        } else if (selectedCommitteeId) {
        await loadDetail(selectedCommitteeId);
      }
    } finally {
      setSavingCommittee(false);
    }
  };

  const sendCommitteeMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCommitteeId || !chatMessage.trim()) return;
    const data = await postCommitteesJson<{ success: boolean }>(`/${selectedCommitteeId}/messages`, {
      content: chatMessage,
      attachments: chatUploads,
      is_decision_log: decisionLog,
    });
    if (data.success) {
      setChatMessage('');
      setChatUploads([]);
      setDecisionLog(false);
      await loadDetail(selectedCommitteeId);
    }
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCommitteeId) return;
    const data = await postCommitteesJson<{ success: boolean }>(`/${selectedCommitteeId}/tasks`, taskForm);
    if (data.success) {
      setTaskForm({ title: '', description: '', assigned_member_id: '', due_date: '', priority: 'Medium' });
      await loadDetail(selectedCommitteeId);
    }
  };

  const updateTaskStatus = async (taskId: number, status: string) => {
    const data = await patchCommitteesJson<{ success: boolean }>(`/tasks/${taskId}`, { status });
    if (data.success && selectedCommitteeId) {
      await loadDetail(selectedCommitteeId);
    }
  };

  const createVote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCommitteeId) return;
    const data = await postCommitteesJson<{ success: boolean }>(`/${selectedCommitteeId}/votes`, {
      ...voteForm,
      options: voteForm.options.split(',').map((item) => item.trim()).filter(Boolean),
    });
    if (data.success) {
      setVoteForm({ title: '', description: '', decision_type: 'YesNo', options: 'Yes,No', closes_at: '' });
      await loadDetail(selectedCommitteeId);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>, onDone: (filePath: string, fileName?: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await uploadCommunicationAttachment(file);
    if (data.success && data.file) {
      onDone(data.file.file_path, data.file.file_name);
    }
    event.target.value = '';
  };

  const saveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCommitteeId || !documentForm.file_url) return;
    const data = await postCommitteesJson<{ success: boolean }>(`/${selectedCommitteeId}/documents`, documentForm);
    if (data.success) {
      setDocumentForm({ title: '', category: 'Minutes', file_url: '' });
      await loadDetail(selectedCommitteeId);
    }
  };

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[700px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Sidebar: Committees List */}
      <div className="flex w-full flex-col border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 sm:w-80 md:w-96 shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Landmark className="h-5 w-5 text-brand-500" />
              Committees
            </h2>
            <button onClick={resetForNewCommittee} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20" title="New Committee">
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search committees..." className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-4 pr-4 text-sm font-medium outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900" />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {committees.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <div className="p-8 text-center text-sm font-medium text-slate-500">No committees found.</div>
          ) : (
            committees.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).map((committee) => (
              <button key={committee.id} type="button" onClick={() => { setSelectedCommitteeId(committee.id); setIsCreating(false); }} className={`group w-full border-b border-slate-100 p-5 text-left transition-all last:border-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selectedCommitteeId === committee.id && !isCreating ? 'bg-white shadow-sm ring-1 ring-brand-500/20 border-l-4 border-l-brand-500 dark:bg-slate-800/80 dark:ring-slate-700/50 dark:border-l-brand-400' : 'border-l-4 border-l-transparent'}`}>
                <div className="flex items-center justify-between">
                  <p className={`font-bold truncate ${selectedCommitteeId === committee.id && !isCreating ? 'text-brand-600 dark:text-brand-400' : 'text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400'}`}>{committee.name}</p>
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 ${committee.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                     {committee.status}
                  </span>
                </div>
                <p className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${selectedCommitteeId === committee.id && !isCreating ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500'}`}>
                  <Users className="h-3.5 w-3.5" /> {committee.member_count} Members
                  <span className="mx-1 opacity-50">•</span>
                  {committee.committee_type}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 flex-col bg-slate-50/50 dark:bg-slate-950/20 overflow-y-auto custom-scrollbar">
        {isCreating ? (
           <div className="p-6 lg:p-10">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <PenSquare className="h-8 w-8 text-brand-500" />
                    {selectedCommitteeId ? 'Edit Committee' : 'Create Committee'}
                  </h1>
                  <p className="mt-2 text-slate-500 dark:text-slate-400">Establish an official group, define roles, and structure your operations.</p>
                </div>

                <form onSubmit={saveCommittee} className="space-y-8">
                  {/* Basic Details */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                     <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                       <LayoutDashboard className="h-5 w-5 text-slate-400" /> Basic Details
                     </h2>
                     <div className="grid gap-5">
                       <select value={committeeForm.committee_type} onChange={(event) => setCommitteeForm({ ...committeeForm, committee_type: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                         {templates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
                       </select>
                       <input value={committeeForm.name} onChange={(event) => setCommitteeForm({ ...committeeForm, name: event.target.value })} placeholder="Committee Name e.g. Finance Audit Group" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                       <textarea value={committeeForm.description} onChange={(event) => setCommitteeForm({ ...committeeForm, description: event.target.value })} placeholder={selectedTemplate?.description || 'Describe this committee'} className="h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                       <div className="grid gap-5 md:grid-cols-2">
                         <div>
                           <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Start Date</label>
                           <input type="date" value={committeeForm.start_date} onChange={(event) => setCommitteeForm({ ...committeeForm, start_date: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                         </div>
                         <div>
                           <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">End Date (Optional)</label>
                           <input type="date" value={committeeForm.end_date} onChange={(event) => setCommitteeForm({ ...committeeForm, end_date: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                         </div>
                       </div>
                       <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 pt-2">
                         <div className="flex items-center gap-3">
                           <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Status</span>
                           <select value={committeeForm.status} onChange={(event) => setCommitteeForm({ ...committeeForm, status: event.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                             {['Draft', 'Active', 'Inactive', 'Archived'].map((status) => <option key={status}>{status}</option>)}
                           </select>
                         </div>
                         <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                           <input type="checkbox" checked={committeeForm.is_public} onChange={(event) => setCommitteeForm({ ...committeeForm, is_public: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:ring-offset-slate-900" />
                           Show in resident directory
                         </label>
                       </div>
                     </div>
                  </div>

                  {/* Draft Members */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                     <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                       <Users className="h-5 w-5 text-slate-400" /> Member Composition
                     </h2>
                     <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-950/20">
                       <div className="grid gap-4 md:grid-cols-2">
                         <select value={memberDraft.user_id} onChange={(event) => setMemberDraft({ ...memberDraft, user_id: event.target.value })} className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                           <option value="">Select a resident, admin, or guard...</option>
                           {availableMembers.map((member) => <option key={member.id} value={member.id}>{member.name} / {member.role}{member.block_name ? ` / ${member.block_name}-${member.flat_number}` : ''}</option>)}
                         </select>
                         <input value={memberDraft.role_title} onChange={(event) => setMemberDraft({ ...memberDraft, role_title: event.target.value })} placeholder={selectedTemplate?.default_roles.join(', ') || 'Role title (e.g. Secretary)'} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                         <select value={memberDraft.permission_scope} onChange={(event) => setMemberDraft({ ...memberDraft, permission_scope: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                           {permissionScopes.map((scope) => <option key={scope}>{scope}</option>)}
                         </select>
                         <input type="date" value={memberDraft.tenure_start_date} onChange={(event) => setMemberDraft({ ...memberDraft, tenure_start_date: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950" />
                         <input type="date" value={memberDraft.tenure_end_date} onChange={(event) => setMemberDraft({ ...memberDraft, tenure_end_date: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950" />
                       </div>
                       <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-200/50 pt-4 dark:border-slate-700/50">
                         <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                           <input type="checkbox" checked={memberDraft.is_primary_contact} onChange={(event) => setMemberDraft({ ...memberDraft, is_primary_contact: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900" /> 
                           Mark as primary contact
                         </label>
                         <button type="button" onClick={addMemberDraft} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 disabled:opacity-50">
                           <Plus className="mr-2 h-4 w-4" /> Add to Roster
                         </button>
                       </div>
                     </div>
                     {draftMembers.length > 0 && (
                       <div className="mt-6 space-y-3">
                         {draftMembers.map((member) => (
                           <div key={member.user_id} className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-slate-200 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700">
                             <div>
                               <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                 {member.name || `User ID: ${member.user_id}`}
                                 {member.is_primary_contact && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">Primary</span>}
                               </p>
                               <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                 <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">{member.role_title}</span>
                                 <span className="opacity-50">•</span>
                                 <span>{member.permission_scope}</span>
                               </div>
                             </div>
                             <button type="button" onClick={() => setDraftMembers((current) => current.filter((item) => item.user_id !== member.user_id))} className="text-sm font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300">Remove</button>
                           </div>
                         ))}
                       </div>
                     )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4">
                    <button type="button" onClick={() => { setIsCreating(false); if (!selectedCommitteeId && committees.length) setSelectedCommitteeId(committees[0].id); }} className="rounded-xl px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                    <button type="submit" disabled={savingCommittee} className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-8 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/20 transition-all hover:-translate-y-0.5 hover:bg-brand-500 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-brand-600">
                      {savingCommittee ? 'Saving...' : selectedCommitteeId ? 'Update Committee' : 'Create Committee'}
                    </button>
                  </div>
                </form>
              </div>
           </div>
        ) : selectedCommittee && detail ? (
          <div className="flex h-full flex-col">
            {/* Committee Dashboard Header */}
            <div className="flex-shrink-0 border-b border-slate-100 bg-white/80 px-6 py-6 dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-md z-10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedCommittee.name}</h2>
                  <p className="mt-1.5 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">{selectedCommittee.description || 'Structured society group with tracked responsibilities and communication.'}</p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 text-xs font-bold uppercase tracking-wider">
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{selectedCommittee.committee_type}</span>
                  <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 shadow-sm">{selectedCommittee.status}</span>
                </div>
              </div>
              
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-4">
                {[{ label: 'Total Members', value: selectedCommittee.member_count, icon: Users }, { label: 'Active Tasks', value: selectedCommittee.open_task_count, icon: ShieldCheck }, { label: 'Pending Votes', value: selectedCommittee.live_vote_count, icon: Vote }, { label: 'Stored Docs', value: selectedCommittee.document_count, icon: FileText }].map((item) => (
                  <div key={item.label} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-slate-200 dark:border-slate-800/80 dark:bg-slate-950/40 dark:hover:border-slate-700">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-slate-900">
                      <item.icon className="h-5 w-5 text-brand-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white leading-none">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Premium Segmented Navigation Tabs */}
              <div className="mt-6 flex w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-950">
                {(['members', 'chat', 'tasks', 'votes', 'documents'] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition-all sm:flex-none ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800 dark:text-white dark:ring-white/10' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'}`}>
                    {tab === 'chat' ? 'Discussion' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Committee Dashboard Content Tabs Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 p-6 md:p-8 dark:bg-slate-950/20">

            {activeTab === 'members' && (
              <div className="space-y-4 max-w-4xl mx-auto">
                {detail.members.map((member) => (
                  <div key={`${member.user_id}-${member.role_title}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800/50">
                    <div className="flex items-center gap-4">
                       <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-400 dark:bg-slate-800">
                         {(member.name || '').charAt(0).toUpperCase()}
                       </div>
                       <div>
                        <p className="font-bold text-slate-900 dark:text-white text-base">{member.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{member.role_title}</span>
                          <span className="opacity-50">•</span>
                          <span>{member.permission_scope}</span>
                          {member.is_primary_contact && (
                            <>
                              <span className="opacity-50">•</span>
                              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Primary</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{member.phone_number || 'No contact'}</p>
                      <p className="mt-1 text-xs font-medium text-slate-400 tracking-wide uppercase">
                         {(member.tenure_start_date || member.tenure_end_date) ? `${member.tenure_start_date ? new Date(member.tenure_start_date).getFullYear() : 'Now'} - ${member.tenure_end_date ? new Date(member.tenure_end_date).getFullYear() : 'Present'}` : 'Open Tenure'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex h-[500px] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900 max-w-5xl mx-auto">
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/30">
                  {detail.messages.length === 0 ? (
                     <div className="flex h-full flex-col items-center justify-center text-slate-400">
                       <MessageSquare className="h-10 w-10 opacity-20 mb-3" />
                       <p className="text-sm font-medium">No committee discussions yet.</p>
                     </div>
                  ) : (
                    detail.messages.map((message) => {
                      const isMine = false; // Add real sender check later if user payload is present
                      return (
                        <div key={message.id} className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className="flex max-w-[85%] gap-4">
                            {!isMine && (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500 mt-1 dark:bg-slate-800">
                                {message.sender_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 mb-1.5 px-1">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{message.sender_name}</span>
                                <span className="text-[10px] uppercase tracking-wider text-slate-400">{message.sender_role_title}</span>
                                <span className="text-[10px] font-semibold text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Now'}</span>
                                {message.is_decision_log && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">Decision</span>}
                              </div>
                              <div className={`px-5 py-3.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${isMine ? 'rounded-2xl rounded-tr-sm bg-brand-600 text-white' : 'rounded-2xl rounded-tl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
                                {message.content}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 z-20">
                  <form onSubmit={sendCommitteeMessage} className="relative rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 transition-all">
                    <textarea value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Type a message or formal decision log..." className="h-20 w-full resize-none bg-transparent px-5 py-4 text-sm font-medium outline-none custom-scrollbar dark:text-white" required />
                    <div className="flex items-center justify-between border-t border-slate-200/50 px-4 py-2.5 dark:border-slate-800/50">
                      <div className="flex items-center gap-4">
                        <label className="flex cursor-pointer items-center justify-center rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 group">
                          <FileText className="h-4 w-4" />
                          {chatUploads.length > 0 && <span className="ml-2 text-xs font-bold text-brand-600 dark:text-brand-400">{chatUploads.length} attached</span>}
                          <input type="file" className="hidden" onChange={(event) => void uploadFile(event, (filePath, fileName) => setChatUploads((current) => [...current, { file_path: filePath, file_name: fileName }]))} />
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-300">
                          <input type="checkbox" checked={decisionLog} onChange={(event) => setDecisionLog(event.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800" /> 
                          Log Decision
                        </label>
                      </div>
                      <button type="submit" disabled={!chatMessage.trim()} className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-2 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-brand-500 disabled:opacity-50">
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <form onSubmit={createTask} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-6 flex items-center justify-between border-b border-slate-50 pb-4 dark:border-slate-800">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Action Item Tracking</h3>
                      <p className="text-xs font-medium text-slate-500">Assign responsibilities and track operational progress.</p>
                    </div>
                    <ShieldCheck className="h-6 w-6 text-brand-500 opacity-20" />
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Task Heading</span>
                        <input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="e.g., Audit Maintenance Logs" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Lead Member</span>
                        <select value={taskForm.assigned_member_id} onChange={(event) => setTaskForm({ ...taskForm, assigned_member_id: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                          <option value="">Select an assignee...</option>
                          {detail.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name} / {member.role_title}</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Detailed Instructions</span>
                      <textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="Outline the expected outcome and any specific steps required..." className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                    </label>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                      <label className="flex-1 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Target Date</span>
                        <input type="date" value={taskForm.due_date} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950" />
                      </label>
                      <label className="flex-1 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Priority Level</span>
                        <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                          {['Low', 'Medium', 'High'].map((priority) => <option key={priority}>{priority}</option>)}
                        </select>
                      </label>
                      <button type="submit" className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl bg-brand-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-500 hover:scale-[1.02] active:scale-95">
                        Deploy Task
                      </button>
                    </div>
                  </div>
                </form>

                <div className="grid gap-3">
                  {detail.tasks.map((task) => (
                    <div key={task.id} className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                           <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${task.priority === 'High' ? 'bg-rose-500' : task.priority === 'Medium' ? 'bg-amber-500' : 'bg-brand-500'}`} />
                           <div>
                            <p className="font-bold text-slate-900 dark:text-white">{task.title}</p>
                            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                              {task.assigned_to_name || 'Unassigned'}
                              <span className="opacity-30">•</span>
                              {task.due_date ? `Due ${new Date(task.due_date).toLocaleDateString()}` : 'No deadline'}
                            </p>
                           </div>
                        </div>
                        <select value={task.status} onChange={(event) => void updateTaskStatus(task.id, event.target.value)} className={`rounded-xl border px-3 py-1.5 text-xs font-bold outline-none transition-colors ${task.status === 'Completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}>
                          {['Open', 'InProgress', 'Blocked', 'Completed'].map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                   {!detail.tasks.length && (
                    <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
                      <p className="text-sm font-medium text-slate-400">All actions are clear. Ready for new tasks.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'votes' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <form onSubmit={createVote} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-6 flex items-center justify-between border-b border-slate-50 pb-4 dark:border-slate-800">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Initialize Formal Vote</h3>
                      <p className="text-xs font-medium text-slate-500">Submit a proposal for committee-wide decision tracking.</p>
                    </div>
                    <Vote className="h-6 w-6 text-brand-500 opacity-20" />
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Proposal Title</span>
                        <input value={voteForm.title} onChange={(event) => setVoteForm({ ...voteForm, title: event.target.value })} placeholder="e.g., Annual Budget Approval" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Closing Deadline</span>
                        <input type="datetime-local" value={voteForm.closes_at} onChange={(event) => setVoteForm({ ...voteForm, closes_at: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                      </label>
                    </div>
                    
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Context & Rationale</span>
                      <textarea value={voteForm.description} onChange={(event) => setVoteForm({ ...voteForm, description: event.target.value })} placeholder="Provide detailed context for members to make an informed choice..." className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                    </label>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                      <label className="flex-1 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Decision Logic</span>
                        <select value={voteForm.decision_type} onChange={(event) => setVoteForm({ ...voteForm, decision_type: event.target.value, options: event.target.value === 'YesNo' ? 'Yes,No' : '' })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                          <option value="YesNo">Binary (Yes / No)</option>
                          <option value="SingleChoice">Multiple Choice Selection</option>
                        </select>
                      </label>
                      {voteForm.decision_type === 'SingleChoice' && (
                        <label className="flex-[2] space-y-1.5 animate-in slide-in-from-left-2 duration-300">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Custom Options (Comma Separated)</span>
                          <input value={voteForm.options} onChange={(event) => setVoteForm({ ...voteForm, options: event.target.value })} placeholder="Approve, Revise, Reject with Notes..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                        </label>
                      )}
                      <button type="submit" className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl bg-brand-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-500 hover:scale-[1.02] active:scale-95">
                        Broadcast Vote
                      </button>
                    </div>
                  </div>
                </form>
                <div className="space-y-3">
                  {detail.votes.map((vote) => (
                    <div key={vote.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                      <p className="font-semibold text-slate-900 dark:text-white">{vote.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{vote.status}{vote.closes_at ? ` / closes ${new Date(vote.closes_at).toLocaleString()}` : ''}</p>
                      <div className="mt-3 grid gap-2">
                        {vote.options.map((option) => (
                          <div key={option.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                            <span>{option.option_text}</span>
                            <span className="font-semibold text-slate-500">{option.response_count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <form onSubmit={saveDocument} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-6 flex items-center justify-between border-b border-slate-50 pb-4 dark:border-slate-800">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Central Repository</h3>
                      <p className="text-xs font-medium text-slate-500">Securely store and categorize official committee documentation.</p>
                    </div>
                    <FileText className="h-6 w-6 text-brand-500 opacity-20" />
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <label className="flex-[2] space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Document Title</span>
                      <input value={documentForm.title} onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })} placeholder="e.g., Q1 Meeting Minutes" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
                    </label>
                    <label className="flex-1 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Category Tag</span>
                      <select value={documentForm.category} onChange={(event) => setDocumentForm({ ...documentForm, category: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                        {['Minutes', 'Budget', 'Policy', 'TaskFile', 'Other'].map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <div className="flex-[1.5] flex gap-2">
                       <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-center text-sm font-bold text-slate-600 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:bg-slate-800">
                        {documentForm.file_url ? 'File Ready' : 'Select File'}
                        <input type="file" className="hidden" onChange={(event) => void uploadFile(event, (filePath) => setDocumentForm((current) => ({ ...current, file_url: filePath })))} />
                      </label>
                      <button type="submit" disabled={!documentForm.file_url} className="shrink-0 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-500 hover:scale-[1.02] active:scale-95 disabled:opacity-50">
                        Upload
                      </button>
                    </div>
                  </div>
                </form>
                <div className="space-y-3">
                  {detail.documents.map((document) => (
                    <div key={document.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{document.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{document.category} / {document.uploaded_by_name}</p>
                        </div>
                        <a href={`http://localhost:5000${document.file_url}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600">Open</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 mb-4 dark:bg-brand-500/10">
                <Landmark className="h-8 w-8 text-brand-500" />
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">Select a Committee</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">Click on a committee from the sidebar to manage members and operations.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
