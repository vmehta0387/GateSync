import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { API_BASE_URL } from '../config/env';
import { subscribeToResidentComplaintUpdates } from '../lib/socket';
import { useSession } from '../providers/SessionProvider';
import {
  addComplaintMessage,
  closeComplaint,
  createComplaint,
  fetchComplaintCategories,
  fetchComplaintDetail,
  fetchComplaints,
  fetchResidentFlats,
  uploadComplaintAttachment,
} from '../services/resident';
import { colors } from '../theme';
import { ComplaintCategory, ComplaintDetail, ComplaintSummaryItem, ResidentFlat } from '../types/resident';
import { formatDateTime } from '../utils/format';

export function ResidentComplaintsScreen() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flats, setFlats] = useState<ResidentFlat[]>([]);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [complaints, setComplaints] = useState<ComplaintSummaryItem[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [form, setForm] = useState({
    flat_id: '',
    category_id: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    description: '',
    attachments: [] as Array<{ file_name?: string; file_path: string; url?: string }>,
  });
  const [message, setMessage] = useState('');
  const [closingReason, setClosingReason] = useState('');
  const [selectedMessageEntry, setSelectedMessageEntry] = useState<ComplaintDetail['messages'][number] | null>(null);

  const closeTicketDetail = useCallback(() => {
    setSelectedComplaintId(null);
    setDetail(null);
    setMessage('');
    setClosingReason('');
  }, []);

  const loadBase = useCallback(async () => {
    setRefreshing(true);
    const [flatsRes, categoriesRes, complaintsRes] = await Promise.all([
      fetchResidentFlats(),
      fetchComplaintCategories(),
      fetchComplaints(),
    ]);

    if (flatsRes.success) {
      const nextFlats = flatsRes.flats || [];
      setFlats(nextFlats);
      setForm((current) => ({ ...current, flat_id: current.flat_id || (nextFlats[0] ? String(nextFlats[0].flat_id) : '') }));
    }
    if (categoriesRes.success) {
      const nextCategories = categoriesRes.categories || [];
      setCategories(nextCategories);
      setForm((current) => ({ ...current, category_id: current.category_id || (nextCategories[0] ? String(nextCategories[0].id) : '') }));
    }
    if (complaintsRes.success) {
      const nextComplaints = complaintsRes.complaints || [];
      setComplaints(nextComplaints);
    }
    setRefreshing(false);
  }, []);

  const loadDetail = useCallback(async (complaintId: number) => {
    const response = await fetchComplaintDetail(complaintId);
    if (response.success) {
      setDetail({
        complaint: response.complaint,
        assignees: response.assignees,
        messages: response.messages,
        history: response.history,
        recurring_count: response.recurring_count,
      });
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedComplaintId) {
      setDetail(null);
      return;
    }

    void loadDetail(selectedComplaintId);
  }, [loadDetail, selectedComplaintId]);

  useEffect(() => {
    if (!session?.user?.id) {
      return undefined;
    }

    return subscribeToResidentComplaintUpdates([`resident_${session.user.id}`], () => {
      void loadBase();
      if (selectedComplaintId) {
        void loadDetail(selectedComplaintId);
      }
    });
  }, [loadBase, loadDetail, selectedComplaintId, session?.user?.id]);

  const visibleComplaints = useMemo(() => complaints.slice(0, 20), [complaints]);

  const closeSelectedComplaint = async () => {
    if (!detail) {
      return;
    }

    const response = await closeComplaint(detail.complaint.id, { note: closingReason.trim() || undefined });
    if (!response.success) {
      Alert.alert('Unable to close ticket', response.message || 'Please try again.');
      return;
    }

    setClosingReason('');
    await loadBase();
    await loadDetail(detail.complaint.id);
  };

  const attachImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow photo library access to attach issue proof.');
      return;
    }

    setUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      const response = await uploadComplaintAttachment({
        uri: asset.uri,
        name: asset.fileName || `complaint-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });

      if (!response.success || !response.file?.file_path) {
        Alert.alert('Upload failed', response.message || 'Could not upload attachment.');
        return;
      }

      setForm((current) => ({ ...current, attachments: [...current.attachments, response.file!] }));
    } finally {
      setUploading(false);
    }
  };

  const submitComplaint = async () => {
    setSubmitting(true);
    const response = await createComplaint({
      flat_id: Number(form.flat_id),
      category_id: Number(form.category_id),
      priority: form.priority,
      description: form.description.trim(),
      attachments: form.attachments,
    });
    setSubmitting(false);

    if (!response.success) {
      Alert.alert('Unable to raise complaint', response.message || 'Please try again.');
      return;
    }

    setForm((current) => ({ ...current, description: '', attachments: [] }));
    await loadBase();
  };

  const submitMessage = async () => {
    if (!selectedComplaintId || !message.trim()) {
      return;
    }

    const response = await addComplaintMessage(selectedComplaintId, { message: message.trim(), attachments: [] });
    if (!response.success) {
      Alert.alert('Unable to post update', response.message || 'Please try again.');
      return;
    }

    setMessage('');
    await loadDetail(selectedComplaintId);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBase()} />}>
        <View style={styles.hero}>
          <Text style={styles.title}>Helpdesk</Text>
          <Text style={styles.subtitle}>Raise issues with proof and track the full resolution thread.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Raise complaint</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.choiceRow}>
              {flats.map((flat) => (
                <Pressable key={flat.flat_id} onPress={() => setForm((current) => ({ ...current, flat_id: String(flat.flat_id) }))} style={[styles.choiceChip, form.flat_id === String(flat.flat_id) ? styles.choiceChipActive : null]}>
                  <Text style={[styles.choiceChipText, form.flat_id === String(flat.flat_id) ? styles.choiceChipTextActive : null]}>{flat.block_name}-{flat.flat_number}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.choiceRow}>
              {categories.map((category) => (
                <Pressable key={category.id} onPress={() => setForm((current) => ({ ...current, category_id: String(category.id) }))} style={[styles.choiceChip, form.category_id === String(category.id) ? styles.choiceChipActive : null]}>
                  <Text style={[styles.choiceChipText, form.category_id === String(category.id) ? styles.choiceChipTextActive : null]}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={styles.priorityRow}>
            {(['Low', 'Medium', 'High'] as const).map((priority) => (
              <Pressable key={priority} onPress={() => setForm((current) => ({ ...current, priority }))} style={[styles.priorityChip, form.priority === priority ? styles.priorityChipActive : null]}>
                <Text style={[styles.priorityChipText, form.priority === priority ? styles.priorityChipTextActive : null]}>{priority}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={form.description} onChangeText={(value) => setForm((current) => ({ ...current, description: value }))} placeholder="Describe the issue clearly" placeholderTextColor={colors.textMuted} multiline style={styles.textArea} />
          <Pressable onPress={() => void attachImage()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{uploading ? 'Uploading proof...' : 'Attach photo proof'}</Text>
          </Pressable>
          {form.attachments.length ? (
            <AttachmentList
              attachments={form.attachments}
              onOpen={(attachment) => void openComplaintAttachment(attachment)}
            />
          ) : null}
          <Pressable onPress={() => void submitComplaint()} disabled={submitting || !form.flat_id || !form.category_id || !form.description.trim()} style={[styles.primaryButton, (submitting || !form.flat_id || !form.category_id || !form.description.trim()) ? styles.disabledButton : null]}>
            <Text style={styles.primaryButtonText}>{submitting ? 'Submitting...' : 'Submit Ticket'}</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <View style={styles.cardCopy}>
              <Text style={styles.sectionTitle}>My tickets</Text>
              <Text style={styles.helperText}>Open any ticket to view its full details and conversation.</Text>
            </View>
            <Text style={styles.ticketCount}>{visibleComplaints.length}</Text>
          </View>
          {visibleComplaints.length ? visibleComplaints.map((complaint) => (
            <Pressable key={complaint.id} onPress={() => setSelectedComplaintId(complaint.id)} style={styles.ticketCard}>
              <View style={styles.rowBetween}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{buildComplaintSubject(complaint)}</Text>
                  <Text style={styles.cardMeta}>{complaint.ticket_id} / {complaint.category_name} / {complaint.block_name}-{complaint.flat_number}</Text>
                </View>
                <View style={styles.badgeStack}>
                  <Badge label={complaint.priority} tone={getPriorityTone(complaint.priority)} />
                  <Badge label={complaint.status} tone={complaint.is_overdue ? 'danger' : complaint.status === 'Resolved' || complaint.status === 'Closed' ? 'success' : 'info'} />
                </View>
              </View>
              <Text numberOfLines={2} style={styles.ticketPreview}>{complaint.description}</Text>
              <View style={styles.ticketFooter}>
                <Text style={styles.microText}>{formatDateTime(complaint.updated_at || complaint.created_at)}</Text>
                {complaint.attachments?.length ? <Text style={styles.microText}>{complaint.attachments.length} attachment(s)</Text> : null}
              </View>
            </Pressable>
          )) : (
            <EmptyState title="No complaints yet" detail="Your submitted tickets and their resolution status will appear here." />
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selectedComplaintId)} animationType="slide" onRequestClose={closeTicketDetail}>
        <View style={styles.detailScreen}>
          <View style={styles.detailHeader}>
            <Pressable onPress={closeTicketDetail} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Text style={styles.detailHeaderTitle}>Ticket detail</Text>
            <View style={styles.backButtonSpacer} />
          </View>

          {detail ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <View style={styles.detailCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{buildComplaintSubject(detail.complaint)}</Text>
                    <Text style={styles.cardMeta}>{detail.complaint.ticket_id} / {detail.complaint.category_name}</Text>
                  </View>
                  <View style={styles.badgeStack}>
                    <Badge label={detail.complaint.priority} tone={getPriorityTone(detail.complaint.priority)} />
                    <Badge label={detail.complaint.status} tone={detail.complaint.is_overdue ? 'danger' : detail.complaint.status === 'Resolved' || detail.complaint.status === 'Closed' ? 'success' : 'info'} />
                  </View>
                </View>
                <Text style={styles.detailBody}>{detail.complaint.description}</Text>
                {detail.complaint.attachments?.length ? (
                  <AttachmentList
                    attachments={detail.complaint.attachments}
                    onOpen={(attachment) => void openComplaintAttachment(attachment)}
                  />
                ) : null}
                <Text style={styles.helperText}>Flat: {detail.complaint.block_name}-{detail.complaint.flat_number}</Text>
                <Text style={styles.helperText}>Assigned: {detail.assignees.length ? detail.assignees.map((item) => item.name).join(', ') : 'Awaiting assignment'}</Text>
                <Text style={styles.helperText}>Recurring flat issues: {detail.recurring_count}</Text>
                {!['Resolved', 'Closed'].includes(detail.complaint.status) ? (
                  <>
                    <TextInput value={closingReason} onChangeText={setClosingReason} placeholder="Optional reason before you close this ticket" placeholderTextColor={colors.textMuted} style={styles.input} />
                    <Pressable onPress={() => void closeSelectedComplaint()} style={styles.closeButton}>
                      <Text style={styles.closeButtonText}>Close Ticket</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              <Text style={styles.subheading}>Conversation</Text>
              {detail.messages.length ? detail.messages.map((entry) => (
                <Pressable key={entry.id} style={styles.timelineCard} onPress={() => setSelectedMessageEntry(entry)}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{entry.sender_name}</Text>
                    <Text style={styles.microText}>{formatDateTime(entry.created_at)}</Text>
                  </View>
                  <Text style={styles.helperText}>{entry.message}</Text>
                  {entry.attachments?.length ? (
                    <AttachmentList
                      attachments={entry.attachments}
                      onOpen={(attachment) => void openComplaintAttachment(attachment)}
                    />
                  ) : null}
                </Pressable>
              )) : <EmptyState title="No updates yet" detail="Replies from society support will appear here." />}

              <TextInput value={message} onChangeText={setMessage} placeholder="Add follow-up message" placeholderTextColor={colors.textMuted} multiline style={styles.textArea} />
              <Pressable onPress={() => void submitMessage()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Post Update</Text>
              </Pressable>

              <Text style={styles.subheading}>Timeline</Text>
              {detail.history.map((entry) => (
                <View key={entry.id} style={styles.timelineCard}>
                  <Text style={styles.cardTitle}>{entry.status}</Text>
                  <Text style={styles.helperText}>{entry.note || 'Update recorded'}</Text>
                  <Text style={styles.microText}>{entry.changed_by_name} / {formatDateTime(entry.created_at)}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyDetailState}>
              <EmptyState title="Loading ticket" detail="Fetching the latest conversation and ticket status." />
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={Boolean(selectedMessageEntry)} transparent animationType="slide" onRequestClose={() => setSelectedMessageEntry(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <View style={styles.cardCopy}>
                <Text style={styles.modalTitle}>{selectedMessageEntry?.sender_name || 'Message detail'}</Text>
                <Text style={styles.cardMeta}>{formatDateTime(selectedMessageEntry?.created_at || null)}</Text>
              </View>
              <Pressable onPress={() => setSelectedMessageEntry(null)} style={styles.dismissButton}>
                <Text style={styles.dismissButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.modalMessageText}>{selectedMessageEntry?.message || ''}</Text>
              {selectedMessageEntry?.attachments?.length ? (
                <AttachmentList
                  attachments={selectedMessageEntry.attachments}
                  onOpen={(attachment) => void openComplaintAttachment(attachment)}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getPriorityTone(priority: 'Low' | 'Medium' | 'High') {
  if (priority === 'High') return 'danger';
  if (priority === 'Medium') return 'warning';
  return 'info';
}

function buildComplaintSubject(complaint: ComplaintSummaryItem) {
  const description = (complaint.description || '').trim();
  const firstLine = description.split(/\r?\n/)[0]?.trim() || '';
  if (firstLine.length > 0) {
    return firstLine.length > 56 ? `${firstLine.slice(0, 56).trimEnd()}...` : firstLine;
  }
  return `${complaint.category_name} issue`;
}

function resolveComplaintAttachmentUrl(attachment: { file_name?: string; file_path: string; url?: string }) {
  if (attachment.url) {
    return attachment.url;
  }
  if (attachment.file_path.startsWith('http://') || attachment.file_path.startsWith('https://')) {
    return attachment.file_path;
  }
  return `${API_BASE_URL}${attachment.file_path.startsWith('/') ? attachment.file_path : `/${attachment.file_path}`}`;
}

async function openComplaintAttachment(attachment: { file_name?: string; file_path: string; url?: string }) {
  try {
    await Linking.openURL(resolveComplaintAttachmentUrl(attachment));
  } catch {
    Alert.alert('Unable to open attachment', attachment.file_name || 'Please try again.');
  }
}

function AttachmentList({
  attachments,
  onOpen,
}: {
  attachments: Array<{ file_name?: string; file_path: string; url?: string }>;
  onOpen: (attachment: { file_name?: string; file_path: string; url?: string }) => void;
}) {
  return (
    <View style={styles.attachmentWrap}>
      {attachments.map((attachment, index) => (
        <Pressable key={`${attachment.file_path}-${index}`} onPress={() => onOpen(attachment)} style={styles.attachmentChip}>
          <Text numberOfLines={1} style={styles.attachmentChipText}>{attachment.file_name || `Attachment ${index + 1}`}</Text>
        </Pressable>
      ))}
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
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceChip: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10 },
  choiceChipActive: { backgroundColor: '#e7efff', borderColor: '#bfd3ff' },
  choiceChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  choiceChipTextActive: { color: colors.primaryDeep },
  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  priorityChipActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  priorityChipText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  priorityChipTextActive: { color: colors.white },
  textArea: {
    minHeight: 110,
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
  secondaryButton: { borderRadius: 16, borderWidth: 1, borderColor: '#bfd3ff', backgroundColor: '#eef4ff', alignItems: 'center', paddingVertical: 13 },
  secondaryButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  input: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, color: colors.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  ticketCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  detailCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 6 },
  timelineCard: { borderRadius: 18, backgroundColor: colors.surfaceMuted, padding: 14, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  badgeStack: { gap: 6, alignItems: 'flex-end' },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  microText: { color: colors.textMuted, fontSize: 11 },
  ticketPreview: { color: colors.text, fontSize: 13, lineHeight: 20 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  ticketCount: { minWidth: 38, borderRadius: 999, backgroundColor: colors.surfaceMuted, color: colors.primaryDeep, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '800' },
  subheading: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  closeButton: { borderRadius: 14, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#efc6c6', alignItems: 'center', paddingVertical: 12 },
  closeButtonText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  detailScreen: { flex: 1, backgroundColor: colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailHeaderTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  backButton: { borderRadius: 14, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 8 },
  backButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
  backButtonSpacer: { width: 56 },
  detailContent: { gap: 16, padding: 18, paddingBottom: 36 },
  emptyDetailState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  detailBody: { color: colors.text, fontSize: 14, lineHeight: 22 },
  attachmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  attachmentChip: {
    maxWidth: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfd3ff',
    backgroundColor: '#eef4ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentChipText: { color: colors.primaryDeep, fontSize: 12, fontWeight: '700' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(10, 20, 35, 0.45)', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '72%', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, padding: 18, gap: 12 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  modalBody: { paddingBottom: 18 },
  modalMessageText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  dismissButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 8 },
  dismissButtonText: { color: colors.primaryDeep, fontSize: 13, fontWeight: '800' },
});
