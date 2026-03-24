'use client';
import { useState, useEffect } from 'react';
import { Building2, Users, CreditCard, TrendingUp, Activity } from 'lucide-react';

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({ total_societies: 0, total_users: 0, total_revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch('http://localhost:5000/api/v1/superadmin/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { title: 'Total Communities', value: stats.total_societies, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'Active Users', value: stats.total_users, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { title: 'Platform MRR', value: `â‚¹${Number(stats.total_revenue).toLocaleString()}`, icon: CreditCard, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  ];

  if (loading) return <div className="h-64 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"/></div>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Platform Overview</h2>
        <p className="text-slate-500 mt-1">Monitor the health and growth of the GateSync ecosystem.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-slate-500 font-medium text-sm tracking-wide">{stat.title}</p>
                  <h3 className="text-4xl font-extrabold text-slate-800 mt-2">{stat.value}</h3>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-7 h-7" />
                </div>
              </div>
              {/* Decorative background element */}
              <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${stat.bg} opacity-50 blur-2xl group-hover:scale-150 transition-transform duration-500`}></div>
            </div>
          );
        })}
      </div>

      {/* Chart Placeholder Area */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-8">
         <div className="flex items-center justify-between mb-8">
           <h3 className="text-xl font-bold text-slate-800">Growth Analytics</h3>
           <button className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100">
             <Activity className="w-4 h-4" /> Real-time
           </button>
         </div>
         <div className="h-72 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-xl bg-slate-50">
           <div className="text-center">
             <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
             <p className="text-slate-400 font-medium">Growth chart visualization will render here</p>
           </div>
         </div>
      </div>
    </div>
  );
}
