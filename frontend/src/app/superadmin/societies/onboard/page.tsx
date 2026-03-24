'use client';
import { useState } from 'react';
import { Building2, User, Grid, Shield, Settings, CheckCircle2, ChevronRight, ArrowLeft, UploadCloud, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function OnboardWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '', address: '', society_type: 'Apartment',
    towers_count: 1, floors_per_tower: 10, total_flats: 50,
    amenities: [],
    admin: { name: '', email: '', phone: '' },
    gates: [{ name: 'Main Gate', gate_type: 'Main' }],
    config_settings: { visitor_approval: true, auto_delivery: false },
    subscription_plan: 'Free'
  });

  const STEPS = [
    { title: 'Core Details', icon: Building2 },
    { title: 'Assign Admin', icon: User },
    { title: 'Structure', icon: Grid },
    { title: 'Security', icon: Shield },
    { title: 'Governance', icon: Settings },
  ];

  const handleNext = () => setStep(s => Math.min(s + 1, 5));
  const handlePrev = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 5) return handleNext();
    
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch('http://localhost:5000/api/v1/superadmin/societies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        router.push('/superadmin/societies');
      } else {
        setError(data.message || 'Error onboarding society');
      }
    } catch (err) {
      setError('Server unreachable');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any, category?: string) => {
    if (category) {
      setFormData(prev => ({ ...prev, [category as keyof typeof prev]: { ...(prev as any)[category], [field]: value } }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800">Onboard Community</h2>
          <p className="text-slate-500 mt-1">Configure advanced parameters for a new GateSync B2B tenant.</p>
        </div>
        <button type="button" onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 flex items-center text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Societies
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between mb-12 relative px-4">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -translate-y-1/2 z-0 rounded-full">
           <div className="h-full bg-blue-600 transition-all duration-500 rounded-full" style={{ width: `${((step - 1) / 4) * 100}%` }} />
        </div>
        {STEPS.map((s, i) => {
          const isActive = step >= i + 1;
          const Icon = s.icon;
          return (
            <div key={i} className="relative z-10 flex flex-col items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-4 transition-colors duration-300 shadow-sm ${isActive ? 'bg-blue-600 border-blue-50 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                {step > i + 1 ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
              </div>
              <p className={`text-xs mt-3 font-semibold absolute -bottom-6 whitespace-nowrap ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{s.title}</p>
            </div>
          );
        })}
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden mt-12 transition-all p-8">
        <form onSubmit={handleSubmit}>
          {error && <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100 flex items-center"><div className="w-2 h-2 bg-red-600 rounded-full mr-2"/>{error}</div>}
          
          <div className="min-h-[300px]">
            {/* Step 1: Core */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-xl font-bold text-slate-800 mb-6">1. Core Property Specs</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Society Name</label>
                    <input required autoFocus value={formData.name} onChange={e => updateField('name', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-medium text-slate-800" placeholder="Prestige Residency..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Full Address</label>
                    <input required value={formData.address} onChange={e => updateField('address', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-medium text-slate-800" placeholder="123 Main St..." />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Property Type</label>
                    <select value={formData.society_type} onChange={e => updateField('society_type', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-[11px] rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-800">
                      <option>Apartment</option><option>Villa</option><option>Mixed</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Admin */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-xl font-bold text-slate-800 mb-6">2. Configure Root Admin</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Admin Full Name</label>
                    <input required autoFocus value={formData.admin.name} onChange={e => updateField('name', e.target.value, 'admin')} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-800" placeholder="Jane Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                    <input required type="email" value={formData.admin.email} onChange={e => updateField('email', e.target.value, 'admin')} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-800" placeholder="admin@society.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Primary Mobile (OTP Login)</label>
                    <input required type="tel" maxLength={10} minLength={10} value={formData.admin.phone} onChange={e => updateField('phone', e.target.value.replace(/\D/g, ''), 'admin')} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-800 tracking-wider" placeholder="9876543210" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Structure */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-xl font-bold text-slate-800 mb-6">3. Structural Mapping</h3>
                
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex items-start gap-4 mb-6">
                  <div className="bg-blue-600 p-3 rounded-full text-white"><UploadCloud className="w-6 h-6"/></div>
                  <div>
                    <h4 className="font-bold text-blue-900 text-lg">Bulk Import Flats (Coming Soon)</h4>
                    <p className="text-blue-700/80 text-sm mt-1 mb-3">Upload a standard CSV defining all owner/tenant mappings mapped exactly to flat numbers and tower structures.</p>
                    <button type="button" className="text-xs bg-white text-blue-600 px-4 py-2 rounded-lg font-bold shadow-sm opacity-50 cursor-not-allowed">Upload CSV (Locked)</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Towers/Wings</label>
                    <input required type="number" min="1" value={formData.towers_count} onChange={e => updateField('towers_count', parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-center text-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Floors per Tower</label>
                    <input required type="number" min="1" value={formData.floors_per_tower} onChange={e => updateField('floors_per_tower', parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-center text-xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Total Flats</label>
                    <input required type="number" min="1" value={formData.total_flats} onChange={e => updateField('total_flats', parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-center text-xl" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Security Gates */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-xl font-bold text-slate-800 mb-6">4. Perimeter Security Layout</h3>
                <div className="space-y-4">
                  {formData.gates.map((g, i) => (
                    <div key={i} className="flex gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gate #{i+1} Name</label>
                        <input value={g.name} onChange={e => {
                          const newGates = [...formData.gates]; newGates[i].name = e.target.value; updateField('gates', newGates);
                        }} className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gate Type</label>
                        <select value={g.gate_type} onChange={e => {
                          const newGates = [...formData.gates]; newGates[i].gate_type = e.target.value; updateField('gates', newGates);
                        }} className="w-full bg-white border border-slate-200 px-4 py-[11px] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium">
                          <option>Main</option><option>Service</option><option>Other</option>
                        </select>
                      </div>
                      {i > 0 && <button type="button" onClick={() => updateField('gates', formData.gates.filter((_, idx) => idx !== i))} className="px-4 py-2.5 text-red-500 hover:bg-red-50 rounded-xl font-bold transition-colors">Remove</button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => updateField('gates', [...formData.gates, { name: '', gate_type: 'Service' }])} className="text-blue-600 font-bold hover:text-blue-700 text-sm flex items-center mt-2 p-2"><Plus className="w-4 h-4 mr-1"/> Add Another Gate</button>
                </div>
              </div>
            )}

            {/* Step 5: Global Settings & Plan */}
            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-xl font-bold text-slate-800 mb-6">5. Features & Subscription</h3>
                
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6">
                  <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-wider">Governing Rules</h4>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={formData.config_settings.visitor_approval} onChange={e => setFormData(prev => ({...prev, config_settings: {...prev.config_settings, visitor_approval: e.target.checked}}))} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 accent-blue-600" />
                    <span className="font-medium text-slate-800">Strict Visitor Approval Required (Residents must approve app notifications)</span>
                  </label>
                </div>

                <div>
                  <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-wider">SaaS Tier Designation</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {['Free', 'Pro', 'Enterprise'].map(plan => (
                      <div key={plan} onClick={() => updateField('subscription_plan', plan)} className={`cursor-pointer border-2 rounded-2xl p-5 text-center transition-all relative overflow-hidden ${formData.subscription_plan === plan ? 'border-blue-600 bg-blue-50 shadow-md transform -translate-y-1' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        {formData.subscription_plan === plan && <div className="absolute top-0 right-0 bg-blue-600 text-white p-1 rounded-bl-xl"><CheckCircle2 className="w-4 h-4"/></div>}
                        <h5 className={`font-bold text-lg ${formData.subscription_plan === plan ? 'text-blue-900' : 'text-slate-600'}`}>{plan}</h5>
                        <p className={`text-xs mt-1 font-medium ${formData.subscription_plan === plan ? 'text-blue-700' : 'text-slate-400'}`}>{plan === 'Enterprise' ? 'All Modules + AI' : plan === 'Pro' ? 'Core + Billing' : 'Basic Visitors'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between items-center">
            <button type="button" onClick={handlePrev} disabled={step === 1} className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center ${step === 1 ? 'opacity-0 pointer-events-none' : 'text-slate-500 hover:bg-slate-100'}`}>
              <ArrowLeft className="w-5 h-5 mr-2" /> Previous
            </button>
            
            <button type="submit" disabled={loading} className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold transition-all shadow-xl shadow-slate-900/20 flex items-center active:scale-95 disabled:opacity-75">
              {loading ? 'Creating Ecosystem...' : step === 5 ? 'Launch Society Infrastructure' : <>Next Step <ChevronRight className="w-5 h-5 ml-2" /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
