'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Building2, CalendarDays, IndianRupee, PenSquare, ShieldAlert, Wrench } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import {
  type Facility,
  type FacilityBooking,
  type FacilityMaintenanceBlock,
  type FacilitySummary,
  fetchFacilitiesJson,
  postFacilitiesJson,
  putFacilitiesJson,
  deleteFacilitiesJson,
} from '@/lib/facilities';
import { subscribeToFacilityLiveUpdates } from '@/lib/socket';

const INITIAL_FORM = {
  id: 0,
  name: '',
  type: 'Clubhouse',
  description: '',
  capacity: '10',
  rules: '',
  max_booking_hours: '2',
  advance_booking_days: '7',
  cancellation_hours: '6',
  pricing: '0',
  is_paid: false,
  is_active: true,
};

const INITIAL_MAINTENANCE_FORM = {
  facility_id: '',
  start_time: '',
  end_time: '',
  reason: '',
};

export default function AdminFacilitiesPage() {
  const session = getStoredSession();
  const [summary, setSummary] = useState<FacilitySummary | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [maintenanceBlocks, setMaintenanceBlocks] = useState<FacilityMaintenanceBlock[]>([]);
  const [availability, setAvailability] = useState<{ bookings: FacilityBooking[]; maintenance_blocks: FacilityMaintenanceBlock[] } | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [facilityForm, setFacilityForm] = useState(INITIAL_FORM);
  const [maintenanceForm, setMaintenanceForm] = useState(INITIAL_MAINTENANCE_FORM);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'operations' | 'management'>('dashboard');

  const loadBase = useCallback(async () => {
    const [summaryData, facilitiesData, bookingsData, maintenanceData] = await Promise.all([
      fetchFacilitiesJson<{ success: boolean; summary: FacilitySummary }>('/summary'),
      fetchFacilitiesJson<{ success: boolean; facilities: Facility[] }>('/'),
      fetchFacilitiesJson<{ success: boolean; bookings: FacilityBooking[] }>('/bookings'),
      fetchFacilitiesJson<{ success: boolean; maintenance_blocks: FacilityMaintenanceBlock[] }>('/maintenance'),
    ]);

    if (summaryData.success) setSummary(summaryData.summary);
    if (facilitiesData.success) {
      setFacilities(facilitiesData.facilities || []);
      if (!selectedFacilityId && facilitiesData.facilities?.length) {
        setSelectedFacilityId(facilitiesData.facilities[0].id);
      }
    }
    if (bookingsData.success) setBookings(bookingsData.bookings || []);
    if (maintenanceData.success) setMaintenanceBlocks(maintenanceData.maintenance_blocks || []);
  }, [selectedFacilityId]);

  const loadAvailability = useCallback(async (facilityId: number) => {
    const today = new Date();
    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 3600000);
    const data = await fetchFacilitiesJson<{
      success: boolean;
      bookings: FacilityBooking[];
      maintenance_blocks: FacilityMaintenanceBlock[];
    }>(
      `/availability?facility_id=${facilityId}&date_from=${encodeURIComponent(today.toISOString())}&date_to=${encodeURIComponent(sevenDaysLater.toISOString())}`,
    );

    if (data.success) {
      setAvailability({
        bookings: data.bookings || [],
        maintenance_blocks: data.maintenance_blocks || [],
      });
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadBase();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadBase]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    const handle = window.setTimeout(() => {
      void loadAvailability(selectedFacilityId);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadAvailability, selectedFacilityId]);

  useEffect(() => {
    if (!session.user?.society_id) return;
    const unsubscribe = subscribeToFacilityLiveUpdates(
      [`society_${session.user.society_id}_facilities`],
      () => {
        void loadBase();
        if (selectedFacilityId) {
          void loadAvailability(selectedFacilityId);
        }
      },
    );
    return unsubscribe;
  }, [loadAvailability, loadBase, selectedFacilityId, session.user?.society_id]);

  const visibleBookings = useMemo(
    () => bookings.filter((booking) => bookingStatusFilter === 'ALL' || booking.status === bookingStatusFilter),
    [bookingStatusFilter, bookings],
  );

  const resetForm = () => {
    setFacilityForm(INITIAL_FORM);
  };

  const submitFacility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      ...facilityForm,
      capacity: Number(facilityForm.capacity),
      max_booking_hours: Number(facilityForm.max_booking_hours),
      advance_booking_days: Number(facilityForm.advance_booking_days),
      cancellation_hours: Number(facilityForm.cancellation_hours),
      pricing: Number(facilityForm.pricing),
    };

    const response = facilityForm.id
      ? await putFacilitiesJson<{ success: boolean; message?: string }>(`/${facilityForm.id}`, payload)
      : await postFacilitiesJson<{ success: boolean; message?: string }>('/', payload);

    if (!response.success) {
      alert(response.message || 'Unable to save facility');
      return;
    }

    resetForm();
    await loadBase();
  };

  const submitMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await postFacilitiesJson<{ success: boolean; message?: string }>('/maintenance', maintenanceForm);
    if (!response.success) {
      alert(response.message || 'Unable to block facility');
      return;
    }

    setMaintenanceForm(INITIAL_MAINTENANCE_FORM);
    await loadBase();
    if (selectedFacilityId) {
      await loadAvailability(selectedFacilityId);
    }
  };

  const updateBookingStatus = async (bookingId: number, status: FacilityBooking['status'], paymentStatus?: FacilityBooking['payment_status']) => {
    const response = await putFacilitiesJson<{ success: boolean; message?: string }>(`/bookings/${bookingId}`, {
      status,
      payment_status: paymentStatus,
    });

    if (!response.success) {
      alert(response.message || 'Unable to update booking');
      return;
    }

    await loadBase();
  };

  const removeMaintenanceBlock = async (blockId: number) => {
    const response = await deleteFacilitiesJson<{ success: boolean; message?: string }>(`/maintenance/${blockId}`);
    if (!response.success) {
      alert(response.message || 'Unable to remove maintenance block');
      return;
    }

    await loadBase();
    if (selectedFacilityId) {
      await loadAvailability(selectedFacilityId);
    }
  };

  const selectedFacility = facilities.find((facility) => facility.id === selectedFacilityId) || null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between border-b border-slate-100 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Facilities Management</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">Manage amenities, control slot rules, block maintenance windows, and monitor usage in one place.</p>
        </div>
      </div>

      <div className="flex w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900/50 max-w-md">
        {(['dashboard', 'operations', 'management'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800 dark:text-white dark:ring-white/10' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="Facilities" value={summary?.total_facilities ?? 0} icon={<Building2 className="h-5 w-5" />} />
            <SummaryCard label="Upcoming" value={summary?.upcoming_bookings ?? 0} icon={<CalendarDays className="h-5 w-5" />} />
            <SummaryCard label="Maintenance" value={summary?.scheduled_maintenance ?? 0} icon={<Wrench className="h-5 w-5" />} />
            <SummaryCard label="Revenue" value={`₹${Math.round(summary?.revenue_generated ?? 0)}`} icon={<IndianRupee className="h-5 w-5" />} />
          </div>

          <div className="grid gap-8 xl:grid-cols-2">
            {/* Live Availability */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4 border-b border-slate-50 pb-6 mb-6 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Availability Snapshot</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                    {selectedFacility ? `${selectedFacility.name} for the next 7 days` : 'Select a facility below to inspect live usage'}
                  </p>
                </div>
                {selectedFacility ? (
                  <div className="rounded-2xl bg-slate-100 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {selectedFacility.is_paid ? `Paid / ₹${selectedFacility.pricing} hr` : 'Free booking'}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4">Upcoming Bookings</p>
                  <div className="space-y-3">
                    {(availability?.bookings || []).slice(0, 5).map((booking) => (
                      <div key={booking.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 transition-colors">
                        <p className="font-bold text-slate-900 dark:text-white">{booking.user_name}</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{formatDateRange(booking.start_time, booking.end_time)}</p>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400">{booking.guest_count} people / {booking.status}</p>
                      </div>
                    ))}
                    {!availability?.bookings?.length ? <EmptyText text="No upcoming bookings in the next 7 days." /> : null}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-400 mb-4">Maintenance Blocks</p>
                  <div className="space-y-3">
                    {(availability?.maintenance_blocks || []).slice(0, 5).map((block) => (
                      <div key={block.id} className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-sm text-rose-900 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-100 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors">
                        <p className="font-bold">{formatDateRange(block.start_time, block.end_time)}</p>
                        <p className="mt-2 text-xs font-medium opacity-80">{block.reason || 'Maintenance block'}</p>
                      </div>
                    ))}
                    {!availability?.maintenance_blocks?.length ? <EmptyText text="No maintenance scheduled in the next 7 days." /> : null}
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-50 pt-6 dark:border-slate-800">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-4">Select Facility</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {facilities.map((facility) => (
                    <button
                      key={facility.id}
                      type="button"
                      onClick={() => setSelectedFacilityId(facility.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${selectedFacilityId === facility.id ? 'border-brand-500 bg-brand-50/50 shadow-sm dark:border-brand-500/50 dark:bg-brand-500/10' : 'border-slate-200 bg-white hover:border-brand-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'}`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">{facility.name}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{facility.type}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Usage Insights */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              <div className="border-b border-slate-50 pb-6 mb-6 dark:border-slate-800">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Usage Insights</h2>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Discover peak operational hours and historically popular amenities.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 flex-1">
                <div>
                   <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-4">Most Used Hubs</p>
                   <div className="space-y-3">
                    {(summary?.top_facilities || []).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/50">
                        <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                        <p className="mt-1 text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">{item.total_bookings} bookings / ₹{Math.round(item.revenue)}</p>
                      </div>
                    ))}
                    {!summary?.top_facilities?.length ? <EmptyText text="Usage insights will appear after bookings start coming in." /> : null}
                  </div>
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-4">Peak Activity Windows</p>
                   <div className="space-y-3">
                    {(summary?.peak_hours || []).map((item) => (
                      <div key={item.hour_label} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/50">
                        <p className="font-bold text-slate-900 dark:text-white">{item.hour_label}</p>
                        <p className="mt-1 text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">{item.total} sessions active</p>
                      </div>
                    ))}
                    {!summary?.peak_hours?.length ? <EmptyText text="Peak-hour trends will appear once bookings are recorded." /> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'operations' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-slate-50 pb-6 mb-6 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Booking Operations</h2>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Track upcoming reservations, mark completed slots, and override payment state when needed.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Filter Status:</span>
                <select value={bookingStatusFilter} onChange={(event) => setBookingStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {['ALL', 'Confirmed', 'Cancelled', 'Rejected', 'Completed'].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto pb-2">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
                    <th className="py-4 pr-4">Resident</th>
                    <th className="py-4 pr-4">Facility</th>
                    <th className="py-4 pr-4">Slot</th>
                    <th className="py-4 pr-4">People</th>
                    <th className="py-4 pr-4">Payment</th>
                    <th className="py-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBookings.slice(0, 18).map((booking) => (
                    <tr key={booking.id} className="border-b border-slate-50 align-top transition-colors hover:bg-slate-50/50 dark:border-slate-800/50 dark:hover:bg-slate-900/50">
                      <td className="py-5 pr-4">
                        <p className="font-bold text-slate-900 dark:text-white">{booking.user_name}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{booking.flat_summary || booking.user_phone}</p>
                      </td>
                      <td className="py-5 pr-4">
                        <p className="font-bold text-brand-600 dark:text-brand-400">{booking.facility_name}</p>
                        <span className={`mt-2 inline-block rounded-xl px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${booking.status === 'Confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : booking.status === 'Cancelled' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{booking.status}</span>
                      </td>
                      <td className="py-5 pr-4 text-xs font-medium text-slate-600 dark:text-slate-300">{formatDateRange(booking.start_time, booking.end_time)}</td>
                      <td className="py-5 pr-4 font-bold text-slate-900 dark:text-white">{booking.guest_count}</td>
                      <td className="py-5 pr-4">
                        <p className="font-bold text-slate-900 dark:text-white">₹{booking.total_amount}</p>
                        <span className={`mt-2 inline-block rounded-xl px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${booking.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>{booking.payment_status}</span>
                      </td>
                      <td className="py-5">
                        <div className="flex flex-wrap gap-2">
                          {booking.status === 'Confirmed' ? (
                            <>
                              <button onClick={() => void updateBookingStatus(booking.id, 'Completed', booking.payment_status === 'Pending' ? 'Paid' : booking.payment_status)} className="rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-600 shadow-sm transition-all active:scale-95">
                                Complete
                              </button>
                              <button onClick={() => void updateBookingStatus(booking.id, 'Cancelled', booking.payment_status)} className="rounded-xl bg-rose-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 transition-all active:scale-95">
                                Cancel
                              </button>
                            </>
                          ) : null}
                          {booking.payment_status === 'Pending' && booking.status !== 'Cancelled' ? (
                            <button onClick={() => void updateBookingStatus(booking.id, booking.status, 'Paid')} className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95">
                              Mark Paid
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleBookings.length ? <div className="py-8"><EmptyText text="No bookings match the selected criteria." /></div> : null}
            </div>
          </div>
        </div>
      )}
      {activeTab === 'management' && (
        <div className="grid gap-8 xl:grid-cols-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <form onSubmit={submitFacility} className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-50 pb-6 mb-6 dark:border-slate-800">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{facilityForm.id ? 'Edit Facility Rules' : 'Create New Facility'}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Define booking regulations, pricing logic, and max capacities.</p>
              </div>
              {facilityForm.id ? (
                <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
                  Cancel Edit
                </button>
              ) : null}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Name / Title</span>
                <input value={facilityForm.name} onChange={(event) => setFacilityForm({ ...facilityForm, name: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Category Type</span>
                <select value={facilityForm.type} onChange={(event) => setFacilityForm({ ...facilityForm, type: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  {['Gym', 'Clubhouse', 'Swimming Pool', 'Tennis Court', 'Party Hall', 'Guest Room', 'Other'].map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Public Description</span>
                <textarea value={facilityForm.description} onChange={(event) => setFacilityForm({ ...facilityForm, description: event.target.value })} className="h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-medium shadow-inner outline-none resize-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Max Capacity (Persons)</span>
                <input type="number" min="1" value={facilityForm.capacity} onChange={(event) => setFacilityForm({ ...facilityForm, capacity: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Max Duration (Hours)</span>
                <input type="number" min="1" value={facilityForm.max_booking_hours} onChange={(event) => setFacilityForm({ ...facilityForm, max_booking_hours: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Advance Booking Limit (Days)</span>
                <input type="number" min="1" value={facilityForm.advance_booking_days} onChange={(event) => setFacilityForm({ ...facilityForm, advance_booking_days: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Cancellation Cutoff (Hours)</span>
                <input type="number" min="0" value={facilityForm.cancellation_hours} onChange={(event) => setFacilityForm({ ...facilityForm, cancellation_hours: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Strict Usage Rules</span>
                <textarea value={facilityForm.rules} onChange={(event) => setFacilityForm({ ...facilityForm, rules: event.target.value })} placeholder="Example: No loud music after 10PM. Proper attire required." className="h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-medium shadow-inner outline-none resize-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Hourly Pricing (₹)</span>
                <input type="number" min="0" value={facilityForm.pricing} onChange={(event) => setFacilityForm({ ...facilityForm, pricing: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold shadow-inner outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white" required />
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4 mt-4">
                <label className="flex-1 flex cursor-pointer items-center min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900">
                  <div className="relative shrink-0">
                    <input type="checkbox" className="peer sr-only" checked={facilityForm.is_paid} onChange={(event) => setFacilityForm({ ...facilityForm, is_paid: event.target.checked })} />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-brand-500 dark:bg-slate-800 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300 truncate">Paid Service</span>
                </label>
                <label className="flex-1 flex cursor-pointer items-center min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900">
                  <div className="relative shrink-0">
                    <input type="checkbox" className="peer sr-only" checked={facilityForm.is_active} onChange={(event) => setFacilityForm({ ...facilityForm, is_active: event.target.checked })} />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-brand-500 dark:bg-slate-800 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300 truncate">Active</span>
                </label>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button type="submit" className="rounded-2xl bg-brand-600 px-8 py-3.5 text-sm font-black text-white shadow-lg transition-all hover:scale-105 active:scale-95 hover:bg-brand-500">
                {facilityForm.id ? 'Save Configuration' : 'Deploy Facility'}
              </button>
            </div>
            
            <div className="mt-8 border-t border-slate-50 pt-8 dark:border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-4">Select To Edit</p>
              <div className="flex flex-wrap gap-2">
                {facilities.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFacilityForm({ ...f, capacity: String(f.capacity), max_booking_hours: String(f.max_booking_hours), advance_booking_days: String(f.advance_booking_days), cancellation_hours: String(f.cancellation_hours), pricing: String(f.pricing) })} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-brand-400 transition-colors shadow-sm">
                    <PenSquare className="h-3 w-3 inline mr-1.5 opacity-50" /> {f.name}
                  </button>
                ))}
              </div>
            </div>
          </form>

          <div className="space-y-8">
            <form onSubmit={submitMaintenance} className="rounded-3xl border border-amber-100 bg-amber-50/30 p-6 lg:p-8 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Wrench className="h-48 w-48 text-amber-500" />
              </div>
              <div className="relative z-10 flex flex-col gap-6">
                <div className="border-b border-amber-50 pb-6 dark:border-amber-800/50">
                  <h2 className="text-xl font-extrabold text-amber-900 dark:text-amber-100 flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-amber-500" /> Block Maintenance</h2>
                  <p className="mt-1 text-sm font-medium text-amber-800/80 dark:text-amber-200/80">Schedule downtime for repairs. Future bookings will be prevented.</p>
                </div>

                <div className="grid gap-6">
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 ml-1">Target Facility</span>
                    <select value={maintenanceForm.facility_id} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, facility_id: event.target.value })} className="w-full rounded-2xl border border-amber-200 bg-white px-5 py-3.5 text-sm font-bold shadow-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100" required>
                      <option value="">Select a facility</option>
                      {facilities.map((facility) => (
                        <option key={facility.id} value={facility.id}>{facility.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 ml-1">Start Offline Window</span>
                    <input type="datetime-local" value={maintenanceForm.start_time} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, start_time: event.target.value })} className="w-full rounded-2xl border border-amber-200 bg-white px-5 py-3.5 text-sm font-bold shadow-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100" required />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 ml-1">Restore Online Window</span>
                    <input type="datetime-local" value={maintenanceForm.end_time} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, end_time: event.target.value })} className="w-full rounded-2xl border border-amber-200 bg-white px-5 py-3.5 text-sm font-bold shadow-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100" required />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 ml-1">Reason / Note</span>
                    <textarea value={maintenanceForm.reason} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, reason: event.target.value })} placeholder="E.g., Deep cleaning of the pool filter system." className="h-24 w-full rounded-2xl border border-amber-200 bg-white px-5 py-3.5 text-sm font-medium shadow-sm outline-none resize-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100" required />
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="rounded-2xl bg-amber-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all">
                    Enforce Block
                  </button>
                </div>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-6 border-b border-slate-50 pb-6 dark:border-slate-800">Scheduled Work</h2>
              <div className="space-y-4">
                {maintenanceBlocks.slice(0, 8).map((block) => (
                  <div key={block.id} className="group relative rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400"></div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{block.facility_name}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">{formatDateRange(block.start_time, block.end_time)}</p>
                        <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">{block.reason || 'Maintenance Work'}</p>
                      </div>
                      <button onClick={() => void removeMaintenanceBlock(block.id)} className="shrink-0 rounded-xl bg-slate-200/50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 transition-colors shadow-sm">
                        Lift Block
                      </button>
                    </div>
                  </div>
                ))}
                {!maintenanceBlocks.length ? <EmptyText text="No upcoming maintenance blocks." /> : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">{text}</p>;
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return 'TBD';
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleString()} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
