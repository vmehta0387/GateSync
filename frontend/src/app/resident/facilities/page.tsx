'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarClock, IndianRupee, Users, Wrench } from 'lucide-react';
import { getStoredSession } from '@/lib/auth';
import {
  type Facility,
  type FacilityBooking,
  type FacilityMaintenanceBlock,
  fetchFacilitiesJson,
  postFacilitiesJson,
  putFacilitiesJson,
} from '@/lib/facilities';
import { subscribeToFacilityLiveUpdates } from '@/lib/socket';

const INITIAL_BOOKING_FORM = {
  facility_id: '',
  booking_date: '',
  start_time: '',
  duration_hours: '1',
  guest_count: '1',
  notes: '',
};

export default function ResidentFacilitiesPage() {
  const session = getStoredSession();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [availability, setAvailability] = useState<{ bookings: FacilityBooking[]; maintenance_blocks: FacilityMaintenanceBlock[] } | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [bookingForm, setBookingForm] = useState(INITIAL_BOOKING_FORM);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadBase = useCallback(async () => {
    const [facilitiesData, bookingsData] = await Promise.all([
      fetchFacilitiesJson<{ success: boolean; facilities: Facility[] }>('/'),
      fetchFacilitiesJson<{ success: boolean; bookings: FacilityBooking[] }>('/bookings'),
    ]);

    if (facilitiesData.success) {
      const activeFacilities = (facilitiesData.facilities || []).filter((facility) => facility.is_active);
      setFacilities(activeFacilities);
      if (!selectedFacilityId && activeFacilities.length) {
        setSelectedFacilityId(activeFacilities[0].id);
        setBookingForm((current) => ({ ...current, facility_id: String(activeFacilities[0].id) }));
      }
    }
    if (bookingsData.success) setBookings(bookingsData.bookings || []);
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
    if (!session.user?.society_id || !session.user?.id) return;
    const unsubscribe = subscribeToFacilityLiveUpdates(
      [`society_${session.user.society_id}_facilities`, `resident_${session.user.id}`],
      () => {
        void loadBase();
        if (selectedFacilityId) {
          void loadAvailability(selectedFacilityId);
        }
      },
    );
    return unsubscribe;
  }, [loadAvailability, loadBase, selectedFacilityId, session.user?.id, session.user?.society_id]);

  const visibleBookings = useMemo(
    () => bookings.filter((booking) => statusFilter === 'ALL' || booking.status === statusFilter),
    [bookings, statusFilter],
  );

  const selectedFacility = facilities.find((facility) => facility.id === selectedFacilityId) || null;

  const createBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!bookingForm.booking_date || !bookingForm.start_time || !bookingForm.facility_id) {
      alert('Select facility, date, and start time');
      return;
    }

    const start = new Date(`${bookingForm.booking_date}T${bookingForm.start_time}`);
    const end = new Date(start.getTime() + Number(bookingForm.duration_hours || 1) * 3600000);

    const response = await postFacilitiesJson<{ success: boolean; message?: string }>('/bookings', {
      facility_id: Number(bookingForm.facility_id),
      guest_count: Number(bookingForm.guest_count),
      notes: bookingForm.notes,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });

    if (!response.success) {
      alert(response.message || 'Unable to book facility');
      return;
    }

    setBookingForm((current) => ({
      ...INITIAL_BOOKING_FORM,
      facility_id: current.facility_id,
    }));
    await loadBase();
    await loadAvailability(Number(bookingForm.facility_id));
  };

  const cancelBooking = async (bookingId: number) => {
    const response = await putFacilitiesJson<{ success: boolean; message?: string }>(`/bookings/${bookingId}`, {
      status: 'Cancelled',
    });

    if (!response.success) {
      alert(response.message || 'Unable to cancel booking');
      return;
    }

    await loadBase();
    if (selectedFacilityId) {
      await loadAvailability(selectedFacilityId);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Facilities & Bookings</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Reserve shared amenities, check availability, and manage your upcoming slots.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Available Facilities</h2>
            <div className="mt-4 grid gap-3">
              {facilities.map((facility) => (
                <button
                  key={facility.id}
                  type="button"
                  onClick={() => {
                    setSelectedFacilityId(facility.id);
                    setBookingForm((current) => ({
                      ...current,
                      facility_id: String(facility.id),
                      duration_hours: String(Math.min(Number(current.duration_hours || 1), Math.max(facility.max_booking_hours || 1, 1))),
                      guest_count: String(Math.min(Number(current.guest_count || 1), Math.max(facility.capacity || 1, 1))),
                    }));
                  }}
                  className={`rounded-2xl border p-4 text-left ${selectedFacilityId === facility.id ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10' : 'border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/40'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">{facility.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{facility.type}</p>
                    </div>
                    <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {facility.is_paid ? `₹${facility.pricing}/hr` : 'Free'}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{facility.description || 'Shared amenity available for residents.'}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Capacity {facility.capacity}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Advance {facility.advance_booking_days}d</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Max {facility.max_booking_hours}h</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={createBooking} className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Book Selected Facility</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <select
                value={bookingForm.facility_id}
                onChange={(event) => {
                  const nextFacilityId = Number(event.target.value);
                  const nextFacility = facilities.find((facility) => facility.id === nextFacilityId) || null;
                  setBookingForm({
                    ...bookingForm,
                    facility_id: event.target.value,
                    duration_hours: String(Math.min(Number(bookingForm.duration_hours || 1), Math.max(nextFacility?.max_booking_hours || 1, 1))),
                    guest_count: String(Math.min(Number(bookingForm.guest_count || 1), Math.max(nextFacility?.capacity || 1, 1))),
                  });
                  setSelectedFacilityId(nextFacilityId);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="">Select facility</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>{facility.name}</option>
                ))}
              </select>
              <input type="date" value={bookingForm.booking_date} onChange={(event) => setBookingForm({ ...bookingForm, booking_date: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
              <input type="time" value={bookingForm.start_time} onChange={(event) => setBookingForm({ ...bookingForm, start_time: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
              <select value={bookingForm.duration_hours} onChange={(event) => setBookingForm({ ...bookingForm, duration_hours: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                {Array.from({ length: Math.max(selectedFacility?.max_booking_hours || 1, 1) }, (_, index) => String(index + 1)).map((hours) => (
                  <option key={hours} value={hours}>{hours} hour{hours === '1' ? '' : 's'}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={bookingForm.guest_count}
                onChange={(event) =>
                  setBookingForm({
                    ...bookingForm,
                    guest_count: String(Math.min(Number(event.target.value || 1), Math.max(selectedFacility?.capacity || 1, 1))),
                  })
                }
                placeholder="People count"
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
              <textarea value={bookingForm.notes} onChange={(event) => setBookingForm({ ...bookingForm, notes: event.target.value })} placeholder="Optional note for admin..." className="h-24 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm md:col-span-2 dark:border-slate-800 dark:bg-slate-900" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {selectedFacility ? (
                  selectedFacility.is_paid ? `Estimated amount: ₹${Number(bookingForm.duration_hours || 1) * selectedFacility.pricing}` : 'No payment required for this facility'
                ) : 'Select a facility to see pricing and rules'}
              </div>
              <button type="submit" className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600">Reserve Slot</button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Availability & Rules</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedFacility ? `${selectedFacility.name} for the next 7 days` : 'Select a facility'}</p>
              </div>
              {selectedFacility ? (
                <div className="space-y-2 text-right text-sm text-slate-500 dark:text-slate-400">
                  <div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"><Users className="h-4 w-4" /> Capacity {selectedFacility.capacity}</div>
                  <div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"><CalendarClock className="h-4 w-4" /> Cancel before {selectedFacility.cancellation_hours}h</div>
                </div>
              ) : null}
            </div>

            {selectedFacility?.rules ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                {selectedFacility.rules}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Booked Slots</p>
                <div className="mt-3 space-y-3">
                  {(availability?.bookings || []).map((booking) => (
                    <div key={booking.id} className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
                      <p className="font-semibold text-slate-900 dark:text-white">{booking.user_name}</p>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">{formatDateRange(booking.start_time, booking.end_time)}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{booking.guest_count} people</p>
                    </div>
                  ))}
                  {!availability?.bookings?.length ? <EmptyCard text="No confirmed bookings in the next 7 days." /> : null}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Maintenance Blocks</p>
                <div className="mt-3 space-y-3">
                  {(availability?.maintenance_blocks || []).map((block) => (
                    <div key={block.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <p className="font-semibold">{formatDateRange(block.start_time, block.end_time)}</p>
                      <p className="mt-1 text-xs">{block.reason || 'Maintenance block'}</p>
                    </div>
                  ))}
                  {!availability?.maintenance_blocks?.length ? <EmptyCard text="No maintenance blocks in the next 7 days." /> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">My Bookings</h2>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                {['ALL', 'Confirmed', 'Cancelled', 'Completed'].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 space-y-3">
              {visibleBookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{booking.facility_name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatDateRange(booking.start_time, booking.end_time)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{booking.status}</span>
                      {booking.total_amount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <IndianRupee className="h-3.5 w-3.5" /> {booking.total_amount} / {booking.payment_status}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{booking.notes || `${booking.guest_count} people booked.`}</p>
                  {booking.status === 'Confirmed' && booking.is_cancellable ? (
                    <div className="mt-4">
                      <button onClick={() => void cancelBooking(booking.id)} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/20">
                        Cancel Booking
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!visibleBookings.length ? <EmptyCard text="No bookings yet for the selected filter." /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard icon={<CalendarClock className="h-4 w-4" />} title="Advance Booking" text={selectedFacility ? `Book up to ${selectedFacility.advance_booking_days} days ahead.` : 'Select a facility to see rules.'} />
        <InfoCard icon={<Wrench className="h-4 w-4" />} title="Maintenance Safety" text="Blocked slots are enforced automatically to prevent double booking during upkeep." />
        <InfoCard icon={<Users className="h-4 w-4" />} title="Fair Usage" text="Capacity is checked live across overlapping bookings, not just one request at a time." />
      </div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">{text}</p>;
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-center gap-3 text-slate-900 dark:text-white">
        <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800">{icon}</div>
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return 'TBD';
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleString()} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
