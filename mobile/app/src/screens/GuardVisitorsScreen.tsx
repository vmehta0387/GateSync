import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { API_BASE_URL } from '../config/env';
import { getSpeechRecognitionLib } from '../lib/speechRecognition';
import { uploadVisitorPhoto } from '../services/guard';
import { colors } from '../theme';
import { FlatOption, StaffMember, VisitorLog, WalkInPayload } from '../types/guard';
import { formatDateTime, formatDayLabel, getDateKey, toValidDate } from '../utils/format';

const visitorTypes: Array<WalkInPayload['purpose']> = ['Guest', 'Delivery', 'Cab', 'Service', 'Unknown'];
const getVisitorTypeLabel = (value: WalkInPayload['purpose']) => value === 'Unknown' ? 'Other' : value;
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
  const [historyTab, setHistoryTab] = useState<'today' | 'past'>('today');
  const [visiblePastDayCount, setVisiblePastDayCount] = useState(2);
  const [mode, setMode] = useState<'visitors' | 'staff'>('visitors');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [insideSearch, setInsideSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [flatSearch, setFlatSearch] = useState('');
  const [walkIn, setWalkIn] = useState(initialWalkIn);
  const [selectedDeliveryFlatIds, setSelectedDeliveryFlatIds] = useState<number[]>([]);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isListeningForName, setIsListeningForName] = useState(false);

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

  const sortedMovementLogs = useMemo(
    () => [...filteredLogs].sort((a, b) => {
      const aTime = toValidDate(a.entry_time || a.expected_time || a.approval_requested_at)?.getTime() || 0;
      const bTime = toValidDate(b.entry_time || b.expected_time || b.approval_requested_at)?.getTime() || 0;
      return bTime - aTime;
    }),
    [filteredLogs],
  );

  const todayKey = useMemo(() => getDateKey(new Date().toISOString()), []);

  const todayLogs = useMemo(
    () => sortedMovementLogs.filter((log) => getDateKey(log.entry_time || log.expected_time || log.approval_requested_at) === todayKey),
    [sortedMovementLogs, todayKey],
  );

  const pastDayKeys = useMemo(() => {
    const keys: string[] = [];
    sortedMovementLogs.forEach((log) => {
      const dateKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
      if (!dateKey || dateKey === todayKey || keys.includes(dateKey)) return;
      keys.push(dateKey);
    });
    return keys;
  }, [sortedMovementLogs, todayKey]);

  const visiblePastDayKeys = useMemo(() => pastDayKeys.slice(0, visiblePastDayCount), [pastDayKeys, visiblePastDayCount]);

  const pastLogs = useMemo(
    () => sortedMovementLogs.filter((log) => {
      const dateKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
      return Boolean(dateKey && visiblePastDayKeys.includes(dateKey));
    }),
    [sortedMovementLogs, visiblePastDayKeys],
  );

  const hasMorePastLogs = visiblePastDayKeys.length < pastDayKeys.length;

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

  const insideVisitorsSorted = useMemo(
    () => [...activeVisitors].sort((a, b) => {
      const aTime = a.entry_time ? new Date(a.entry_time).getTime() : 0;
      const bTime = b.entry_time ? new Date(b.entry_time).getTime() : 0;
      return bTime - aTime;
    }),
    [activeVisitors],
  );

  const filteredInsideVisitors = useMemo(() => {
    const query = insideSearch.trim().toLowerCase();
    if (!query) return insideVisitorsSorted;
    return insideVisitorsSorted.filter((log) =>
      [log.visitor_name, log.visitor_phone, log.block_name, log.flat_number, log.purpose, log.passcode || '', log.vehicle_number || '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [insideSearch, insideVisitorsSorted]);

  const [visibleInsideCount, setVisibleInsideCount] = useState(8);
  const visibleInsideVisitors = useMemo(
    () => filteredInsideVisitors.slice(0, visibleInsideCount),
    [filteredInsideVisitors, visibleInsideCount],
  );
  const hasMoreInsideVisitors = visibleInsideVisitors.length < filteredInsideVisitors.length;

  useEffect(() => {
    setVisiblePastDayCount(2);
  }, [search, logs]);

  useEffect(() => {
    setVisibleInsideCount(8);
  }, [insideSearch, activeVisitors]);

  useEffect(() => {
    const speechLib = getSpeechRecognitionLib();
    const speechModule = speechLib?.ExpoSpeechRecognitionModule;
    if (!speechModule) {
      return undefined;
    }

    const startListener = speechModule.addListener('start', () => {
      setIsListeningForName(true);
    });
    const endListener = speechModule.addListener('end', () => {
      setIsListeningForName(false);
    });
    const resultListener = speechModule.addListener('result', (event: { results?: Array<{ transcript?: string }> }) => {
      const transcript = event.results?.[0]?.transcript?.trim();
      if (!transcript) return;

      const normalizedName = transcript
        .replace(/[^A-Za-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!normalizedName) return;

      setWalkIn((current) => ({ ...current, name: normalizedName }));
    });
    const errorListener = speechModule.addListener('error', (event: { message?: string }) => {
      setIsListeningForName(false);
      if (event?.message) {
        Alert.alert('Voice input unavailable', event.message);
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
    };
  }, []);

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access to scan QR visitor passes.');
        return;
      }
    }

    setScannerOpen(true);
  };

  const handleQrScan = async ({ data }: { data: string }) => {
    if (busy) return;

    let scannedPasscode = String(data || '').trim();
    if (!scannedPasscode) {
      return;
    }

    if (scannedPasscode.startsWith('GATESYNC-PASS:')) {
      scannedPasscode = scannedPasscode.replace('GATESYNC-PASS:', '').trim();
    }

    if (!scannedPasscode) {
      Alert.alert('Invalid QR', 'This QR code does not contain a valid visitor pass.');
      return;
    }

    setScannerOpen(false);
    setBusy(true);
    await onPasscodeCheckIn(scannedPasscode.toUpperCase());
    setPasscode('');
    setBusy(false);
  };

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

  const handleVoiceNameInput = async () => {
    const speechLib = getSpeechRecognitionLib();
    const speechModule = speechLib?.ExpoSpeechRecognitionModule;

    if (!speechModule) {
      Alert.alert('Voice input needs a development build', 'Speech-to-text is not available in Expo Go. Use a development build to test guard voice entry.');
      return;
    }

    if (isListeningForName) {
      speechModule.stop();
      return;
    }

    const permission = await speechModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone permission needed', 'Allow microphone and speech recognition access to fill visitor names using voice.');
      return;
    }

    speechModule.start({
      lang: 'en-IN',
      interimResults: false,
      continuous: false,
      maxAlternatives: 1,
      iosTaskHint: 'confirmation',
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'web_search',
      },
    });
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
            <Pressable onPress={() => void openScanner()} style={styles.scanAction}>
              <Text style={styles.scanActionText}>{scannerOpen ? 'Scanner Open' : 'Scan QR Pass'}</Text>
            </Pressable>
            {scannerOpen ? (
              <View style={styles.scannerWrap}>
                <CameraView
                  style={styles.scanner}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={busy ? undefined : handleQrScan}
                />
                <View style={styles.scannerHintBar}>
                  <Text style={styles.scannerHintText}>Align the visitor QR inside the frame.</Text>
                  <Pressable onPress={() => setScannerOpen(false)} style={styles.closeScannerButton}>
                    <Text style={styles.closeScannerButtonText}>Close</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
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
                  <Text style={[styles.typeChipText, walkIn.purpose === type ? styles.typeChipTextActive : null]}>{getVisitorTypeLabel(type)}</Text>
                </Pressable>
              ))}
            </View>

            <LabeledInput
              label="Visitor name"
              value={walkIn.name}
              onChangeText={(value) => setWalkIn((current) => ({ ...current, name: value }))}
              placeholder="Visitor name"
              trailingAction={{
                label: isListeningForName ? '●' : '🎤',
                onPress: () => void handleVoiceNameInput(),
                active: isListeningForName,
              }}
            />
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
            <Text style={styles.sectionTitle}>Currently inside</Text>
            <LabeledInput label="Search inside visitors" value={insideSearch} onChangeText={setInsideSearch} placeholder="Search name, phone, flat, vehicle..." />
            {visibleInsideVisitors.length ? visibleInsideVisitors.map((log) => (
              <View key={`inside-${log.id}`} style={styles.listCard}>
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
                      <Text style={styles.itemMeta}>Entered {formatDateTime(log.entry_time)}</Text>
                    </View>
                  </View>
                  <Badge label="Inside" tone="success" />
                </View>
                <Pressable style={[styles.submitButton, styles.successButton]} onPress={() => void onCheckOut(log.id)}>
                  <Text style={styles.submitButtonText}>Check Out</Text>
                </Pressable>
              </View>
            )) : (
              <EmptyState title="No visitors inside" detail="Checked-in visitors will show here with a direct checkout action." />
            )}
            {hasMoreInsideVisitors ? (
              <Pressable style={styles.loadMoreButton} onPress={() => setVisibleInsideCount((current) => current + 8)}>
                <Text style={styles.loadMoreButtonText}>Load 8 more inside visitors</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Visitor movement</Text>
            <LabeledInput label="Search" value={search} onChangeText={setSearch} placeholder="Search visitor, phone, flat, passcode..." />
            <View style={styles.historyTabRow}>
              <HistoryTabButton active={historyTab === 'today'} label={`Today (${todayLogs.length})`} onPress={() => setHistoryTab('today')} />
              <HistoryTabButton active={historyTab === 'past'} label={`Past (${pastDayKeys.length} days)`} onPress={() => setHistoryTab('past')} />
            </View>
            {(historyTab === 'today' ? todayLogs : pastLogs).length ? (historyTab === 'today' ? todayLogs : pastLogs).map((log, index, currentLogs) => (
              <View key={log.id} style={styles.listCard}>
                {historyTab === 'past' && (() => {
                  const currentKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
                  const previousKey = index > 0 ? getDateKey(currentLogs[index - 1].entry_time || currentLogs[index - 1].expected_time || currentLogs[index - 1].approval_requested_at) : null;
                  if (!currentKey || currentKey === previousKey) return null;
                  return <Text style={styles.dayLabel}>{formatDayLabel(log.entry_time || log.expected_time || log.approval_requested_at)}</Text>;
                })()}
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
                  {log.status === 'Approved' && (log.entry_method === 'PreApproved' || Boolean(log.passcode)) ? (
                    <Pressable style={[styles.smallButton, styles.primarySmall]} onPress={() => void onApprovedCheckIn(log.id)}>
                      <Text style={styles.smallButtonText}>Check In</Text>
                    </Pressable>
                  ) : null}
                  {log.status === 'CheckedIn' || (Boolean(log.entry_time) && !log.exit_time) ? (
                    <Pressable style={[styles.smallButton, styles.successSmall]} onPress={() => void onCheckOut(log.id)}>
                      <Text style={styles.smallButtonText}>Check Out</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )) : (
              <EmptyState title={historyTab === 'today' ? 'No visitor movement today' : 'No past visitor movement'} detail={historyTab === 'today' ? 'Today’s gate activity will show up here.' : 'Older visitor activity will show up here in 2-day batches.'} />
            )}
            {historyTab === 'past' && hasMorePastLogs ? (
              <Pressable style={styles.loadMoreButton} onPress={() => setVisiblePastDayCount((current) => current + 2)}>
                <Text style={styles.loadMoreButtonText}>Load older 2 days</Text>
              </Pressable>
            ) : null}
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

function HistoryTabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.historyTabButton, active ? styles.historyTabButtonActive : null]}>
      <Text style={[styles.historyTabButtonText, active ? styles.historyTabButtonTextActive : null]}>{label}</Text>
    </Pressable>
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
  trailingAction,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
  trailingAction?: {
    label: string;
    onPress: () => void;
    active?: boolean;
  };
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWithAction}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          maxLength={maxLength}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, trailingAction ? styles.inputWithActionField : null]}
        />
        {trailingAction ? (
          <Pressable onPress={trailingAction.onPress} style={[styles.inlineActionButton, trailingAction.active ? styles.inlineActionButtonActive : null]}>
            <Text style={[styles.inlineActionButtonText, trailingAction.active ? styles.inlineActionButtonTextActive : null]}>{trailingAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
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
  scanAction: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 13, alignItems: 'center' },
  scanActionText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  scannerWrap: { overflow: 'hidden', borderRadius: 20, backgroundColor: 'rgba(15,23,42,0.35)', gap: 0 },
  scanner: { width: '100%', height: 260, backgroundColor: '#0f172a' },
  scannerHintBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 12 },
  scannerHintText: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  closeScannerButton: { borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 8 },
  closeScannerButtonText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  panel: { borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  inputGroup: { gap: 6 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  inputWithAction: { position: 'relative', justifyContent: 'center' },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  inputWithActionField: { paddingRight: 74 },
  inlineActionButton: { position: 'absolute', right: 8, width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: '#cfe0ff', backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center' },
  inlineActionButtonActive: { borderColor: '#7aa2ff', backgroundColor: '#dbe7ff' },
  inlineActionButtonText: { color: colors.primaryDeep, fontSize: 18, fontWeight: '800' },
  inlineActionButtonTextActive: { color: colors.primaryDeep },
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
  historyTabRow: { flexDirection: 'row', gap: 8 },
  historyTabButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  historyTabButtonActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  historyTabButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  historyTabButtonTextActive: { color: colors.primaryDeep },
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
  successButton: { backgroundColor: colors.success },
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
  dayLabel: { color: colors.primaryDeep, fontSize: 12, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  smallButton: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  primarySmall: { backgroundColor: colors.primary },
  successSmall: { backgroundColor: colors.success },
  smallButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  loadMoreButton: { borderRadius: 16, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', alignItems: 'center', paddingVertical: 12 },
  loadMoreButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
});
