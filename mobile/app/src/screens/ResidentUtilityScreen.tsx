import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
  ImportantContactPerson,
  ImportantServiceStaff,
  Invoice,
  NoticeItem,
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
    subtitle: 'See linked flats, public committees, and the latest society updates in one place.',
  },
  notices: {
    title: 'Notices',
    subtitle: 'Read society announcements, urgent alerts, and maintenance updates.',
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
      const [flatsRes, committeesRes, noticesRes, contactsRes] = await Promise.all([
        fetchResidentFlats(),
        fetchCommitteeDirectory(),
        fetchNotices(),
        fetchImportantContacts(),
      ]);

      if (flatsRes.success) setFlats(flatsRes.flats || []);
      if (committeesRes.success) setCommittees(committeesRes.committees || []);
      if (noticesRes.success) setNotices(noticesRes.notices || []);
      if (contactsRes.success) {
        setImportantContacts(contactsRes.contacts || { admins: [], managers: [], service_staff: [] });
      }

      if (!flatsRes.success || !committeesRes.success || !noticesRes.success || !contactsRes.success) {
        setMessage(getFailureMessage(flatsRes, committeesRes, noticesRes, contactsRes) || 'Unable to load society overview.');
      }
      setRefreshing(false);
      return;
    }

    if (route === 'notices') {
      const response = await fetchNotices();
      if (response.success) {
        setNotices(response.notices || []);
      } else {
        setNotices([]);
        setMessage(getFailureMessage(response) || 'Unable to load notices.');
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
  const insideVisitors = useMemo(() => logs.filter((log) => log.status === 'CheckedIn'), [logs]);

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
                        <Text style={styles.secondaryButtonText}>Open invoice</Text>
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
            <Section title="Linked flats">
              {flats.length ? (
                flats.map((flat) => (
                  <View key={flat.flat_id} style={styles.simpleCard}>
                    <Text style={styles.itemTitle}>{flat.block_name}-{flat.flat_number}</Text>
                    <Text style={styles.itemMeta}>{flat.type}</Text>
                  </View>
                ))
              ) : (
                <EmptyState title="No flats linked" detail="Ask your admin to map your account to the correct apartment." />
              )}
            </Section>

            <Section title="Important numbers">
              {importantContacts.admins.length || importantContacts.managers.length || importantContacts.service_staff.length ? (
                <>
                  {importantContacts.managers.length ? (
                    <ContactGroup
                      title="Society manager"
                      contacts={importantContacts.managers}
                      onCall={handleCall}
                    />
                  ) : null}
                  {importantContacts.admins.length ? (
                    <ContactGroup
                      title="Society admin"
                      contacts={importantContacts.admins}
                      onCall={handleCall}
                    />
                  ) : null}
                  {(['Security', 'Cleaner', 'Plumber', 'Electrician'] as const).map((staffType) => {
                    const filteredStaff = importantContacts.service_staff.filter((member) => member.type === staffType);
                    if (!filteredStaff.length) {
                      return null;
                    }

                    return (
                      <ServiceStaffGroup
                        key={staffType}
                        title={staffType === 'Cleaner' ? 'Housekeeping' : staffType}
                        contacts={filteredStaff}
                        onCall={handleCall}
                      />
                    );
                  })}
                </>
              ) : (
                <EmptyState title="No important contacts shared yet" detail="Admin, manager, and service team contact numbers will appear here once configured." />
              )}
            </Section>

            <Section title="Committee directory">
              {committees.length ? (
                committees.map((committee) => (
                  <View key={committee.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.copy}>
                        <Text style={styles.itemTitle}>{committee.name}</Text>
                        <Text style={styles.itemMeta}>{committee.committee_type} / {committee.member_count} member(s)</Text>
                      </View>
                      <Badge label={committee.status} tone="info" />
                    </View>
                    {committee.members.slice(0, 4).map((member) => (
                      <Text key={member.id} style={styles.memberLine}>
                        {member.role_title}: {member.name}{member.is_primary_contact ? ' (primary)' : ''}
                      </Text>
                    ))}
                  </View>
                ))
              ) : (
                <EmptyState title="No public committees yet" detail="Public committee names and roles will appear here once published." />
              )}
            </Section>

            <Section title="Latest notices">
              {notices.length ? (
                notices.slice(0, 5).map((notice) => <NoticeCard key={notice.id} notice={notice} compact />)
              ) : (
                <EmptyState title="No notices yet" detail="Society announcements will show up here when published." />
              )}
            </Section>
          </>
        ) : null}

        {route === 'notices' ? (
          <Section title="All notices">
            {notices.length ? (
              notices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)
            ) : (
              <EmptyState title="No notices published" detail="Admin announcements and urgent updates will appear here." />
            )}
          </Section>
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

function ContactGroup({
  title,
  contacts,
  onCall,
}: {
  title: string;
  contacts: ImportantContactPerson[];
  onCall: (phoneNumber: string, label: string) => Promise<void>;
}) {
  return (
    <View style={styles.contactGroup}>
      <Text style={styles.contactGroupTitle}>{title}</Text>
      {contacts.map((contact) => (
        <View key={`${title}-${contact.id}`} style={styles.contactCard}>
          <View style={styles.contactTopRow}>
            <View style={styles.copy}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactRole}>{contact.label || contact.role || title}</Text>
            </View>
          </View>
          <View style={styles.phoneRow}>
            <Text style={styles.phoneValue}>{contact.phone_number || 'Number not shared'}</Text>
            <Pressable style={styles.callButton} onPress={() => void onCall(contact.phone_number, contact.name)}>
              <Text style={styles.callButtonText}>Call</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function ServiceStaffGroup({
  title,
  contacts,
  onCall,
}: {
  title: string;
  contacts: ImportantServiceStaff[];
  onCall: (phoneNumber: string, label: string) => Promise<void>;
}) {
  return (
    <View style={styles.contactGroup}>
      <Text style={styles.contactGroupTitle}>{title}</Text>
      {contacts.map((contact) => (
        <View key={`${contact.type}-${contact.id}`} style={styles.contactCard}>
          <View style={styles.contactTopRow}>
            <View style={styles.copy}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactRole}>
                {contact.assignment_scope === 'SOCIETY' ? 'Society-wide support' : 'Assigned support'}
                {contact.shift_timing ? ` / ${contact.shift_timing}` : ''}
              </Text>
            </View>
            <Badge label={contact.type} tone="info" />
          </View>
          <View style={styles.phoneRow}>
            <Text style={styles.phoneValue}>{contact.phone_number || 'Number not shared'}</Text>
            <Pressable style={styles.callButton} onPress={() => void onCall(contact.phone_number, contact.name)}>
              <Text style={styles.callButtonText}>Call</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function NoticeCard({ notice, compact = false }: { notice: NoticeItem; compact?: boolean }) {
  return (
    <View style={styles.listCard}>
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
    </View>
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

  const telUrl = `tel:${normalizedNumber}`;
  const supported = await Linking.canOpenURL(telUrl);
  if (!supported) {
    Alert.alert('Unable to call', 'Calling is not supported on this device.');
    return;
  }

  await Linking.openURL(telUrl);
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
  noticeContent: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
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
  contactGroupTitle: {
    color: colors.text,
    fontSize: 13,
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
});
