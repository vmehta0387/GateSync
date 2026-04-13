import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { subscribeToResidentFacilityUpdates } from '../lib/socket';
import { useSession } from '../providers/SessionProvider';
import {
  cancelFacilityBooking,
  createFacilityBooking,
  fetchFacilities,
  fetchFacilityAvailability,
  fetchFacilityBookings,
} from '../services/resident';
import { colors } from '../theme';
import { Facility, FacilityBooking, FacilityMaintenanceBlock } from '../types/resident';
import { formatDateTime } from '../utils/format';

const initialBookingForm = {
  booking_date: '',
  start_time: '',
  duration_hours: '',
  guest_count: '',
  notes: '',
};

export function ResidentFacilitiesScreen() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [availability, setAvailability] = useState<{ bookings: FacilityBooking[]; maintenance_blocks: FacilityMaintenanceBlock[] }>({
    bookings: [],
    maintenance_blocks: [],
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [bookingForm, setBookingForm] = useState(initialBookingForm);
  const [bookingFilter, setBookingFilter] = useState<'Upcoming' | 'Past'>('Upcoming');
  const [showFacilityPicker, setShowFacilityPicker] = useState(false);
  const [iosBookingPickerMode, setIosBookingPickerMode] = useState<'date' | 'time' | null>(null);

  const loadBase = useCallback(async () => {
    setRefreshing(true);
    const [facilitiesRes, bookingsRes] = await Promise.all([fetchFacilities(), fetchFacilityBookings()]);

    if (facilitiesRes.success) {
      const activeFacilities = (facilitiesRes.facilities || []).filter((facility) => facility.is_active);
      setFacilities(activeFacilities);
      if (!selectedFacilityId && activeFacilities[0]) {
        setSelectedFacilityId(activeFacilities[0].id);
      }
    }
    if (bookingsRes.success) setBookings(bookingsRes.bookings || []);
    setRefreshing(false);
  }, [selectedFacilityId]);

  const loadAvailability = useCallback(async (facilityId: number) => {
    const today = new Date();
    const weekAhead = new Date(today.getTime() + 7 * 24 * 3600000);
    const response = await fetchFacilityAvailability(facilityId, today.toISOString(), weekAhead.toISOString());
    if (response.success) {
      setAvailability({
        bookings: response.bookings || [],
        maintenance_blocks: response.maintenance_blocks || [],
      });
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    void loadAvailability(selectedFacilityId);
  }, [loadAvailability, selectedFacilityId]);

  useEffect(() => {
    if (!session?.user?.id || !session?.user?.society_id) {
      return undefined;
    }

    return subscribeToResidentFacilityUpdates([`society_${session.user.society_id}_facilities`, `resident_${session.user.id}`], () => {
      void loadBase();
      if (selectedFacilityId) {
        void loadAvailability(selectedFacilityId);
      }
    });
  }, [loadAvailability, loadBase, selectedFacilityId, session?.user?.id, session?.user?.society_id]);

  const selectedFacility = useMemo(() => facilities.find((facility) => facility.id === selectedFacilityId) || null, [facilities, selectedFacilityId]);
  const nowTs = Date.now();
  const upcomingBookings = useMemo(
    () => bookings.filter((booking) => {
      const endTs = booking.end_time ? new Date(booking.end_time).getTime() : 0;
      return endTs >= nowTs && booking.status !== 'Cancelled' && booking.status !== 'Rejected';
    }),
    [bookings, nowTs],
  );
  const pastBookings = useMemo(
    () => bookings.filter((booking) => {
      const endTs = booking.end_time ? new Date(booking.end_time).getTime() : 0;
      return endTs < nowTs || booking.status === 'Completed' || booking.status === 'Cancelled' || booking.status === 'Rejected';
    }),
    [bookings, nowTs],
  );
  const visibleBookings = useMemo(
    () => (bookingFilter === 'Upcoming' ? upcomingBookings : pastBookings),
    [bookingFilter, pastBookings, upcomingBookings],
  );
  const selectedBookingDateTime = useMemo(() => {
    if (bookingForm.booking_date && bookingForm.start_time) {
      return new Date(`${bookingForm.booking_date}T${bookingForm.start_time}`);
    }

    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
    return fallback;
  }, [bookingForm.booking_date, bookingForm.start_time]);

  const bookingSelectionLabel = useMemo(() => {
    if (!bookingForm.booking_date || !bookingForm.start_time) {
      return 'Pick a date and start time for the booking.';
    }

    return `${bookingForm.booking_date} at ${bookingForm.start_time}`;
  }, [bookingForm.booking_date, bookingForm.start_time]);

  const selectedBookingDateLabel = useMemo(() => {
    if (!bookingForm.booking_date) {
      return 'No date selected';
    }

    return bookingForm.booking_date;
  }, [bookingForm.booking_date]);

  const selectedBookingTimeLabel = useMemo(() => {
    if (!bookingForm.start_time) {
      return 'No time selected';
    }

    return bookingForm.start_time;
  }, [bookingForm.start_time]);

  const handleBookingDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (!date) return;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    setBookingForm((current) => ({ ...current, booking_date: `${year}-${month}-${day}` }));
  };

  const handleBookingTimeChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (!date) return;

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    setBookingForm((current) => ({ ...current, start_time: `${hours}:${minutes}` }));
  };

  const openBookingDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: selectedBookingDateTime,
        minimumDate: new Date(),
        onChange: (event, value) => {
          if (event.type !== 'set' || !value) return;
          handleBookingDateChange(event, value);
        },
      });
      return;
    }

    setIosBookingPickerMode('date');
  };

  const openBookingTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        value: selectedBookingDateTime,
        is24Hour: false,
        onChange: (event, value) => {
          if (event.type !== 'set' || !value) return;
          handleBookingTimeChange(event, value);
        },
      });
      return;
    }

    setIosBookingPickerMode('time');
  };

  const submitBooking = async () => {
    if (!selectedFacility || !bookingForm.booking_date || !bookingForm.start_time) {
      Alert.alert('Booking details missing', 'Select a facility, date, and start time first.');
      return;
    }

    const startTime = new Date(`${bookingForm.booking_date}T${bookingForm.start_time}`);
    const durationHours = Math.max(1, Number(bookingForm.duration_hours || 1));
    const guestCount = Math.max(1, Number(bookingForm.guest_count || 1));
    const endTime = new Date(startTime.getTime() + durationHours * 3600000);
    const response = await createFacilityBooking({
      facility_id: selectedFacility.id,
      guest_count: guestCount,
      notes: bookingForm.notes,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });

    if (!response.success) {
      Alert.alert('Unable to reserve slot', response.message || 'Please try a different time window.');
      return;
    }

    setBookingForm(initialBookingForm);
    await loadBase();
    await loadAvailability(selectedFacility.id);
  };

  const cancelBooking = async (bookingId: number) => {
    const response = await cancelFacilityBooking(bookingId);
    if (!response.success) {
      Alert.alert('Unable to cancel booking', response.message || 'Please try again.');
      return;
    }

    await loadBase();
    if (selectedFacilityId) {
      await loadAvailability(selectedFacilityId);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBase()} />}>
        <View style={styles.hero}>
          <Text style={styles.title}>Facilities</Text>
          <Text style={styles.subtitle}>Check availability, reserve amenities, and manage upcoming bookings.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Available amenities</Text>
          <Pressable style={styles.facilitySelectField} onPress={() => setShowFacilityPicker(true)}>
            <Text style={styles.pickerFieldLabel}>Amenity</Text>
            <Text style={styles.pickerFieldValue}>{selectedFacility ? `${selectedFacility.name} (${selectedFacility.type})` : 'Select amenity'}</Text>
          </Pressable>
          {selectedFacility ? (
            <Text style={styles.helperText}>
              {selectedFacility.is_paid ? `Rs ${selectedFacility.pricing}/hr` : 'Free'} / Capacity {selectedFacility.capacity}
            </Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Book selected facility</Text>
          {selectedFacility ? (
            <>
              <Text style={styles.helperText}>{selectedFacility.name} / Max {selectedFacility.max_booking_hours}h / Advance {selectedFacility.advance_booking_days} day(s)</Text>
              <View style={styles.pickerPanel}>
                <Text style={styles.helperText}>{bookingSelectionLabel}</Text>
                <View style={styles.formRow}>
                  <Pressable style={[styles.pickerField, styles.rowInput]} onPress={openBookingDatePicker}>
                    <Text style={styles.pickerFieldLabel}>Date</Text>
                    <Text style={styles.pickerFieldValue}>{selectedBookingDateLabel}</Text>
                  </Pressable>
                  <Pressable style={[styles.pickerField, styles.rowInput]} onPress={openBookingTimePicker}>
                    <Text style={styles.pickerFieldLabel}>Time</Text>
                    <Text style={styles.pickerFieldValue}>{selectedBookingTimeLabel}</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.rowInput}>
                  <Text style={styles.pickerFieldLabel}>Duration (hours)</Text>
                  <TextInput value={bookingForm.duration_hours} onChangeText={(value) => setBookingForm((current) => ({ ...current, duration_hours: value.replace(/\D/g, '') }))} placeholder="Hours" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={styles.input} />
                </View>
                <View style={styles.rowInput}>
                  <Text style={styles.pickerFieldLabel}>Guests</Text>
                  <TextInput value={bookingForm.guest_count} onChangeText={(value) => setBookingForm((current) => ({ ...current, guest_count: value.replace(/\D/g, '') }))} placeholder="Guests" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={styles.input} />
                </View>
              </View>
              <TextInput value={bookingForm.notes} onChangeText={(value) => setBookingForm((current) => ({ ...current, notes: value }))} placeholder="Optional note" placeholderTextColor={colors.textMuted} multiline style={styles.textArea} />
              <Pressable onPress={() => void submitBooking()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Reserve Slot</Text>
              </Pressable>
            </>
          ) : (
            <EmptyState title="No facility selected" detail="Pick an amenity above to see rules and reserve a slot." />
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Availability this week</Text>
          {availability.bookings.length ? availability.bookings.map((booking) => (
            <View key={booking.id} style={styles.listCard}>
              <Text style={styles.cardTitle}>{booking.user_name}</Text>
              <Text style={styles.cardMeta}>{formatDateTime(booking.start_time)} to {formatDateTime(booking.end_time)}</Text>
            </View>
          )) : (
            <EmptyState title="No confirmed bookings" detail="This facility is currently open for the next 7 days." />
          )}
          {availability.maintenance_blocks.length ? (
            <>
              <Text style={styles.subheading}>Maintenance blocks</Text>
              {availability.maintenance_blocks.map((block) => (
                <View key={block.id} style={styles.maintenanceCard}>
                  <Text style={styles.cardTitle}>{formatDateTime(block.start_time)} to {formatDateTime(block.end_time)}</Text>
                  <Text style={styles.cardMeta}>{block.reason || 'Maintenance scheduled'}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>My bookings</Text>
          <View style={styles.bookingFilterRow}>
            {(['Upcoming', 'Past'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setBookingFilter(option)}
                style={[styles.bookingFilterChip, bookingFilter === option ? styles.bookingFilterChipActive : null]}
              >
                <Text style={[styles.bookingFilterChipText, bookingFilter === option ? styles.bookingFilterChipTextActive : null]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
          {visibleBookings.length ? visibleBookings.map((booking) => (
            <View key={booking.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{booking.facility_name}</Text>
                  <Text style={styles.cardMeta}>{formatDateTime(booking.start_time)} to {formatDateTime(booking.end_time)}</Text>
                  <Text style={styles.microMeta}>{booking.notes || `${booking.guest_count} people`}</Text>
                </View>
                <Badge label={compactBookingStatus(booking.status)} tone={booking.status === 'Confirmed' ? 'info' : booking.status === 'Completed' ? 'success' : 'warning'} />
              </View>
              {bookingFilter === 'Upcoming' && booking.status === 'Confirmed' && booking.is_cancellable ? (
                <Pressable onPress={() => void cancelBooking(booking.id)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel Booking</Text>
                </Pressable>
              ) : null}
            </View>
          )) : (
            <EmptyState title={`No ${bookingFilter.toLowerCase()} bookings`} detail={bookingFilter === 'Upcoming' ? 'Your upcoming amenity reservations will appear here.' : 'Completed and older bookings will appear here.'} />
          )}
        </View>
      </ScrollView>
      {Platform.OS === 'ios' && iosBookingPickerMode ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setIosBookingPickerMode(null)}
        >
          <View style={styles.iosPickerModalScrim}>
            <View style={styles.iosPickerSheet}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>{iosBookingPickerMode === 'date' ? 'Select date' : 'Select time'}</Text>
                <Pressable
                  onPress={() => {
                    const pickerDate = selectedBookingDateTime;
                    if (iosBookingPickerMode === 'date' && !bookingForm.booking_date) {
                      const year = pickerDate.getFullYear();
                      const month = String(pickerDate.getMonth() + 1).padStart(2, '0');
                      const day = String(pickerDate.getDate()).padStart(2, '0');
                      setBookingForm((current) => ({ ...current, booking_date: `${year}-${month}-${day}` }));
                    }
                    if (iosBookingPickerMode === 'time' && !bookingForm.start_time) {
                      const hours = String(pickerDate.getHours()).padStart(2, '0');
                      const minutes = String(pickerDate.getMinutes()).padStart(2, '0');
                      setBookingForm((current) => ({ ...current, start_time: `${hours}:${minutes}` }));
                    }
                    setIosBookingPickerMode(null);
                  }}
                  style={styles.dismissButton}
                >
                  <Text style={styles.dismissButtonText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                mode={iosBookingPickerMode}
                display="spinner"
                value={selectedBookingDateTime}
                onChange={iosBookingPickerMode === 'date' ? handleBookingDateChange : handleBookingTimeChange}
                minimumDate={iosBookingPickerMode === 'date' ? new Date() : undefined}
              />
            </View>
          </View>
        </Modal>
      ) : null}
      <Modal visible={showFacilityPicker} transparent animationType="fade" onRequestClose={() => setShowFacilityPicker(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.facilityPickerCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Select amenity</Text>
              <Pressable onPress={() => setShowFacilityPicker(false)} style={styles.dismissButton}>
                <Text style={styles.dismissButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.facilityPickerList}>
              {facilities.map((facility) => (
                <Pressable
                  key={facility.id}
                  onPress={() => {
                    setSelectedFacilityId(facility.id);
                    setShowFacilityPicker(false);
                  }}
                  style={[styles.facilityPickerItem, selectedFacilityId === facility.id ? styles.facilityPickerItemActive : null]}
                >
                  <Text style={[styles.facilityPickerItemTitle, selectedFacilityId === facility.id ? styles.facilityPickerItemTitleActive : null]}>
                    {facility.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {facility.type} / {facility.is_paid ? `Rs ${facility.pricing}/hr` : 'Free'} / Capacity {facility.capacity}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function compactBookingStatus(status: FacilityBooking['status']) {
  if (status === 'Completed') return 'Completed';
  if (status === 'Cancelled') return 'Cancelled';
  if (status === 'Rejected') return 'Rejected';
  return 'Upcoming';
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  content: { gap: 16 },
  hero: { gap: 4 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  panel: { borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  facilitySelectField: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  formRow: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  pickerPanel: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 14, gap: 10 },
  pickerField: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 11, gap: 2, justifyContent: 'center' },
  pickerFieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerFieldValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  textArea: {
    minHeight: 90,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  primaryButton: { borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', paddingVertical: 15 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderRadius: 14, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  secondaryButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(10, 20, 35, 0.45)', justifyContent: 'center', padding: 20 },
  facilityPickerCard: { maxHeight: '72%', borderRadius: 24, backgroundColor: colors.surface, padding: 18, gap: 12 },
  facilityPickerList: { gap: 10 },
  facilityPickerItem: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 14, gap: 4 },
  facilityPickerItemActive: { borderColor: '#bfd3ff', backgroundColor: '#eef4ff' },
  facilityPickerItemTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  facilityPickerItemTitleActive: { color: colors.primaryDeep },
  listCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 6 },
  maintenanceCard: { borderRadius: 18, backgroundColor: '#fff7e9', borderWidth: 1, borderColor: '#f3d8a7', padding: 14, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  subheading: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  dismissButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 8 },
  dismissButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  bookingFilterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  bookingFilterChip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 8 },
  bookingFilterChipActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  bookingFilterChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  bookingFilterChipTextActive: { color: colors.primaryDeep },
  microMeta: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  iosPickerModalScrim: { flex: 1, backgroundColor: 'rgba(10, 20, 35, 0.35)', justifyContent: 'flex-end' },
  iosPickerSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.surface, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20 },
});
