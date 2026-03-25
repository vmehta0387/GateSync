'use client';
import { motion } from 'framer-motion';
import { Shield, Bell, Moon, Smartphone, UserCog, Plus, PencilLine, Ban, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getStoredSession } from '@/lib/auth';

type SettingsPayload = {
  visitorApprovalRequired: boolean;
  nightEntryRestriction: boolean;
};

type ManagerRecord = {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
};

const defaultManagerForm = {
  name: '',
  email: '',
  phone_number: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
};

export default function SettingsPage() {
  const session = getStoredSession();
  const isAdmin = session.user?.role === 'ADMIN';
  const [visitorApproval, setVisitorApproval] = useState(true);
  const [nightRestriction, setNightRestriction] = useState(true);
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [managerModules, setManagerModules] = useState<string[]>([]);
  const [managerForm, setManagerForm] = useState(defaultManagerForm);
  const [editingManagerId, setEditingManagerId] = useState<number | null>(null);
  const [savingManager, setSavingManager] = useState(false);
  const [managerMessage, setManagerMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch('https://api.gatesync.in/api/v1/settings', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if(data.success && data.settings) {
           const parsed = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
           setVisitorApproval(!!parsed.visitorApprovalRequired);
           setNightRestriction(!!parsed.nightEntryRestriction);
        }
      } catch(e) { console.error(e) }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchManagers = async () => {
      try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch('https://api.gatesync.in/api/v1/settings/managers', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await res.json();
        if (data.success) {
          setManagers(data.managers || []);
          setManagerModules(data.meta?.allowed_modules || []);
        }
      } catch (error) {
        console.error(error);
      }
    };

    void fetchManagers();
  }, [isAdmin]);

  const saveSettings = async (updates: SettingsPayload) => {
    try {
      const token = localStorage.getItem('gatepulse_token');
      await fetch('https://api.gatesync.in/api/v1/settings', {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
         body: JSON.stringify({ settings: updates })
      });
    } catch(e) { console.error(e) }
  };

  const handleVisitorToggle = () => {
    const newVal = !visitorApproval;
    setVisitorApproval(newVal);
    saveSettings({ visitorApprovalRequired: newVal, nightEntryRestriction: nightRestriction });
  };

  const handleNightToggle = () => {
    const newVal = !nightRestriction;
    setNightRestriction(newVal);
    saveSettings({ visitorApprovalRequired: visitorApproval, nightEntryRestriction: newVal });
  };

  const resetManagerForm = () => {
    setEditingManagerId(null);
    setManagerForm(defaultManagerForm);
  };

  const refreshManagers = async () => {
    const token = localStorage.getItem('gatepulse_token');
    const res = await fetch('https://api.gatesync.in/api/v1/settings/managers', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (data.success) {
      setManagers(data.managers || []);
      setManagerModules(data.meta?.allowed_modules || []);
    }
  };

  const saveManager = async () => {
    if (!managerForm.name || !managerForm.phone_number) {
      alert('Manager name and phone number are required');
      return;
    }

    setSavingManager(true);
    setManagerMessage('');
    try {
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch(
        `https://api.gatesync.in/api/v1/settings/managers${editingManagerId ? `/${editingManagerId}` : ''}`,
        {
          method: editingManagerId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(managerForm),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Could not save manager');
        return;
      }

      setManagerMessage(data.message || (editingManagerId ? 'Manager updated' : 'Manager added'));
      resetManagerForm();
      await refreshManagers();
    } catch (error) {
      console.error(error);
    } finally {
      setSavingManager(false);
    }
  };

  const editManager = (manager: ManagerRecord) => {
    setEditingManagerId(manager.id);
    setManagerForm({
      name: manager.name || '',
      email: manager.email || '',
      phone_number: manager.phone_number || '',
      status: manager.status || 'ACTIVE',
    });
  };

  const toggleManagerStatus = async (manager: ManagerRecord) => {
    try {
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch(`https://api.gatesync.in/api/v1/settings/managers/${manager.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: manager.name,
          email: manager.email || '',
          phone_number: manager.phone_number,
          status: manager.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Could not update manager status');
        return;
      }
      setManagerMessage(data.message || 'Manager status updated');
      await refreshManagers();
    } catch (error) {
      console.error(error);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        This page is reserved for the primary admin. Managers can run day-to-day operations, but they cannot change society settings or manage admin access.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          Society Settings & Policies
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Configure security rules, notification preferences, and upload guidelines.</p>
      </div>

      <div className="space-y-6">
         {/* Security Settings */}
         <div className="glass-panel p-6 rounded-2xl">
           <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-900 dark:text-slate-100">
             <Shield className="w-5 h-5 text-brand-500"/> Content Security Rules
           </h2>
           <div className="space-y-4">
             <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
               <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Mandatory Visitor Approval</h3>
                  <p className="text-sm text-slate-500">Require resident approval for all unannounced visitors.</p>
               </div>
               <button onClick={handleVisitorToggle} className={`w-12 h-6 rounded-full transition-colors relative ${visitorApproval ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                 <motion.div className="w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5" animate={{ left: visitorApproval ? '26px' : '2px' }} />
               </button>
             </div>
             <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
               <div className="flex gap-4">
                 <Moon className="w-8 h-8 text-blue-500 mt-1" />
                 <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Night Entry Restrictions</h3>
                    <p className="text-sm text-slate-500">Block staff and deliveries between 11 PM and 5 AM automatically.</p>
                 </div>
               </div>
               <button onClick={handleNightToggle} className={`w-12 h-6 rounded-full transition-colors relative ${nightRestriction ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                 <motion.div className="w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5" animate={{ left: nightRestriction ? '26px' : '2px' }} />
               </button>
             </div>
           </div>
         </div>

         {/* Notification Settings */}
         <div className="glass-panel p-6 rounded-2xl">
           <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-900 dark:text-slate-100">
             <Bell className="w-5 h-5 text-orange-500"/> Notification Preferences
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start gap-4 hover:border-brand-300 transition-colors cursor-pointer">
                 <Smartphone className="w-6 h-6 text-slate-400 mt-0.5" />
                 <div>
                   <h3 className="font-semibold">Push Notifications</h3>
                   <p className="text-sm text-slate-500 mt-1">Send app popups for announcements and alerts.</p>
                 </div>
              </div>
              <div className="p-4 border border-brand-500 rounded-xl flex items-start gap-4 bg-brand-50 dark:bg-brand-500/10 cursor-pointer text-brand-700 dark:text-brand-300">
                 <Bell className="w-6 h-6 text-brand-500 mt-0.5" />
                 <div>
                   <h3 className="font-semibold">SMS Alerts</h3>
                   <p className="text-sm opacity-80 mt-1">For emergency and offline residents.</p>
                 </div>
              </div>
           </div>
         </div>

         <div className="glass-panel p-6 rounded-2xl space-y-6">
           <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
             <div>
               <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                 <UserCog className="w-5 h-5 text-sky-500"/> Team & Roles
               </h2>
               <p className="text-sm text-slate-500 mt-2">
                 Add a manager who can run daily society operations after the main admin, but without billing, settings, or committee control.
               </p>
             </div>
             {managerMessage ? (
               <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                 {managerMessage}
               </div>
             ) : null}
           </div>

           <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
             <div className="flex items-center justify-between gap-4">
               <div>
                 <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                   {editingManagerId ? 'Edit Manager' : 'Add Manager'}
                 </h3>
                 <p className="text-sm text-slate-500 mt-1">
                   Manager gets OTP login and access to visitors, complaints, staff, residents, facilities, communication, dashboard, and security.
                 </p>
               </div>
               {!editingManagerId ? (
                 <div className="inline-flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
                   <Plus className="w-4 h-4" /> New Manager
                 </div>
               ) : null}
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1.5">Manager Name</label>
                 <input
                   value={managerForm.name}
                   onChange={(event) => setManagerForm((current) => ({ ...current, name: event.target.value }))}
                   className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500"
                   placeholder="Operations Manager"
                 />
               </div>
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone Number</label>
                 <input
                   value={managerForm.phone_number}
                   onChange={(event) => setManagerForm((current) => ({ ...current, phone_number: event.target.value.replace(/\D/g, '') }))}
                   className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500"
                   placeholder="9876543210"
                   maxLength={10}
                 />
               </div>
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                 <input
                   value={managerForm.email}
                   onChange={(event) => setManagerForm((current) => ({ ...current, email: event.target.value }))}
                   className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500"
                   placeholder="manager@gatesync.app"
                 />
               </div>
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
                 <select
                   value={managerForm.status}
                   onChange={(event) => setManagerForm((current) => ({ ...current, status: event.target.value as 'ACTIVE' | 'INACTIVE' }))}
                   className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500"
                 >
                   <option value="ACTIVE">Active</option>
                   <option value="INACTIVE">Inactive</option>
                 </select>
               </div>
             </div>

             <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4">
               <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">Manager Rights</p>
               <div className="flex flex-wrap gap-2">
                 {managerModules.map((module) => (
                   <span key={module} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 capitalize">
                     {module.replace('_', ' ')}
                   </span>
                 ))}
                 <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200">
                   Billing excluded
                 </span>
                 <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200">
                   Settings excluded
                 </span>
                 <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200">
                   Committees excluded
                 </span>
               </div>
             </div>

             <div className="flex items-center gap-3">
               <button
                 onClick={saveManager}
                 disabled={savingManager}
                 className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
               >
                 {savingManager ? 'Saving...' : editingManagerId ? 'Update Manager' : 'Create Manager'}
               </button>
               {editingManagerId ? (
                 <button
                   onClick={resetManagerForm}
                   className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                 >
                   Cancel Edit
                 </button>
               ) : null}
             </div>
           </div>

           <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
             <div className="flex items-center justify-between gap-4 mb-4">
               <div>
                 <h3 className="font-semibold text-slate-900 dark:text-slate-100">Manager Directory</h3>
                 <p className="text-sm text-slate-500 mt-1">Admins can quickly activate, deactivate, or update manager access from here.</p>
               </div>
               <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                 {managers.length} manager account(s)
               </div>
             </div>

             <div className="space-y-3">
               {managers.length ? managers.map((manager) => (
                 <div key={manager.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                   <div>
                     <div className="flex items-center gap-3 flex-wrap">
                       <p className="font-semibold text-slate-900 dark:text-slate-100">{manager.name}</p>
                       <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${manager.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                         {manager.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                       </span>
                     </div>
                     <p className="text-sm text-slate-500 mt-1">{manager.phone_number}{manager.email ? ` / ${manager.email}` : ''}</p>
                     <p className="text-xs text-slate-400 mt-1">Created {new Date(manager.created_at).toLocaleDateString()}</p>
                   </div>
                   <div className="flex items-center gap-2">
                     <button
                       onClick={() => editManager(manager)}
                       className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                     >
                       <PencilLine className="w-4 h-4" /> Edit
                     </button>
                     <button
                       onClick={() => toggleManagerStatus(manager)}
                       className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${manager.status === 'ACTIVE' ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                     >
                       {manager.status === 'ACTIVE' ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                       {manager.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                     </button>
                   </div>
                 </div>
               )) : (
                 <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 px-4 py-4 text-sm text-slate-500">
                   No managers added yet. Create one above to delegate daily operations after the primary admin.
                 </div>
               )}
             </div>
           </div>
         </div>
      </div>
    </div>
  );
}
