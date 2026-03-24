'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const links = [
  { label: 'Overview', href: '/admin/communication' },
  { label: 'Notices', href: '/admin/communication/notices' },
  { label: 'Messages', href: '/admin/communication/messages' },
  { label: 'Alerts', href: '/admin/communication/alerts' },
  { label: 'Polls', href: '/admin/communication/polls' },
  { label: 'Events', href: '/admin/communication/events' },
  { label: 'Documents', href: '/admin/communication/documents' },
];

export default function CommunicationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Premium Tab Navigation */}
      <div className="overflow-x-auto pb-2 custom-scrollbar">
        <div className="inline-flex min-w-max gap-2 rounded-2xl bg-slate-200/50 p-1.5 backdrop-blur-md dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-center relative rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-300 ease-in-out ${
                  isActive
                    ? 'bg-white text-brand-600 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-950 dark:text-brand-400 dark:ring-slate-800'
                    : 'text-slate-600 hover:bg-white/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        {children}
      </div>
    </div>
  );
}
