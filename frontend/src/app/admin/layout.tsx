'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { getStoredSession, useClientReady } from '@/lib/auth';

const managerBlockedPrefixes = ['/admin/settings', '/admin/billing', '/admin/committees'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isClient = useClientReady();
  const session = isClient ? getStoredSession() : { token: null, user: null };
  const currentRole = session.user?.role;
  const isAuthorized = !!session.token && (currentRole === 'ADMIN' || currentRole === 'MANAGER');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [societyName, setSocietyName] = useState(session.user?.society_name || '');
  useEffect(() => {
    if (isClient && !isAuthorized) {
      router.replace('/');
    }
  }, [isClient, isAuthorized, router]);

  useEffect(() => {
    if (isClient && currentRole === 'MANAGER' && managerBlockedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      router.replace('/admin');
    }
  }, [currentRole, isClient, pathname, router]);

  useEffect(() => {
    if (!isClient || !session.token || !session.user?.society_id || session.user?.society_name) {
      return;
    }

    const syncProfile = async () => {
      try {
        const response = await fetch('https://api.gatesync.in/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${session.token}` },
          cache: 'no-store',
        });
        const data = await response.json();
        if (response.ok && data.success && data.user) {
          setSocietyName(data.user.society_name || '');
          localStorage.setItem('gatepulse_user', JSON.stringify(data.user));
        }
      } catch (error) {
        console.error('Could not fetch admin profile', error);
      }
    };

    void syncProfile();
  }, [isClient, session.token, session.user?.society_id, session.user?.society_name]);

  if (!isClient || !isAuthorized) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar role={currentRole || 'ADMIN'} societyName={societyName || session.user?.society_name || ''} isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className={`flex-1 ${isCollapsed ? 'ml-20' : 'ml-64'} p-5 md:p-6 overflow-y-auto transition-all duration-300 ease-in-out`}>
        <div className="w-full max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
