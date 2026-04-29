'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, Crown, Shield, Sparkles, UserRound, Wallet } from 'lucide-react';
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

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
};

type RazorpayHandlerPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOpenOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler: (payload: RazorpayHandlerPayload) => void;
};

type RazorpayInstance = {
  open: () => void;
};

type RazorpayConstructor = new (options: RazorpayOpenOptions) => RazorpayInstance;

type PremiumPaymentProof = {
  paymentProofToken: string;
  planCode: 'PRO_MONTHLY' | 'PRO_YEARLY';
  totalFlats: number;
  amountInr: number;
  paymentId: string;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const API_BASE = 'https://api.gatesync.in/api/v1';
const DEFAULT_UNIT_PRICE = 10;
const RAZORPAY_CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

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

async function loadRazorpayScript() {
  if (typeof window === 'undefined') return false;
  if (window.Razorpay) return true;

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_SCRIPT}"]`);
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if ((window as Window).Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay SDK failed to load')), { once: true });
    });
    return Boolean(window.Razorpay);
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay SDK failed to load'));
    document.body.appendChild(script);
  });

  return Boolean(window.Razorpay);
}

export default function PublicOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [planChoice, setPlanChoice] = useState<PlanChoice>('TRIAL');
  const [unitPrice, setUnitPrice] = useState(DEFAULT_UNIT_PRICE);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [premiumPaymentProof, setPremiumPaymentProof] = useState<PremiumPaymentProof | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(`${API_BASE}/subscriptions/plans`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data?.success) return;
        const perUnit = Number(data?.pricing_model?.per_unit_monthly_inr || DEFAULT_UNIT_PRICE);
        if (Number.isFinite(perUnit) && perUnit > 0) setUnitPrice(perUnit);
      } catch {
        // keep fallback
      }
    };
    void fetchPlans();
  }, []);

  const monthlyAmount = useMemo(() => formData.total_flats * unitPrice, [formData.total_flats, unitPrice]);
  const yearlyAmount = useMemo(() => monthlyAmount * 12, [monthlyAmount]);
  const isTrial = planChoice === 'TRIAL';
  const selectedPremiumPlanCode = useMemo<'PRO_MONTHLY' | 'PRO_YEARLY'>(
    () => (planChoice === 'PRO_YEARLY' ? 'PRO_YEARLY' : 'PRO_MONTHLY'),
    [planChoice]
  );
  const premiumPaymentDone = useMemo(
    () =>
      Boolean(
        premiumPaymentProof &&
          premiumPaymentProof.planCode === selectedPremiumPlanCode &&
          premiumPaymentProof.totalFlats === Number(formData.total_flats || 0)
      ),
    [premiumPaymentProof, selectedPremiumPlanCode, formData.total_flats]
  );

  useEffect(() => {
    if (!premiumPaymentProof) return;
    if (isTrial) {
      setPremiumPaymentProof(null);
      return;
    }
    if (
      premiumPaymentProof.planCode !== selectedPremiumPlanCode ||
      premiumPaymentProof.totalFlats !== Number(formData.total_flats || 0)
    ) {
      setPremiumPaymentProof(null);
      setSuccess('Plan or unit count changed. Please verify premium payment again.');
    }
  }, [isTrial, premiumPaymentProof, selectedPremiumPlanCode, formData.total_flats]);

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

  const startPremiumPayment = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const sdkReady = await loadRazorpayScript();
      if (!sdkReady || !window.Razorpay) {
        setError('Unable to load secure payment window. Please refresh and try again.');
        setSaving(false);
        return;
      }

      const orderResponse = await fetch(`${API_BASE}/onboarding/payment/precreate-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_code: selectedPremiumPlanCode,
          total_flats: Number(formData.total_flats || 0),
        }),
      });
      const orderData = await orderResponse.json();
      if (!orderResponse.ok || !orderData?.success) {
        setError(orderData?.message || 'Unable to start premium payment.');
        setSaving(false);
        return;
      }

      const order: RazorpayOrderResponse = orderData.order;
      const razorpayKey = String(orderData.razorpay_key_id || '').trim();
      const preOrderToken = String(orderData.pre_order_token || '').trim();
      if (!order?.id || !razorpayKey || !preOrderToken) {
        setError('Payment setup is incomplete. Please contact support.');
        setSaving(false);
        return;
      }

      const rz = new window.Razorpay({
        key: razorpayKey,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'GateSync',
        description: selectedPremiumPlanCode === 'PRO_YEARLY' ? 'Premium Annual Plan' : 'Premium Monthly Plan',
        order_id: order.id,
        prefill: {
          contact: formData.admin.phone || undefined,
          email: formData.admin.email || undefined,
          name: formData.admin.name || undefined,
        },
        theme: { color: '#1d8bf1' },
        modal: {
          ondismiss: () => {
            setError('Payment was cancelled. You can retry and continue.');
            setSaving(false);
          },
        },
        handler: async (paymentPayload: RazorpayHandlerPayload) => {
          try {
            const verifyResponse = await fetch(`${API_BASE}/onboarding/payment/preconfirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pre_order_token: preOrderToken,
                razorpay_order_id: paymentPayload.razorpay_order_id,
                razorpay_payment_id: paymentPayload.razorpay_payment_id,
                razorpay_signature: paymentPayload.razorpay_signature,
              }),
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok || !verifyData?.success) {
              setError(verifyData?.message || 'Payment verification failed. Please retry.');
              setSaving(false);
              return;
            }

            setPremiumPaymentProof({
              paymentProofToken: String(verifyData.payment_proof_token || '').trim(),
              planCode: selectedPremiumPlanCode,
              totalFlats: Number(formData.total_flats || 0),
              amountInr: Number(verifyData.payment?.amount_inr || 0),
              paymentId: String(verifyData.payment?.payment_id || '').trim(),
            });
            setSuccess('Premium payment verified. You can continue onboarding.');
            setStep(2);
            setSaving(false);
          } catch {
            setError('Payment complete hua, but verification network issue aaya. Please retry.');
            setSaving(false);
          }
        },
      });

      rz.open();
    } catch {
      setError('Server unreachable. Please try again.');
      setSaving(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    const payload = {
      ...formData,
      subscription_plan: isTrial ? 'Free' : 'Pro',
      premium_plan_code: isTrial ? null : selectedPremiumPlanCode,
      payment_proof_token: isTrial ? null : premiumPaymentProof?.paymentProofToken || null,
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

      setSuccess('Society created successfully. Admin can now login using OTP.');
      setTimeout(() => router.push('/'), 1800);
    } catch {
      setError('Server unreachable. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#eef4fb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(59,130,246,0.28),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(6,182,212,0.20),transparent_35%),linear-gradient(160deg,#eff5fc_0%,#dbe9f8_48%,#edf6fb_100%)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(30,64,175,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(30,64,175,0.22)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-blue-300/45 blur-3xl" />
      <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-cyan-200/55 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 rounded-2xl border border-blue-100/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src="/icon.svg" alt="GateSync" width={42} height={42} className="h-9 w-9 md:h-10 md:w-10" />
              <p className="text-3xl font-black leading-none tracking-tight text-[#0f172a]">
                Gate<span className="text-[#0ea5e9]">Sync</span>
              </p>
            </div>
            <a
              href="tel:+919699615965"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1d8bf1] to-[#22c1df] px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-95"
            >
              Call Us
              <span className="text-white/90">+91 96996 15965</span>
            </a>
          </div>
        </div>

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700/80">Guided Onboarding</p>
            <h1 className="mt-1 text-3xl font-black text-[#0f172a] md:text-4xl">Launch Your Society in Minutes</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Clear steps, no technical jargon, and transparent unit-based billing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        <div className="mb-8 rounded-2xl border border-cyan-200 bg-gradient-to-r from-blue-50 via-cyan-50 to-blue-50 p-4 shadow-[0_10px_30px_-18px_rgba(30,64,175,0.35)]">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <Sparkles className="h-4 w-4 text-cyan-600" />
            <span className="font-semibold">{`₹${unitPrice}/unit/month`}</span>
            <span className="text-slate-500">• 2-month full-feature free trial</span>
            <span className="text-slate-500">• Auto unit-limit validation</span>
          </div>
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
                className={`rounded-2xl border px-4 py-3 text-left backdrop-blur transition ${
                  active
                    ? 'border-cyan-300 bg-cyan-100/80'
                    : done
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-blue-100 bg-white/85 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`h-4 w-4 ${active ? 'text-cyan-700' : done ? 'text-emerald-600' : 'text-blue-500/80'}`} />
                  {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-800">{item.title}</p>
              </button>
            );
          })}
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/88 p-6 shadow-[0_25px_60px_-35px_rgba(30,64,175,0.45)] backdrop-blur-xl md:p-7">
          {step === 1 ? (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-slate-900">Plan & Unit Declaration</h2>
              <p className="text-sm text-slate-600">
                Declare total units once. System will block unit additions beyond this quota until subscription upgrade.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Declared Flats / Units</p>
                  <input
                    type="number"
                    min={1}
                    value={formData.total_flats}
                    onChange={(e) => update('total_flats', Math.max(1, Number(e.target.value || 1)))}
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-lg font-bold text-slate-900"
                  />
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Choose Plan</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span>Free Trial (2 months)</span>
                      <input checked={planChoice === 'TRIAL'} onChange={() => setPlanChoice('TRIAL')} type="radio" />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span>{`Premium Monthly (₹${monthlyAmount}/month)`}</span>
                      <input checked={planChoice === 'PRO_MONTHLY'} onChange={() => setPlanChoice('PRO_MONTHLY')} type="radio" />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span>{`Premium Annual (₹${yearlyAmount}/year)`}</span>
                      <input checked={planChoice === 'PRO_YEARLY'} onChange={() => setPlanChoice('PRO_YEARLY')} type="radio" />
                    </label>
                  </div>
                  {!isTrial ? (
                    <p className={`mt-3 text-xs font-semibold ${premiumPaymentDone ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {premiumPaymentDone
                        ? `Premium payment verified (₹${premiumPaymentProof?.amountInr || 0}).`
                        : 'Complete premium payment in Step 1 to continue.'}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Society Name</label>
                <input value={formData.name} onChange={(e) => update('name', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Address</label>
                <textarea value={formData.address} onChange={(e) => update('address', e.target.value)} className="mt-2 min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Society Type</label>
                <select value={formData.society_type} onChange={(e) => update('society_type', e.target.value as FormState['society_type'])} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">
                  <option value="Apartment">Apartment</option>
                  <option value="Villa">Villa</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Declared Flats / Units</label>
                <input value={formData.total_flats} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-slate-600" />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Admin Name</label>
                <input value={formData.admin.name} onChange={(e) => update('admin', { ...formData.admin, name: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Admin Email (Optional)</label>
                <input type="email" value={formData.admin.email} onChange={(e) => update('admin', { ...formData.admin, email: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Admin Phone</label>
                <input value={formData.admin.phone} maxLength={10} onChange={(e) => update('admin', { ...formData.admin, phone: e.target.value.replace(/\D/g, '') })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Towers</label>
                  <input type="number" min={1} value={formData.towers_count} onChange={(e) => update('towers_count', Math.max(1, Number(e.target.value || 1)))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Floors/Tower</label>
                  <input type="number" min={1} value={formData.floors_per_tower} onChange={(e) => update('floors_per_tower', Math.max(1, Number(e.target.value || 1)))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Main Rule</label>
                  <label className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                    <input type="checkbox" checked={formData.config_settings.visitor_approval} onChange={(e) => update('config_settings', { ...formData.config_settings, visitor_approval: e.target.checked })} />
                    Visitor approval required
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                {formData.gates.map((gate, index) => (
                  <div key={`${gate.name}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
                    <input
                      value={gate.name}
                      onChange={(e) => {
                        const gates = [...formData.gates];
                        gates[index] = { ...gates[index], name: e.target.value };
                        update('gates', gates);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900"
                      placeholder="Gate name"
                    />
                    <select
                      value={gate.gate_type}
                      onChange={(e) => {
                        const gates = [...formData.gates];
                        gates[index] = { ...gates[index], gate_type: e.target.value as 'Main' | 'Service' | 'Other' };
                        update('gates', gates);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900"
                    >
                      <option value="Main">Main</option>
                      <option value="Service">Service</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                ))}
                <button type="button" onClick={() => update('gates', [...formData.gates, { name: '', gate_type: 'Service' }])} className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  + Add Gate
                </button>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4 text-sm text-slate-700">
              <h2 className="text-xl font-bold text-slate-900">Final Review</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900">Society</p>
                  <p>{formData.name || '-'}</p>
                  <p>{formData.address || '-'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
            <button type="button" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
              Previous
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !isTrial && !premiumPaymentDone) {
                    void startPremiumPayment();
                    return;
                  }
                  setStep((prev) => Math.min(5, prev + 1));
                }}
                disabled={!canContinue || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {step === 1 && !isTrial && !premiumPaymentDone ? 'Pay & Continue' : 'Continue'}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={saving || (!isTrial && !premiumPaymentDone)} className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Society'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
