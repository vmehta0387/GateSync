'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { getStoredSession, useClientReady } from '@/lib/auth';

export default function GuardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isClient = useClientReady();
  const session = isClient ? getStoredSession() : { token: null, user: null };
  const isAuthorized = !!session.token && session.user?.role === 'GUARD';
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (isClient && !isAuthorized) {
      router.replace('/');
    }
  }, [isClient, isAuthorized, router]);

  if (!isClient || !isAuthorized) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar role="GUARD" isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className={`flex-1 ${isCollapsed ? 'ml-20' : 'ml-64'} p-8 overflow-y-auto transition-all duration-300 ease-in-out`}>
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
