import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { API_BASE_URL } from '../config/env';
import { uploadVisitorPhoto } from '../services/guard';
import { colors } from '../theme';
import { FlatOption, StaffMember, VisitorLog, WalkInPayload } from '../types/guard';
import { formatDateTime } from '../utils/format';

const visitorTypes: Array<WalkInPayload['purpose']> = ['Guest', 'Delivery', 'Cab', 'Service', 'Unknown'];
const initialWalkIn: WalkInPayload = {
  name: '',
  phone_number: '',
  purpose: 'Guest',
  block_name: '',
  flat_number: '',
  delivery_company: '',
  vehicle_number: '',
};

export function GuardVisitorsScreen({
  logs,
  staffList,
  flatOptions,
  approvedArrivals,
  activeVisitors,
  onPasscodeCheckIn,
  onWalkInSubmit,
  onCheckOut,
  onApprovedCheckIn,
  onStaffCheckIn,
  onStaffCheckOut,
}: {
  logs: VisitorLog[];
  staffList: StaffMember[];
  flatOptions: FlatOption[];
  approvedArrivals: VisitorLog[];
  activeVisitors: VisitorLog[];
  onPasscodeCheckIn: (passcode: string) => Promise<void>;
  onWalkInSubmit: (payload: WalkInPayload) => Promise<void>;
  onCheckOut: (logId: number) => Promise<void>;
  onApprovedCheckIn: (logId: number) => Promise<void>;
  onStaffCheckIn: (staffId: number) => Promise<void>;
  onStaffCheckOut: (staffId: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<'visitors' | 'staff'>('visitors');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [flatSearch, setFlatSearch] = useState('');
  const [walkIn, setWalkIn] = useState(initialWalkIn);
  const [selectedDeliveryFlatIds, setSelectedDeliveryFlatIds] = useState<number[]>([]);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState('');

  const blockOptions = useMemo(
    () => [...new Set(flatOptions.map((flat) => flat.block_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [flatOptions],
  );

  const selectedBlockFlats = useMemo(
    () => flatOptions.filter((flat) => flat.block_name === walkIn.block_name),
    [flatOptions, walkIn.block_name],
  );

  const filteredBlockFlats = useMemo(() => {
    const query = flatSearch.trim().toLowerCase();
    const filtered = query
      ? selectedBlockFlats.filter((flat) => flat.flat_number.toLowerCase().includes(query))
      : selectedBlockFlats;
    return filtered.slice(0, 20);
  }, [flatSearch, selectedBlockFlats]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter((log) =>
      [log.visitor_name, log.visitor_phone, log.block_name, log.flat_number, log.status, log.passcode || '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [logs, search]);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return staffList;
    return staffList.filter((staff) =>
      [staff.name, staff.phone, staff.type, staff.assigned_flats.map((flat) => flat.label).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [staffList, staffSearch]);

  const selectedDeliveryFlats = useMemo(
    () => selectedDeliveryFlatIds
      .map((flatId) => flatOptions.find((flat) => flat.id === flatId))
      .filter(Boolean) as FlatOption[],
    [flatOptions, selectedDeliveryFlatIds],
  );

  const hasFlatSelection = walkIn.purpose === 'Delivery'
    ? selectedDeliveryFlatIds.length > 0
    : Boolean(walkIn.block_name && walkIn.flat_number);

  const submitPasscode = async () => {
    setBusy(true);
    await onPasscodeCheckIn(passcode.trim().toUpperCase());
    setPasscode('');
    setBusy(false);
  };

  const submitWalkIn = async () => {
    const primaryFlat = selectedDeliveryFlats[0];
    setBusy(true);
    await onWalkInSubmit({
      ...walkIn,
      phone_number: walkIn.phone_number.replace(/\D/g, '').slice(0, 10),
      block_name: walkIn.purpose === 'Delivery' ? primaryFlat?.block_name || walkIn.block_name : walkIn.block_name,
      flat_number: walkIn.purpose === 'Delivery' ? primaryFlat?.flat_number || walkIn.flat_number : walkIn.flat_number,
      flat_ids: walkIn.purpose === 'Delivery' ? selectedDeliveryFlatIds : undefined,
      vehicle_number: walkIn.vehicle_number?.toUpperCase(),
    });
    setWalkIn(initialWalkIn);
    setSelectedDeliveryFlatIds([]);
    setFlatSearch('');
    setVisitorPhotoPreview('');
    setBusy(false);
  };

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to capture visitor photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.6,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    const upload = await uploadVisitorPhoto({
      uri: asset.uri,
      name: asset.fileName || `visitor-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    });

    if (!upload.success || !upload.file?.file_path) {
      Alert.alert('Upload failed', upload.message || 'Unable to save visitor photo.');
      return;
    }

    setWalkIn((current) => ({ ...current, visitor_photo_url: upload.file?.file_path || '' }));
    setVisitorPhotoPreview(upload.file.url || asset.uri);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.statsRow}>
        <StatCard label="Awaiting arrival" value={approvedArrivals.length} tone="primary" />
        <StatCard label="Inside campus" value={activeVisitors.length} />
        <StatCard label="Staff inside" value={staffList.filter((staff) => staff.is_inside).length} />
      </View>

      <View style={styles.modeRow}>
        <ModeButton active={mode === 'visitors'} label="Visitor Entry" onPress={() => setMode('visitors')} />
        <ModeButton active={mode === 'staff'} label="Staff Entry" onPress={() => setMode('staff')} />
      </View>

      {mode === 'visitors' ? (
        <>
          <View style={styles.panelStrong}>
            <Text style={styles.panelTitle}>Passcode check-in</Text>
            <TextInput
              value={passcode}
              onChangeText={setPasscode}
              autoCapitalize="characters"
              placeholder="GP000123"
              placeholderTextColor="rgba(255,255,255,0.62)"
              style={styles.panelInput}
            />
            <Pressable onPress={() => void submitPasscode()} disabled={busy || !passcode.trim()} style={[styles.primaryAction, busy || !passcode.trim() ? styles.disabled : null]}>
              <Text style={styles.primaryActionText}>Check In With Passcode</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>New walk-in visitor</Text>
            <View style={styles.typeRow}>
              {visitorTypes.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    setWalkIn((current) => ({ ...current, purpose: type, flat_number: type === 'Delivery' ? '' : current.flat_number }));
                    if (type !== 'Delivery') setSelectedDeliveryFlatIds([]);
                  }}
                  style={[styles.typeChip, walkIn.purpose === type ? styles.typeChipActive : null]}
                >
                  <Text style={[styles.typeChipText, walkIn.purpose === type ? styles.typeChipTextActive : null]}>{type}</Text>
                </Pressable>
              ))}
            </View>

            <LabeledInput label="Visitor name" value={walkIn.name} onChangeText={(value) => setWalkIn((current) => ({ ...current, name: value }))} placeholder="Visitor name" />
            <LabeledInput label="Mobile number" value={walkIn.phone_number} onChangeText={(value) => setWalkIn((current) => ({ ...current, phone_number: value.replace(/\D/g, '') }))} placeholder="10-digit mobile number" keyboardType="number-pad" maxLength={10} />

            <Text style={styles.fieldLabel}>Visitor photo</Text>
            {visitorPhotoPreview ? (
              <View style={styles.photoCard}>
                <Image source={{ uri: visitorPhotoPreview.startsWith('http') ? visitorPhotoPreview : `${API_BASE_URL}${walkIn.visitor_photo_url || ''}` }} style={styles.photoPreview} />
                <View style={styles.photoCopy}>
                  <Text style={styles.photoTitle}>Photo captured</Text>
                  <Text style={styles.photoSubtitle}>Retake if the face is not clear.</Text>
                </View>
              </View>
            ) : null}
            <Pressable onPress={() => void capturePhoto()} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>{visitorPhotoPreview ? 'Retake Photo' : 'Take Visitor Photo'}</Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Tower or block</Text>
            <View style={styles.selectorWrap}>
              {blockOptions.map((blockName) => (
                <Pressable
                  key={blockName}
                  onPress={() => {
                    setWalkIn((current) => ({ ...current, block_name: blockName, flat_number: '' }));
                    setFlatSearch('');
                  }}
                  style={[styles.selectorChip, walkIn.block_name === blockName ? styles.selectorChipActive : null]}
                >
                  <Text style={[styles.selectorChipText, walkIn.block_name === blockName ? styles.selectorChipTextActive : null]}>{blockName}</Text>
                </Pressable>
              ))}
            </View>

            <LabeledInput label="Search flat" value={flatSearch} onChangeText={setFlatSearch} placeholder="Search flat number" />
            <View style={styles.selectorWrap}>
              {filteredBlockFlats.map((flat) => {
                const active = walkIn.purpose === 'Delivery'
                  ? selectedDeliveryFlatIds.includes(flat.id)
                  : walkIn.flat_number === flat.flat_number;
                return (
                  <Pressable
                    key={flat.id}
                    onPress={() => {
                      if (walkIn.purpose === 'Delivery') {
                        setSelectedDeliveryFlatIds((current) => current.includes(flat.id) ? current.filter((id) => id !== flat.id) : [...current, flat.id]);
                        return;
                      }
                      setWalkIn((current) => ({ ...current, flat_number: flat.flat_number }));
                    }}
                    style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                  >
                    <Text style={[styles.selectorChipText, active ? styles.selectorChipTextActive : null]}>{flat.flat_number}</Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedDeliveryFlats.length ? (
              <Text style={styles.helperText}>Selected: {selectedDeliveryFlats.map((flat) => flat.label).join(', ')}</Text>
            ) : null}

            <LabeledInput label="Vehicle number" value={walkIn.vehicle_number || ''} onChangeText={(value) => setWalkIn((current) => ({ ...current, vehicle_number: value }))} placeholder="Optional" />
            {walkIn.purpose === 'Delivery' ? (
              <LabeledInput label="Delivery company" value={walkIn.delivery_company || ''} onChangeText={(value) => setWalkIn((current) => ({ ...current, delivery_company: value }))} placeholder="Amazon, Swiggy, Blinkit..." />
            ) : null}

            <Pressable onPress={() => void submitWalkIn()} disabled={busy || !walkIn.name || walkIn.phone_number.length !== 10 || !hasFlatSelection} style={[styles.submitButton, busy || !walkIn.name || walkIn.phone_number.length !== 10 || !hasFlatSelection ? styles.disabled : null]}>
              <Text style={styles.submitButtonText}>{walkIn.purpose === 'Delivery' ? 'Log Delivery Visitor' : 'Log Walk-In Visitor'}</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Visitor movement</Text>
            <LabeledInput label="Search" value={search} onChangeText={setSearch} placeholder="Search visitor, phone, flat, passcode..." />
            {filteredLogs.length ? filteredLogs.map((log) => (
              <View key={log.id} style={styles.listCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.identity}>
                    {log.visitor_photo_url ? (
                      <Image source={{ uri: log.visitor_photo_url.startsWith('http') ? log.visitor_photo_url : `${API_BASE_URL}${log.visitor_photo_url}` }} style={styles.thumb} />
                    ) : (
                      <View style={styles.thumbFallback}><Text style={styles.thumbFallbackText}>{log.visitor_name.charAt(0).toUpperCase()}</Text></View>
                    )}
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>{log.visitor_name}</Text>
                      <Text style={styles.itemMeta}>{log.visitor_phone} / {log.block_name}-{log.flat_number}</Text>
                    </View>
                  </View>
                  <Badge label={log.status} tone={log.status === 'CheckedIn' ? 'success' : log.status === 'Pending' ? 'warning' : 'info'} />
                </View>
                <Text style={styles.itemMeta}>{log.purpose} / {log.passcode || log.vehicle_number || 'Walk-in visitor'}</Text>
                <Text style={styles.itemMeta}>{formatDateTime(log.entry_time || log.expected_time || log.approval_requested_at)}</Text>
                <View style={styles.actionRow}>
                  {log.status === 'Approved' ? (
                    <Pressable style={[styles.smallButton, styles.primarySmall]} onPress={() => void onApprovedCheckIn(log.id)}>
                      <Text style={styles.smallButtonText}>Check In</Text>
                    </Pressable>
                  ) : null}
                  {log.status === 'CheckedIn' ? (
                    <Pressable style={[styles.smallButton, styles.successSmall]} onPress={() => void onCheckOut(log.id)}>
                      <Text style={styles.smallButtonText}>Check Out</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )) : (
              <EmptyState title="No matching visitor logs" detail="Try another search or log a fresh visitor entry." />
            )}
          </View>
        </>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Staff entry</Text>
          <LabeledInput label="Search staff" value={staffSearch} onChangeText={setStaffSearch} placeholder="Search staff name, phone, type..." />
          {filteredStaff.length ? filteredStaff.map((staff) => (
            <View key={staff.id} style={styles.listCard}>
              <View style={styles.rowBetween}>
                <View style={styles.identity}>
                  {staff.profile_photo_url ? (
                    <Image source={{ uri: staff.profile_photo_url.startsWith('http') ? staff.profile_photo_url : `${API_BASE_URL}${staff.profile_photo_url}` }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbFallback}><Text style={styles.thumbFallbackText}>{staff.name.charAt(0).toUpperCase()}</Text></View>
                  )}
                  <View style={styles.copy}>
                    <Text style={styles.itemTitle}>{staff.name}</Text>
                    <Text style={styles.itemMeta}>{staff.type} / {staff.phone}</Text>
                    <Text style={styles.itemMeta}>{staff.assignment_scope === 'SOCIETY' ? 'Society-wide staff' : staff.assigned_flats.map((flat) => flat.label).join(', ') || 'Flat-specific'}</Text>
                  </View>
                </View>
                <Badge label={staff.is_blacklisted ? 'Blocked' : staff.is_inside ? 'Inside' : 'Outside'} tone={staff.is_blacklisted ? 'danger' : staff.is_inside ? 'success' : 'info'} />
              </View>
              <Pressable onPress={() => void (staff.is_inside ? onStaffCheckOut(staff.id) : onStaffCheckIn(staff.id))} disabled={staff.is_blacklisted} style={[styles.submitButton, staff.is_blacklisted ? styles.disabled : staff.is_inside ? styles.darkButton : styles.greenButton]}>
                <Text style={styles.submitButtonText}>{staff.is_inside ? 'Mark Out' : 'Mark In'}</Text>
              </Pressable>
            </View>
          )) : (
            <EmptyState title="No staff found" detail="Try another search or add staff from the admin panel." />
          )}
        </View>
      )}
    </View>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, active ? styles.modeButtonActive : null]}>
      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  modeRow: { flexDirection: 'row', gap: 10, borderRadius: 18, backgroundColor: '#e6edf7', padding: 6 },
  modeButton: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  modeButtonActive: { backgroundColor: colors.secondary },
  modeButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  modeButtonTextActive: { color: colors.white },
  panelStrong: { borderRadius: 24, backgroundColor: colors.primary, padding: 18, gap: 12 },
  panelTitle: { color: colors.white, fontSize: 22, fontWeight: '900' },
  panelInput: { borderRadius: 18, backgroundColor: 'rgba(15,23,42,0.24)', color: colors.white, paddingHorizontal: 16, paddingVertical: 15, fontSize: 17, fontWeight: '700' },
  primaryAction: { borderRadius: 18, backgroundColor: colors.secondary, paddingVertical: 15, alignItems: 'center' },
  primaryActionText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  panel: { borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  inputGroup: { gap: 6 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10 },
  typeChipActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  typeChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  typeChipTextActive: { color: colors.primaryDeep },
  selectorWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectorChip: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10 },
  selectorChipActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  selectorChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  selectorChipTextActive: { color: colors.primaryDeep },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  photoCard: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', padding: 12 },
  photoPreview: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.border },
  photoCopy: { flex: 1, gap: 4 },
  photoTitle: { color: colors.primaryDeep, fontSize: 14, fontWeight: '800' },
  photoSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  secondaryAction: { borderRadius: 16, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', alignItems: 'center', paddingVertical: 13 },
  secondaryActionText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  submitButton: { borderRadius: 18, backgroundColor: colors.secondary, alignItems: 'center', paddingVertical: 15 },
  darkButton: { backgroundColor: colors.secondary },
  greenButton: { backgroundColor: colors.success },
  submitButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  listCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  identity: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  thumb: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.border },
  thumbFallback: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#dbe7ff', alignItems: 'center', justifyContent: 'center' },
  thumbFallbackText: { color: colors.primaryDeep, fontSize: 18, fontWeight: '900' },
  copy: { flex: 1, gap: 3 },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  itemMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  smallButton: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  primarySmall: { backgroundColor: colors.primary },
  successSmall: { backgroundColor: colors.success },
  smallButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
});
