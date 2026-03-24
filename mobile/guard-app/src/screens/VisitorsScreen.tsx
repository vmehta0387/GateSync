import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { API_BASE_URL } from '../config/env';
import { colors } from '../theme';
import { FlatOption, StaffMember, VisitorLog, WalkInPayload } from '../types/guard';
import { formatDateTime } from '../utils/format';
import { uploadVisitorPhoto } from '../services/guard';

const initialWalkIn: WalkInPayload = {
  name: '',
  phone_number: '',
  purpose: 'Guest',
  block_name: '',
  flat_number: '',
  delivery_company: '',
  vehicle_number: '',
};

const visitorTypeOptions: Array<WalkInPayload['purpose']> = ['Guest', 'Delivery', 'Cab', 'Service', 'Unknown'];

export function VisitorsScreen({
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
  const [activeSection, setActiveSection] = useState<'visitors' | 'staff'>('visitors');
  const [search, setSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [flatSearch, setFlatSearch] = useState('');
  const [passcode, setPasscode] = useState('');
  const [walkIn, setWalkIn] = useState(initialWalkIn);
  const [selectedDeliveryFlatIds, setSelectedDeliveryFlatIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState('');

  const blockOptions = useMemo(
    () => [...new Set(flatOptions.map((flat) => flat.block_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [flatOptions],
  );

  const flatsForSelectedBlock = useMemo(
    () => flatOptions.filter((flat) => flat.block_name === walkIn.block_name),
    [flatOptions, walkIn.block_name],
  );

  const filteredFlatsForSelectedBlock = useMemo(() => {
    const query = flatSearch.trim().toLowerCase();
    const filtered = query
      ? flatsForSelectedBlock.filter((flat) => flat.flat_number.toLowerCase().includes(query))
      : flatsForSelectedBlock;

    return filtered.slice(0, 20);
  }, [flatSearch, flatsForSelectedBlock]);

  const selectedDeliveryFlats = useMemo(
    () => selectedDeliveryFlatIds
      .map((flatId) => flatOptions.find((flat) => flat.id === flatId))
      .filter(Boolean) as FlatOption[],
    [flatOptions, selectedDeliveryFlatIds],
  );

  const requiresMultipleFlats = walkIn.purpose === 'Delivery';
  const hasFlatSelection = requiresMultipleFlats
    ? selectedDeliveryFlatIds.length > 0
    : Boolean(walkIn.block_name && walkIn.flat_number);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return logs;
    }

    return logs.filter((log) => [
      log.visitor_name,
      log.visitor_phone,
      log.block_name,
      log.flat_number,
      log.passcode || '',
      log.status,
    ].join(' ').toLowerCase().includes(query));
  }, [logs, search]);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) {
      return staffList;
    }

    return staffList.filter((staff) =>
      [
        staff.name,
        staff.phone,
        staff.type,
        staff.assignment_scope === 'SOCIETY' ? 'Society-wide' : staff.assigned_flats.map((flat) => flat.label).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [staffList, staffSearch]);

  const handlePasscode = async () => {
    setBusy(true);
    await onPasscodeCheckIn(passcode.trim().toUpperCase());
    setPasscode('');
    setBusy(false);
  };

  const handleWalkIn = async () => {
    const primaryFlat = requiresMultipleFlats
      ? selectedDeliveryFlats[0]
      : null;

    setBusy(true);
    await onWalkInSubmit({
      ...walkIn,
      block_name: requiresMultipleFlats ? primaryFlat?.block_name || walkIn.block_name : walkIn.block_name,
      flat_number: requiresMultipleFlats ? primaryFlat?.flat_number || walkIn.flat_number : walkIn.flat_number,
      flat_ids: requiresMultipleFlats ? selectedDeliveryFlatIds : undefined,
      phone_number: walkIn.phone_number.replace(/\D/g, '').slice(0, 10),
      vehicle_number: walkIn.vehicle_number?.toUpperCase(),
    });
    setWalkIn(initialWalkIn);
    setSelectedDeliveryFlatIds([]);
    setFlatSearch('');
    setShowOptionalDetails(false);
    setVisitorPhotoPreview('');
    setBusy(false);
  };

  const handleCaptureVisitorPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to capture visitor photos.');
      return;
    }

    setCapturingPhoto(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.6,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      const uploadResult = await uploadVisitorPhoto({
        uri: asset.uri,
        name: asset.fileName || `visitor-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });

      if (!uploadResult.success || !uploadResult.file?.file_path) {
        Alert.alert('Upload failed', uploadResult.message || 'Unable to save visitor photo.');
        return;
      }

      setWalkIn((current) => ({
        ...current,
        visitor_photo_url: uploadResult.file?.file_path || '',
      }));
      setVisitorPhotoPreview(uploadResult.file.url || asset.uri);
    } finally {
      setCapturingPhoto(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.statsRow}>
        <StatCard label="Awaiting arrival" value={approvedArrivals.length} tone="primary" />
        <StatCard label="Inside campus" value={activeVisitors.length} />
        <StatCard label="Staff inside" value={staffList.filter((staff) => staff.is_inside).length} />
      </View>

      <View style={styles.sectionSwitcher}>
        <Pressable
          onPress={() => setActiveSection('visitors')}
          style={[styles.sectionSwitchButton, activeSection === 'visitors' ? styles.sectionSwitchButtonActive : null]}
        >
          <Text style={[styles.sectionSwitchText, activeSection === 'visitors' ? styles.sectionSwitchTextActive : null]}>Visitor Entry</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveSection('staff')}
          style={[styles.sectionSwitchButton, activeSection === 'staff' ? styles.sectionSwitchButtonActive : null]}
        >
          <Text style={[styles.sectionSwitchText, activeSection === 'staff' ? styles.sectionSwitchTextActive : null]}>Staff Entry</Text>
        </Pressable>
      </View>

      {activeSection === 'visitors' ? (
        <>
      <View style={styles.panelStrong}>
        <Text style={styles.panelTitle}>Passcode check-in</Text>
        <Text style={styles.panelSubtitle}>Enter resident-issued passcode and allow instant entry.</Text>
        <TextInput
          value={passcode}
          onChangeText={setPasscode}
          autoCapitalize="characters"
          placeholder="GP000123"
          placeholderTextColor="rgba(255,255,255,0.6)"
          style={styles.panelInput}
        />
        <Pressable
          onPress={() => void handlePasscode()}
          disabled={busy || !passcode.trim()}
          style={[styles.primaryAction, (!passcode.trim() || busy) ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryActionText}>Check In With Passcode</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>New walk-in visitor</Text>

        <Text style={styles.fieldLabel}>Choose visitor type</Text>
        <View style={styles.typeGrid}>
          {visitorTypeOptions.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                setWalkIn((current) => ({
                  ...current,
                  purpose: option,
                  flat_number: option === 'Delivery' ? '' : current.flat_number,
                }));
                if (option !== 'Delivery') {
                  setSelectedDeliveryFlatIds([]);
                }
              }}
              style={[styles.typeCard, walkIn.purpose === option ? styles.activeTypeCard : null]}
            >
              <Text style={[styles.typeCardTitle, walkIn.purpose === option ? styles.activeTypeCardTitle : null]}>
                {option}
              </Text>
              <Text style={[styles.typeCardHint, walkIn.purpose === option ? styles.activeTypeCardHint : null]}>
                {option === 'Delivery' ? 'Courier or food drop' : option === 'Service' ? 'Worker visit' : option === 'Cab' ? 'Pickup or drop' : option === 'Unknown' ? 'Verify carefully' : 'Friends or family'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Visitor name</Text>
        <TextInput
          value={walkIn.name}
          onChangeText={(value) => setWalkIn((current) => ({ ...current, name: value }))}
          placeholder="Example: Ramesh Kumar"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Mobile number</Text>
        <TextInput
          value={walkIn.phone_number}
          onChangeText={(value) => setWalkIn((current) => ({ ...current, phone_number: value.replace(/\D/g, '') }))}
          placeholder="10-digit mobile number"
          keyboardType="number-pad"
          maxLength={10}
          placeholderTextColor={colors.textMuted}
          style={styles.inputLarge}
        />

        <Text style={styles.fieldLabel}>Visitor photo</Text>
        {visitorPhotoPreview ? (
          <View style={styles.photoCard}>
            <Image source={{ uri: visitorPhotoPreview.startsWith('http') ? visitorPhotoPreview : `${API_BASE_URL}${walkIn.visitor_photo_url || ''}` }} style={styles.photoPreview} />
            <View style={styles.photoCopy}>
              <Text style={styles.photoTitle}>Photo captured</Text>
              <Text style={styles.photoSubtitle}>Retake if face is not clear.</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.photoActions}>
          <Pressable
            onPress={() => void handleCaptureVisitorPhoto()}
            disabled={capturingPhoto}
            style={[styles.photoButton, capturingPhoto ? styles.disabledButton : null]}
          >
            <Text style={styles.photoButtonText}>
              {capturingPhoto ? 'Opening camera...' : visitorPhotoPreview ? 'Retake Photo' : 'Take Visitor Photo'}
            </Text>
          </Pressable>
          {visitorPhotoPreview ? (
            <Pressable
              onPress={() => {
                setVisitorPhotoPreview('');
                setWalkIn((current) => ({ ...current, visitor_photo_url: '' }));
              }}
              style={styles.clearPhotoButton}
            >
              <Text style={styles.clearPhotoButtonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.fieldLabel}>Tower or block</Text>
        {blockOptions.length ? (
          <View style={styles.selectorWrap}>
            {blockOptions.map((blockName) => (
              <Pressable
                key={blockName}
                onPress={() =>
                  setWalkIn((current) => ({
                    ...current,
                    block_name: blockName,
                    flat_number: current.block_name === blockName ? current.flat_number : '',
                  }))
                }
                onPressIn={() => {
                  if (walkIn.block_name !== blockName) {
                    setFlatSearch('');
                  }
                }}
                style={[styles.selectorChip, walkIn.block_name === blockName ? styles.selectorChipActive : null]}
              >
                <Text style={[styles.selectorChipText, walkIn.block_name === blockName ? styles.selectorChipTextActive : null]}>
                  {blockName}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <TextInput
            value={walkIn.block_name}
            onChangeText={(value) => setWalkIn((current) => ({ ...current, block_name: value }))}
            placeholder="Example: T6 or A"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        )}

        <Text style={styles.fieldLabel}>Flat number</Text>
        {flatsForSelectedBlock.length ? (
          <View style={styles.inlineSelectorPanel}>
            <TextInput
              value={flatSearch}
              onChangeText={setFlatSearch}
              placeholder="Search flat number"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            {requiresMultipleFlats ? (
              <>
                {selectedDeliveryFlats.length ? (
                  <View style={styles.selectedMultiWrap}>
                    <Text style={styles.selectedLabel}>Selected flats</Text>
                    <View style={styles.selectorWrap}>
                      {selectedDeliveryFlats.map((flat) => (
                        <Pressable
                          key={flat.id}
                          onPress={() => {
                            setSelectedDeliveryFlatIds((current) => current.filter((id) => id !== flat.id));
                          }}
                          style={styles.selectedValuePill}
                        >
                          <Text style={styles.selectedValueText}>
                            {flat.block_name}-{flat.flat_number}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <Text style={styles.helperText}>Tap each flat that the delivery person needs to visit.</Text>
              </>
            ) : walkIn.flat_number ? (
              <View style={styles.selectedRow}>
                <Text style={styles.selectedLabel}>Selected flat</Text>
                <Pressable
                  onPress={() => {
                    setWalkIn((current) => ({ ...current, flat_number: '' }));
                    setFlatSearch('');
                  }}
                  style={styles.selectedValuePill}
                >
                  <Text style={styles.selectedValueText}>{walkIn.flat_number}</Text>
                </Pressable>
              </View>
            ) : null}
            <ScrollView style={styles.flatListScroll} nestedScrollEnabled>
              <View style={styles.selectorWrap}>
                {filteredFlatsForSelectedBlock.map((flat) => (
                  <Pressable
                    key={flat.id}
                    onPress={() => {
                      if (requiresMultipleFlats) {
                        setSelectedDeliveryFlatIds((current) =>
                          current.includes(flat.id)
                            ? current.filter((id) => id !== flat.id)
                            : [...current, flat.id],
                        );
                        setFlatSearch('');
                        return;
                      }

                      setWalkIn((current) => ({ ...current, flat_number: flat.flat_number }));
                      setFlatSearch(flat.flat_number);
                    }}
                    style={[
                      styles.selectorChip,
                      requiresMultipleFlats
                        ? selectedDeliveryFlatIds.includes(flat.id)
                          ? styles.selectorChipActive
                          : null
                        : walkIn.flat_number === flat.flat_number
                          ? styles.selectorChipActive
                          : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectorChipText,
                        requiresMultipleFlats
                          ? selectedDeliveryFlatIds.includes(flat.id)
                            ? styles.selectorChipTextActive
                            : null
                          : walkIn.flat_number === flat.flat_number
                            ? styles.selectorChipTextActive
                            : null,
                      ]}
                    >
                      {flat.flat_number}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {!filteredFlatsForSelectedBlock.length ? (
              <Text style={styles.helperText}>No flats matched this search in {walkIn.block_name}.</Text>
            ) : flatsForSelectedBlock.length > filteredFlatsForSelectedBlock.length ? (
              <Text style={styles.helperText}>Showing first {filteredFlatsForSelectedBlock.length} matches. Refine search to narrow more.</Text>
            ) : null}
          </View>
        ) : (
          <TextInput
            value={walkIn.flat_number}
            onChangeText={(value) => setWalkIn((current) => ({ ...current, flat_number: value }))}
            placeholder="Example: 1403"
            placeholderTextColor={colors.textMuted}
            style={styles.inputLarge}
          />
        )}

        <Pressable
          onPress={() => setShowOptionalDetails((current) => !current)}
          style={styles.optionalToggle}
        >
          <Text style={styles.optionalToggleText}>
            {showOptionalDetails ? 'Hide extra details' : 'Add vehicle or delivery details'}
          </Text>
        </Pressable>

        {showOptionalDetails ? (
          <View style={styles.optionalPanel}>
            <Text style={styles.fieldLabel}>Vehicle number</Text>
            <TextInput
              value={walkIn.vehicle_number || ''}
              onChangeText={(value) => setWalkIn((current) => ({ ...current, vehicle_number: value }))}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            {walkIn.purpose === 'Delivery' ? (
              <>
                <Text style={styles.fieldLabel}>Delivery company</Text>
                <TextInput
                  value={walkIn.delivery_company || ''}
                  onChangeText={(value) => setWalkIn((current) => ({ ...current, delivery_company: value }))}
                  placeholder="Amazon, Swiggy, Blinkit..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </>
            ) : null}
          </View>
        ) : null}
        <Pressable
          onPress={() => void handleWalkIn()}
          disabled={busy || !walkIn.name || walkIn.phone_number.length !== 10 || !hasFlatSelection}
          style={[
            styles.submitButton,
            (busy || !walkIn.name || walkIn.phone_number.length !== 10 || !hasFlatSelection)
              ? styles.disabledButton
              : null,
          ]}
        >
          <Text style={styles.submitButtonText}>
            {walkIn.purpose === 'Delivery' ? 'Log Delivery Visitor' : 'Log Walk-In Visitor'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Visitor movement</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search visitor, flat, phone, passcode..."
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <View style={styles.list}>
          {filteredLogs.length ? filteredLogs.map((log) => (
            <View key={log.id} style={styles.listCard}>
              <View style={styles.listHeader}>
                <View style={styles.visitorIdentity}>
                  {log.visitor_photo_url ? (
                    <Image
                      source={{ uri: log.visitor_photo_url.startsWith('http') ? log.visitor_photo_url : `${API_BASE_URL}${log.visitor_photo_url}` }}
                      style={styles.listPhoto}
                    />
                  ) : (
                    <View style={styles.listPhotoFallback}>
                      <Text style={styles.listPhotoFallbackText}>{log.visitor_name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.listCopy}>
                    <Text style={styles.listTitle}>{log.visitor_name}</Text>
                    <Text style={styles.listMeta}>{log.visitor_phone} / {log.block_name}-{log.flat_number}</Text>
                  </View>
                </View>
                <Badge
                  label={log.status}
                  tone={log.status === 'CheckedIn' ? 'success' : log.status === 'Pending' ? 'warning' : 'info'}
                />
              </View>
              <Text style={styles.listDetail}>{log.purpose} / {log.passcode || log.vehicle_number || 'Walk-in visitor'}</Text>
              <Text style={styles.listDetail}>{formatDateTime(log.entry_time || log.expected_time || log.approval_requested_at)}</Text>
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
                {log.status === 'Pending' ? <Text style={styles.pendingText}>Waiting for resident approval</Text> : null}
              </View>
            </View>
          )) : (
            <EmptyState title="No matching visitor logs" detail="Try a different search or start a fresh walk-in entry." />
          )}
        </View>
      </View>
        </>
      ) : null}

      {activeSection === 'staff' ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Staff entry</Text>
          <Text style={styles.sectionSubtitle}>Search staff and tap once to mark in or out.</Text>
          <TextInput
            value={staffSearch}
            onChangeText={setStaffSearch}
            placeholder="Search staff name, phone, type..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <View style={styles.staffList}>
            {filteredStaff.length ? filteredStaff.map((staff) => (
              <View key={staff.id} style={styles.staffCard}>
                <View style={styles.staffIdentity}>
                  {staff.profile_photo_url ? (
                    <Image
                      source={{ uri: staff.profile_photo_url.startsWith('http') ? staff.profile_photo_url : `${API_BASE_URL}${staff.profile_photo_url}` }}
                      style={styles.staffPhoto}
                    />
                  ) : (
                    <View style={styles.staffPhotoFallback}>
                      <Text style={styles.staffPhotoFallbackText}>{staff.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.staffCopy}>
                    <Text style={styles.staffName}>{staff.name}</Text>
                    <Text style={styles.staffMeta}>{staff.type} / {staff.phone}</Text>
                    <Text style={styles.staffMeta}>
                      {staff.assignment_scope === 'SOCIETY'
                        ? 'Society-wide staff'
                        : staff.assigned_flats.map((flat) => flat.label).join(', ') || 'Flat-specific'}
                    </Text>
                    {staff.is_blacklisted ? (
                      <Text style={styles.staffBlockedText}>Blocked: {staff.blacklist_reason || 'Blacklisted'}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.staffActions}>
                  <Badge
                    label={staff.is_inside ? 'Inside' : staff.is_blacklisted ? 'Blocked' : 'Outside'}
                    tone={staff.is_blacklisted ? 'danger' : staff.is_inside ? 'success' : 'info'}
                  />
                  <Pressable
                    onPress={() => void (staff.is_inside ? onStaffCheckOut(staff.id) : onStaffCheckIn(staff.id))}
                    disabled={staff.is_blacklisted}
                    style={[
                      styles.staffActionButton,
                      staff.is_inside ? styles.staffOutButton : styles.staffInButton,
                      staff.is_blacklisted ? styles.disabledButton : null,
                    ]}
                  >
                    <Text style={styles.staffActionButtonText}>{staff.is_inside ? 'Mark Out' : 'Mark In'}</Text>
                  </Pressable>
                </View>
              </View>
            )) : (
              <EmptyState title="No staff found" detail="Try another search or add staff from the admin panel." />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionSwitcher: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#e6edf7',
    padding: 6,
  },
  sectionSwitchButton: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sectionSwitchButtonActive: {
    backgroundColor: colors.secondary,
  },
  sectionSwitchText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionSwitchTextActive: {
    color: colors.white,
  },
  panelStrong: {
    borderRadius: 24,
    backgroundColor: colors.primary,
    padding: 18,
    gap: 12,
  },
  panelTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  panelSubtitle: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 13,
    lineHeight: 18,
  },
  panelInput: {
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.24)',
    color: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    fontWeight: '700',
  },
  primaryAction: {
    borderRadius: 18,
    backgroundColor: colors.secondary,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  panel: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surfaceMuted,
  },
  activeTypeCard: {
    backgroundColor: '#e7efff',
    borderColor: '#bfd3ff',
  },
  typeCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  activeTypeCardTitle: {
    color: colors.primaryDeep,
  },
  typeCardHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  activeTypeCardHint: {
    color: colors.primaryDeep,
  },
  inputLarge: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '700',
  },
  selectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inlineSelectorPanel: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
  },
  selectorChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectorChipActive: {
    backgroundColor: '#e7efff',
    borderColor: '#bfd3ff',
  },
  selectorChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  selectorChipTextActive: {
    color: colors.primaryDeep,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectedMultiWrap: {
    gap: 8,
  },
  selectedLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedValuePill: {
    borderRadius: 999,
    backgroundColor: '#e7efff',
    borderWidth: 1,
    borderColor: '#bfd3ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedValueText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  flatListScroll: {
    maxHeight: 170,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  photoCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bfd3ff',
    backgroundColor: '#eef4ff',
    padding: 12,
  },
  photoPreview: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: colors.border,
  },
  photoCopy: {
    flex: 1,
    gap: 4,
  },
  photoTitle: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  photoSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  photoButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#0f5ae0',
    paddingVertical: 14,
    alignItems: 'center',
  },
  photoButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  clearPhotoButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0b3b3',
    backgroundColor: '#fff3f3',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  clearPhotoButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  optionalToggle: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfd3ff',
    backgroundColor: '#eef4ff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionalToggleText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  optionalPanel: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#f7faff',
    borderWidth: 1,
    borderColor: '#dbe7ff',
    padding: 14,
  },
  submitButton: {
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: 15,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  list: {
    gap: 10,
  },
  staffList: {
    gap: 10,
  },
  staffCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 12,
  },
  staffIdentity: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  staffPhoto: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.border,
  },
  staffPhotoFallback: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#dbe7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffPhotoFallbackText: {
    color: colors.primaryDeep,
    fontSize: 20,
    fontWeight: '900',
  },
  staffCopy: {
    flex: 1,
    gap: 4,
  },
  staffName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  staffMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  staffBlockedText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  staffActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  staffActionButton: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 104,
    alignItems: 'center',
  },
  staffInButton: {
    backgroundColor: colors.success,
  },
  staffOutButton: {
    backgroundColor: colors.secondary,
  },
  staffActionButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  listCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  visitorIdentity: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  listPhoto: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.border,
  },
  listPhotoFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#dbe7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listPhotoFallbackText: {
    color: colors.primaryDeep,
    fontSize: 18,
    fontWeight: '900',
  },
  listCopy: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  listMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  listDetail: {
    color: colors.textMuted,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  smallButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primarySmall: {
    backgroundColor: colors.primary,
  },
  successSmall: {
    backgroundColor: colors.success,
  },
  smallButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  pendingText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
});
