'use client';
import { motion } from 'framer-motion';
import { Check, ChevronRight, ChevronLeft, UploadCloud, Plus, X, ShieldAlert, Car, Users, Lock, BellRing } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FLAT_TYPE_OPTIONS = ['Studio', '1RK', '1BHK', '2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK', 'Villa', 'Penthouse', 'Other'];
const ACCESS_ROLE_OPTIONS = [
  { value: 'Primary', label: 'Primary resident access' },
  { value: 'Secondary', label: 'Secondary resident access' },
];
const defaultNotifications = { push_notifications: true, sms_alerts: true, whatsapp_alerts: false };
const defaultPermissions = { can_approve_visitors: true, can_view_bills: true, can_raise_complaints: true };
const PERMISSION_OPTIONS: Array<{ key: keyof typeof defaultPermissions; label: string }> = [
  { key: 'can_approve_visitors', label: 'Approve Visitors' },
  { key: 'can_view_bills', label: 'View Society Bills' },
  { key: 'can_raise_complaints', label: 'Raise Complaints' },
];
const NOTIFICATION_OPTIONS: Array<{ key: keyof typeof defaultNotifications; label: string }> = [
  { key: 'push_notifications', label: 'App Push Notifications' },
  { key: 'sms_alerts', label: 'SMS Alerts' },
  { key: 'whatsapp_alerts', label: 'WhatsApp Message Sync' },
];

export default function AddResidentWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // State Payload Tree
  const [basic, setBasic] = useState({ name: '', email: '', phone_number: '' });
  const [flat, setFlat] = useState({ block_name: '', floor: '', flat_number: '', flat_type: '', occupancy_type: 'Owner', access_role: 'Primary', move_in_date: '', move_out_date: '' });
  const [identity, setIdentity] = useState({ id_type: 'Aadhaar', id_number: '', id_proof_url: '' });
  const [emergency, setEmergency] = useState({ emergency_name: '', emergency_relation: '', emergency_phone: '' });
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [permissions, setPermissions] = useState(defaultPermissions);
  
  // Dynamic Arrays
  const [vehicles, setVehicles] = useState([{ vehicle_type: 'Car', vehicle_number: '', parking_slot: '' }]);
  const [family, setFamily] = useState([{ name: '', age: '', relation: '', phone: '' }]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const payload = { basic, flat, identity, emergency, notifications, permissions, vehicles, family };
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch('https://api.gatesync.in/api/v1/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(data.success) {
        alert("Resident Successfully Registered!");
        router.push('/admin/residents');
      } else alert(data.message);
    } catch(e) { console.error(e) }
    finally { setSubmitting(false) }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-between mb-8 max-w-3xl mx-auto w-full relative">
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-800 -z-10 rounded-full" />
      <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-brand-500 -z-10 rounded-full transition-all duration-500" style={{ width: `${((step - 1) / 3) * 100}%` }} />
      {[1, 2, 3, 4].map(s => (
        <div key={s} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-4 ${
          step >= s ? 'bg-brand-500 border-white dark:border-slate-950 text-white' : 'bg-slate-100 border-white dark:bg-slate-800 dark:border-slate-950 text-slate-400'
        } transition-colors duration-300 shadow-sm`}>
          {step > s ? <Check className="w-5 h-5"/> : s}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          Add New Resident
        </h1>
        <p className="text-slate-500 mt-2">Complete the 4-step wizard to register a fully verified profile onto the platform.</p>
      </div>

      <StepIndicator />

      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
        
        {/* STEP 1: Basic & Flat */}
        {step === 1 && (
          <div className="space-y-6">
             <h2 className="text-xl font-bold flex items-center gap-2"><Users className="w-5 h-5 text-brand-500"/> Personal & Flat Mapping</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium">Full Name *</label>
                  <input value={basic.name} onChange={e=>setBasic({...basic, name: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-sm font-medium">Mobile Number *</label>
                  <input value={basic.phone_number} onChange={e=>setBasic({...basic, phone_number: e.target.value})} type="tel" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="9876543210" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email ID</label>
                  <input value={basic.email} onChange={e=>setBasic({...basic, email: e.target.value})} type="email" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="text-sm font-medium">Tower / Wing *</label>
                  <input value={flat.block_name} onChange={e=>setFlat({...flat, block_name: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="e.g. Tower A" />
                </div>
                <div>
                  <label className="text-sm font-medium">Floor (Optional)</label>
                  <input value={flat.floor} onChange={e=>setFlat({...flat, floor: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="e.g. 14" />
                </div>
                <div>
                  <label className="text-sm font-medium">Flat Number *</label>
                  <input value={flat.flat_number} onChange={e=>setFlat({...flat, flat_number: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="e.g. 1403" />
                </div>
                <div>
                  <label className="text-sm font-medium">Flat Type *</label>
                  <select value={flat.flat_type} onChange={e=>setFlat({...flat, flat_type: e.target.value})} className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500 appearance-none">
                    <option value="">Select flat type</option>
                    {FLAT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                   <label className="text-sm font-medium">Resident Type</label>
                   <select value={flat.occupancy_type} onChange={e=>setFlat({...flat, occupancy_type: e.target.value})} className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500 appearance-none">
                     <option value="Owner">Owner (Primary Billing)</option>
                     <option value="Tenant">Tenant</option>
                     <option value="Family">Family Member</option>
                     <option value="Co-owner">Co-owner</option>
                   </select>
                </div>
                <div>
                  <label className="text-sm font-medium">App Access Role</label>
                  <select value={flat.access_role} onChange={e=>setFlat({...flat, access_role: e.target.value})} className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500 appearance-none">
                    {ACCESS_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">Each flat can have one primary and one secondary resident account for approvals and notifications.</p>
                </div>
             </div>
          </div>
        )}

        {/* STEP 2: Occupancy & Verification */}
        {step === 2 && (
          <div className="space-y-6">
             <h2 className="text-xl font-bold flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-green-500"/> Verification & Term</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium">Move-in Date</label>
                  <input value={flat.move_in_date} onChange={e=>setFlat({...flat, move_in_date: e.target.value})} type="date" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium">Move-out Date (Tenants)</label>
                  <input value={flat.move_out_date} onChange={e=>setFlat({...flat, move_out_date: e.target.value})} type="date" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-green-500" />
                </div>
                <div className="md:col-span-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-200">KYC Identity details</h3>
                </div>
                <div>
                  <label className="text-sm font-medium">Identity Type</label>
                  <select value={identity.id_type} onChange={e=>setIdentity({...identity, id_type: e.target.value})} className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500">
                     <option value="Aadhaar">Aadhaar</option>
                     <option value="PAN">PAN Card</option>
                     <option value="Passport">Passport</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">ID Number</label>
                  <input value={identity.id_number} onChange={e=>setIdentity({...identity, id_number: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none focus:border-brand-500" placeholder="XXXX-XXXX-XXXX" />
                </div>
                <div className="md:col-span-2">
                   <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 cursor-pointer transition-colors">
                     <UploadCloud className="w-8 h-8 text-slate-400 mb-2"/>
                     <span className="font-medium text-slate-700 dark:text-slate-300">Click to upload ID Proof Scan</span>
                     <span className="text-xs text-slate-500 mt-1">JPEG, PNG, or PDF up to 5MB</span>
                   </label>
                </div>
             </div>
          </div>
        )}

        {/* STEP 3: Vehicles & Family */}
        {step === 3 && (
          <div className="space-y-8">
             <div>
               <h2 className="text-xl font-bold flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2"><Car className="w-5 h-5 text-blue-500"/> Vehicles</div>
                 <button onClick={() => setVehicles([...vehicles, {vehicle_type: 'Car', vehicle_number: '', parking_slot: ''}])} className="text-sm px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium flex items-center gap-1"><Plus className="w-4 h-4"/> Add Vehicle</button>
               </h2>
               <div className="space-y-4">
                 {vehicles.map((v, i) => (
                    <div key={i} className="flex flex-col md:flex-row gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 relative">
                       {i > 0 && <button onClick={() => setVehicles(vehicles.filter((_, idx)=>idx!==i))} className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full"><X className="w-3 h-3"/></button>}
                       <select value={v.vehicle_type} onChange={e=>{const nv=[...vehicles]; nv[i].vehicle_type=e.target.value; setVehicles(nv);}} className="md:w-1/3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none">
                         <option>Car</option><option>Bike</option>
                       </select>
                       <input value={v.vehicle_number} onChange={e=>{const nv=[...vehicles]; nv[i].vehicle_number=e.target.value; setVehicles(nv);}} placeholder="DL-10-CB-4455" className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none uppercase" />
                       <input value={v.parking_slot} onChange={e=>{const nv=[...vehicles]; nv[i].parking_slot=e.target.value; setVehicles(nv);}} placeholder="Slot # (Opt)" className="md:w-1/4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none" />
                    </div>
                 ))}
               </div>
             </div>
             
             <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
               <h2 className="text-xl font-bold flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2"><Users className="w-5 h-5 text-purple-500"/> Family Members</div>
                 <button onClick={() => setFamily([...family, {name: '', age: '', relation: '', phone: ''}])} className="text-sm px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors font-medium flex items-center gap-1"><Plus className="w-4 h-4"/> Add Family</button>
               </h2>
               <div className="space-y-4">
                 {family.map((f, i) => (
                    <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 relative">
                       {i > 0 && <button onClick={() => setFamily(family.filter((_, idx)=>idx!==i))} className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full"><X className="w-3 h-3"/></button>}
                       <input value={f.name} onChange={e=>{const nf=[...family]; nf[i].name=e.target.value; setFamily(nf);}} placeholder="Name" className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none" />
                       <input value={f.age} onChange={e=>{const nf=[...family]; nf[i].age=e.target.value; setFamily(nf);}} type="number" placeholder="Age" className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none" />
                       <input value={f.relation} onChange={e=>{const nf=[...family]; nf[i].relation=e.target.value; setFamily(nf);}} placeholder="Relation (Spouse, Son)" className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none" />
                       <input value={f.phone} onChange={e=>{const nf=[...family]; nf[i].phone=e.target.value; setFamily(nf);}} placeholder="Mobile (opt)" className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none" />
                    </div>
                 ))}
               </div>
             </div>
          </div>
        )}

        {/* STEP 4: Emergency & Access Management */}
        {step === 4 && (
          <div className="space-y-8">
             <div>
               <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><BellRing className="w-5 h-5 text-red-500"/> Emergency Contact</h2>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div>
                   <label className="text-sm font-medium">Contact Name</label>
                   <input value={emergency.emergency_name} onChange={e=>setEmergency({...emergency, emergency_name: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none" />
                 </div>
                 <div>
                   <label className="text-sm font-medium">Relation</label>
                   <input value={emergency.emergency_relation} onChange={e=>setEmergency({...emergency, emergency_relation: e.target.value})} type="text" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none" />
                 </div>
                 <div>
                   <label className="text-sm font-medium">Phone</label>
                   <input value={emergency.emergency_phone} onChange={e=>setEmergency({...emergency, emergency_phone: e.target.value})} type="tel" className="w-full mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 outline-none" />
                 </div>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-200 dark:border-slate-800 pt-6">
                <div>
                   <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Lock className="w-5 h-5 text-slate-500"/> Digital App Access Roles</h2>
                   <div className="space-y-3">
                     {PERMISSION_OPTIONS.map((option) => (
                       <label key={option.key} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{option.label}</span>
                          <input type="checkbox" checked={permissions[option.key]} onChange={e=>setPermissions({...permissions, [option.key]: e.target.checked})} className="w-5 h-5 rounded text-brand-500 focus:ring-brand-500 accent-brand-500 cursor-pointer" />
                       </label>
                     ))}
                   </div>
                </div>
                <div>
                   <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><BellRing className="w-5 h-5 text-orange-500"/> Notification Prefs</h2>
                   <div className="space-y-3">
                     {NOTIFICATION_OPTIONS.map((option) => (
                       <label key={option.key} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{option.label}</span>
                          <input type="checkbox" checked={notifications[option.key]} onChange={e=>setNotifications({...notifications, [option.key]: e.target.checked})} className="w-5 h-5 rounded text-brand-500 focus:ring-brand-500 accent-brand-500 cursor-pointer" />
                       </label>
                     ))}
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* Navigation Controls */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
           <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin/residents')} className="px-5 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              {step > 1 && (
                <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <ChevronLeft className="w-4 h-4"/> Back
                </button>
              )}
           </div>
           
           {step < 4 ? (
              <button onClick={() => {
                 if (step === 1 && (!basic.name || !basic.phone_number || !flat.block_name || !flat.flat_number || !flat.flat_type)) {
                   alert("Please fill out the mandatory Phase 1 elements (Name, Phone, Tower, Flat Number, Flat Type)"); return;
                 }
                 setStep(step + 1);
              }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition-colors shadow-md">
                Next <ChevronRight className="w-4 h-4"/>
              </button>
           ) : (
             <button onClick={handleCreate} disabled={submitting} className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-brand-500 hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/20 disabled:opacity-50">
                {submitting ? 'Authenticating...' : 'Finish & Activate Resident Profile'}
             </button>
           )}
        </div>
      </motion.div>
    </div>
  );
}
