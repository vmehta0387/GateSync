import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E6E8EB] selection:bg-blue-500/30">
      <nav className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <span className="text-white font-black text-xl">G</span>
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">GatePulse</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Back to Home</Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        <div className="space-y-4 mb-16">
          <h1 className="text-5xl font-black tracking-tight text-white italic">Privacy Policy</h1>
          <p className="text-white/40 font-medium tracking-wide">Last Updated: March 25, 2026</p>
        </div>

        <div className="space-y-12 prose prose-invert prose-blue max-w-none">
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">01</span>
              Introduction
            </h2>
            <p className="text-lg leading-relaxed text-white/70">
              Welcome to GatePulse. We are committed to protecting your personal information and your right to privacy.
              If you have any questions or concerns about our policy, or our practices with regards to your personal
              information, please contact us at privacy@gatesync.in.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">02</span>
              Information We Collect
            </h2>
            <p className="text-lg leading-relaxed text-white/70 mb-4">
              We collect personal information that you voluntarily provide to us when you register on the App,
              express an interest in obtaining information about us or our products and services, or otherwise
              contact us.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none p-0">
              {[
                "Name and Contact Data",
                "Credentials",
                "Society and Unit Information",
                "Visitor Logs and Images",
                "Facility Bookings",
                "Incident Reports"
              ].map((item) => (
                <li key={item} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-medium text-white/90">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">03</span>
              How We Use Your Information
            </h2>
            <p className="text-lg leading-relaxed text-white/70">
              We use personal information collected via our App for a variety of business purposes described below.
              We process your personal information for these purposes in reliance on our legitimate business interests,
              in order to enter into or perform a contract with you, with your consent, and/or for compliance with
              our legal obligations.
            </p>
          </section>

          <section className="p-8 rounded-3xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20">
            <h2 className="text-2xl font-bold text-white mb-4 italic">Security Matters</h2>
            <p className="text-lg leading-relaxed text-blue-100/70 italic">
              We aim to protect your personal information through a system of organizational and technical security
              measures. We have implemented appropriate internal control measures designed to protect the security
              of any personal information we process.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/5 py-12 bg-black/40">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-white/40 text-sm">&copy; 2026 GateSync Technologies Private Limited. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="/" className="text-sm text-white/60 hover:text-white">Home</Link>
            <Link href="/terms" className="text-sm text-white/60 hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
