'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip, Send, MessageSquare, Plus } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import {
  type ConversationItem,
  type ResidentTarget,
  type ThreadMessage,
  type UploadedFile,
  emptyHub,
  fetchCommunicationJson,
  postCommunicationJson,
  uploadCommunicationAttachment,
} from '@/lib/communication';

export default function CommunicationMessagesPage() {
  const currentUserId = getStoredSession().user?.id || null;
  const [targets, setTargets] = useState(emptyHub.targets);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ receiver_id: '', subject: '', content: '', priority: 'Normal' });

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((item) => `${item.resident_name} ${item.block_name} ${item.flat_number} ${item.last_message}`.toLowerCase().includes(q));
  }, [conversations, search]);

  const loadPage = useCallback(async () => {
    try {
      const [hubData, messagesData] = await Promise.all([
        fetchCommunicationJson<{ success: boolean; targets: typeof emptyHub.targets; overview: typeof emptyHub.overview; inbox: [] }>('/hub'),
        fetchCommunicationJson<{ success: boolean; conversations: ConversationItem[] }>('/messages'),
      ]);

      if (hubData.success) setTargets(hubData.targets || emptyHub.targets);
      if (messagesData.success) {
        setConversations(messagesData.conversations || []);
        return messagesData.conversations || [];
      }
    } catch (error) {
      console.error(error);
    }
    return [];
  }, []);

  const loadThread = useCallback(async (residentId: number) => {
    try {
      const data = await fetchCommunicationJson<{ success: boolean; messages: ThreadMessage[] }>(`/messages/thread/${residentId}`);
      if (data.success) setThread(data.messages || []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadPage().then((loadedConversations) => {
      if (mounted && loadedConversations.length > 0) {
        setSelectedResidentId(loadedConversations[0].resident_id);
      }
    });
    return () => { mounted = false; };
  }, [loadPage]);

  useEffect(() => {
    if (!selectedResidentId) return;
    setForm((current) => ({ ...current, receiver_id: String(selectedResidentId) }));
    void loadThread(selectedResidentId);
  }, [loadThread, selectedResidentId]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadCommunicationAttachment(file);
      if (data.success && data.file) {
        setUploads((current) => [...current, data.file as UploadedFile]);
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
    setSending(true);
    try {
      const data = await postCommunicationJson<{ success: boolean; message?: string }>('/messages', {
        ...form,
        receiver_id: Number(form.receiver_id),
        attachments: uploads,
      });

      if (!data.success) {
        alert(data.message || 'Unable to send message');
        return;
      }

      setForm((current) => ({ ...current, subject: '', content: '' }));
      setUploads([]);
      if (selectedResidentId) await loadThread(selectedResidentId);
      await loadPage();
    } catch (error) {
      console.error(error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[600px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Conversations Sidebar */}
      <div className="flex w-full flex-col border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 sm:w-80 md:w-96 shrink-0">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-800 backdrop-blur-md">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-4 pr-4 text-sm font-medium outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:focus:bg-slate-900" />
          <button onClick={() => { setSelectedResidentId(null); setThread([]); setForm(curr => ({ ...curr, receiver_id: '' })); }} className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20" title="New Message">
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-sm font-medium text-slate-500">No conversations found.</div>
          ) : (
            filteredConversations.map((conversation) => (
              <button key={conversation.resident_id} onClick={() => setSelectedResidentId(conversation.resident_id)} className={`group w-full border-b border-slate-100 p-5 text-left transition-all last:border-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selectedResidentId === conversation.resident_id ? 'bg-white shadow-sm ring-1 ring-brand-500/20 border-l-4 border-l-brand-500 dark:bg-slate-800/80 dark:ring-slate-700/50 dark:border-l-brand-400' : 'border-l-4 border-l-transparent'}`}>
                <div className="flex items-center justify-between">
                  <p className={`font-bold truncate ${selectedResidentId === conversation.resident_id ? 'text-brand-600 dark:text-brand-400' : 'text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400'}`}>{conversation.resident_name || 'Resident'}</p>
                  <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
                     {conversation.block_name}-{conversation.flat_number}
                  </span>
                </div>
                <p className={`mt-2 line-clamp-2 text-sm font-medium ${selectedResidentId === conversation.resident_id ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-500'}`}>{conversation.last_message || 'No messages yet.'}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col bg-slate-50/50 dark:bg-slate-950/20">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
            {selectedResidentId
              ? conversations.find((c) => c.resident_id === selectedResidentId)?.resident_name || 'Direct Message'
              : 'Select a Conversation'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-6">
          {thread.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                <MessageSquare className="h-8 w-8 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium">Select a resident to view the conversation.</p>
            </div>
          ) : (
            thread.map((message) => {
              const isMine = message.sender_id === currentUserId;
              return (
                <div key={message.id} className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`relative max-w-[85%] sm:max-w-[70%] rounded-3xl px-6 py-4 shadow-sm ${isMine ? 'rounded-br-sm bg-brand-600 text-white shadow-brand-500/20' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'}`}>
                    {message.subject && (
                      <p className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${isMine ? 'text-brand-200' : 'text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2'}`}>
                        {message.subject}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    <p className={`mt-3 text-[10px] font-bold text-right ${isMine ? 'text-brand-300' : 'text-slate-400'}`}>
                      {message.created_at ? new Date(message.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Now'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 md:p-6 pb-6 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)] z-20">
          <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            {!selectedResidentId && (
              <select value={form.receiver_id} onChange={(event) => { setForm({ ...form, receiver_id: event.target.value }); setSelectedResidentId(Number(event.target.value)); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white custom-select">
                <option value="">Start new conversation with resident...</option>
                {targets.residents.map((resident: ResidentTarget) => <option key={resident.id} value={resident.id}>{resident.name} / {resident.block_name}-{resident.flat_number}</option>)}
              </select>
            )}
            
            <div className="relative rounded-2xl border border-slate-200 bg-slate-50 shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-brand-500 transition-all">
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject (Optional)" className="w-full border-b border-slate-200/50 bg-transparent px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-700 outline-none placeholder-slate-400 dark:border-slate-800/50 dark:text-slate-300" />
               <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Type your message..." className="h-24 w-full resize-none bg-transparent px-5 py-4 text-sm font-medium text-slate-900 outline-none custom-scrollbar dark:text-white" required />
               
               <div className="flex items-center justify-between border-t border-slate-200/50 px-4 py-3 dark:border-slate-800/50">
                 <div className="flex items-center gap-3">
                   <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="rounded-xl border-0 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 custom-select">
                     <option>Normal</option>
                     <option>High</option>
                     <option>Emergency</option>
                   </select>
                   <label className="flex cursor-pointer items-center justify-center rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 group ring-1 ring-transparent hover:ring-slate-200 dark:hover:ring-slate-700 bg-transparent">
                     <Paperclip className="h-4 w-4" />
                     {uploading && <span className="ml-2 text-xs font-bold">Uploading...</span>}
                     {uploads.length > 0 && <span className="ml-2 text-xs font-bold text-brand-600 dark:text-brand-400">{uploads.length} attached</span>}
                     <input type="file" className="hidden" onChange={handleUpload} />
                   </label>
                 </div>
                 <button type="submit" disabled={sending} className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-500/20 transition-all hover:-translate-y-0.5 hover:bg-brand-500 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:bg-brand-600">
                   <Send className="mr-2 h-4 w-4" />
                   {sending ? 'Sending...' : 'Send'}
                 </button>
               </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
