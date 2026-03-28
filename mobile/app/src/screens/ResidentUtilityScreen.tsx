import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { API_BASE_URL } from '../config/env';
import {
  fetchCommunicationConversations,
  fetchCommunicationEvents,
  fetchCommunicationPolls,
  fetchCommunicationThread,
  submitPollResponse,
  fetchCommitteeDirectory,
  fetchBillingSummary,
  fetchImportantContacts,
  fetchInvoices,
  fetchNotices,
  fetchResidentFlats,
  fetchResidentStaffDirectory,
  fetchSharedDocuments,
  fetchVisitorLogs,
} from '../services/resident';
import { colors } from '../theme';
import type { ResidentActionRoute } from '../types/navigation';
import type {
  CommitteeDirectoryItem,
  CommunicationConversation,
  CommunicationThreadMessage,
  EventItem,
  ImportantContactPerson,
  ImportantServiceStaff,
  Invoice,
  NoticeItem,
  PollItem,
  ResidentImportantContacts,
  ResidentFlat,
  ResidentStaffDirectoryItem,
  SharedDocument,
  VisitorLog,
  BillingSummary,
} from '../types/resident';
import { formatDateTime } from '../utils/format';

const ROUTE_META: Record<ResidentActionRoute, { title: string; subtitle: string }> = {
  bills: {
    title: 'Bills',
    subtitle: 'Track pending dues and see invoice history for your linked flats.',
  },
  society: {
    title: 'Society',
    subtitle: 'Reach the society desk fast, browse public committees, and catch the latest updates.',
  },
  communication: {
    title: 'Resident Hub',
    subtitle: 'Stay on top of notices, polls, events, direct updates, and shared communication from admin.',
  },
  myFlat: {
    title: 'My flat',
    subtitle: 'Check your apartment mapping, recent gate activity, and dues.',
  },
  staff: {
    title: 'Staff',
    subtitle: 'See registered household and society staff with live presence and schedules.',
  },
  documents: {
    title: 'Documents',
    subtitle: 'Open society rules, meeting records, and shared files from the admin office.',
  },
};

export function ResidentUtilityScreen({
  route,
  onBack,
}: {
  route: ResidentActionRoute;
  onBack: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [flats, setFlats] = useState<ResidentFlat[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [conversations, setConversations] = useState<CommunicationConversation[]>([]);
  const [conversationThread, setConversationThread] = useState<CommunicationThreadMessage[]>([]);
  const [committees, setCommittees] = useState<CommitteeDirectoryItem[]>([]);
  const [staff, setStaff] = useState<ResidentStaffDirectoryItem[]>([]);
  const [importantContacts, setImportantContacts] = useState<ResidentImportantContacts>({
    admins: [],
    managers: [],
    service_staff: [],
  });
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [message, setMessage] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState<'All' | Invoice['status']>('All');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [selectedPoll, setSelectedPoll] = useState<PollItem | null>(null);
  const [selectedPollOptionId, setSelectedPollOptionId] = useState<number | null>(null);
  const [submittingPollResponse, setSubmittingPollResponse] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<CommunicationConversation | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SharedDocument | null>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<number | null>(null);
  const [connectTab, setConnectTab] = useState<'notices' | 'polls' | 'events' | 'updates'>('notices');
  const [expandedContactGroups, setExpandedContactGroups] = useState<Record<string, boolean>>({
    managers: true,
    admins: false,
    security: true,
    housekeeping: false,
    plumber: false,
    electrician: false,
  });

  const getFailureMessage = (...responses: unknown[]) => {
    for (const response of responses) {
      if (response && typeof response === 'object' && 'message' in response && typeof response.message === 'string') {
        return response.message;
      }
    }

    return '';
  };

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setMessage('');

    if (route === 'bills') {
      const [invoiceRes, summaryRes] = await Promise.all([
        fetchInvoices(),
        fetchBillingSummary(),
      ]);
      if (invoiceRes.success) {
        setInvoices(invoiceRes.invoices || []);
      } else {
        setInvoices([]);
        setMessage(getFailureMessage(invoiceRes) || 'Unable to load billing details.');
      }
      setBillingSummary(summaryRes.success && 'summary' in summaryRes ? summaryRes.summary : null);
      setRefreshing(false);
      return;
    }

    if (route === 'society') {
      const [flatsRes, committeesRes, contactsRes] = await Promise.all([
        fetchResidentFlats(),
        fetchCommitteeDirectory(),
        fetchImportantContacts(),
      ]);

      if (flatsRes.success) setFlats(flatsRes.flats || []);
      if (committeesRes.success) setCommittees(committeesRes.committees || []);
      if (contactsRes.success) {
        setImportantContacts(contactsRes.contacts || { admins: [], managers: [], service_staff: [] });
      }

      if (!flatsRes.success || !committeesRes.success || !contactsRes.success) {
        setMessage(getFailureMessage(flatsRes, committeesRes, contactsRes) || 'Unable to load society overview.');
      }
      setRefreshing(false);
      return;
    }

    if (route === 'communication') {
      const [noticesRes, pollsRes, eventsRes, conversationsRes, documentsRes] = await Promise.all([
        fetchNotices(),
        fetchCommunicationPolls(),
        fetchCommunicationEvents(),
        fetchCommunicationConversations(),
        fetchSharedDocuments(),
      ]);

      if (noticesRes.success) setNotices(noticesRes.notices || []);
      else setNotices([]);
      if (pollsRes.success) setPolls(pollsRes.polls || []);
      else setPolls([]);
      if (eventsRes.success) setEvents(eventsRes.events || []);
      else setEvents([]);
      if (conversationsRes.success) setConversations(conversationsRes.conversations || []);
      else setConversations([]);
      if (documentsRes.success) setDocuments(documentsRes.documents || []);
      else setDocuments([]);

      const successfulSections = [
        noticesRes.success,
        pollsRes.success,
        eventsRes.success,
        conversationsRes.success,
        documentsRes.success,
      ].filter(Boolean).length;

      if (successfulSections === 0) {
        setMessage(getFailureMessage(noticesRes, pollsRes, eventsRes, conversationsRes, documentsRes) || 'Unable to load Resident Hub.');
      } else if (successfulSections < 5) {
        setMessage('Some communication sections are still loading or not available yet.');
      }
      setRefreshing(false);
      return;
    }

    if (route === 'myFlat') {
      const [flatsRes, invoicesRes, logsRes] = await Promise.all([
        fetchResidentFlats(),
        fetchInvoices(),
        fetchVisitorLogs(),
      ]);

      if (flatsRes.success) setFlats(flatsRes.flats || []);
      if (invoicesRes.success) setInvoices(invoicesRes.invoices || []);
      if (logsRes.success) setLogs(logsRes.logs || []);

      if (!flatsRes.success || !invoicesRes.success || !logsRes.success) {
        setMessage(getFailureMessage(flatsRes, invoicesRes, logsRes) || 'Unable to load flat details.');
      }
      setRefreshing(false);
      return;
    }

    if (route === 'staff') {
      const response = await fetchResidentStaffDirectory();
      if (response.success) {
        setStaff(response.staff || []);
      } else {
        setStaff([]);
        setMessage(getFailureMessage(response) || 'Unable to load staff directory.');
      }
      setRefreshing(false);
      return;
    }

    const response = await fetchSharedDocuments();
    if (response.success) {
      setDocuments(response.documents || []);
    } else {
      setDocuments([]);
      setMessage(getFailureMessage(response) || 'Unable to load documents.');
    }
    setRefreshing(false);
  }, [route]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const meta = ROUTE_META[route];
  const unpaidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === 'Unpaid'), [invoices]);
  const dueInvoices = useMemo(() => invoices.filter((invoice) => ['Unpaid', 'Overdue', 'PartiallyPaid'].includes(invoice.status)), [invoices]);
  const unpaidTotal = useMemo(
    () => dueInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_amount ?? invoice.amount ?? 0), 0),
    [dueInvoices],
  );
  const overdueInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === 'Overdue'), [invoices]);
  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => invoiceFilter === 'All' || invoice.status === invoiceFilter),
    [invoiceFilter, invoices],
  );
  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId],
  );
  const selectedCommittee = useMemo(
    () => committees.find((committee) => committee.id === selectedCommitteeId) || null,
    [committees, selectedCommitteeId],
  );
  const insideVisitors = useMemo(() => logs.filter((log) => log.status === 'CheckedIn'), [logs]);
  const importantNumberGroups = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      entries: Array<{ id: string | number; name: string; subtitle: string; phone_number: string; badge?: string }>;
    }> = [];

    if (importantContacts.managers.length) {
      groups.push({
        key: 'managers',
        title: 'Society manager',
        entries: importantContacts.managers.map((contact) => ({
          id: contact.id,
          name: contact.name,
          subtitle: contact.label || contact.role || 'Society manager',
          phone_number: contact.phone_number,
        })),
      });
    }

    if (importantContacts.admins.length) {
      groups.push({
        key: 'admins',
        title: 'Society admin',
        entries: importantContacts.admins.map((contact) => ({
          id: contact.id,
          name: contact.name,
          subtitle: contact.label || contact.role || 'Society admin',
          phone_number: contact.phone_number,
        })),
      });
    }

    const staffGroups: Array<{ key: string; title: string; type: ImportantServiceStaff['type'] }> = [
      { key: 'security', title: 'Security', type: 'Security' },
      { key: 'housekeeping', title: 'Housekeeping', type: 'Cleaner' },
      { key: 'plumber', title: 'Plumber', type: 'Plumber' },
      { key: 'electrician', title: 'Electrician', type: 'Electrician' },
    ];

    staffGroups.forEach((staffGroup) => {
      const contacts = importantContacts.service_staff.filter((member) => member.type === staffGroup.type);
      if (!contacts.length) {
        return;
      }

      groups.push({
        key: staffGroup.key,
        title: staffGroup.title,
        entries: contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          subtitle: `${contact.assignment_scope === 'SOCIETY' ? 'Society-wide support' : 'Assigned support'}${contact.shift_timing ? ` / ${contact.shift_timing}` : ''}`,
          phone_number: contact.phone_number,
          badge: contact.type === 'Cleaner' ? 'Housekeeping' : contact.type,
        })),
      });
    });

    return groups;
  }, [importantContacts]);

  const openConversation = useCallback(async (conversation: CommunicationConversation) => {
    setSelectedConversation(conversation);
    const response = await fetchCommunicationThread(conversation.resident_id);
    if (response.success) {
      setConversationThread(response.messages || []);
      return;
    }

    setConversationThread([]);
    const failureMessage = 'message' in response ? response.message : 'Please try again.';
    Alert.alert('Unable to load update', failureMessage || 'Please try again.');
  }, []);

  useEffect(() => {
    setSelectedCommitteeId(null);
  }, [route]);

  useEffect(() => {
    if (route !== 'communication') {
      setConnectTab('notices');
      setSelectedNotice(null);
      setSelectedPoll(null);
      setSelectedPollOptionId(null);
      setSelectedEvent(null);
      setSelectedConversation(null);
      setSelectedDocument(null);
      setConversationThread([]);
    }
  }, [route]);

  useEffect(() => {
    setSelectedPollOptionId(selectedPoll?.user_response_option_id || null);
  }, [selectedPoll]);

  const handlePollResponse = useCallback(async () => {
    if (!selectedPoll || !selectedPollOptionId) {
      Alert.alert('Select an option', 'Choose one poll option before submitting.');
      return;
    }

    setSubmittingPollResponse(true);
    const response = await submitPollResponse(selectedPoll.id, selectedPollOptionId);
    setSubmittingPollResponse(false);

    if (!response.success) {
      Alert.alert('Unable to submit vote', response.message || 'Please try again.');
      return;
    }

    const updatedPoll: PollItem = {
      ...selectedPoll,
      user_response_option_id: response.option_id ?? selectedPollOptionId,
      response_count: response.response_count ?? selectedPoll.response_count,
    };
    setSelectedPoll(updatedPoll);
    setPolls((current) => current.map((poll) => (
      poll.id === selectedPoll.id
        ? {
            ...poll,
            user_response_option_id: response.option_id ?? selectedPollOptionId,
            response_count: response.response_count ?? poll.response_count,
          }
        : poll
    )));
    Alert.alert('Vote recorded', 'Your poll response has been saved.');
  }, [selectedPoll, selectedPollOptionId]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData()} />}
      >
        <View style={styles.headerCard}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.subtitle}>{meta.subtitle}</Text>
        </View>

        {message ? (
          <View style={styles.inlineNotice}>
            <Text style={styles.inlineNoticeText}>{message}</Text>
          </View>
        ) : null}

        {route === 'bills' ? (
          <>
            <View style={styles.billingHero}>
              <Text style={styles.billingHeroEyebrow}>Billing desk</Text>
              <Text style={styles.billingHeroTitle}>Keep maintenance dues clear and predictable.</Text>
              <Text style={styles.billingHeroSubtitle}>
                Review current charges and open invoice detail without hunting through past records.
              </Text>
              <View style={styles.summaryRow}>
                <MetricCard label="Pending amount" value={`Rs ${unpaidTotal.toFixed(0)}`} tone="danger" />
                <MetricCard label="Due invoices" value={dueInvoices.length} tone="warning" />
              </View>
              {billingSummary ? (
                <View style={styles.summaryRow}>
                  <MetricCard label="Collected" value={`Rs ${billingSummary.total_collected.toFixed(0)}`} tone="success" />
                  <MetricCard label="Overdue" value={`Rs ${billingSummary.overdue_amount.toFixed(0)}`} tone="warning" />
                </View>
              ) : null}
            </View>

            <View style={styles.filterRow}>
              {(['All', 'Unpaid', 'Overdue', 'PartiallyPaid', 'Paid'] as const).map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setInvoiceFilter(status)}
                  style={[styles.filterChip, invoiceFilter === status ? styles.filterChipActive : null]}
                >
                  <Text style={[styles.filterChipText, invoiceFilter === status ? styles.filterChipTextActive : null]}>
                    {status === 'PartiallyPaid' ? 'Partial' : status}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.summaryRow}>
              <MetricCard label="Visible invoices" value={filteredInvoices.length} tone="primary" />
              <MetricCard label="Overdue count" value={overdueInvoices.length} tone="danger" />
            </View>

            {selectedInvoice ? (
              <Section title="Invoice detail">
                <View style={styles.invoiceDetailCard}>
                  <View style={styles.rowBetween}>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>
                        {selectedInvoice.block_name}-{selectedInvoice.flat_number} / {selectedInvoice.invoice_number || `INV-${selectedInvoice.id}`}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {selectedInvoice.month_year} / Due {selectedInvoice.due_date || 'Not set'} / {selectedInvoice.billing_type || 'Bill'}
                      </Text>
                    </View>
                    <Badge label={selectedInvoice.status} tone={getInvoiceTone(selectedInvoice.status)} />
                  </View>
                  <View style={styles.invoiceMetaGrid}>
                    <InvoiceMetaItem label="Total" value={`Rs ${(selectedInvoice.total_amount ?? selectedInvoice.amount).toFixed(2)}`} />
                    <InvoiceMetaItem label="Balance" value={`Rs ${(selectedInvoice.balance_amount ?? selectedInvoice.amount).toFixed(2)}`} />
                    <InvoiceMetaItem label="Penalty" value={`Rs ${(selectedInvoice.penalty_amount ?? 0).toFixed(2)}`} />
                    <InvoiceMetaItem label="Adjustment" value={`Rs ${(selectedInvoice.adjustment_amount ?? 0).toFixed(2)}`} />
                  </View>
                  {selectedInvoice.line_items?.length ? (
                    <View style={styles.detailList}>
                      {selectedInvoice.line_items.map((item) => (
                        <View key={item.id} style={styles.lineItemRow}>
                          <Text style={styles.itemMeta}>{item.label}</Text>
                          <Text style={styles.lineItemAmount}>Rs {item.amount.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {selectedInvoice.payments?.length ? (
                    <View style={styles.subSection}>
                      <Text style={styles.subSectionTitle}>Payment history</Text>
                      {selectedInvoice.payments.map((payment) => (
                        <Text key={payment.id} style={styles.itemMeta}>
                          {payment.payment_method || 'Payment'} / Rs {payment.amount.toFixed(2)} / {payment.status}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {selectedInvoice.adjustments?.length ? (
                    <View style={styles.subSection}>
                      <Text style={styles.subSectionTitle}>Adjustments</Text>
                      {selectedInvoice.adjustments.map((adjustment) => (
                        <Text key={adjustment.id} style={styles.itemMeta}>
                          {adjustment.adjustment_type}: Rs {adjustment.amount.toFixed(2)} {adjustment.reason ? `/ ${adjustment.reason}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.actionRow}>
                    {selectedInvoice.pdf_url ? (
                      <Pressable style={styles.secondaryButton} onPress={() => void openLink(selectedInvoice.pdf_url || '', selectedInvoice.invoice_number || 'Invoice PDF')}>
                        <Text style={styles.secondaryButtonText}>Download invoice</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Section>
            ) : null}

            <Section title="Invoice history">
              {filteredInvoices.length ? (
                filteredInvoices.map((invoice) => (
                  <View key={invoice.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.copy}>
                        <Text style={styles.itemTitle}>{invoice.block_name}-{invoice.flat_number} / {invoice.invoice_number || `INV-${invoice.id}`}</Text>
                        <Text style={styles.itemMeta}>{invoice.month_year} / Due {invoice.due_date || 'Not set'} / {invoice.billing_type || 'Bill'}</Text>
                      </View>
                      <Badge label={invoice.status} tone={getInvoiceTone(invoice.status)} />
                    </View>
                    <Text style={styles.amountText}>Balance Rs {(invoice.balance_amount ?? invoice.amount).toFixed(2)}</Text>
                    <Text style={styles.itemMeta}>
                      Subtotal Rs {(invoice.subtotal_amount ?? invoice.amount).toFixed(2)}
                      {invoice.penalty_amount ? ` / Penalty Rs ${invoice.penalty_amount.toFixed(2)}` : ''}
                      {invoice.adjustment_amount ? ` / Adjustment Rs ${invoice.adjustment_amount.toFixed(2)}` : ''}
                    </Text>
                    <View style={styles.actionRow}>
                      <Pressable style={styles.secondaryButton} onPress={() => setSelectedInvoiceId(invoice.id)}>
                        <Text style={styles.secondaryButtonText}>View detail</Text>
                      </Pressable>
                      {invoice.pdf_url ? (
                        <Pressable style={styles.secondaryButton} onPress={() => void openLink(invoice.pdf_url || '', invoice.invoice_number || 'Invoice PDF')}>
                          <Text style={styles.secondaryButtonText}>Download invoice</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                <EmptyState title="No invoices in this view" detail="Try another filter or wait for the next billing cycle to be generated." />
              )}
            </Section>
          </>
        ) : null}

        {route === 'society' ? (
          <>
            <Section title="Important numbers">
              {importantNumberGroups.length ? (
                importantNumberGroups.map((group) => (
                  <AccordionGroup
                    key={group.key}
                    title={group.title}
                    count={group.entries.length}
                    expanded={Boolean(expandedContactGroups[group.key])}
                    onToggle={() => setExpandedContactGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                  >
                    {group.entries.map((entry) => (
                      <View key={`${group.key}-${entry.id}`} style={styles.contactCard}>
                        <View style={styles.contactTopRow}>
                          <View style={styles.copy}>
                            <Text style={styles.contactName}>{entry.name}</Text>
                            <Text style={styles.contactRole}>{entry.subtitle}</Text>
                          </View>
                          {entry.badge ? <Badge label={entry.badge} tone="info" /> : null}
                        </View>
                        <View style={styles.phoneRow}>
                          <Text style={styles.phoneValue}>{entry.phone_number || 'Number not shared'}</Text>
                          <Pressable style={styles.callButton} onPress={() => void handleCall(entry.phone_number, entry.name)}>
                            <Text style={styles.callButtonText}>Call</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </AccordionGroup>
                ))
              ) : (
                <EmptyState title="No important contacts shared yet" detail="Admin, manager, and service team contact numbers will appear here once configured." />
              )}
            </Section>

            {selectedCommittee ? (
              <Section title={selectedCommittee.name}>
                <Pressable onPress={() => setSelectedCommitteeId(null)} style={styles.backButton}>
                  <Text style={styles.backButtonText}>Back to committees</Text>
                </Pressable>
                <View style={styles.listCard}>
                  <View style={styles.rowBetween}>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>{selectedCommittee.committee_type}</Text>
                      <Text style={styles.itemMeta}>{selectedCommittee.member_count} member(s)</Text>
                    </View>
                    <Badge label={selectedCommittee.status} tone="info" />
                  </View>
                  {selectedCommittee.description ? <Text style={styles.noticeContent}>{selectedCommittee.description}</Text> : null}
                </View>
                <View style={styles.committeeMemberList}>
                  {selectedCommittee.members.map((member) => (
                    <View key={member.id} style={styles.committeeMemberCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.copy}>
                          <Text style={styles.contactName}>{member.name}</Text>
                          <Text style={styles.contactRole}>{member.is_primary_contact ? 'Primary contact' : 'Committee member'}</Text>
                        </View>
                        <View style={styles.noticeBadges}>
                          {member.is_primary_contact ? <Badge label="Primary" tone="info" /> : null}
                          {member.status ? <Badge label={member.status} tone="success" /> : null}
                        </View>
                      </View>
                      <Text style={styles.itemMeta}>
                        {member.block_name && member.flat_number ? `Flat: ${member.block_name}-${member.flat_number}` : 'Flat not shared'}
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : (
              <Section title="Committee directory">
                {committees.length ? (
                  committees.map((committee) => (
                    <Pressable key={committee.id} style={styles.listCard} onPress={() => setSelectedCommitteeId(committee.id)}>
                      <View style={styles.rowBetween}>
                        <View style={styles.copy}>
                          <Text style={styles.itemTitle}>{committee.name}</Text>
                          <Text style={styles.itemMeta}>{committee.committee_type} / {committee.member_count} member(s)</Text>
                        </View>
                        <Badge label={committee.status} tone="info" />
                      </View>
                      <Text numberOfLines={2} style={styles.itemMeta}>{committee.description || 'Tap to see all committee members and roles.'}</Text>
                      <Text style={styles.committeeOpenHint}>Open member details</Text>
                    </Pressable>
                  ))
                ) : (
                  <EmptyState title="No public committees yet" detail="Public committee names and roles will appear here once published." />
                )}
              </Section>
            )}
          </>
        ) : null}

        {route === 'communication' ? (
          <>
            <View style={styles.filterRow}>
              {([
                { key: 'notices', label: 'Notices' },
                { key: 'polls', label: 'Polls' },
                { key: 'events', label: 'Events' },
                { key: 'updates', label: 'Updates' },
              ] as const).map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => setConnectTab(tab.key)}
                  style={[styles.filterChip, connectTab === tab.key ? styles.filterChipActive : null]}
                >
                  <Text style={[styles.filterChipText, connectTab === tab.key ? styles.filterChipTextActive : null]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {connectTab === 'notices' ? (
              <Section title="Society notices">
                {notices.length ? (
                  notices.map((notice) => <NoticeCard key={notice.id} notice={notice} onPress={() => setSelectedNotice(notice)} />)
                ) : (
                  <EmptyState title="No notices published" detail="Admin announcements and urgent updates will appear here." />
                )}
              </Section>
            ) : null}

            {connectTab === 'polls' ? (
              <Section title="Community polls">
                {polls.length ? (
                  polls.map((poll) => (
                    <Pressable key={poll.id} style={styles.listCard} onPress={() => setSelectedPoll(poll)}>
                      <View style={styles.rowBetween}>
                        <View style={styles.copy}>
                          <Text style={styles.itemTitle}>{poll.title}</Text>
                          <Text style={styles.itemMeta}>
                            {poll.poll_type === 'YesNo' ? 'Yes / No' : 'Single choice'} / {poll.response_count} response(s)
                          </Text>
                        </View>
                        <Badge label={poll.status} tone={poll.status === 'Live' ? 'success' : 'info'} />
                      </View>
                      {poll.description ? <Text numberOfLines={2} style={styles.noticeContent}>{poll.description}</Text> : null}
                      <Text style={styles.itemMeta}>
                        {poll.starts_at ? `Starts ${formatDateTime(poll.starts_at)}` : 'Available now'}
                        {poll.ends_at ? ` / Ends ${formatDateTime(poll.ends_at)}` : ''}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <EmptyState title="No polls live right now" detail="Resident voting and quick opinion polls will appear here once published." />
                )}
              </Section>
            ) : null}

            {connectTab === 'events' ? (
              <Section title="Community events">
                {events.length ? (
                  events.map((event) => (
                    <Pressable key={event.id} style={styles.listCard} onPress={() => setSelectedEvent(event)}>
                      <View style={styles.rowBetween}>
                        <View style={styles.copy}>
                          <Text style={styles.itemTitle}>{event.title}</Text>
                          <Text style={styles.itemMeta}>{event.venue || 'Society venue'} / {formatDateTime(event.start_at || null)}</Text>
                        </View>
                        <Badge label={event.status} tone="info" />
                      </View>
                      {event.description ? <Text numberOfLines={2} style={styles.noticeContent}>{event.description}</Text> : null}
                      <Text style={styles.itemMeta}>
                        Going {event.rsvp_summary?.Going || 0} / Maybe {event.rsvp_summary?.Maybe || 0} / Not going {event.rsvp_summary?.NotGoing || 0}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <EmptyState title="No upcoming events" detail="Community meetups and admin-published events will appear here." />
                )}
              </Section>
            ) : null}

            {connectTab === 'updates' ? (
              <>
                <Section title="Direct updates">
                  {conversations.length ? (
                    conversations.map((conversation) => (
                      <Pressable key={conversation.resident_id} style={styles.listCard} onPress={() => void openConversation(conversation)}>
                        <View style={styles.rowBetween}>
                          <View style={styles.copy}>
                            <Text style={styles.itemTitle}>{conversation.last_subject || conversation.resident_name || 'Admin update'}</Text>
                            <Text style={styles.itemMeta}>
                              {conversation.last_created_at ? formatDateTime(conversation.last_created_at) : 'Latest message'}
                            </Text>
                          </View>
                          {conversation.unread_count ? <Badge label={`${conversation.unread_count} new`} tone="warning" /> : null}
                        </View>
                        <Text numberOfLines={2} style={styles.noticeContent}>{conversation.last_message || 'Open thread to read the update.'}</Text>
                      </Pressable>
                    ))
                  ) : (
                    <EmptyState title="No direct updates yet" detail="Private admin messages and thread updates will appear here." />
                  )}
                </Section>

                <Section title="Shared files">
                  {documents.length ? (
                    documents.map((document) => (
                      <Pressable key={document.id} style={styles.listCard} onPress={() => setSelectedDocument(document)}>
                        <View style={styles.rowBetween}>
                          <View style={styles.copy}>
                            <Text style={styles.itemTitle}>{document.title}</Text>
                            <Text style={styles.itemMeta}>{document.category} / {document.created_by_name || 'Admin'}</Text>
                          </View>
                          {document.is_pinned ? <Badge label="Pinned" tone="info" /> : null}
                        </View>
                        {document.description ? <Text numberOfLines={2} style={styles.noticeContent}>{document.description}</Text> : null}
                      </Pressable>
                    ))
                  ) : (
                    <EmptyState title="No update files shared" detail="Circulars, forms, and related files will appear here." />
                  )}
                </Section>
              </>
            ) : null}
          </>
        ) : null}

        {route === 'myFlat' ? (
          <>
            <View style={styles.summaryRow}>
              <MetricCard label="Linked flats" value={flats.length} tone="primary" />
              <MetricCard label="Visitors inside" value={insideVisitors.length} tone="success" />
            </View>
            <Section title="Apartment mapping">
              {flats.length ? (
                flats.map((flat) => (
                  <View key={flat.flat_id} style={styles.simpleCard}>
                    <Text style={styles.itemTitle}>{flat.block_name}-{flat.flat_number}</Text>
                    <Text style={styles.itemMeta}>Occupancy: {flat.type}</Text>
                  </View>
                ))
              ) : (
                <EmptyState title="Flat mapping pending" detail="Your apartment will appear here once the admin maps your resident account." />
              )}
            </Section>

            <Section title="Billing snapshot">
              {invoices.length ? (
                invoices.slice(0, 4).map((invoice) => (
                  <View key={invoice.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.copy}>
                        <Text style={styles.itemTitle}>{invoice.month_year}</Text>
                        <Text style={styles.itemMeta}>{invoice.block_name}-{invoice.flat_number}</Text>
                      </View>
                      <Badge label={invoice.status} tone={invoice.status === 'Paid' ? 'success' : 'warning'} />
                    </View>
                    <Text style={styles.amountText}>Rs {invoice.amount}</Text>
                  </View>
                ))
              ) : (
                <EmptyState title="No billing records" detail="Invoices for your apartment will be shown here." />
              )}
            </Section>

            <Section title="Recent gate activity">
              {logs.length ? (
                logs.slice(0, 5).map((log) => (
                  <View key={log.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.copy}>
                        <Text style={styles.itemTitle}>{log.visitor_name}</Text>
                        <Text style={styles.itemMeta}>{log.purpose} / {log.block_name}-{log.flat_number}</Text>
                      </View>
                      <Badge label={log.status} tone={getVisitorTone(log.status)} />
                    </View>
                    <Text style={styles.itemMeta}>
                      {log.entry_time ? `Entered ${formatDateTime(log.entry_time)}` : `Expected ${formatDateTime(log.expected_time)}`}
                    </Text>
                  </View>
                ))
              ) : (
                <EmptyState title="No gate activity yet" detail="Visitor movement linked to your flat will appear here." />
              )}
            </Section>
          </>
        ) : null}

        {route === 'staff' ? (
          <Section title="Staff directory">
            {staff.length ? (
              staff.map((member) => (
                <View key={member.id} style={styles.listCard}>
                  <View style={styles.rowBetween}>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>{member.name}</Text>
                      <Text style={styles.itemMeta}>{member.type} / {member.assignment_scope === 'SOCIETY' ? 'Society-wide' : 'Flat-linked'}</Text>
                    </View>
                    <Badge
                      label={member.is_blacklisted ? 'Blocked' : member.is_inside ? 'Inside' : 'Registered'}
                      tone={member.is_blacklisted ? 'danger' : member.is_inside ? 'success' : 'info'}
                    />
                  </View>
                  <Text style={styles.itemMeta}>Phone: {member.phone || 'Not shared'}</Text>
                  <Text style={styles.itemMeta}>
                    Schedule: {member.shift_timing || `${member.work_start_time || '--'} to ${member.work_end_time || '--'}`}
                  </Text>
                  {member.assigned_flats.length ? (
                    <Text style={styles.itemMeta}>
                      Assigned: {member.assigned_flats.map((flat) => flat.label).join(', ')}
                    </Text>
                  ) : null}
                  {member.blacklist_reason ? <Text style={styles.alertMeta}>Reason: {member.blacklist_reason}</Text> : null}
                </View>
              ))
            ) : (
              <EmptyState title="No staff shared yet" detail="Household and society staff entries will appear here when added by the admin." />
            )}
          </Section>
        ) : null}

        {route === 'documents' ? (
          <Section title="Shared documents">
            {documents.length ? (
              documents.map((document) => (
                <View key={document.id} style={styles.listCard}>
                  <View style={styles.rowBetween}>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>{document.title}</Text>
                      <Text style={styles.itemMeta}>{document.category} / {document.created_by_name || 'Admin'}</Text>
                    </View>
                    {document.is_pinned ? <Badge label="Pinned" tone="info" /> : null}
                  </View>
                  {document.description ? <Text style={styles.itemMeta}>{document.description}</Text> : null}
                  <View style={styles.actionRow}>
                    <Pressable style={styles.openButton} onPress={() => void openLink(document.file_url, document.title)}>
                      <Text style={styles.openButtonText}>Open document</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <EmptyState title="No documents shared" detail="Rules, minutes, and society documents will be listed here once published." />
            )}
          </Section>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(selectedNotice)} transparent animationType="slide" onRequestClose={() => setSelectedNotice(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <Text style={styles.modalTitle}>{selectedNotice?.title || 'Notice detail'}</Text>
                <Text style={styles.itemMeta}>
                  {selectedNotice?.created_by_name || 'Admin'} / {formatDateTime(selectedNotice?.published_at || selectedNotice?.created_at || null)}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedNotice(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
            {selectedNotice ? (
              <>
                <View style={styles.noticeBadgeRow}>
                  <Badge label={selectedNotice.notice_type} tone={getNoticeTone(selectedNotice.notice_type)} />
                  {selectedNotice.is_pinned ? <Badge label="Pinned" tone="info" /> : null}
                </View>
                <ScrollView contentContainerStyle={styles.modalBody}>
                  <Text style={styles.noticeDetailText}>{selectedNotice.content}</Text>
                  {selectedNotice.attachments?.length ? (
                    <View style={styles.modalSection}>
                      <Text style={styles.subSectionTitle}>Attachments</Text>
                      {selectedNotice.attachments.map((attachment, index) => {
                        const url = attachment.url || attachment.file_path || '';
                        return (
                          <Pressable key={`${selectedNotice.id}-attachment-${index}`} style={styles.secondaryButton} onPress={() => void openLink(url, attachment.file_name || 'Notice attachment')}>
                            <Text style={styles.secondaryButtonText}>{attachment.file_name || `Attachment ${index + 1}`}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedPoll)} transparent animationType="slide" onRequestClose={() => setSelectedPoll(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <Text style={styles.modalTitle}>{selectedPoll?.title || 'Poll detail'}</Text>
                <Text style={styles.itemMeta}>
                  {selectedPoll?.starts_at ? `Starts ${formatDateTime(selectedPoll.starts_at)}` : 'Live now'}
                  {selectedPoll?.ends_at ? ` / Ends ${formatDateTime(selectedPoll.ends_at)}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedPoll(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
            {selectedPoll ? (
              <ScrollView contentContainerStyle={styles.modalBody}>
                <View style={styles.noticeBadgeRow}>
                  <Badge label={selectedPoll.status} tone={selectedPoll.status === 'Live' ? 'success' : 'info'} />
                  <Badge label={selectedPoll.poll_type === 'YesNo' ? 'Yes / No' : 'Single choice'} tone="info" />
                </View>
                {selectedPoll.description ? <Text style={styles.noticeDetailText}>{selectedPoll.description}</Text> : null}
                <View style={styles.modalSection}>
                  <Text style={styles.subSectionTitle}>Options</Text>
                  {selectedPoll.options.map((option, index) => (
                    <Pressable
                      key={`${selectedPoll.id}-option-${index}`}
                      style={[
                        styles.pollOptionCard,
                        selectedPollOptionId === option.id ? styles.pollOptionCardActive : null,
                      ]}
                      onPress={() => setSelectedPollOptionId(option.id || null)}
                    >
                      <Text
                        style={[
                          styles.itemMeta,
                          selectedPollOptionId === option.id ? styles.pollOptionTextActive : null,
                        ]}
                      >
                        {option.option_text}
                      </Text>
                      {selectedPollOptionId === option.id ? <Badge label="Selected" tone="success" /> : null}
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.itemMeta}>{selectedPoll.response_count} response(s) recorded</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.openButton, (!selectedPollOptionId || submittingPollResponse) ? styles.disabledButton : null]}
                    onPress={() => void handlePollResponse()}
                    disabled={!selectedPollOptionId || submittingPollResponse}
                  >
                    <Text style={styles.openButtonText}>
                      {submittingPollResponse ? 'Submitting...' : selectedPoll.user_response_option_id ? 'Update response' : 'Submit response'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedEvent)} transparent animationType="slide" onRequestClose={() => setSelectedEvent(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <Text style={styles.modalTitle}>{selectedEvent?.title || 'Event detail'}</Text>
                <Text style={styles.itemMeta}>{selectedEvent?.venue || 'Society venue'}</Text>
              </View>
              <Pressable onPress={() => setSelectedEvent(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
            {selectedEvent ? (
              <ScrollView contentContainerStyle={styles.modalBody}>
                <View style={styles.noticeBadgeRow}>
                  <Badge label={selectedEvent.status} tone="info" />
                  {selectedEvent.rsvp_required ? <Badge label="RSVP enabled" tone="success" /> : null}
                </View>
                {selectedEvent.description ? <Text style={styles.noticeDetailText}>{selectedEvent.description}</Text> : null}
                <View style={styles.modalSection}>
                  <Text style={styles.subSectionTitle}>Schedule</Text>
                  <Text style={styles.itemMeta}>Starts: {formatDateTime(selectedEvent.start_at || null)}</Text>
                  {selectedEvent.end_at ? <Text style={styles.itemMeta}>Ends: {formatDateTime(selectedEvent.end_at)}</Text> : null}
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.subSectionTitle}>RSVP snapshot</Text>
                  <Text style={styles.itemMeta}>Going: {selectedEvent.rsvp_summary?.Going || 0}</Text>
                  <Text style={styles.itemMeta}>Maybe: {selectedEvent.rsvp_summary?.Maybe || 0}</Text>
                  <Text style={styles.itemMeta}>Not going: {selectedEvent.rsvp_summary?.NotGoing || 0}</Text>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedConversation)} transparent animationType="slide" onRequestClose={() => setSelectedConversation(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <Text style={styles.modalTitle}>{selectedConversation?.last_subject || 'Admin update'}</Text>
                <Text style={styles.itemMeta}>{selectedConversation?.resident_name || 'Admin thread'}</Text>
              </View>
              <Pressable onPress={() => setSelectedConversation(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {conversationThread.length ? (
                conversationThread.map((entry) => (
                  <View key={entry.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.copy}>
                        <Text style={styles.itemTitle}>{entry.sender_name}</Text>
                        <Text style={styles.itemMeta}>{formatDateTime(entry.created_at || null)}</Text>
                      </View>
                      <Badge label={entry.priority} tone={entry.priority === 'Emergency' ? 'danger' : entry.priority === 'High' ? 'warning' : 'info'} />
                    </View>
                    {entry.subject ? <Text style={styles.contactRole}>{entry.subject}</Text> : null}
                    <Text style={styles.noticeContent}>{entry.content}</Text>
                    {entry.attachments?.length ? (
                      <View style={styles.modalSection}>
                        <Text style={styles.subSectionTitle}>Attachments</Text>
                        {entry.attachments.map((attachment, index) => {
                          const url = attachment.url || attachment.file_path || '';
                          return (
                            <Pressable key={`${entry.id}-attachment-${index}`} style={styles.secondaryButton} onPress={() => void openLink(url, attachment.file_name || 'Thread attachment')}>
                              <Text style={styles.secondaryButtonText}>{attachment.file_name || `Attachment ${index + 1}`}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <EmptyState title="No thread details yet" detail="New admin messages will appear here once available." />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedDocument)} transparent animationType="slide" onRequestClose={() => setSelectedDocument(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <Text style={styles.modalTitle}>{selectedDocument?.title || 'Update detail'}</Text>
                <Text style={styles.itemMeta}>{selectedDocument?.category || 'Document'} / {selectedDocument?.created_by_name || 'Admin'}</Text>
              </View>
              <Pressable onPress={() => setSelectedDocument(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
            {selectedDocument ? (
              <ScrollView contentContainerStyle={styles.modalBody}>
                {selectedDocument.description ? <Text style={styles.noticeDetailText}>{selectedDocument.description}</Text> : null}
                <View style={styles.actionRow}>
                  <Pressable style={styles.openButton} onPress={() => void openLink(selectedDocument.file_url, selectedDocument.title)}>
                    <Text style={styles.openButtonText}>Open document</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'primary' | 'warning' | 'danger' | 'success';
}) {
  const palette = {
    primary: { backgroundColor: '#eaf2ff', color: colors.primaryDeep },
    warning: { backgroundColor: '#fff4e3', color: colors.warning },
    danger: { backgroundColor: '#fff0f0', color: colors.danger },
    success: { backgroundColor: '#e8f8ef', color: colors.success },
  }[tone];

  return (
    <View style={[styles.metricCard, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.metricValue, { color: palette.color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function InvoiceMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.invoiceMetaItem}>
      <Text style={styles.invoiceMetaLabel}>{label}</Text>
      <Text style={styles.invoiceMetaValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function AccordionGroup({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.contactGroup}>
      <Pressable style={styles.contactGroupHeader} onPress={onToggle}>
        <View style={styles.copy}>
          <Text style={styles.contactGroupTitle}>{title}</Text>
          <Text style={styles.itemMeta}>{count} contact(s)</Text>
        </View>
        <Text style={styles.committeeOpenHint}>{expanded ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

function NoticeCard({ notice, compact = false, onPress }: { notice: NoticeItem; compact?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={styles.listCard} onPress={onPress}>
      <View style={styles.rowBetween}>
        <View style={styles.copy}>
          <Text style={styles.itemTitle}>{notice.title}</Text>
          <Text style={styles.itemMeta}>
            {notice.created_by_name || 'Admin'} / {formatDateTime(notice.published_at || notice.created_at || null)}
          </Text>
        </View>
        <View style={styles.noticeBadges}>
          {notice.is_pinned ? <Badge label="Pinned" tone="info" /> : null}
          <Badge label={notice.notice_type} tone={getNoticeTone(notice.notice_type)} />
        </View>
      </View>
      <Text numberOfLines={compact ? 3 : undefined} style={styles.noticeContent}>
        {notice.content}
      </Text>
      {notice.attachments?.length ? (
        <Text style={styles.itemMeta}>{notice.attachments.length} attachment(s) shared with this notice.</Text>
      ) : null}
    </Pressable>
  );
}

function getNoticeTone(noticeType: string) {
  if (noticeType === 'Emergency' || noticeType === 'Urgent') return 'danger';
  if (noticeType === 'Maintenance') return 'warning';
  if (noticeType === 'Event') return 'success';
  return 'info';
}

function getVisitorTone(status: VisitorLog['status']) {
  if (status === 'CheckedIn') return 'success';
  if (status === 'Denied') return 'danger';
  if (status === 'Pending') return 'warning';
  return 'info';
}

function getInvoiceTone(status: Invoice['status']) {
  if (status === 'Paid') return 'success';
  if (status === 'Overdue') return 'danger';
  if (status === 'PartiallyPaid') return 'warning';
  if (status === 'Waived') return 'info';
  return 'warning';
}

async function openLink(fileUrl: string, title: string) {
  const resolvedUrl = resolveAbsoluteUrl(fileUrl);
  if (!resolvedUrl) {
    Alert.alert('Unable to open', `${title} does not have a valid file link yet.`);
    return;
  }

  const supported = await Linking.canOpenURL(resolvedUrl);
  if (!supported) {
    Alert.alert('Unable to open', 'This document link is not supported on your device.');
    return;
  }

  await Linking.openURL(resolvedUrl);
}

async function handleCall(phoneNumber: string, label: string) {
  const normalizedNumber = String(phoneNumber || '').replace(/[^\d+]/g, '');
  if (!normalizedNumber) {
    Alert.alert('Number unavailable', `${label} does not have a phone number yet.`);
    return;
  }

  const telUrl = Platform.OS === 'ios' ? `telprompt:${normalizedNumber}` : `tel:${normalizedNumber}`;
  try {
    await Linking.openURL(telUrl);
  } catch {
    try {
      await Linking.openURL(`tel:${normalizedNumber}`);
    } catch {
      Alert.alert('Unable to call', `Dial manually: ${normalizedNumber}`);
    }
  }
}

function resolveAbsoluteUrl(fileUrl: string) {
  if (!fileUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  if (fileUrl.startsWith('/')) {
    return `${API_BASE_URL}${fileUrl}`;
  }

  return fileUrl;
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  content: {
    gap: 16,
    paddingBottom: 16,
  },
  headerCard: {
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 8,
  },
  billingHero: {
    borderRadius: 26,
    backgroundColor: '#f5f8ff',
    borderWidth: 1,
    borderColor: '#dce7fb',
    padding: 18,
    gap: 12,
  },
  billingHeroEyebrow: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  billingHeroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  billingHeroSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backButtonText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  inlineNotice: {
    borderRadius: 18,
    backgroundColor: '#fff5df',
    borderWidth: 1,
    borderColor: '#f0d79d',
    padding: 14,
  },
  inlineNoticeText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#eaf2ff',
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: colors.primaryDeep,
  },
  metricCard: {
    flex: 1,
    borderRadius: 22,
    padding: 16,
    gap: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionBody: {
    gap: 10,
  },
  detailList: {
    gap: 4,
  },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineItemAmount: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  listCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  simpleCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  amountText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  invoiceDetailCard: {
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    padding: 16,
    gap: 12,
  },
  invoiceMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  invoiceMetaItem: {
    minWidth: '47%',
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4,
  },
  invoiceMetaLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  invoiceMetaValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  subSection: {
    gap: 6,
  },
  subSectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  memberLine: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  noticeBadges: {
    gap: 6,
    alignItems: 'flex-end',
  },
  noticeBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  noticeContent: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  noticeDetailText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  openButton: {
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  disabledButton: {
    opacity: 0.55,
  },
  secondaryButton: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  openButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  pollOptionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pollOptionCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#eef4ff',
  },
  pollOptionTextActive: {
    color: colors.primaryDeep,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  alertMeta: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  contactGroup: {
    gap: 10,
  },
  contactGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
  },
  contactGroupTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  contactCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 10,
  },
  contactTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  contactName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  contactRole: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  phoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  phoneValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  callButton: {
    borderRadius: 14,
    backgroundColor: '#eaf2ff',
    borderWidth: 1,
    borderColor: '#cfe0ff',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  callButtonText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  committeeOpenHint: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  committeeMemberList: {
    gap: 10,
  },
  committeeMemberCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 35, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '78%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 14,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  modalBody: {
    gap: 14,
    paddingBottom: 16,
  },
  modalSection: {
    gap: 10,
  },
  closeButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
});
