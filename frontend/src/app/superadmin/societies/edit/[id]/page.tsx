'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Building2, User, Grid, Shield, Settings, CheckCircle2, RefreshCw, UploadCloud, Plus } from 'lucide-react';

export default function EditSocietyPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const societyId = resolvedParams.id;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<any>(null);
  
  const AVAILABLE_AMENITIES = ['Gymnasium', 'Swimming Pool', 'Club House', 'Park', 'Power Backup', 'Security Cameras', 'Tennis Court', 'Parking'];

  useEffect(() => {
    const fetchSociety = async () => {
      try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch(`https://api.gatesync.in/api/v1/superadmin/societies/${societyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          const s = data.society;
          setFormData({
            name: s.name, address: s.address, society_type: s.society_type,
            towers_count: s.towers_count, floors_per_tower: s.floors_per_tower, total_flats: s.total_flats,
            amenities: (typeof s.amenities === 'string' ? JSON.parse(s.amenities) : s.amenities) || [],
            admin: data.admin,
            gates: data.gates || [],
            config_settings: (typeof s.config_settings === 'string' ? JSON.parse(s.config_settings) : s.config_settings) || { visitor_approval: true, auto_delivery: false },
            subscription_plan: s.subscription_plan
          });
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Server unreachable');
      } finally {
        setLoading(false);
      }
    };
    fetchSociety();
  }, [societyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch(`https://api.gatesync.in/api/v1/superadmin/societies/${societyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        router.push('/superadmin/societies');
      } else {
        setError(data.message || 'Error updating society');
      }
    } catch (err) {
      setError('Server unreachable');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any, category?: string) => {
    if (category) {
      setFormData((prev: any) => ({ ...prev, [category]: { ...prev[category], [field]: value } }));
    } else {
      setFormData((prev: any) => ({ ...prev, [field]: value }));
    }
  };

  const toggleAmenity = (am: string) => {
    const current = formData.amenities || [];
    if(current.includes(am)) updateField('amenities', current.filter((x: string) => x !== am));
    else updateField('amenities', [...current, am]);
  };

  const handleGenerateFlats = async () => {
    try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch(`https://api.gatesync.in/api/v1/superadmin/societies/${societyId}/flats/generate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        alert(data.success ? data.message : data.message);
    } catch(err) {
        alert('Server unreachable');
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center pt-32"><div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!formData) return <div className="p-8 text-center text-red-500 font-bold">Failed to load payload: {error}</div>;

  const TABS = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'admin', label: 'Admin', icon: User },
    { id: 'structure', label: 'Structure', icon: Grid },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'billing', label: 'Plan & Rules', icon: Settings }
  ];

  return (
    <form onSubmit={handleSave} className="max-w-6xl mx-auto py-8 mb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.back()} className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">{formData.name}</h2>
            <p className="text-slate-500 font-medium">Tenant Editor View ID: #{societyId}</p>
          </div>
        </div>
        <button type="submit" disabled={saving} className="bg-slate-900 hover:bg-black text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-xl shadow-slate-900/20 flex items-center active:scale-95 disabled:opacity-75">
          {saving ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
          {saving ? 'Saving...' : 'Deploy Changes'}
        </button>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100">{error}</div>}

      <div className="flex gap-8 items-start">
        {/* Sidebar Nav */}
        <div className="w-64 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sticky top-28">
          <div className="space-y-1.5">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === t.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                >
                  <Icon className="w-5 h-5" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-xl p-8 min-h-[500px]">
          
          {/* Form Tabs */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">General Information</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Society Name</label>
                  <input required value={formData.name} onChange={e => updateField('name', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Full Address</label>
                  <input required value={formData.address} onChange={e => updateField('address', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Property Type</label>
                  <select value={formData.society_type} onChange={e => updateField('society_type', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-800">
                    <option>Apartment</option><option>Villa</option><option>Mixed</option>
                  </select>
                </div>
                <div className="col-span-2 pt-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Facility Amenities</label>
                    <div className="flex flex-wrap gap-3">
                        {AVAILABLE_AMENITIES.map(am => (
                            <button key={am} type="button" onClick={() => toggleAmenity(am)} className={`px-4 py-2 border rounded-xl text-sm font-bold transition-all shadow-sm ${formData.amenities?.includes(am) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                                {am}
                            </button>
                        ))}
                    </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Root Admin Assignment</h3>
              <div className="bg-amber-50 text-amber-800 p-5 rounded-2xl border border-amber-200 text-sm font-bold mb-6 flex items-center">
                Changing this mobile number will instantly revoke access from the current user and transfer ROOT SYSTEM access to the newly specified number.
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                  <input required value={formData.admin.name} onChange={e => updateField('name', e.target.value, 'admin')} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                  <input required type="email" value={formData.admin.email} onChange={e => updateField('email', e.target.value, 'admin')} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Mobile Number (OTP Login)</label>
                  <input required type="tel" maxLength={10} minLength={10} value={formData.admin.phone_number} onChange={e => updateField('phone_number', e.target.value.replace(/\D/g, ''), 'admin')} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-800 tracking-wider" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'structure' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Structural Configuration</h3>
              <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl flex items-start gap-5 mb-5">
                <div className="bg-blue-600 p-3.5 rounded-2xl text-white shadow-lg"><UploadCloud className="w-6 h-6"/></div>
                <div className="flex-1">
                  <h4 className="font-extrabold text-slate-800 text-lg">Update Flat Map via CSV</h4>
                  <p className="text-slate-500 text-sm mt-1 mb-4 font-medium">Upload a standard CSV defining all owner/tenant mappings mapped exactly to flat numbers and tower structures.</p>
                  <button type="button" className="text-sm bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-colors">Import CSV Document</button>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-start gap-5 mb-8">
                <div className="bg-emerald-600 p-3.5 rounded-2xl text-white shadow-lg"><Grid className="w-6 h-6"/></div>
                <div className="flex-1">
                  <h4 className="font-extrabold text-emerald-900 text-lg">Auto-Provision Blocks & Flats</h4>
                  <p className="text-emerald-700 text-sm mt-1 mb-4 font-medium">Automatically build the database records mapping out Tower permutations and generic flat numbers matching your specified structural counts. Overwrites existing maps for this tenant.</p>
                  <button type="button" onClick={handleGenerateFlats} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold shadow-md shadow-emerald-600/30 transition-all w-auto inline-block active:scale-95">Execute Auto-Provisioning Script</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Towers/Wings</label>
                  <input required type="number" min="1" value={formData.towers_count} onChange={e => updateField('towers_count', parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-center text-2xl text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Floors per Tower</label>
                  <input required type="number" min="1" value={formData.floors_per_tower} onChange={e => updateField('floors_per_tower', parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-center text-2xl text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Total Flats</label>
                  <input required type="number" min="1" value={formData.total_flats} onChange={e => updateField('total_flats', parseInt(e.target.value))} className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-center text-2xl text-slate-800" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Gate Infrastructure</h3>
              <div className="space-y-4">
                {formData.gates.map((g: any, i: number) => (
                  <div key={i} className="flex gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gate ID String</label>
                      <input value={g.name} onChange={e => {
                        const newGates = [...formData.gates]; newGates[i].name = e.target.value; updateField('gates', newGates);
                      }} className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Security Level</label>
                      <select value={g.gate_type} onChange={e => {
                        const newGates = [...formData.gates]; newGates[i].gate_type = e.target.value; updateField('gates', newGates);
                      }} className="w-full bg-white border border-slate-200 px-4 py-[13.5px] rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800">
                        <option>Main</option><option>Service</option><option>Other</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => updateField('gates', formData.gates.filter((_: any, idx: number) => idx !== i))} className="px-5 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-sm transition-colors border border-red-100">Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => updateField('gates', [...formData.gates, { name: '', gate_type: 'Service' }])} className="text-blue-600 font-bold hover:text-blue-700 text-sm flex items-center mt-4 p-3 bg-blue-50 rounded-xl px-5 hover:bg-blue-100 transition-colors border border-blue-100"><Plus className="w-4 h-4 mr-2"/> Append New Gate Identity</button>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800 mb-6">Plan & Operating Framework</h3>
              
              <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl mb-8">
                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-wider">Governing Rules</h4>
                <label className="flex items-center gap-4 cursor-pointer">
                  <input type="checkbox" checked={!!formData.config_settings?.visitor_approval} onChange={e => setFormData((prev: any) => ({...prev, config_settings: {...prev.config_settings, visitor_approval: e.target.checked}}))} className="w-6 h-6 rounded text-blue-600 focus:ring-blue-500 accent-blue-600" />
                  <span className="font-bold text-slate-800">Enforce Resident Visitor Approvals System-Wide</span>
                </label>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-wider">SaaS Subscription Status</h4>
                <div className="grid grid-cols-3 gap-5">
                  {['Free', 'Pro', 'Enterprise'].map(plan => (
                    <div key={plan} onClick={() => updateField('subscription_plan', plan)} className={`cursor-pointer border-2 rounded-3xl p-6 text-center transition-all relative overflow-hidden ${formData.subscription_plan === plan ? 'border-blue-600 bg-blue-600 shadow-xl text-white transform -translate-y-1 scale-[1.02]' : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'}`}>
                      {formData.subscription_plan === plan && <div className="absolute top-0 right-0 bg-white text-blue-600 p-1.5 rounded-bl-2xl shadow-sm"><CheckCircle2 className="w-5 h-5"/></div>}
                      <h5 className={`font-extrabold text-xl mb-1`}>{plan}</h5>
                      <p className={`text-xs font-bold opacity-80 tracking-wide`}>{plan === 'Enterprise' ? 'All Modules + AI' : plan === 'Pro' ? 'Core + Billing' : 'Basic Visitors'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </form>
  );
}
