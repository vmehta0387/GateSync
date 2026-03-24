import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { subscribeToResidentVisitorUpdates } from '../lib/socket';
import { useSession } from '../providers/SessionProvider';
import { approveVisitor, denyVisitor, fetchPendingApprovals, fetchResidentFlats, fetchVisitorLogs, preApproveVisitor } from '../services/resident';
import { colors } from '../theme';
import { ResidentFlat, VisitorLog, VisitorType } from '../types/resident';
import { formatDateTime } from '../utils/format';

const VISITOR_TYPES: VisitorType[] = ['Guest', 'Delivery', 'Cab', 'Service', 'Unknown'];

const initialForm = {
  name: '',
  phone_number: '',
  purpose: 'Guest' as VisitorType,
  flat_id: '',
  expected_time: '',
  delivery_company: '',
  vehicle_number: '',
  contactless_delivery: false,
};

export function ResidentVisitorsScreen() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flats, setFlats] = useState<ResidentFlat[]>([]);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<VisitorLog[]>([]);
  const [form, setForm] = useState(initialForm);
  const [lastPasscode, setLastPasscode] = useState('');

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const [flatsRes, logsRes, pendingRes] = await Promise.all([
      fetchResidentFlats(),
      fetchVisitorLogs(),
      fetchPendingApprovals(),
    ]);

    if (flatsRes.success) {
      const nextFlats = flatsRes.flats || [];
      setFlats(nextFlats);
      setForm((current) => ({
        ...current,
        flat_id: current.flat_id || (nextFlats[0] ? String(nextFlats[0].flat_id) : ''),
      }));
    }
    if (logsRes.success) setLogs(logsRes.logs || []);
    if (pendingRes.success) setPendingApprovals(pendingRes.approvals || []);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!session?.user?.id) {
      return undefined;
    }

    const rooms = [`resident_${session.user.id}`, ...flats.map((flat) => `flat_${flat.flat_id}`)];
    return subscribeToResidentVisitorUpdates(rooms, () => {
      void loadAll();
    });
  }, [flats, loadAll, session?.user?.id]);

  const upcomingVisitors = useMemo(
    () => logs.filter((log) => log.status === 'Approved' && (log.entry_method === 'PreApproved' || Boolean(log.passcode))),
    [logs],
  );
  const gateApprovedVisitors = useMemo(
    () => logs.filter((log) => log.status === 'Approved' && !(log.entry_method === 'PreApproved' || Boolean(log.passcode))),
    [logs],
  );
  const insideVisitors = useMemo(() => logs.filter((log) => log.status === 'CheckedIn'), [logs]);

  const submitPass = async () => {
    setSubmitting(true);
    const response = await preApproveVisitor({
      name: form.name.trim(),
      phone_number: form.phone_number.replace(/\D/g, '').slice(0, 10),
      purpose: form.purpose,
      flat_id: Number(form.flat_id),
      expected_time: form.expected_time || null,
      delivery_company: form.delivery_company || null,
      vehicle_number: form.vehicle_number || null,
      contactless_delivery: form.contactless_delivery,
    });
    setSubmitting(false);

    if (!response.success || !response.passcode) {
      Alert.alert('Unable to create pass', response.message || 'Please check the details and try again.');
      return;
    }

    setLastPasscode(response.passcode);
    setForm((current) => ({
      ...initialForm,
      flat_id: current.flat_id,
    }));
    await loadAll();
  };

  const handleDecision = async (logId: number, nextAction: 'approve' | 'deny') => {
    const response = nextAction === 'approve' ? await approveVisitor(logId) : await denyVisitor(logId);
    if (!response.success) {
      Alert.alert('Action failed', response.message || 'Please try again.');
      return;
    }
    await loadAll();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}>
        <View style={styles.hero}>
          <Text style={styles.title}>Visitors</Text>
          <Text style={styles.subtitle}>Pre-approve guests and respond quickly when the gate asks for approval.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Create visitor pass</Text>
          <View style={styles.typeRow}>
            {VISITOR_TYPES.map((type) => (
              <Pressable key={type} onPress={() => setForm((current) => ({ ...current, purpose: type }))} style={[styles.typeChip, form.purpose === type ? styles.typeChipActive : null]}>
                <Text style={[styles.typeChipText, form.purpose === type ? styles.typeChipTextActive : null]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput value={form.name} onChangeText={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Visitor name" placeholderTextColor={colors.textMuted} style={styles.input} />
          <TextInput value={form.phone_number} onChangeText={(value) => setForm((current) => ({ ...current, phone_number: value.replace(/\D/g, '') }))} placeholder="10-digit phone" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={10} style={styles.input} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.flatPickerRow}>
              {flats.map((flat) => (
                <Pressable key={flat.flat_id} onPress={() => setForm((current) => ({ ...current, flat_id: String(flat.flat_id) }))} style={[styles.flatChip, form.flat_id === String(flat.flat_id) ? styles.flatChipActive : null]}>
                  <Text style={[styles.flatChipText, form.flat_id === String(flat.flat_id) ? styles.flatChipTextActive : null]}>{flat.block_name}-{flat.flat_number}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <TextInput value={form.expected_time} onChangeText={(value) => setForm((current) => ({ ...current, expected_time: value }))} placeholder="Expected time (optional)" placeholderTextColor={colors.textMuted} style={styles.input} />
          <TextInput value={form.vehicle_number} onChangeText={(value) => setForm((current) => ({ ...current, vehicle_number: value.toUpperCase() }))} placeholder="Vehicle number (optional)" placeholderTextColor={colors.textMuted} style={styles.input} />

          {form.purpose === 'Delivery' ? (
            <>
              <TextInput value={form.delivery_company} onChangeText={(value) => setForm((current) => ({ ...current, delivery_company: value }))} placeholder="Delivery company" placeholderTextColor={colors.textMuted} style={styles.input} />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Contactless delivery</Text>
                <Switch value={form.contactless_delivery} onValueChange={(value) => setForm((current) => ({ ...current, contactless_delivery: value }))} trackColor={{ true: '#b9d0ff' }} thumbColor={form.contactless_delivery ? colors.primary : '#f3f4f6'} />
              </View>
            </>
          ) : null}

          <Pressable onPress={() => void submitPass()} disabled={submitting || !form.name.trim() || form.phone_number.length !== 10 || !form.flat_id} style={[styles.primaryButton, (submitting || !form.name.trim() || form.phone_number.length !== 10 || !form.flat_id) ? styles.disabledButton : null]}>
            <Text style={styles.primaryButtonText}>{submitting ? 'Creating pass...' : 'Generate Visitor Pass'}</Text>
          </Pressable>

          {lastPasscode ? (
            <View style={styles.passCard}>
              <Text style={styles.passTitle}>Latest passcode</Text>
              <Text style={styles.passCode}>{lastPasscode}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Approval requests</Text>
          {pendingApprovals.length ? pendingApprovals.map((log) => (
            <View key={log.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{log.visitor_name}</Text>
                  <Text style={styles.cardMeta}>{log.purpose} / {log.block_name}-{log.flat_number}</Text>
                  <Text style={styles.cardMeta}>{formatDateTime(log.approval_requested_at || null)}</Text>
                </View>
                <Badge label="Pending" tone="warning" />
              </View>
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionButton, styles.approveButton]} onPress={() => void handleDecision(log.id, 'approve')}>
                  <Text style={styles.actionButtonText}>Approve</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.denyButton]} onPress={() => void handleDecision(log.id, 'deny')}>
                  <Text style={styles.denyButtonText}>Deny</Text>
                </Pressable>
              </View>
            </View>
          )) : (
            <EmptyState title="No requests waiting" detail="Guard approvals will appear here when someone arrives at the gate." />
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Upcoming visitors</Text>
          {upcomingVisitors.length ? upcomingVisitors.map((log) => (
            <View key={log.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{log.visitor_name}</Text>
                  <Text style={styles.cardMeta}>{log.purpose} / {log.block_name}-{log.flat_number}</Text>
                </View>
                <Badge label={log.passcode || 'Approved'} tone="info" />
              </View>
            </View>
          )) : (
            <EmptyState title="No upcoming visitors" detail="Generated gate passes will be listed here." />
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Approved visitors</Text>
          {gateApprovedVisitors.length ? gateApprovedVisitors.map((log) => (
            <View key={log.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{log.visitor_name}</Text>
                  <Text style={styles.cardMeta}>{log.purpose} / {log.block_name}-{log.flat_number}</Text>
                </View>
                <Badge label="Approved" tone="info" />
              </View>
              <Text style={styles.cardMeta}>Approved by you. Guard will only mark the actual entry at the gate.</Text>
            </View>
          )) : (
            <EmptyState title="No approved visitors waiting" detail="Approved walk-ins will stay here until the guard marks their actual entry." />
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Currently inside</Text>
          {insideVisitors.length ? insideVisitors.map((log) => (
            <View key={log.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{log.visitor_name}</Text>
                  <Text style={styles.cardMeta}>{log.purpose} / Entered {formatDateTime(log.entry_time)}</Text>
                </View>
                <Badge label="Inside" tone="success" />
              </View>
            </View>
          )) : (
            <EmptyState title="No visitors inside" detail="Live check-ins from the gate will show up here." />
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
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10 },
  typeChipActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  typeChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  typeChipTextActive: { color: colors.primaryDeep },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  flatPickerRow: { flexDirection: 'row', gap: 10 },
  flatChip: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  flatChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  flatChipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  flatChipTextActive: { color: colors.white },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  primaryButton: { borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', paddingVertical: 15 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  passCard: { borderRadius: 18, backgroundColor: '#edf7ef', borderWidth: 1, borderColor: '#bde0c2', padding: 14, gap: 4 },
  passTitle: { color: colors.success, fontSize: 13, fontWeight: '800' },
  passCode: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: 4 },
  listCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  approveButton: { backgroundColor: colors.success },
  denyButton: { backgroundColor: '#fff3f3', borderWidth: 1, borderColor: '#efc6c6' },
  actionButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  denyButtonText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
});
