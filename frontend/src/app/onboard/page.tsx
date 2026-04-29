'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, Crown, Shield, UserRound, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';

type PlanChoice = 'TRIAL' | 'PRO_MONTHLY' | 'PRO_YEARLY';

type FormState = {
  name: string;
  address: string;
  society_type: 'Apartment' | 'Villa' | 'Mixed';
  towers_count: number;
  floors_per_tower: number;
  total_flats: number;
  admin: {
    name: string;
    email: string;
    phone: string;
  };
  gates: Array<{ name: string; gate_type: 'Main' | 'Service' | 'Other' }>;
  config_settings: {
    visitor_approval: boolean;
    auto_delivery: boolean;
  };
  subscription_plan: 'Free' | 'Pro' | 'Enterprise';
};

const API_BASE = 'https://api.gatesync.in/api/v1';
const DEFAULT_UNIT_PRICE = 10;

const STEPS = [
  { id: 1, title: 'Plan & Units', icon: Wallet },
  { id: 2, title: 'Society Details', icon: Building2 },
  { id: 3, title: 'Admin Setup', icon: UserRound },
  { id: 4, title: 'Security Setup', icon: Shield },
  { id: 5, title: 'Review & Launch', icon: Crown },
];

const INITIAL_FORM: FormState = {
  name: '',
  address: '',
  society_type: 'Apartment',
  towers_count: 1,
  floors_per_tower: 10,
  total_flats: 100,
  admin: {
    name: '',
    email: '',
    phone: '',
  },
  gates: [{ name: 'Main Gate', gate_type: 'Main' }],
  config_settings: {
    visitor_approval: true,
    auto_delivery: false,
  },
  subscription_plan: 'Free',
};

export default function PublicOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [planChoice, setPlanChoice] = useState<PlanChoice>('TRIAL');
  const [unitPrice, setUnitPrice] = useState(DEFAULT_UNIT_PRICE);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(`${API_BASE}/subscriptions/plans`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data?.success) return;
        const perUnit = Number(data?.pricing_model?.per_unit_monthly_inr || DEFAULT_UNIT_PRICE);
        if (Number.isFinite(perUnit) && perUnit > 0) {
          setUnitPrice(perUnit);
        }
      } catch {
        // Keep fallback.
      }
    };
    void fetchPlans();
  }, []);

  const monthlyAmount = useMemo(() => formData.total_flats * unitPrice, [formData.total_flats, unitPrice]);
  const yearlyAmount = useMemo(() => monthlyAmount * 12, [monthlyAmount]);
  const isTrial = planChoice === 'TRIAL';

  const canContinue = useMemo(() => {
    if (step === 1) return formData.total_flats > 0;
    if (step === 2) return Boolean(formData.name.trim() && formData.address.trim());
    if (step === 3) return Boolean(formData.admin.name.trim() && /^\d{10}$/.test(formData.admin.phone));
    if (step === 4) return formData.gates.length > 0 && formData.gates.every((gate) => gate.name.trim().length > 0);
    return true;
  }, [formData, step]);

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    const payload = {
      ...formData,
      subscription_plan: isTrial ? 'Free' : 'Pro',
      total_flats: Number(formData.total_flats || 0),
      towers_count: Number(formData.towers_count || 0),
      floors_per_tower: Number(formData.floors_per_tower || 0),
    };

    try {
      const response = await fetch(`${API_BASE}/onboarding/society`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.message || 'Unable to onboard society right now.');
        setSaving(false);
        return;
      }

      if (!isTrial) {
        setSuccess('Society created. Next step: complete Razorpay payment from premium checkout to unlock paid plan.');
      } else {
        setSuccess('Society created successfully. Admin can now login using OTP.');
      }
      setTimeout(() => router.push('/'), 1800);
    } catch {
      setError('Server unreachable. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Society Onboarding</h1>
          <p className="mt-2 text-sm text-slate-600">
            Simple flow for non-technical admins. Declare units, choose plan, then finish setup in minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <span className="font-semibold">Pricing model:</span> {`₹${unitPrice}/unit/month`} • 2-month free trial with full features
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-5">
        {STEPS.map((item) => {
          const Icon = item.icon;
          const active = item.id === step;
          const done = item.id < step;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                active ? 'border-blue-300 bg-blue-50' : done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-4 w-4 ${active ? 'text-blue-700' : done ? 'text-emerald-700' : 'text-slate-500'}`} />
                {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-900">{item.title}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 1 ? (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900">Plan & Unit Declaration</h2>
            <p className="text-sm text-slate-600">
              Declare total units once. System will block adding units beyond this count unless subscription is upgraded.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Declared Units</p>
                <input
                  type="number"
                  min={1}
                  value={formData.total_flats}
                  onChange={(e) => update('total_flats', Math.max(1, Number(e.target.value || 1)))}
                  className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-bold text-slate-900"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Choose Plan</p>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <span>Free Trial (2 months)</span>
                    <input checked={planChoice === 'TRIAL'} onChange={() => setPlanChoice('TRIAL')} type="radio" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <span>{`Premium Monthly (₹${monthlyAmount}/month)`}</span>
                    <input checked={planChoice === 'PRO_MONTHLY'} onChange={() => setPlanChoice('PRO_MONTHLY')} type="radio" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <span>{`Premium Annual (₹${yearlyAmount}/year)`}</span>
                    <input checked={planChoice === 'PRO_YEARLY'} onChange={() => setPlanChoice('PRO_YEARLY')} type="radio" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">Society Name</label>
              <input value={formData.name} onChange={(e) => update('name', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">Address</label>
              <textarea value={formData.address} onChange={(e) => update('address', e.target.value)} className="mt-2 min-h-[96px] w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Society Type</label>
              <select value={formData.society_type} onChange={(e) => update('society_type', e.target.value as FormState['society_type'])} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5">
                <option value="Apartment">Apartment</option>
                <option value="Villa">Villa</option>
                <option value="Mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Declared Flats</label>
              <input value={formData.total_flats} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5" />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">Admin Name</label>
              <input value={formData.admin.name} onChange={(e) => update('admin', { ...formData.admin, name: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Admin Email (Optional)</label>
              <input type="email" value={formData.admin.email} onChange={(e) => update('admin', { ...formData.admin, email: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Admin Phone</label>
              <input value={formData.admin.phone} maxLength={10} onChange={(e) => update('admin', { ...formData.admin, phone: e.target.value.replace(/\D/g, '') })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-semibold text-slate-700">Towers</label>
                <input type="number" min={1} value={formData.towers_count} onChange={(e) => update('towers_count', Math.max(1, Number(e.target.value || 1)))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Floors/Tower</label>
                <input type="number" min={1} value={formData.floors_per_tower} onChange={(e) => update('floors_per_tower', Math.max(1, Number(e.target.value || 1)))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Main Rule</label>
                <label className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <input type="checkbox" checked={formData.config_settings.visitor_approval} onChange={(e) => update('config_settings', { ...formData.config_settings, visitor_approval: e.target.checked })} />
                  Visitor approval required
                </label>
              </div>
            </div>
            <div className="space-y-2">
              {formData.gates.map((gate, index) => (
                <div key={`${gate.name}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
                  <input
                    value={gate.name}
                    onChange={(e) => {
                      const gates = [...formData.gates];
                      gates[index] = { ...gates[index], name: e.target.value };
                      update('gates', gates);
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5"
                    placeholder="Gate name"
                  />
                  <select
                    value={gate.gate_type}
                    onChange={(e) => {
                      const gates = [...formData.gates];
                      gates[index] = { ...gates[index], gate_type: e.target.value as 'Main' | 'Service' | 'Other' };
                      update('gates', gates);
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="Main">Main</option>
                    <option value="Service">Service</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              ))}
              <button type="button" onClick={() => update('gates', [...formData.gates, { name: '', gate_type: 'Service' }])} className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700">
                + Add Gate
              </button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4 text-sm text-slate-700">
            <h2 className="text-xl font-bold text-slate-900">Final Review</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">Society</p>
                <p>{formData.name || '-'}</p>
                <p>{formData.address || '-'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">Plan</p>
                <p>{planChoice}</p>
                <p>{`${formData.total_flats} units`}</p>
                <p>{isTrial ? '2-month free trial' : planChoice === 'PRO_MONTHLY' ? `₹${monthlyAmount}/month` : `₹${yearlyAmount}/year`}</p>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

        <div className="mt-8 flex items-center justify-between">
          <button type="button" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
            Previous
          </button>
          {step < 5 ? (
            <button type="button" onClick={() => setStep((prev) => Math.min(5, prev + 1))} disabled={!canContinue} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Society'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
