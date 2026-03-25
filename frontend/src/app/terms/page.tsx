import Link from 'next/link';

export default function TermsOfServicePage() {
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
          <h1 className="text-5xl font-black tracking-tight text-white italic">Terms of Service</h1>
          <p className="text-white/40 font-medium tracking-wide">Last Updated: March 25, 2026</p>
        </div>

        <div className="space-y-12 prose prose-invert prose-blue max-w-none">
          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">01</span>
              Agreement to Terms
            </h2>
            <p className="text-lg leading-relaxed text-white/70">
              By accessing or using the GateSync mobile application and GatePulse web services, you agree to be bound 
              by these Terms of Service. If you do not agree to all of these terms, do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">02</span>
              Use of Services
            </h2>
            <p className="text-lg leading-relaxed text-white/70 mb-4">
              You are responsible for maintaining the confidentiality of your account and credentials. You agree to 
              use the services only for lawful purposes and in accordance with the rules of your respective gated community.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">03</span>
              Gated Community Rules
            </h2>
            <p className="text-lg leading-relaxed text-white/70">
              GateSync acts as a facilitator for community management. Your use of the app is also subject to the 
              specific bylaws and security protocols of your residential society.
            </p>
          </section>

          <section className="p-8 rounded-3xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20">
            <h2 className="text-2xl font-bold text-white mb-4 italic">Limitation of Liability</h2>
            <p className="text-lg leading-relaxed text-blue-100/70 italic">
              GateSync Technologies Private Limited shall not be liable for any indirect, incidental, special, 
              consequential, or punitive damages resulting from your use of or inability to use the services.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/5 py-12 bg-black/40">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-white/40 text-sm">&copy; 2026 GateSync Technologies Private Limited. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="/" className="text-sm text-white/60 hover:text-white">Home</Link>
            <Link href="/privacy" className="text-sm text-white/60 hover:text-white">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
