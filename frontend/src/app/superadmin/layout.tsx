'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Building2, CreditCard, LogOut, Bell, Search, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { clearStoredSession, getStoredSession, StoredUser, useClientReady } from '@/lib/auth';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isClient = useClientReady();
  const session = isClient ? getStoredSession() : { token: null, user: null };
  const user = session.user as StoredUser | null;
  const isAuthorized = !!session.token && user?.role === 'SUPERADMIN';
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (isClient && !isAuthorized) {
      router.replace('/');
    }
  }, [isClient, isAuthorized, router]);

  if (!isClient || !isAuthorized || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 border-4 border-transparent">
        <div className="animate-spin w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const navItems = [
    { name: 'Overview', href: '/superadmin', icon: LayoutDashboard },
    { name: 'Societies', href: '/superadmin/societies', icon: Building2 },
    { name: 'Platform Billing', href: '/superadmin/billing', icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${isCollapsed ? 'w-20' : 'w-72'} bg-slate-900 text-white flex-col pt-8 pb-6 px-4 hidden md:flex fixed h-full shadow-2xl z-30 transition-all duration-300 ease-in-out border-r border-slate-800`}
      >
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-4 top-10 bg-slate-800 text-slate-300 p-1.5 rounded-full border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors z-40 hidden md:block"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className={`flex items-center gap-3 mb-10 overflow-hidden px-2 transition-all duration-300`}>
          <div className="shrink-0 group">
            <Image src="/icon.svg" alt="GateSync" width={isCollapsed ? 48 : 40} height={isCollapsed ? 48 : 40} className="hover:scale-105 transition-transform drop-shadow-lg" priority />
          </div>
          {!isCollapsed && (
            <div className="whitespace-nowrap opacity-100 transition-opacity duration-300">
              <h1 className="text-2xl font-bold tracking-tight">GateSync</h1>
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">Superadmin</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.name} href={item.href}>
                <div 
                  className={`relative flex items-center ${isCollapsed ? 'p-3 justify-center' : 'gap-3 px-4 py-3'} rounded-xl transition-all duration-200 group ${isActive ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                  {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
                  
                  {/* Tooltip for collapsed state inside component (optional since title attribute works well too, but this is cooler) */}
                  {isCollapsed && (
                     <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap shadow-xl border border-slate-700">
                        {item.name}
                     </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-2 py-4 border-t border-slate-800">
          <button
            onClick={() => {
              clearStoredSession();
              router.replace('/');
            }}
            className={`flex items-center text-slate-400 hover:text-red-400 transition-colors w-full ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl hover:bg-red-400/10 group`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
            {!isCollapsed && <span className="font-medium whitespace-nowrap">Sign Out</span>}
            
            {isCollapsed && (
               <div className="absolute left-full ml-4 px-3 py-1.5 bg-red-900/90 text-white text-sm font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap shadow-xl border border-red-800">
                  Sign Out
               </div>
            )}
          </button>
        </div>
      </aside>

      <main className={`flex-1 ${isCollapsed ? 'md:ml-20' : 'md:ml-72'} flex flex-col min-h-screen relative transition-all duration-300 ease-in-out`}>
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-20 w-full shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <Menu className="w-6 h-6 text-slate-500 md:hidden cursor-pointer" />
            <div className="hidden md:flex relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search societies, admins..."
                className="w-full bg-slate-100/50 border border-slate-200 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="relative text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 p-2 rounded-full border border-slate-100">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-full flex items-center justify-center text-white font-bold shadow-md transform hover:scale-105 transition-transform cursor-pointer border-2 border-white">
                SA
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-bold text-slate-800">Root Admin</p>
                <p className="text-xs text-slate-500 font-medium">+{user.phone_number}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
