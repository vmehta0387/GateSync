import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  duration_hours: '1',
  guest_count: '1',
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

  const submitBooking = async () => {
    if (!selectedFacility || !bookingForm.booking_date || !bookingForm.start_time) {
      Alert.alert('Booking details missing', 'Select a facility, date, and start time first.');
      return;
    }

    const startTime = new Date(`${bookingForm.booking_date}T${bookingForm.start_time}`);
    const endTime = new Date(startTime.getTime() + Number(bookingForm.duration_hours || 1) * 3600000);
    const response = await createFacilityBooking({
      facility_id: selectedFacility.id,
      guest_count: Number(bookingForm.guest_count || 1),
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.facilityRow}>
              {facilities.map((facility) => (
                <Pressable key={facility.id} onPress={() => setSelectedFacilityId(facility.id)} style={[styles.facilityCard, selectedFacilityId === facility.id ? styles.facilityCardActive : null]}>
                  <Text style={styles.cardTitle}>{facility.name}</Text>
                  <Text style={styles.cardMeta}>{facility.type}</Text>
                  <Text style={styles.helperText}>{facility.is_paid ? `Rs ${facility.pricing}/hr` : 'Free'} / Capacity {facility.capacity}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Book selected facility</Text>
          {selectedFacility ? (
            <>
              <Text style={styles.helperText}>{selectedFacility.name} / Max {selectedFacility.max_booking_hours}h / Advance {selectedFacility.advance_booking_days} day(s)</Text>
              <TextInput value={bookingForm.booking_date} onChangeText={(value) => setBookingForm((current) => ({ ...current, booking_date: value }))} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} style={styles.input} />
              <TextInput value={bookingForm.start_time} onChangeText={(value) => setBookingForm((current) => ({ ...current, start_time: value }))} placeholder="Start time (HH:MM)" placeholderTextColor={colors.textMuted} style={styles.input} />
              <View style={styles.formRow}>
                <TextInput value={bookingForm.duration_hours} onChangeText={(value) => setBookingForm((current) => ({ ...current, duration_hours: value.replace(/\D/g, '') || '1' }))} placeholder="Hours" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={[styles.input, styles.rowInput]} />
                <TextInput value={bookingForm.guest_count} onChangeText={(value) => setBookingForm((current) => ({ ...current, guest_count: value.replace(/\D/g, '') || '1' }))} placeholder="Guests" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={[styles.input, styles.rowInput]} />
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
          {bookings.length ? bookings.map((booking) => (
            <View key={booking.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{booking.facility_name}</Text>
                  <Text style={styles.cardMeta}>{formatDateTime(booking.start_time)} to {formatDateTime(booking.end_time)}</Text>
                  <Text style={styles.cardMeta}>{booking.notes || `${booking.guest_count} people`}</Text>
                </View>
                <Badge label={booking.status} tone={booking.status === 'Confirmed' ? 'info' : booking.status === 'Completed' ? 'success' : 'warning'} />
              </View>
              {booking.status === 'Confirmed' && booking.is_cancellable ? (
                <Pressable onPress={() => void cancelBooking(booking.id)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel Booking</Text>
                </Pressable>
              ) : null}
            </View>
          )) : (
            <EmptyState title="No bookings yet" detail="Reserved amenities and their slot timings will appear here." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  content: { gap: 16 },
  hero: { gap: 4 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  panel: { borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  facilityRow: { flexDirection: 'row', gap: 12 },
  facilityCard: { width: 180, borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 6, borderWidth: 1, borderColor: 'transparent' },
  facilityCardActive: { borderColor: '#bfd3ff', backgroundColor: '#eef4ff' },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  formRow: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
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
  listCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 6 },
  maintenanceCard: { borderRadius: 18, backgroundColor: '#fff7e9', borderWidth: 1, borderColor: '#f3d8a7', padding: 14, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  subheading: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
});
