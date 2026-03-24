'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type BillingSummary = {
  total_invoiced: number;
  total_collected: number;
  pending_amount: number;
  overdue_amount: number;
  penalties_applied: number;
  collection_rate: number;
  paid_invoices: number;
  unpaid_invoices: number;
  overdue_invoices: number;
  defaulters: Array<{ flat_id: number; block_name: string; flat_number: string; outstanding_amount: number; invoice_count: number }>;
  monthly_revenue: Array<{ month_year: string; collected_amount: number; invoiced_amount: number }>;
};

type BillingConfig = {
  id: number;
  title: string;
  description: string;
  billing_type: string;
  frequency: string;
  calculation_method: string;
  base_amount: number;
  due_day: number | null;
  auto_generate: boolean;
  late_fee_type: string;
  late_fee_value: number;
  breakdown: Array<{ label: string; amount: number; calculation: 'fixed' | 'per_sqft' }>;
  flat_type_amounts: Record<string, number>;
  is_active: boolean;
};

type Invoice = {
  id: number;
  invoice_number: string;
  block_name: string;
  flat_number: string;
  month_year: string;
  billing_type: string;
  status: string;
  due_date: string | null;
  subtotal_amount: number;
  penalty_amount: number;
  adjustment_amount: number;
  total_amount: number;
  balance_amount: number;
  line_items: Array<{ id: number; label: string; amount: number }>;
};

type Reports = {
  collection_report: Array<{ month_year: string; invoiced_amount: number; collected_amount: number; pending_amount: number }>;
  flat_wise_dues: Array<{ flat_id: number; block_name: string; flat_number: string; pending_amount: number; overdue_count: number }>;
};

type BillingTab = 'overview' | 'rules' | 'invoices' | 'reports';
type InvoiceFilter = 'All' | 'Unpaid' | 'Overdue' | 'Paid' | 'PartiallyPaid';
type InvoiceAction = 'paid' | 'waive';

const API_BASE = 'http://localhost:5000/api/v1';

const defaultRule = {
  title: '',
  description: '',
  billing_type: 'MonthlyMaintenance',
  frequency: 'Monthly',
  calculation_method: 'Equal',
  base_amount: '3000',
  due_day: '10',
  auto_generate: true,
  late_fee_type: 'FlatPerDay',
  late_fee_value: '50',
  flat_type_amounts: {
    '1BHK': '2500',
    '2BHK': '3500',
    '3BHK': '5000',
  },
  breakdown: [
    { label: 'Maintenance', amount: '2000', calculation: 'fixed' as const },
    { label: 'Security', amount: '500', calculation: 'fixed' as const },
    { label: 'Water', amount: '500', calculation: 'fixed' as const },
  ],
};

const tabs: Array<{ id: BillingTab; label: string; helper: string }> = [
  { id: 'overview', label: 'Overview', helper: 'Summary, collection health, defaulters' },
  { id: 'rules', label: 'Rules & Flats', helper: 'Billing rules and flat masters' },
  { id: 'invoices', label: 'Invoices', helper: 'Track bills, balances, waivers, payments' },
  { id: 'reports', label: 'Reports', helper: 'Collections and flat-wise dues' },
];

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currency.format(value || 0);
}

function statusClasses(status: string) {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'Overdue':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'PartiallyPaid':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'Waived':
      return 'bg-violet-50 text-violet-700 ring-violet-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  const escapeCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function configToRuleForm(config: BillingConfig) {
  return {
    title: config.title || '',
    description: config.description || '',
    billing_type: config.billing_type || 'MonthlyMaintenance',
    frequency: config.frequency || 'Monthly',
    calculation_method: config.calculation_method || 'Equal',
    base_amount: String(config.base_amount ?? ''),
    due_day: config.due_day ? String(config.due_day) : '10',
    auto_generate: config.auto_generate ?? true,
    late_fee_type: config.late_fee_type || 'FlatPerDay',
    late_fee_value: String(config.late_fee_value ?? ''),
    flat_type_amounts: Object.fromEntries(
      Object.entries(config.flat_type_amounts || {}).map(([flatType, amount]) => [flatType, String(amount)])
    ),
    breakdown: (config.breakdown?.length ? config.breakdown : defaultRule.breakdown).map((item) => ({
      label: item.label || '',
      amount: String(item.amount ?? ''),
      calculation: item.calculation,
    })),
  };
}

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [configs, setConfigs] = useState<BillingConfig[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reports, setReports] = useState<Reports>({ collection_report: [], flat_wise_dues: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [generationMonth, setGenerationMonth] = useState(new Date().toISOString().slice(0, 7));
  const [ruleForm, setRuleForm] = useState(defaultRule);
  const [activeTab, setActiveTab] = useState<BillingTab>('overview');
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('All');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: InvoiceAction; invoice: Invoice } | null>(null);
  const [flatTypes, setFlatTypes] = useState<string[]>(['Studio', '1BHK', '2BHK', '3BHK', '4BHK', 'Villa', 'Other']);

  const token = typeof window !== 'undefined' ? localStorage.getItem('gatepulse_token') : null;

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [summaryRes, configRes, invoiceRes, reportRes] = await Promise.all([
        fetch(`${API_BASE}/billing/summary`, { headers: authHeaders }),
        fetch(`${API_BASE}/billing/configs`, { headers: authHeaders }),
        fetch(`${API_BASE}/billing`, { headers: authHeaders }),
        fetch(`${API_BASE}/billing/reports`, { headers: authHeaders }),
      ]);

      const [summaryData, configData, invoiceData, reportData] = await Promise.all([
        summaryRes.json(),
        configRes.json(),
        invoiceRes.json(),
        reportRes.json(),
      ]);

      if (summaryData.success) setSummary(summaryData.summary);
      if (configData.success) {
        setConfigs(configData.configs || []);
        setFlatTypes(configData.meta?.flat_types || ['Studio', '1BHK', '2BHK', '3BHK', '4BHK', 'Villa', 'Other']);
        if (!selectedConfigId && configData.configs?.length) {
          setSelectedConfigId(configData.configs[0].id);
        }
      }
      if (invoiceData.success) setInvoices(invoiceData.invoices || []);
      if (reportData.success) setReports(reportData.reports || { collection_report: [], flat_wise_dues: [] });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, selectedConfigId, token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const saveRule = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/billing/configs${editingRuleId ? `/${editingRuleId}` : ''}`, {
        method: editingRuleId ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...ruleForm,
          base_amount: Number(ruleForm.base_amount || 0),
          due_day: Number(ruleForm.due_day || 10),
          late_fee_value: Number(ruleForm.late_fee_value || 0),
          flat_type_amounts: Object.fromEntries(
            Object.entries(ruleForm.flat_type_amounts)
              .filter(([, amount]) => Number(amount || 0) > 0)
              .map(([flatType, amount]) => [flatType, Number(amount || 0)]),
          ),
          breakdown: ruleForm.breakdown.map((item) => ({
            label: item.label,
            amount: Number(item.amount || 0),
            calculation: item.calculation,
          })),
        }),
      });
      const data = await res.json();
      setMessage(data.message || (editingRuleId ? 'Billing rule updated' : 'Billing rule saved'));
      setEditingRuleId(null);
      setRuleForm(defaultRule);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const generateInvoices = async () => {
    if (!selectedConfigId) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/billing/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ config_id: selectedConfigId, month_year: generationMonth }),
      });
      const data = await res.json();
      setMessage(data.message || 'Billing generation complete');
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (invoiceId: number) => {
    await fetch(`${API_BASE}/billing/${invoiceId}/pay`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ payment_method: 'AdminOverride' }),
    });
    await loadAll();
  };

  const applyWaiver = async (invoiceId: number) => {
    await fetch(`${API_BASE}/billing/${invoiceId}/adjust`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ adjustment_type: 'Waiver' }),
    });
    await loadAll();
  };

  const handleInvoiceAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'paid') {
      await markPaid(confirmAction.invoice.id);
      setMessage(`${confirmAction.invoice.invoice_number || `INV-${confirmAction.invoice.id}`} marked as paid.`);
    } else {
      await applyWaiver(confirmAction.invoice.id);
      setMessage(`${confirmAction.invoice.invoice_number || `INV-${confirmAction.invoice.id}`} waived successfully.`);
    }
    setConfirmAction(null);
    setSelectedInvoice(null);
  };

  const filteredInvoices = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesFilter = invoiceFilter === 'All' ? true : invoice.status === invoiceFilter;
      const matchesQuery = !query
        ? true
        : [
            invoice.invoice_number,
            `${invoice.block_name}-${invoice.flat_number}`,
            invoice.month_year,
            invoice.billing_type,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [invoiceFilter, invoiceSearch, invoices]);

  const activeConfig = configs.find((config) => config.id === selectedConfigId) || null;
  const dueInvoicesCount = invoices.filter((invoice) => ['Unpaid', 'Overdue', 'PartiallyPaid'].includes(invoice.status)).length;

  const startRuleEdit = (config: BillingConfig) => {
    setEditingRuleId(config.id);
    setRuleForm(configToRuleForm(config));
  };

  const resetRuleBuilder = () => {
    setEditingRuleId(null);
    setRuleForm(defaultRule);
  };

  const updateFlatTypeAmount = (flatType: string, value: string) => {
    setRuleForm((current) => ({
      ...current,
      flat_type_amounts: {
        ...current.flat_type_amounts,
        [flatType]: value,
      },
    }));
  };

  const overviewCards = [
    { label: 'Total Invoiced', value: summary ? formatCurrency(summary.total_invoiced) : '...', tone: 'text-slate-900' },
    { label: 'Collected', value: summary ? formatCurrency(summary.total_collected) : '...', tone: 'text-emerald-700' },
    { label: 'Pending Dues', value: summary ? formatCurrency(summary.pending_amount) : '...', tone: 'text-amber-700' },
    { label: 'Overdue Dues', value: summary ? formatCurrency(summary.overdue_amount) : '...', tone: 'text-rose-700' },
    { label: 'Collection Rate', value: summary ? `${summary.collection_rate.toFixed(1)}%` : '...', tone: 'text-sky-700' },
    { label: 'Penalties Applied', value: summary ? formatCurrency(summary.penalties_applied) : '...', tone: 'text-violet-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Finance Ops</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Billing Management</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Automate maintenance bills, track collections, and give residents clear invoice breakdowns without turning the page into an accounting mess.
          </p>
        </div>
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Action Center</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Generate and dispatch monthly billing in one place</h2>
            <p className="mt-1 text-sm text-slate-500">Pick a rule, select the month, then generate bills for the whole society.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_auto_auto]">
            <select value={selectedConfigId || ''} onChange={(e) => setSelectedConfigId(e.target.value ? Number(e.target.value) : null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
              <option value="">Select billing rule</option>
              {configs.map((config) => <option key={config.id} value={config.id}>{config.title}</option>)}
            </select>
            <input type="month" value={generationMonth} onChange={(e) => setGenerationMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700" />
            <button onClick={generateInvoices} disabled={saving || !selectedConfigId} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">Generate Bills</button>
            <button
              onClick={() =>
                downloadCsv(
                  `gatesync-billing-overview-${generationMonth}.csv`,
                  [
                    ['Metric', 'Value'],
                    ['Total Invoiced', summary?.total_invoiced || 0],
                    ['Collected', summary?.total_collected || 0],
                    ['Pending Amount', summary?.pending_amount || 0],
                    ['Overdue Amount', summary?.overdue_amount || 0],
                    ['Collection Rate', summary?.collection_rate || 0],
                  ],
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Export Summary
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-xl border px-3 py-2.5 text-left transition ${activeTab === tab.id ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}>
            <p className="text-sm font-semibold">{tab.label}</p>
            <p className={`mt-0.5 text-[11px] ${activeTab === tab.id ? 'text-slate-300' : 'text-slate-500'}`}>{tab.helper}</p>
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            {overviewCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
                <p className={`mt-2 text-xl font-black ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Collection Snapshot</h3>
              <p className="mt-1 text-sm text-slate-500">Quick read on monthly billing momentum and where collections are slowing down.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {(reports.collection_report.length ? reports.collection_report : summary?.monthly_revenue || []).slice(0, 6).map((row) => {
                  const pending = 'pending_amount' in row ? row.pending_amount : row.invoiced_amount - row.collected_amount;
                  return (
                    <div key={row.month_year} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                      <p className="font-semibold text-slate-900">{row.month_year}</p>
                      <p className="mt-3 text-sm text-slate-600">Invoiced: {formatCurrency(row.invoiced_amount)}</p>
                      <p className="text-sm text-emerald-600">Collected: {formatCurrency(row.collected_amount)}</p>
                      <p className="text-sm text-rose-600">Pending: {formatCurrency(pending)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Defaulters Watchlist</h3>
              <p className="mt-1 text-sm text-slate-500">Keep the high-risk flats visible so reminders and follow-ups happen fast.</p>
              <div className="mt-5 space-y-3">
                {summary?.defaulters?.length ? summary.defaulters.map((item) => (
                  <div key={item.flat_id} className="rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{item.block_name}-{item.flat_number}</p>
                        <p className="text-xs text-slate-500">{item.invoice_count} active unpaid invoice(s)</p>
                      </div>
                      <p className="text-sm font-black text-rose-700">{formatCurrency(item.outstanding_amount)}</p>
                    </div>
                  </div>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">No defaulters right now.</p>}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'rules' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Billing Rule Builder</h3>
            <p className="mt-1 text-xs text-slate-500">
              {editingRuleId ? 'Update the selected billing rule and save the changes.' : 'Create reusable monthly, quarterly, yearly, and one-time billing logic with a clear charge breakdown.'}
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 p-3.5">
              <p className="text-sm font-semibold text-slate-900">Rule Setup</p>
              <p className="mt-1 text-[11px] text-slate-500">Define what kind of bill this is and how the base amount should be calculated.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <FieldLabel label="Rule Name" hint="Internal name used while generating bills." />
                  <input value={ruleForm.title} onChange={(e) => setRuleForm((current) => ({ ...current, title: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="Monthly maintenance - standard" />
                </div>
                <div>
                  <FieldLabel label="Base Amount" hint="Starting amount before per-flat logic applies." />
                  <input value={ruleForm.base_amount} onChange={(e) => setRuleForm((current) => ({ ...current, base_amount: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="3000" />
                </div>
                <div>
                  <FieldLabel label="Billing Type" hint="How this charge should appear in billing history." />
                  <select value={ruleForm.billing_type} onChange={(e) => setRuleForm((current) => ({ ...current, billing_type: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                    <option value="MonthlyMaintenance">Monthly Maintenance</option>
                    <option value="QuarterlyMaintenance">Quarterly Maintenance</option>
                    <option value="YearlyMaintenance">Yearly Maintenance</option>
                    <option value="OneTimeCharge">One-time Charge</option>
                    <option value="Penalty">Penalty</option>
                    <option value="Fine">Fine</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Calculation Method" hint="Choose whether all flats pay same, area-based, or custom." />
                  <select value={ruleForm.calculation_method} onChange={(e) => setRuleForm((current) => ({ ...current, calculation_method: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                    <option value="Equal">Equal for all flats</option>
                    <option value="AreaBased">Area Based</option>
                    <option value="FlatType">BHK-wise / Flat type</option>
                    <option value="Custom">Custom flat amount</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Due Day" hint="Day of the month when payment becomes due." />
                  <input value={ruleForm.due_day} onChange={(e) => setRuleForm((current) => ({ ...current, due_day: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="10" />
                </div>
                <div>
                  <FieldLabel label="Late Fee Type" hint="Apply penalty after due date if payment is delayed." />
                  <select value={ruleForm.late_fee_type} onChange={(e) => setRuleForm((current) => ({ ...current, late_fee_type: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                    <option value="None">No late fee</option>
                    <option value="FlatPerDay">Flat per day</option>
                    <option value="FlatOnce">Flat once</option>
                    <option value="PercentOnce">Percent once</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Late Fee Value" hint="Example: 50 for flat-per-day, or percentage for percent-once." />
                  <input value={ruleForm.late_fee_value} onChange={(e) => setRuleForm((current) => ({ ...current, late_fee_value: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="50" />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <FieldLabel label="Description" hint="Explain what the resident is being charged for." />
                  <input value={ruleForm.description} onChange={(e) => setRuleForm((current) => ({ ...current, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="Monthly common area upkeep, water, and security charges." />
                </div>
              </div>
            </div>

            {ruleForm.calculation_method === 'FlatType' ? (
              <div className="mt-4 rounded-xl border border-slate-200 p-3.5">
                <p className="text-sm font-semibold text-slate-900">BHK-wise Amount Mapping</p>
                <p className="mt-1 text-[11px] text-slate-500">Set the bill amount for each flat type. Flats without a mapped amount will fall back to base amount.</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {flatTypes.map((flatType) => (
                    <div key={flatType}>
                      <FieldLabel label={flatType} />
                      <input
                        value={ruleForm.flat_type_amounts[flatType] || ''}
                        onChange={(e) => updateFlatTypeAmount(flatType, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">Invoice Breakdown</p>
                  <p className="text-[11px] text-slate-500">Yeh additional line items hain. BHK-wise or base amount alag se calculate hoke inke saath add hota hai.</p>
                </div>
                <button onClick={() => setRuleForm((current) => ({ ...current, breakdown: [...current.breakdown, { label: '', amount: '0', calculation: 'fixed' }] }))} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                  Add Line
                </button>
              </div>
              <div className="mt-3 space-y-2.5">
                <div className="grid gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 md:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                  <span>Resident Label</span>
                  <span>Charge</span>
                  <span>Charge Basis</span>
                  <span className="text-right">Action</span>
                </div>
                {ruleForm.breakdown.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="grid gap-3 md:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                    <input value={item.label} onChange={(e) => setRuleForm((current) => ({ ...current, breakdown: current.breakdown.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: e.target.value } : entry) }))} className="rounded-md border border-slate-200 px-2 py-1.5 text-[13px]" placeholder="Maintenance" />
                    <input value={item.amount} onChange={(e) => setRuleForm((current) => ({ ...current, breakdown: current.breakdown.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount: e.target.value } : entry) }))} className="rounded-md border border-slate-200 px-2 py-1.5 text-[13px]" placeholder="2000" />
                    <select value={item.calculation} onChange={(e) => setRuleForm((current) => ({ ...current, breakdown: current.breakdown.map((entry, entryIndex) => entryIndex === index ? { ...entry, calculation: e.target.value as 'fixed' | 'per_sqft' } : entry) }))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                      <option value="fixed">Fixed</option>
                      <option value="per_sqft">Per sqft</option>
                    </select>
                    <button onClick={() => setRuleForm((current) => ({ ...current, breakdown: current.breakdown.filter((_, entryIndex) => entryIndex !== index) }))} disabled={ruleForm.breakdown.length === 1} className="rounded-lg border border-rose-200 px-2.5 py-2 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={saveRule} disabled={saving} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {editingRuleId ? 'Update Billing Rule' : 'Save Billing Rule'}
              </button>
              {editingRuleId ? (
                <button onClick={resetRuleBuilder} type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Saved Rules</h3>
              <p className="mt-1 text-xs text-slate-500">Quickly check what is active before generating the month.</p>
              <div className="mt-3.5 space-y-2.5">
                {configs.length ? configs.map((config) => (
                  <div key={config.id} className={`w-full rounded-xl border p-2.5 transition ${selectedConfigId === config.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                    <button onClick={() => setSelectedConfigId(config.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">{config.title}</p>
                          <p className={`mt-1 text-xs ${selectedConfigId === config.id ? 'text-slate-300' : 'text-slate-500'}`}>{config.billing_type} / {config.calculation_method}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${config.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{config.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </button>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => startRuleEdit(config)}
                        className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${selectedConfigId === config.id ? 'border border-white/20 bg-white/10 text-white hover:bg-white/20' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        Edit Rule
                      </button>
                    </div>
                  </div>
                )) : <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No billing rules yet.</p>}
              </div>
              {activeConfig ? (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">{activeConfig.title}</p>
                  <p className="mt-1">Base amount: {formatCurrency(activeConfig.base_amount)}</p>
                  <p>Due day: {activeConfig.due_day || '-'}</p>
                  <p>Late fee: {activeConfig.late_fee_type} {activeConfig.late_fee_value ? `/ ${formatCurrency(activeConfig.late_fee_value)}` : ''}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'invoices' ? (
        <div className="space-y-6">
          <div className="sticky top-4 z-20 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm backdrop-blur">
            <div className="grid gap-3 md:grid-cols-[1.1fr_220px_auto_auto]">
              <input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Search invoice number, flat, month, or billing type" />
              <select value={invoiceFilter} onChange={(e) => setInvoiceFilter(e.target.value as InvoiceFilter)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="All">All statuses</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Overdue">Overdue</option>
                <option value="PartiallyPaid">Partially paid</option>
                <option value="Paid">Paid</option>
              </select>
              <div className="flex items-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">{filteredInvoices.length} invoice(s)</div>
              <button
                onClick={() =>
                  downloadCsv(
                    `gatesync-invoices-${generationMonth}.csv`,
                    [
                      ['Invoice', 'Flat', 'Month', 'Status', 'Total', 'Balance', 'Due Date'],
                      ...filteredInvoices.map((invoice) => [
                        invoice.invoice_number || `INV-${invoice.id}`,
                        `${invoice.block_name}-${invoice.flat_number}`,
                        invoice.month_year,
                        invoice.status,
                        invoice.total_amount,
                        invoice.balance_amount,
                        invoice.due_date || '',
                      ]),
                    ],
                  )
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Export Invoices
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Invoice Queue</h3>
            <p className="mt-1 text-sm text-slate-500">Filter, review, export, and take action on outstanding invoices without opening each one.</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <div className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600">Outstanding: {dueInvoicesCount}</div>
              <div className="rounded-full bg-rose-50 px-3 py-1.5 font-medium text-rose-700">Overdue: {summary?.overdue_invoices || 0}</div>
              <div className="rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">Paid: {summary?.paid_invoices || 0}</div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Invoice</th>
                    <th className="py-3 pr-4">Flat</th>
                    <th className="py-3 pr-4">Breakdown</th>
                    <th className="py-3 pr-4">Total</th>
                    <th className="py-3 pr-4">Balance</th>
                    <th className="py-3 pr-4">Due</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="py-10 text-center text-slate-500">Loading billing data...</td></tr>
                  ) : filteredInvoices.length ? filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-100 align-top">
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-slate-900">{invoice.invoice_number || `INV-${invoice.id}`}</p>
                        <p className="mt-1 text-xs text-slate-500">{invoice.billing_type}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-medium text-slate-900">{invoice.block_name}-{invoice.flat_number}</p>
                        <p className="mt-1 text-xs text-slate-500">{invoice.month_year}</p>
                      </td>
                      <td className="py-4 pr-4 text-xs text-slate-600">
                        <div className="space-y-1">
                          {(invoice.line_items || []).slice(0, 3).map((item) => (
                            <div key={item.id} className="flex justify-between gap-4">
                              <span>{item.label}</span>
                              <span>{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                          {(invoice.line_items || []).length > 3 ? <p className="pt-1 text-[11px] font-semibold text-slate-400">+{invoice.line_items.length - 3} more line item(s)</p> : null}
                        </div>
                      </td>
                      <td className="py-4 pr-4 font-semibold text-slate-900">{formatCurrency(invoice.total_amount)}</td>
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-slate-900">{formatCurrency(invoice.balance_amount)}</p>
                        {invoice.penalty_amount ? <p className="mt-1 text-xs text-rose-600">Penalty {formatCurrency(invoice.penalty_amount)}</p> : null}
                        {invoice.adjustment_amount ? <p className="text-xs text-violet-600">Adjustment {formatCurrency(invoice.adjustment_amount)}</p> : null}
                      </td>
                      <td className="py-4 pr-4 text-slate-600">{invoice.due_date || '-'}</td>
                      <td className="py-4 pr-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(invoice.status)}`}>{invoice.status}</span>
                      </td>
                      <td className="py-4 text-right">
                        {['Unpaid', 'Overdue', 'PartiallyPaid'].includes(invoice.status) ? (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setSelectedInvoice(invoice)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">View</button>
                            <button onClick={() => setConfirmAction({ type: 'paid', invoice })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Mark Paid</button>
                            <button onClick={() => setConfirmAction({ type: 'waive', invoice })} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-200">Waive</button>
                          </div>
                        ) : (
                          <button onClick={() => setSelectedInvoice(invoice)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-500">
                      <div className="mx-auto max-w-sm space-y-2">
                        <p className="text-base font-semibold text-slate-700">No invoices match the current view</p>
                        <p>Try clearing the search, changing the status filter, or generating bills for the selected month.</p>
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'reports' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Monthly Collection Report</h3>
            <p className="mt-1 text-sm text-slate-500">Use this to understand revenue, carry-forward dues, and month-on-month collection health.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {reports.collection_report.map((row) => (
                <div key={row.month_year} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <p className="font-semibold text-slate-900">{row.month_year}</p>
                  <p className="mt-3 text-sm text-slate-600">Invoiced: {formatCurrency(row.invoiced_amount)}</p>
                  <p className="text-sm text-emerald-600">Collected: {formatCurrency(row.collected_amount)}</p>
                  <p className="text-sm text-rose-600">Pending: {formatCurrency(row.pending_amount)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Flat-wise Dues</h3>
            <p className="mt-1 text-sm text-slate-500">Quickly identify defaulters, recurring overdue flats, and where reminders should go next.</p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Flat</th>
                    <th className="py-3 pr-4">Pending</th>
                    <th className="py-3 pr-4">Overdue Bills</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.flat_wise_dues.length ? reports.flat_wise_dues.map((row) => (
                    <tr key={row.flat_id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-slate-900">{row.block_name}-{row.flat_number}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{formatCurrency(row.pending_amount)}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200">{row.overdue_count}</span>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={3} className="py-10 text-center text-slate-500">No flat-wise dues to report.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {selectedInvoice ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <button className="flex-1 cursor-default" onClick={() => setSelectedInvoice(null)} aria-label="Close invoice details" />
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Invoice Detail</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">{selectedInvoice.invoice_number || `INV-${selectedInvoice.id}`}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedInvoice.block_name}-{selectedInvoice.flat_number} / {selectedInvoice.month_year}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Status</p>
                <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(selectedInvoice.status)}`}>{selectedInvoice.status}</span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Due Date</p>
                <p className="mt-3 text-lg font-bold text-slate-900">{selectedInvoice.due_date || '-'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Total</p>
                <p className="mt-3 text-lg font-bold text-slate-900">{formatCurrency(selectedInvoice.total_amount)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Balance</p>
                <p className="mt-3 text-lg font-bold text-slate-900">{formatCurrency(selectedInvoice.balance_amount)}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
              <h4 className="text-sm font-bold text-slate-900">Breakdown</h4>
              <div className="mt-4 space-y-3">
                {selectedInvoice.line_items?.length ? selectedInvoice.line_items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                  </div>
                )) : <p className="text-sm text-slate-500">No line items captured for this invoice.</p>}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
              <h4 className="text-sm font-bold text-slate-900">Totals</h4>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><span className="text-slate-600">Subtotal</span><span className="font-semibold text-slate-900">{formatCurrency(selectedInvoice.subtotal_amount)}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-600">Penalty</span><span className="font-semibold text-slate-900">{formatCurrency(selectedInvoice.penalty_amount)}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-600">Adjustment</span><span className="font-semibold text-slate-900">{formatCurrency(selectedInvoice.adjustment_amount)}</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3"><span className="text-slate-600">Net payable</span><span className="text-base font-black text-slate-900">{formatCurrency(selectedInvoice.total_amount)}</span></div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {['Unpaid', 'Overdue', 'PartiallyPaid'].includes(selectedInvoice.status) ? (
                <>
                  <button onClick={() => setConfirmAction({ type: 'paid', invoice: selectedInvoice })} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                    Mark Paid
                  </button>
                  <button onClick={() => setConfirmAction({ type: 'waive', invoice: selectedInvoice })} className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-700 hover:bg-amber-200">
                    Waive Invoice
                  </button>
                </>
              ) : null}
              <button
                onClick={() =>
                  downloadCsv(
                    `${selectedInvoice.invoice_number || `invoice-${selectedInvoice.id}`}.csv`,
                    [
                      ['Invoice', selectedInvoice.invoice_number || `INV-${selectedInvoice.id}`],
                      ['Flat', `${selectedInvoice.block_name}-${selectedInvoice.flat_number}`],
                      ['Month', selectedInvoice.month_year],
                      ['Status', selectedInvoice.status],
                      ['Due Date', selectedInvoice.due_date || ''],
                      ['Subtotal', selectedInvoice.subtotal_amount],
                      ['Penalty', selectedInvoice.penalty_amount],
                      ['Adjustment', selectedInvoice.adjustment_amount],
                      ['Total', selectedInvoice.total_amount],
                      ['Balance', selectedInvoice.balance_amount],
                      ...((selectedInvoice.line_items || []).map((item) => [`Line Item: ${item.label}`, item.amount])),
                    ],
                  )
                }
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Export Invoice
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Confirm Action</p>
            <h3 className="mt-2 text-xl font-black text-slate-900">
              {confirmAction.type === 'paid' ? 'Mark invoice as paid?' : 'Waive this invoice?'}
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              {confirmAction.invoice.invoice_number || `INV-${confirmAction.invoice.id}`} for {confirmAction.invoice.block_name}-{confirmAction.invoice.flat_number}
              {' '}currently has a balance of {formatCurrency(confirmAction.invoice.balance_amount)}.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => void handleInvoiceAction()} className={`flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-white ${confirmAction.type === 'paid' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
                {confirmAction.type === 'paid' ? 'Confirm Paid' : 'Confirm Waive'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
