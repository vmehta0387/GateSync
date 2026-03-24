'use client';
import { useState } from 'react';
import Image from 'next/image';
import { KeyRound, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length !== 10) return setError('Please enter a valid 10-digit mobile number');
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('http://localhost:5000/api/v1/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber })
      });
      const data = await res.json();
      if (data.success) {
        setStep(2);
      } else {
        setError(data.message || 'Error sending OTP');
      }
    } catch {
      setError('Server unreachable');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return setError('Invalid OTP');
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('http://localhost:5000/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber, otp })
      });
      const data = await res.json();
      if (data.success) {
        // Save token & redirect to dashboard based on role
        localStorage.setItem('gatepulse_token', data.token);
        localStorage.setItem('gatepulse_user', JSON.stringify(data.user));
        
        switch (data.user.role) {
          case 'SUPERADMIN': window.location.href = '/superadmin'; break;
          case 'ADMIN':
          case 'MANAGER':
            window.location.href = '/admin'; break;
          case 'GUARD': window.location.href = '/guard'; break;
          default: window.location.href = '/resident'; break; // RESIDENT
        }
      } else {
        setError(data.message || 'Invalid OTP');
      }
    } catch {
      setError('Server unreachable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="backdrop-blur-3xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] overflow-hidden relative">
          {/* Header */}
          <div className="text-center mb-10 flex flex-col items-center">
            <div className="w-64 h-auto mb-1 relative hover:scale-[1.03] transition-transform duration-300">
              <Image src="/logo-vertical.svg" alt="GateSync Logo" width={300} height={260} className="w-full h-auto drop-shadow-2xl" priority />
            </div>
            <p className="text-blue-100/90 text-sm font-medium tracking-[0.15em] uppercase relative z-10 backdrop-blur-sm px-4 py-1 rounded-full bg-white/5 border border-white/10 shadow-xl">Secure. Smart. Connected.</p>
          </div>

          {/* Error Banner */}
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm text-center">
              {error}
            </motion.div>
          )}

          {/* Form */}
          <div className="relative overflow-hidden">
            <motion.div
              animate={{ x: step === 1 ? '0%' : '-50%' }}
              transition={{ ease: "easeInOut", duration: 0.4 }}
              className="flex w-[200%]"
            >
              {/* Step 1 */}
              <div className="w-1/2 shrink-0 pr-4">
                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Phone Number</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <span className="text-white/60 font-semibold">+91</span>
                        <div className="h-5 w-[1px] bg-white/20 mx-3"></div>
                      </div>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white/5 border border-white/20 rounded-2xl py-3.5 pl-[4.5rem] pr-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium tracking-wide text-lg"
                        placeholder="00000 00000"
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center group disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {loading ? 'Sending OTP...' : 'Continue Securely'}
                    {!loading && <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />}
                  </button>
                  <p className="text-center text-xs text-white/40 mt-5 leading-relaxed">
                    By confirming, you agree to our <a href="#" className="text-blue-300 hover:text-blue-200">Terms of Service</a> &amp; <a href="#" className="text-blue-300 hover:text-blue-200">Privacy Policy</a>.<br/>
                    <span className="inline-block mt-2 px-2 py-1 bg-white/5 rounded-md border border-white/10">(Demo: &apos;9999999999&apos; Admin, &apos;8888888888&apos; Guard)</span>
                  </p>
                </form>
              </div>

              {/* Step 2 */}
              <div className="w-1/2 shrink-0 pl-4">
                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="text-center mb-8">
                    <p className="text-white/70 text-sm">Validating OTP sent to</p>
                    <p className="text-white font-bold tracking-wider mt-1 text-lg">+91 {phoneNumber}</p>
                    <button type="button" onClick={() => setStep(1)} className="text-xs text-blue-300 hover:text-blue-200 font-medium underline mt-2 transition-colors">Change Number</button>
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-white mb-2">6-Digit Security PIN</label>
                    <div className="relative group">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 w-5 h-5" />
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white/5 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white/10 tracking-[0.75em] font-bold text-center transition-all text-xl"
                        placeholder="••••••"
                        maxLength={6}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {loading ? 'Verifying...' : 'Verify & Access'}
                  </button>
                  <p className="text-center text-xs text-white/50 mt-6">
                    Demo: Use OTP <span className="text-white font-bold">&apos;123456&apos;</span>
                  </p>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
