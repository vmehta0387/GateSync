export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Platform Billing</h2>
        <p className="text-slate-500 text-sm mt-1">Manage society subscriptions and monitor revenue streams.</p>
      </div>
      
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
         <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
         </div>
         <h3 className="text-2xl font-bold text-slate-800 mb-2">Billing Infrastructure Integration</h3>
         <p className="text-slate-500 max-w-md mx-auto mb-8">
           The payment gateway (Stripe/Razorpay) integration is scheduled for the next iteration. For now, all onboarded societies bypass the payment wall manually.
         </p>
         <button className="bg-slate-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
           Configure Gateway API Keys
         </button>
      </div>
    </div>
  );
}
