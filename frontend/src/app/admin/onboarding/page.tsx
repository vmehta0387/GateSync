'use client';

import { useMemo, useState } from 'react';
import {
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  DoorOpen,
  FileSpreadsheet,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserCog,
  Wand2,
} from 'lucide-react';

type SocietyProfile = {
  society_name: string;
  address: string;
  society_type: 'Apartment' | 'GatedVilla' | 'Mixed';
  towers_count: string;
  total_flats: string;
  gates_count: string;
};

type TeamSetup = {
  primary_admin_name: string;
  primary_admin_phone: string;
  guards_count: string;
  import_mode: 'Manual' | 'CSV';
};

type OperationsSetup = {
  visitor_approval_mode: 'Resident' | 'AdminFallback' | 'Hybrid';
  pass_validity_hours: string;
  due_day: string;
  billing_start_month: string;
};

type ValidationSetup = {
  test_notification: boolean;
  test_visitor_approval: boolean;
  emergency_contacts_ready: boolean;
};

type CopilotMessage = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
};

type StepId = 'society' | 'structure' | 'team' | 'operations' | 'validation';

const DEFAULT_PROFILE: SocietyProfile = {
  society_name: '',
  address: '',
  society_type: 'Apartment',
  towers_count: '1',
  total_flats: '',
  gates_count: '1',
};

const DEFAULT_TEAM: TeamSetup = {
  primary_admin_name: '',
  primary_admin_phone: '',
  guards_count: '2',
  import_mode: 'Manual',
};

const DEFAULT_OPERATIONS: OperationsSetup = {
  visitor_approval_mode: 'Hybrid',
  pass_validity_hours: '24',
  due_day: '10',
  billing_start_month: new Date().toISOString().slice(0, 7),
};

const DEFAULT_VALIDATION: ValidationSetup = {
  test_notification: false,
  test_visitor_approval: false,
  emergency_contacts_ready: false,
};

const STEPS: Array<{
  id: StepId;
  title: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'society', title: 'Society Basics', helper: 'Name, type, address', icon: Building2 },
  { id: 'structure', title: 'Structure', helper: 'Towers, flats, gates', icon: DoorOpen },
  { id: 'team', title: 'Team Setup', helper: 'Admin, guards, import mode', icon: UserCog },
  { id: 'operations', title: 'Operations Rules', helper: 'Visitor and billing defaults', icon: ShieldCheck },
  { id: 'validation', title: 'Go Live Checks', helper: 'Final readiness checks', icon: ClipboardCheck },
];

const toNumber = (value: string) => Number(value || 0);

function clampPhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

function getCompletionScore(
  profile: SocietyProfile,
  team: TeamSetup,
  ops: OperationsSetup,
  validation: ValidationSetup,
) {
  const checks = [
    Boolean(profile.society_name.trim()),
    Boolean(profile.address.trim()),
    toNumber(profile.towers_count) > 0,
    toNumber(profile.total_flats) > 0,
    toNumber(profile.gates_count) > 0,
    Boolean(team.primary_admin_name.trim()),
    team.primary_admin_phone.length === 10,
    toNumber(team.guards_count) > 0,
    toNumber(ops.pass_validity_hours) > 0,
    toNumber(ops.due_day) >= 1 && toNumber(ops.due_day) <= 31,
    Boolean(ops.billing_start_month),
    validation.test_notification,
    validation.test_visitor_approval,
    validation.emergency_contacts_ready,
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function generateCopilotReply(
  question: string,
  context: {
    step: StepId;
    profile: SocietyProfile;
    team: TeamSetup;
    ops: OperationsSetup;
    validation: ValidationSetup;
  },
) {
  const q = question.toLowerCase();
  if (q.includes('csv') || q.includes('import')) {
    return 'CSV import best works after you finalize tower and flat count. Use a simple sheet with Tower, Flat, Resident Name, Phone, and Role. Keep one row per resident.';
  }
  if (q.includes('billing') || q.includes('due')) {
    return `For faster rollout, start billing on ${context.ops.billing_start_month} with due day ${context.ops.due_day}. You can later fine-tune late fee rules in Billing module.`;
  }
  if (q.includes('guard') || q.includes('security')) {
    return `You currently set ${context.team.guards_count || '0'} guards. For smoother operations, keep at least 2 guards per active gate across shifts.`;
  }
  if (q.includes('approval') || q.includes('visitor')) {
    return `Current approval mode is ${context.ops.visitor_approval_mode}. Hybrid is usually safest: resident gets first priority, admin fallback avoids gate delays.`;
  }
  if (q.includes('ready') || q.includes('go live')) {
    const score = getCompletionScore(context.profile, context.team, context.ops, context.validation);
    return `Current onboarding readiness is ${score}%. Complete all Go Live checks before launch so notifications and approvals work from day one.`;
  }

  if (context.step === 'society') {
    return 'Start with complete society basics. A clear society name and full address helps during notices, invoices, and emergency workflows.';
  }
  if (context.step === 'structure') {
    return 'Lock your towers, total flats, and gate count first. This prevents data mismatch when you import residents or assign guards.';
  }
  if (context.step === 'team') {
    return 'Add the main admin and initial guard count now. You can onboard more managers and guards later without disrupting setup.';
  }
  if (context.step === 'operations') {
    return 'Set visitor approval mode, pass validity, and billing defaults now. This keeps gate operations and collections consistent from launch.';
  }
  return 'Before go-live, run notification and approval tests once. This catches most production issues early.';
}

export default function AdminOnboardingCopilotPage() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [profile, setProfile] = useState<SocietyProfile>(DEFAULT_PROFILE);
  const [team, setTeam] = useState<TeamSetup>(DEFAULT_TEAM);
  const [operations, setOperations] = useState<OperationsSetup>(DEFAULT_OPERATIONS);
  const [validation, setValidation] = useState<ValidationSetup>(DEFAULT_VALIDATION);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 1,
      role: 'assistant',
      text: 'Welcome to Society Onboarding Copilot. I will guide you step by step and flag missing items before go-live.',
    },
  ]);

  const activeStep = STEPS[activeStepIndex];
  const score = useMemo(
    () => getCompletionScore(profile, team, operations, validation),
    [operations, profile, team, validation],
  );

  const checklist = useMemo(
    () => [
      { label: 'Society basics completed', done: Boolean(profile.society_name.trim() && profile.address.trim()) },
      {
        label: 'Structure details completed',
        done: toNumber(profile.towers_count) > 0 && toNumber(profile.total_flats) > 0 && toNumber(profile.gates_count) > 0,
      },
      {
        label: 'Core team configured',
        done: Boolean(team.primary_admin_name.trim()) && team.primary_admin_phone.length === 10 && toNumber(team.guards_count) > 0,
      },
      {
        label: 'Operations defaults configured',
        done: toNumber(operations.pass_validity_hours) > 0 && toNumber(operations.due_day) >= 1 && toNumber(operations.due_day) <= 31,
      },
      {
        label: 'Go live checks completed',
        done: validation.test_notification && validation.test_visitor_approval && validation.emergency_contacts_ready,
      },
    ],
    [operations, profile, team, validation],
  );

  const canMoveNext = useMemo(() => {
    if (activeStep.id === 'society') {
      return Boolean(profile.society_name.trim() && profile.address.trim());
    }
    if (activeStep.id === 'structure') {
      return toNumber(profile.towers_count) > 0 && toNumber(profile.total_flats) > 0 && toNumber(profile.gates_count) > 0;
    }
    if (activeStep.id === 'team') {
      return Boolean(team.primary_admin_name.trim()) && team.primary_admin_phone.length === 10 && toNumber(team.guards_count) > 0;
    }
    if (activeStep.id === 'operations') {
      return toNumber(operations.pass_validity_hours) > 0 && toNumber(operations.due_day) >= 1 && toNumber(operations.due_day) <= 31;
    }
    return validation.test_notification && validation.test_visitor_approval && validation.emergency_contacts_ready;
  }, [activeStep.id, operations.due_day, operations.pass_validity_hours, profile.address, profile.gates_count, profile.society_name, profile.total_flats, profile.towers_count, team.guards_count, team.primary_admin_name, team.primary_admin_phone, validation.emergency_contacts_ready, validation.test_notification, validation.test_visitor_approval]);

  const summaryJson = useMemo(
    () =>
      JSON.stringify(
        {
          profile,
          team,
          operations,
          validation,
          readiness_score: score,
        },
        null,
        2,
      ),
    [operations, profile, score, team, validation],
  );

  const runSmartDefaults = () => {
    setProfile((current) => ({
      ...current,
      society_type: current.society_type || 'Apartment',
      towers_count: current.towers_count || '2',
      total_flats: current.total_flats || '120',
      gates_count: current.gates_count || '2',
    }));
    setTeam((current) => ({
      ...current,
      guards_count: current.guards_count || '4',
      import_mode: current.import_mode || 'CSV',
    }));
    setOperations((current) => ({
      ...current,
      visitor_approval_mode: 'Hybrid',
      pass_validity_hours: current.pass_validity_hours || '24',
      due_day: current.due_day || '10',
    }));
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: 'assistant',
        text: 'Applied recommended defaults for faster rollout. You can still edit everything before go-live.',
      },
    ]);
  };

  const askCopilot = () => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const userMessage: CopilotMessage = { id: Date.now(), role: 'user', text: trimmed };
    const assistantMessage: CopilotMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      text: generateCopilotReply(trimmed, {
        step: activeStep.id,
        profile,
        team,
        ops: operations,
        validation,
      }),
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setQuestion('');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Onboarding Copilot</p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Society Setup Assistant</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Guided onboarding flow that helps your team configure society details, operations defaults, and go-live checks with AI recommendations.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            Readiness Score: {score}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const active = index === activeStepIndex;
                const visited = index < activeStepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStepIndex(index)}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : visited
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Icon className={`h-4 w-4 ${active ? 'text-blue-700' : visited ? 'text-emerald-700' : 'text-slate-500'}`} />
                      {visited ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{step.helper}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900">{activeStep.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{activeStep.helper}</p>
            </div>

            {activeStep.id === 'society' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  value={profile.society_name}
                  onChange={(e) => setProfile((c) => ({ ...c, society_name: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Society name"
                />
                <select
                  value={profile.society_type}
                  onChange={(e) => setProfile((c) => ({ ...c, society_type: e.target.value as SocietyProfile['society_type'] }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="Apartment">Apartment</option>
                  <option value="GatedVilla">Gated Villa</option>
                  <option value="Mixed">Mixed</option>
                </select>
                <textarea
                  value={profile.address}
                  onChange={(e) => setProfile((c) => ({ ...c, address: e.target.value }))}
                  className="min-h-[96px] rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2"
                  placeholder="Full society address"
                />
              </div>
            ) : null}

            {activeStep.id === 'structure' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <input
                  value={profile.towers_count}
                  onChange={(e) => setProfile((c) => ({ ...c, towers_count: e.target.value.replace(/\D/g, '') }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Towers"
                />
                <input
                  value={profile.total_flats}
                  onChange={(e) => setProfile((c) => ({ ...c, total_flats: e.target.value.replace(/\D/g, '') }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Total flats"
                />
                <input
                  value={profile.gates_count}
                  onChange={(e) => setProfile((c) => ({ ...c, gates_count: e.target.value.replace(/\D/g, '') }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Security gates"
                />
                <div className="md:col-span-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
                  Tip: finalize flats and gates before resident import, so role mapping stays clean.
                </div>
              </div>
            ) : null}

            {activeStep.id === 'team' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  value={team.primary_admin_name}
                  onChange={(e) => setTeam((c) => ({ ...c, primary_admin_name: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Primary admin name"
                />
                <input
                  value={team.primary_admin_phone}
                  onChange={(e) => setTeam((c) => ({ ...c, primary_admin_phone: clampPhone(e.target.value) }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Primary admin phone"
                />
                <input
                  value={team.guards_count}
                  onChange={(e) => setTeam((c) => ({ ...c, guards_count: e.target.value.replace(/\D/g, '') }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Initial guards count"
                />
                <select
                  value={team.import_mode}
                  onChange={(e) => setTeam((c) => ({ ...c, import_mode: e.target.value as TeamSetup['import_mode'] }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="Manual">Manual resident add</option>
                  <option value="CSV">CSV resident import</option>
                </select>
              </div>
            ) : null}

            {activeStep.id === 'operations' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <select
                  value={operations.visitor_approval_mode}
                  onChange={(e) => setOperations((c) => ({ ...c, visitor_approval_mode: e.target.value as OperationsSetup['visitor_approval_mode'] }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="Resident">Resident first</option>
                  <option value="AdminFallback">Admin fallback</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
                <input
                  value={operations.pass_validity_hours}
                  onChange={(e) => setOperations((c) => ({ ...c, pass_validity_hours: e.target.value.replace(/\D/g, '') }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Visitor pass validity (hours)"
                />
                <input
                  value={operations.due_day}
                  onChange={(e) => setOperations((c) => ({ ...c, due_day: e.target.value.replace(/\D/g, '') }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Billing due day (1-31)"
                />
                <input
                  type="month"
                  value={operations.billing_start_month}
                  onChange={(e) => setOperations((c) => ({ ...c, billing_start_month: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
            ) : null}

            {activeStep.id === 'validation' ? (
              <div className="space-y-3">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={validation.test_notification}
                    onChange={(e) => setValidation((c) => ({ ...c, test_notification: e.target.checked }))}
                  />
                  Push notification test completed
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={validation.test_visitor_approval}
                    onChange={(e) => setValidation((c) => ({ ...c, test_visitor_approval: e.target.checked }))}
                  />
                  Visitor approve or reject flow tested
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={validation.emergency_contacts_ready}
                    onChange={(e) => setValidation((c) => ({ ...c, emergency_contacts_ready: e.target.checked }))}
                  />
                  Manager, admin, and security emergency contacts verified
                </label>
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveStepIndex((current) => Math.max(0, current - 1))}
                disabled={activeStepIndex === 0}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActiveStepIndex((current) => Math.min(STEPS.length - 1, current + 1))}
                disabled={activeStepIndex === STEPS.length - 1 || !canMoveNext}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next Step <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Copilot Checklist</h3>
              <Sparkles className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-4 space-y-2">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleDashed className="h-4 w-4 text-slate-400" />}
                  <span className={item.done ? 'text-slate-900' : 'text-slate-500'}>{item.label}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={runSmartDefaults}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700"
            >
              <Wand2 className="h-4 w-4" />
              Apply Smart Defaults
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">AI Guide</h3>
              <Bot className="h-4 w-4 text-indigo-600" />
            </div>

            <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === 'assistant'
                      ? 'bg-indigo-50 text-indigo-900'
                      : 'ml-8 bg-slate-900 text-white'
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      askCopilot();
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Ask onboarding question..."
                />
              </div>
              <button
                type="button"
                onClick={askCopilot}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Ask Copilot
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-slate-600" />
              <h3 className="text-base font-bold text-slate-900">Onboarding Snapshot</h3>
            </div>
            <pre className="max-h-[220px] overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
              {summaryJson}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

