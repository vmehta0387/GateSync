import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { subscribeToResidentVisitorUpdates } from '../lib/socket';
import { useSession } from '../providers/SessionProvider';
import { approveVisitor, denyVisitor, fetchPendingApprovals, fetchResidentFlats, fetchVisitorLogs, preApproveVisitor } from '../services/resident';
import { colors } from '../theme';
import { ResidentFlat, VisitorLog, VisitorType } from '../types/resident';
import { formatDateTime, formatDayLabel, getDateKey, toValidDate } from '../utils/format';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const VISITOR_TYPE_OPTIONS: Array<{ value: VisitorType; label: string }> = [
  { value: 'Guest', label: 'Guest' },
  { value: 'Delivery', label: 'Delivery' },
  { value: 'Cab', label: 'Cab' },
  { value: 'Service', label: 'Service' },
  { value: 'Unknown', label: 'Other' },
];

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

type CreatedPass = {
  passcode: string;
  name: string;
  phone_number: string;
  purpose: VisitorType;
  flat_label: string;
  expected_time: string;
  validity_label: string;
};

type ContactOption = {
  id: string;
  name: string;
  phone_number: string;
};

function buildPassQrUrl(passcode: string) {
  const qrValue = encodeURIComponent(`GATESYNC-PASS:${passcode}`);
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${qrValue}`;
}

function getDisplayVisitorType(type: VisitorType | string) {
  return type === 'Unknown' ? 'Other' : type;
}

function getDefaultPassExpiryIso() {
  return new Date(Date.now() + DAY_IN_MS).toISOString();
}

function getValidityLabel(expectedTime: string | null | undefined) {
  if (!expectedTime) {
    return 'Valid for the next 24 hours';
  }

  return `Expected ${formatDateTime(expectedTime)}`;
}

function buildPassFromLog(log: VisitorLog): CreatedPass {
  const effectiveExpectedTime = log.expected_time || getDefaultPassExpiryIso();
  return {
    passcode: log.passcode || 'Approved',
    name: log.visitor_name,
    phone_number: log.visitor_phone || '',
    purpose: log.purpose,
    flat_label: `${log.block_name}-${log.flat_number}`,
    expected_time: effectiveExpectedTime,
    validity_label: getValidityLabel(log.expected_time),
  };
}

function updateDateOnly(sourceIso: string | null | undefined, nextDate: Date) {
  const base = sourceIso ? new Date(sourceIso) : new Date();
  const result = new Date(base);
  result.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
  return result.toISOString();
}

function updateTimeOnly(sourceIso: string | null | undefined, nextTime: Date) {
  const base = sourceIso ? new Date(sourceIso) : new Date();
  const result = new Date(base);
  result.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0);
  return result.toISOString();
}

export function ResidentVisitorsScreen({ onBack }: { onBack?: () => void }) {
  const { session } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flats, setFlats] = useState<ResidentFlat[]>([]);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<VisitorLog[]>([]);
  const [form, setForm] = useState(initialForm);
  const [activePassCard, setActivePassCard] = useState<CreatedPass | null>(null);
  const [historyTab, setHistoryTab] = useState<'today' | 'past'>('today');
  const [visiblePastDayCount, setVisiblePastDayCount] = useState(2);
  const [contactSearch, setContactSearch] = useState('');
  const [contactsVisible, setContactsVisible] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [showExpectedDatePicker, setShowExpectedDatePicker] = useState(false);
  const [showExpectedTimePicker, setShowExpectedTimePicker] = useState(false);

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
  const insideVisitors = useMemo(() => logs.filter((log) => log.status === 'CheckedIn'), [logs]);
  const sortedHistoryLogs = useMemo(
    () => [...logs].sort((a, b) => {
      const aTime = toValidDate(a.entry_time || a.expected_time || a.approval_requested_at)?.getTime() || 0;
      const bTime = toValidDate(b.entry_time || b.expected_time || b.approval_requested_at)?.getTime() || 0;
      return bTime - aTime;
    }),
    [logs],
  );
  const todayKey = useMemo(() => getDateKey(new Date().toISOString()), []);
  const todayHistory = useMemo(
    () => sortedHistoryLogs.filter((log) => getDateKey(log.entry_time || log.expected_time || log.approval_requested_at) === todayKey),
    [sortedHistoryLogs, todayKey],
  );
  const pastDayKeys = useMemo(() => {
    const keys: string[] = [];
    sortedHistoryLogs.forEach((log) => {
      const dateKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
      if (!dateKey || dateKey === todayKey || keys.includes(dateKey)) return;
      keys.push(dateKey);
    });
    return keys;
  }, [sortedHistoryLogs, todayKey]);
  const visiblePastDayKeys = useMemo(() => pastDayKeys.slice(0, visiblePastDayCount), [pastDayKeys, visiblePastDayCount]);
  const pastHistory = useMemo(
    () => sortedHistoryLogs.filter((log) => {
      const dateKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
      return Boolean(dateKey && visiblePastDayKeys.includes(dateKey));
    }),
    [sortedHistoryLogs, visiblePastDayKeys],
  );
  const hasMorePastHistory = visiblePastDayKeys.length < pastDayKeys.length;
  const qrSource = useMemo(() => {
    if (!activePassCard?.passcode) {
      return null;
    }

    return { uri: buildPassQrUrl(activePassCard.passcode) };
  }, [activePassCard]);
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) {
      return contacts.slice(0, 120);
    }

    return contacts
      .filter((contact) => contact.name.toLowerCase().includes(query) || contact.phone_number.includes(query))
      .slice(0, 120);
  }, [contactSearch, contacts]);
  const selectedExpectedDate = useMemo(
    () => (form.expected_time ? new Date(form.expected_time) : new Date(Date.now() + DAY_IN_MS)),
    [form.expected_time],
  );
  const selectedExpectedDateLabel = useMemo(
    () => (form.expected_time ? selectedExpectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'),
    [form.expected_time, selectedExpectedDate],
  );
  const selectedExpectedTimeLabel = useMemo(
    () => (form.expected_time ? selectedExpectedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Not set'),
    [form.expected_time, selectedExpectedDate],
  );
  const expectedTimeLabel = useMemo(
    () => (form.expected_time ? `Expected ${formatDateTime(form.expected_time)}` : 'If you do not pick a time, the pass will stay valid for 24 hours.'),
    [form.expected_time],
  );

  useEffect(() => {
    setVisiblePastDayCount(2);
  }, [logs]);

  const openContactsPicker = async () => {
    setContactsLoading(true);
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Contacts permission needed', 'Allow GateSync to read your contacts and fill visitor details quickly.');
        return;
      }

      if (!contacts.length) {
        const response = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
        });

        const normalizedContacts = (response.data || [])
          .map((contact) => {
            const phoneNumber = contact.phoneNumbers?.find((item) => item.number)?.number || '';
            const normalizedPhone = String(phoneNumber).replace(/\D/g, '').slice(-10);
            const normalizedName = String(contact.name || '').trim();

            if (!normalizedName || normalizedPhone.length !== 10) {
              return null;
            }

            return {
              id: contact.id,
              name: normalizedName,
              phone_number: normalizedPhone,
            } satisfies ContactOption;
          })
          .filter((contact): contact is ContactOption => Boolean(contact))
          .sort((a, b) => a.name.localeCompare(b.name));

        setContacts(normalizedContacts);
      }

      setContactsVisible(true);
    } catch {
      Alert.alert('Unable to open contacts', 'Please type the visitor name and phone number manually for now.');
    } finally {
      setContactsLoading(false);
    }
  };

  const chooseContact = (contact: ContactOption) => {
    setForm((current) => ({
      ...current,
      name: contact.name,
      phone_number: contact.phone_number,
    }));
    setContactsVisible(false);
    setContactSearch('');
  };

  const clearExpectedTime = () => {
    setForm((current) => ({ ...current, expected_time: '' }));
  };

  const handleExpectedDateChange = (_event: DateTimePickerEvent, nextDate?: Date) => {
    setShowExpectedDatePicker(Platform.OS === 'ios');
    if (!nextDate) {
      return;
    }

    setForm((current) => ({
      ...current,
      expected_time: updateDateOnly(current.expected_time || getDefaultPassExpiryIso(), nextDate),
    }));
  };

  const handleExpectedTimeChange = (_event: DateTimePickerEvent, nextTime?: Date) => {
    setShowExpectedTimePicker(Platform.OS === 'ios');
    if (!nextTime) {
      return;
    }

    setForm((current) => ({
      ...current,
      expected_time: updateTimeOnly(current.expected_time || getDefaultPassExpiryIso(), nextTime),
    }));
  };

  const submitPass = async () => {
    const selectedFlat = flats.find((flat) => String(flat.flat_id) === form.flat_id);
    const effectiveExpectedTime = form.expected_time || getDefaultPassExpiryIso();

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

    setActivePassCard({
      passcode: response.passcode,
      name: form.name.trim(),
      phone_number: form.phone_number.replace(/\D/g, '').slice(0, 10),
      purpose: form.purpose,
      flat_label: selectedFlat ? `${selectedFlat.block_name}-${selectedFlat.flat_number}` : 'Selected flat',
      expected_time: effectiveExpectedTime,
      validity_label: getValidityLabel(form.expected_time),
    });
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

  const sharePassMessage = useCallback(async (mode: 'whatsapp' | 'share', pass: CreatedPass | null = activePassCard) => {
    if (!pass) {
      return;
    }

    const qrUrl = buildPassQrUrl(pass.passcode);
    const lines = [
      `GateSync visitor pass for ${pass.name}`,
      `Passcode: ${pass.passcode}`,
      `Flat: ${pass.flat_label}`,
      `Purpose: ${getDisplayVisitorType(pass.purpose)}`,
      pass.validity_label,
      `QR code: ${qrUrl}`,
      'Show this passcode at the gate for fast entry.',
    ].filter(Boolean);
    const message = lines.join('\n');

    if (mode === 'whatsapp') {
      const whatsappAppUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const whatsappWebUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

      try {
        await Linking.openURL(whatsappAppUrl);
        return;
      } catch {
        try {
          await Linking.openURL(whatsappWebUrl);
          return;
        } catch {
          Alert.alert('Unable to open WhatsApp', 'Opening the share sheet instead.');
        }
      }

      await Share.share({ message, url: qrUrl });
      return;
    }

    await Share.share({ message, url: qrUrl });
  }, [activePassCard]);

  const openPassCardFromLog = useCallback((log: VisitorLog) => {
    setActivePassCard(buildPassFromLog(log));
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}>
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            {onBack ? (
              <Pressable onPress={onBack} style={styles.backButton}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={colors.primaryDeep} />
                <Text style={styles.backButtonText}>Back</Text>
              </Pressable>
            ) : <View />}
          </View>
          <Text style={styles.title}>Visitors</Text>
          <Text style={styles.subtitle}>Pre-approve guests, pick a contact quickly, and respond fast when the gate requests approval.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Create visitor pass</Text>
          <View style={styles.typeRow}>
            {VISITOR_TYPE_OPTIONS.map((type) => (
              <Pressable key={type.value} onPress={() => setForm((current) => ({ ...current, purpose: type.value }))} style={[styles.typeChip, form.purpose === type.value ? styles.typeChipActive : null]}>
                <Text style={[styles.typeChipText, form.purpose === type.value ? styles.typeChipTextActive : null]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inlineActionRow}>
            <TextInput value={form.name} onChangeText={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Visitor name" placeholderTextColor={colors.textMuted} style={[styles.input, styles.flexInput]} />
            <Pressable onPress={() => void openContactsPicker()} style={styles.inlinePickerButton}>
              <MaterialCommunityIcons name="account-box-multiple-outline" size={18} color={colors.primaryDeep} />
              <Text style={styles.inlinePickerButtonText}>{contactsLoading ? 'Loading...' : 'Contacts'}</Text>
            </Pressable>
          </View>
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

          <View style={styles.pickerPanel}>
            <View style={styles.rowBetween}>
              <Text style={styles.inputLabel}>Expected time</Text>
              <Pressable onPress={clearExpectedTime}>
                <Text style={styles.clearLinkText}>Clear</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>{expectedTimeLabel}</Text>
            <View style={styles.selectedDateTimeRow}>
              <View style={styles.selectedDateTimeCard}>
                <Text style={styles.selectedDateTimeLabel}>Date</Text>
                <Text style={styles.selectedDateTimeValue}>{selectedExpectedDateLabel}</Text>
              </View>
              <View style={styles.selectedDateTimeCard}>
                <Text style={styles.selectedDateTimeLabel}>Time</Text>
                <Text style={styles.selectedDateTimeValue}>{selectedExpectedTimeLabel}</Text>
              </View>
            </View>
            <View style={styles.timePickerRow}>
              <Pressable style={[styles.secondaryButton, styles.rowInput]} onPress={() => setShowExpectedDatePicker(true)}>
                <Text style={styles.secondaryButtonText}>Pick date</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, styles.rowInput]} onPress={() => setShowExpectedTimePicker(true)}>
                <Text style={styles.secondaryButtonText}>Pick time</Text>
              </Pressable>
            </View>
          </View>

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

          {activePassCard ? (
            <View style={styles.passCard}>
              <Text style={styles.passTitle}>Latest visitor pass</Text>
              <Text style={styles.passCode}>{activePassCard.passcode}</Text>
              <Text style={styles.passMeta}>{activePassCard.name} / {activePassCard.flat_label}</Text>
              <Text style={styles.passMeta}>{activePassCard.validity_label}</Text>
              {qrSource ? <Image source={qrSource} style={styles.qrImage} resizeMode="contain" /> : null}
              <View style={styles.passActionRow}>
                <Pressable style={styles.whatsAppButton} onPress={() => void sharePassMessage('whatsapp')}>
                  <Text style={styles.whatsAppButtonText}>Share on WhatsApp</Text>
                </Pressable>
                <Pressable style={styles.secondaryShareButton} onPress={() => void sharePassMessage('share')}>
                  <Text style={styles.secondaryShareButtonText}>More options</Text>
                </Pressable>
              </View>
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
                  <Text style={styles.cardMeta}>{getDisplayVisitorType(log.purpose)} / {log.block_name}-{log.flat_number}</Text>
                  <Text style={styles.cardMeta}>{formatDateTime(log.approval_requested_at || null)}</Text>
                </View>
                <Badge label="Pending" tone="warning" />
              </View>
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionButton, styles.approveButton]} onPress={() => void handleDecision(log.id, 'approve')}>
                  <Text style={styles.actionButtonText}>Approve</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.denyButton]} onPress={() => void handleDecision(log.id, 'deny')}>
                  <Text style={styles.denyButtonText}>Reject</Text>
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
                  <Text style={styles.cardMeta}>{getDisplayVisitorType(log.purpose)} / {log.block_name}-{log.flat_number}</Text>
                </View>
                <Badge label={log.passcode || 'Approved'} tone="info" />
              </View>
              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} onPress={() => openPassCardFromLog(log)}>
                  <Text style={styles.secondaryButtonText}>View QR</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    const pass = buildPassFromLog(log);
                    setActivePassCard(pass);
                    void sharePassMessage('whatsapp', pass);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Share pass</Text>
                </Pressable>
              </View>
            </View>
          )) : (
            <EmptyState title="No upcoming visitors" detail="Generated gate passes will be listed here." />
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Currently inside</Text>
          {insideVisitors.length ? insideVisitors.map((log) => (
            <View key={log.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{log.visitor_name}</Text>
                  <Text style={styles.cardMeta}>{getDisplayVisitorType(log.purpose)} / Entered {formatDateTime(log.entry_time)}</Text>
                </View>
                <Badge label="Inside" tone="success" />
              </View>
            </View>
          )) : (
            <EmptyState title="No visitors inside" detail="Live check-ins from the gate will show up here." />
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Visitor history</Text>
          <View style={styles.historyTabRow}>
            <HistoryTabButton active={historyTab === 'today'} label={`Today (${todayHistory.length})`} onPress={() => setHistoryTab('today')} />
            <HistoryTabButton active={historyTab === 'past'} label={`Past (${pastDayKeys.length} days)`} onPress={() => setHistoryTab('past')} />
          </View>
          {(historyTab === 'today' ? todayHistory : pastHistory).length ? (historyTab === 'today' ? todayHistory : pastHistory).map((log, index, currentLogs) => (
            <View key={`history-${log.id}`} style={styles.listCard}>
              {historyTab === 'past' && (() => {
                const currentKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
                const previousKey = index > 0 ? getDateKey(currentLogs[index - 1].entry_time || currentLogs[index - 1].expected_time || currentLogs[index - 1].approval_requested_at) : null;
                if (!currentKey || currentKey === previousKey) return null;
                return <Text style={styles.dayLabel}>{formatDayLabel(log.entry_time || log.expected_time || log.approval_requested_at)}</Text>;
              })()}
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{log.visitor_name}</Text>
                  <Text style={styles.cardMeta}>{getDisplayVisitorType(log.purpose)} / {log.block_name}-{log.flat_number}</Text>
                  <Text style={styles.cardMeta}>{formatDateTime(log.entry_time || log.expected_time || log.approval_requested_at)}</Text>
                </View>
                <Badge label={log.status} tone={log.status === 'CheckedIn' ? 'success' : log.status === 'Pending' ? 'warning' : 'info'} />
              </View>
            </View>
          )) : (
            <EmptyState title={historyTab === 'today' ? 'No visitor activity today' : 'No past visitor activity'} detail={historyTab === 'today' ? 'Today’s approvals and visitor movement will show up here.' : 'Older visitor history will load in 2-day batches here.'} />
          )}
          {historyTab === 'past' && hasMorePastHistory ? (
            <Pressable style={styles.loadMoreButton} onPress={() => setVisiblePastDayCount((current) => current + 2)}>
              <Text style={styles.loadMoreButtonText}>Load older 2 days</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {showExpectedDatePicker ? (
        <DateTimePicker
          mode="date"
          value={selectedExpectedDate}
          onChange={handleExpectedDateChange}
          minimumDate={new Date()}
        />
      ) : null}
      {showExpectedTimePicker ? (
        <DateTimePicker
          mode="time"
          value={selectedExpectedDate}
          onChange={handleExpectedTimeChange}
        />
      ) : null}

      <Modal visible={contactsVisible} transparent animationType="slide" onRequestClose={() => setContactsVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Pick from contacts</Text>
              <Pressable onPress={() => setContactsVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <TextInput value={contactSearch} onChangeText={setContactSearch} placeholder="Search name or number" placeholderTextColor={colors.textMuted} style={styles.input} />
            <ScrollView contentContainerStyle={styles.modalList}>
              {filteredContacts.length ? filteredContacts.map((contact) => (
                <Pressable key={contact.id} onPress={() => chooseContact(contact)} style={styles.contactCard}>
                  <Text style={styles.cardTitle}>{contact.name}</Text>
                  <Text style={styles.cardMeta}>{contact.phone_number}</Text>
                </Pressable>
              )) : (
                <EmptyState title="No matching contacts" detail="Try another name or number, or enter the visitor manually." />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function HistoryTabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.historyTabButton, active ? styles.historyTabButtonActive : null]}>
      <Text style={[styles.historyTabButtonText, active ? styles.historyTabButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  content: { gap: 16 },
  hero: { gap: 6 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9 },
  backButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  panel: { borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10 },
  typeChipActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  typeChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  typeChipTextActive: { color: colors.primaryDeep },
  inlineActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flexInput: { flex: 1 },
  inlinePickerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', paddingHorizontal: 12, paddingVertical: 13 },
  inlinePickerButtonText: { color: colors.primaryDeep, fontSize: 12, fontWeight: '800' },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  flatPickerRow: { flexDirection: 'row', gap: 10 },
  flatChip: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  flatChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  flatChipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  flatChipTextActive: { color: colors.white },
  pickerPanel: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 14, gap: 10 },
  selectedDateTimeRow: { flexDirection: 'row', gap: 10 },
  selectedDateTimeCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bfd3ff',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  selectedDateTimeLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  selectedDateTimeValue: { color: colors.primaryDeep, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  timePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  clearLinkText: { color: colors.primaryDeep, fontSize: 12, fontWeight: '800' },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  primaryButton: { borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', paddingVertical: 15 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  passCard: { borderRadius: 18, backgroundColor: '#edf7ef', borderWidth: 1, borderColor: '#bde0c2', padding: 14, gap: 4 },
  passTitle: { color: colors.success, fontSize: 13, fontWeight: '800' },
  passCode: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: 4 },
  passMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  qrImage: { width: 180, height: 180, alignSelf: 'center', marginTop: 8, borderRadius: 18, backgroundColor: colors.white },
  passActionRow: { gap: 10, marginTop: 8 },
  whatsAppButton: { borderRadius: 16, backgroundColor: '#1fa855', alignItems: 'center', paddingVertical: 12 },
  whatsAppButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  secondaryShareButton: { borderRadius: 16, borderWidth: 1, borderColor: '#bde0c2', backgroundColor: colors.white, alignItems: 'center', paddingVertical: 12 },
  secondaryShareButtonText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  secondaryButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12 },
  rowInput: { flex: 1 },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  historyTabRow: { flexDirection: 'row', gap: 8 },
  historyTabButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  historyTabButtonActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  historyTabButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  historyTabButtonTextActive: { color: colors.primaryDeep },
  listCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 10 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  dayLabel: { color: colors.primaryDeep, fontSize: 12, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  approveButton: { backgroundColor: colors.success },
  denyButton: { backgroundColor: '#fff3f3', borderWidth: 1, borderColor: '#efc6c6' },
  actionButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  denyButtonText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  loadMoreButton: { borderRadius: 16, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', alignItems: 'center', paddingVertical: 12 },
  loadMoreButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(10, 20, 35, 0.45)', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '78%', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, padding: 18, gap: 12 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  modalList: { gap: 10, paddingBottom: 18 },
  contactCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 4 },
});
