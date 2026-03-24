'use client';
import { motion } from 'framer-motion';
import { Truck, Package, PackageCheck, PackageX, Search } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDeliveries = async () => {
      try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch('http://localhost:5000/api/v1/deliveries', {
           headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if(data.success) {
           setDeliveries(data.deliveries);
        }
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    };
    fetchDeliveries();
  }, []);

  const stats = [
    { label: 'Expected', value: deliveries.filter(d => d.status === 'Expected').length, icon: Package, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
    { label: 'Arrived', value: deliveries.filter(d => d.status === 'Arrived').length, icon: Truck, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
    { label: 'Delivered', value: deliveries.filter(d => d.status === 'Delivered').length, icon: PackageCheck, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
    { label: 'Failed', value: deliveries.filter(d => d.status === 'Failed').length, icon: PackageX, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Delivery Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Track Swiggy, Amazon, and courier packages across the society.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass-panel p-5 rounded-2xl flex items-center space-x-4 border border-slate-100 dark:border-slate-800"
          >
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{loading ? '...' : stat.value}</p>
              <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Recent Deliveries</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search flat or company..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
             <p className="text-slate-500 col-span-3 text-center py-8">Fetching live delivery data...</p>
          ) : deliveries.length === 0 ? (
             <p className="text-slate-500 col-span-3 text-center py-8">No deliveries recorded today.</p>
          ) : deliveries.map(d => (
             <div key={d.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 hover:border-brand-300 transition-colors">
               <div className="flex justify-between items-start">
                 <div>
                   <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                     {d.company_name} <span className={`w-2 h-2 rounded-full ${d.status === 'Delivered' ? 'bg-green-500' : 'bg-blue-500'}`}/>
                   </h3>
                   <p className="text-sm text-slate-500 mt-1">Person: {d.delivery_person}</p>
                 </div>
                 <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700">
                   Flat {d.block_name}-{d.flat_number}
                 </span>
               </div>
               <div className="mt-4 flex gap-2">
                 <button className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 bg-slate-50 pointer-events-none">
                   Status: {d.status}
                 </button>
               </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}
