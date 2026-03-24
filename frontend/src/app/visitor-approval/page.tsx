'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type ApprovalState = {
  loading: boolean;
  success: boolean;
  message: string;
};

export default function VisitorApprovalPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const decision = searchParams.get('decision') || '';
  const hasValidParams = !!token && ['approve', 'deny'].includes(decision);
  const [state, setState] = useState<ApprovalState>({
    loading: hasValidParams,
    success: false,
    message: hasValidParams ? 'Processing your visitor decision...' : 'This approval link is incomplete or invalid.',
  });

  useEffect(() => {
    if (!hasValidParams) {
      return;
    }

    const submitDecision = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/v1/visitors/public-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, decision }),
        });
        const data = await response.json();
        setState({
          loading: false,
          success: !!data.success,
          message: data.message || 'Visitor decision processed.',
        });
      } catch (error) {
        console.error(error);
        setState({
          loading: false,
          success: false,
          message: 'Unable to reach GateSync right now. Please try the link again.',
        });
      }
    };

    void submitDecision();
  }, [decision, hasValidParams, token]);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-300">GateSync</p>
        <h1 className="mt-4 text-3xl font-bold">Visitor approval</h1>
        <p className="mt-4 text-base text-slate-300">
          {state.loading ? 'Please wait while we verify the secure link and update the gate request.' : state.message}
        </p>
        <div className={`mt-8 rounded-2xl px-4 py-3 text-sm font-medium ${
          state.loading
            ? 'bg-slate-800 text-slate-200'
            : state.success
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-rose-500/15 text-rose-300'
        }`}>
          {state.loading ? 'Updating request...' : state.success ? 'Decision recorded successfully.' : 'Decision could not be completed.'}
        </div>
      </div>
    </div>
  );
}
