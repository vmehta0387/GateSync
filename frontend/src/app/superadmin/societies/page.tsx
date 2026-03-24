'use client';
import { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Building2, MapPin, Edit, ShieldX, PlayCircle, PauseCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SocietiesPage() {
  const router = useRouter();
  const [societies, setSocieties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  const fetchSocieties = async () => {
    try {
      const token = localStorage.getItem('gatepulse_token');
      const res = await fetch('http://localhost:5000/api/v1/superadmin/societies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSocieties(data.societies);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSocieties();
  }, []);

  const handleStatusChange = async (id: number, status: string) => {
    setOpenDropdownId(null);
    try {
        const token = localStorage.getItem('gatepulse_token');
        const res = await fetch(`http://localhost:5000/api/v1/superadmin/societies/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.success) {
            fetchSocieties();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to update status');
    }
  };

  return (
    <div className="space-y-6 relative h-full pb-32">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Managed Communities</h2>
          <p className="text-slate-500 text-sm mt-1">View and manage all societies onboarded to GateSync.</p>
        </div>
        <Link 
          href="/superadmin/societies/onboard"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 active:scale-95"
        >
          <Plus className="w-5 h-5" /> Onboard Society
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="overflow-visible min-h-[300px]">
          <table className="w-full text-left text-sm text-slate-600 relative">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Society Details</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Joined On</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 relative">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading societies...</td></tr>
              ) : societies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Building2 className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium">No communities onboarded yet.</p>
                    <p className="text-sm text-slate-400 mt-1">Click the button above to add your first society.</p>
                  </td>
                </tr>
              ) : (
                societies.map((soc: any) => (
                  <tr key={soc.id} className="hover:bg-slate-50 transition-colors relative">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-sm ${soc.status === 'INACTIVE' ? 'bg-slate-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                          {soc.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className={`font-semibold ${soc.status === 'INACTIVE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{soc.name}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3"/> {soc.address || 'No address'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${soc.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : soc.status === 'SUSPENDED' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {soc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700">{soc.subscription_plan}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium">
                      {new Date(soc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setOpenDropdownId(openDropdownId === soc.id ? null : soc.id)}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-lg hover:bg-slate-200 active:bg-slate-300"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {openDropdownId === soc.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)} />
                          <div className="absolute right-6 top-12 w-48 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 z-50 overflow-hidden py-1 text-left animate-in fade-in slide-in-from-top-2">
                            <Link href={`/superadmin/societies/edit/${soc.id}`} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium flex items-center transition-colors">
                              <Edit className="w-4 h-4 mr-2"/> Edit Details
                            </Link>
                            
                            {soc.status !== 'ACTIVE' && (
                              <button onClick={() => handleStatusChange(soc.id, 'ACTIVE')} className="w-full text-left px-4 py-2.5 text-sm text-emerald-600 hover:bg-emerald-50 font-medium flex items-center transition-colors">
                                <PlayCircle className="w-4 h-4 mr-2"/> Activate Society
                              </button>
                            )}
                            
                            {soc.status === 'ACTIVE' && (
                              <button onClick={() => handleStatusChange(soc.id, 'SUSPENDED')} className="w-full text-left px-4 py-2.5 text-sm text-amber-600 hover:bg-amber-50 font-medium flex items-center transition-colors">
                                <PauseCircle className="w-4 h-4 mr-2"/> Pause (Suspend)
                              </button>
                            )}
                            
                            <div className="h-px bg-slate-100 my-1"></div>
                            
                            {(soc.status === 'ACTIVE' || soc.status === 'SUSPENDED') && (
                              <button onClick={() => handleStatusChange(soc.id, 'INACTIVE')} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center transition-colors">
                                <ShieldX className="w-4 h-4 mr-2"/> Disable (Inactive)
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
