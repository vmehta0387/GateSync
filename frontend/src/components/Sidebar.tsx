'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Home, Users, Bell, AlertTriangle, FileText, LogOut, MessageSquare, Briefcase, Calendar, Settings, ShieldCheck, UserCheck, ChevronLeft, ChevronRight, Landmark } from 'lucide-react';

interface SidebarProps {
  role: string;
  societyName?: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ role, societyName = '', isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const adminLinks = [
    { name: 'Dashboard', href: '/admin', icon: Home },
    { name: 'Visitors', href: '/admin/visitors', icon: UserCheck },
    { name: 'Committees', href: '/admin/committees', icon: Landmark },
    { name: 'Communication', href: '/admin/communication', icon: MessageSquare },
    { name: 'Complaints', href: '/admin/complaints', icon: AlertTriangle },
    { name: 'Staff', href: '/admin/staff', icon: Briefcase },
    { name: 'Residents', href: '/admin/residents', icon: Users },
    { name: 'Billing', href: '/admin/billing', icon: FileText },
    { name: 'Facilities', href: '/admin/facilities', icon: Calendar },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
    { name: 'Guard & Security', href: '/admin/security', icon: ShieldCheck },
  ];
  const managerLinks = [
    { name: 'Dashboard', href: '/admin', icon: Home },
    { name: 'Visitors', href: '/admin/visitors', icon: UserCheck },
    { name: 'Communication', href: '/admin/communication', icon: MessageSquare },
    { name: 'Complaints', href: '/admin/complaints', icon: AlertTriangle },
    { name: 'Staff', href: '/admin/staff', icon: Briefcase },
    { name: 'Residents', href: '/admin/residents', icon: Users },
    { name: 'Facilities', href: '/admin/facilities', icon: Calendar },
    { name: 'Guard & Security', href: '/admin/security', icon: ShieldCheck },
  ];

  const residentLinks = [
    { name: 'Dashboard', href: '/resident', icon: Home },
    { name: 'My Visitors', href: '/resident/visitors', icon: Users },
    { name: 'Facilities', href: '/resident/facilities', icon: Calendar },
    { name: 'Notices', href: '/resident/notices', icon: Bell },
    { name: 'Complaints', href: '/resident/complaints', icon: AlertTriangle },
  ];

  const guardLinks = [
    { name: 'Dashboard', href: '/guard', icon: Home },
    { name: 'Active Logs', href: '/guard/logs', icon: FileText },
  ];

  const links = role === 'ADMIN' ? adminLinks : role === 'MANAGER' ? managerLinks : role === 'GUARD' ? guardLinks : residentLinks;

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} h-screen bg-slate-900 border-r border-slate-800 flex flex-col fixed left-0 top-0 transition-all duration-300 ease-in-out z-30 text-white`}>
      <button 
        onClick={onToggle}
        className="absolute -right-4 top-10 bg-slate-800 text-slate-300 p-1.5 rounded-full border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors z-40 hidden md:block"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`pt-8 pb-6 flex items-center gap-3 overflow-hidden ${isCollapsed ? 'px-4 justify-center' : 'px-6'}`}>
        <div className="shrink-0 flex items-center justify-center group">
          <Image src="/icon.svg" alt="GatePulse" width={isCollapsed ? 48 : 36} height={isCollapsed ? 48 : 36} className="rounded-xl shadow-lg hover:scale-105 transition-transform" priority />
        </div>
        {!isCollapsed && (
          <div className="whitespace-nowrap transition-opacity duration-300">
            <h1 className="text-2xl font-bold tracking-tight">GatePulse</h1>
            <p className="text-[10px] text-blue-400 mt-0.5 uppercase tracking-widest font-semibold">
              {role} Portal
            </p>
            {(role === 'ADMIN' || role === 'MANAGER') && societyName ? (
              <p className="mt-2 max-w-[180px] truncate text-[11px] font-medium text-slate-300" title={societyName}>
                {societyName}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto pb-4 custom-scrollbar">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link key={link.name} href={link.href}>
              <div
                className={`flex items-center relative ${isCollapsed ? 'p-3 justify-center' : 'space-x-3 px-4 py-3'} rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-blue-600/90 text-white font-medium shadow-lg shadow-blue-500/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={isCollapsed ? link.name : undefined}
              >
                <Icon className={`w-5 h-5 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                {!isCollapsed && <span className="whitespace-nowrap font-medium">{link.name}</span>}

                {/* Tooltip */}
                {isCollapsed && (
                   <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap shadow-xl border border-slate-700">
                      {link.name}
                   </div>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={() => { localStorage.clear(); window.location.href = '/'; }}
          className={`flex items-center text-slate-400 hover:text-red-400 w-full transition-colors relative group ${isCollapsed ? 'p-3 justify-center' : 'space-x-3 px-4 py-3'} rounded-xl hover:bg-red-400/10 font-medium`}
          title={isCollapsed ? "Sign Out" : undefined}
        >
          <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
          {!isCollapsed && <span className="whitespace-nowrap">Sign Out</span>}

          {isCollapsed && (
             <div className="absolute left-full ml-4 px-3 py-1.5 bg-red-900/90 text-white text-sm font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap shadow-xl border border-red-800">
                Sign Out
             </div>
          )}
        </button>
      </div>
    </div>
  );
}
