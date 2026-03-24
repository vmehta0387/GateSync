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
  Invoice,
  NoticeItem,
  ResidentFlat,
  ResidentStaffDirectoryItem,
  SharedDocument,
  VisitorLog,
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
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [committees, setCommittees] = useState<CommitteeDirectoryItem[]>([]);
  const [staff, setStaff] = useState<ResidentStaffDirectoryItem[]>([]);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [message, setMessage] = useState('');

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
      const response = await fetchInvoices();
      if (response.success) {
        setInvoices(response.invoices || []);
      } else {
        setInvoices([]);
        setMessage(getFailureMessage(response) || 'Unable to load billing details.');
      }
      setRefreshing(false);
      return;
    }

    if (route === 'society') {
      const [flatsRes, committeesRes, noticesRes] = await Promise.all([
        fetchResidentFlats(),
        fetchCommitteeDirectory(),
        fetchNotices(),
      ]);

      if (flatsRes.success) setFlats(flatsRes.flats || []);
      if (committeesRes.success) setCommittees(committeesRes.committees || []);
      if (noticesRes.success) setNotices(noticesRes.notices || []);

      if (!flatsRes.success || !committeesRes.success || !noticesRes.success) {
        setMessage(getFailureMessage(flatsRes, committeesRes, noticesRes) || 'Unable to load society overview.');
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
  const unpaidTotal = useMemo(
    () => unpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    [unpaidInvoices],
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
            <View style={styles.summaryRow}>
              <MetricCard label="Pending amount" value={`Rs ${unpaidTotal.toFixed(0)}`} tone="danger" />
              <MetricCard label="Unpaid invoices" value={unpaidInvoices.length} tone="warning" />
            </View>
            <Section title="Invoice history">
              {invoices.length ? (
                invoices.map((invoice) => (
                  <View key={invoice.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.copy}>
                        <Text style={styles.itemTitle}>{invoice.block_name}-{invoice.flat_number}</Text>
                        <Text style={styles.itemMeta}>{invoice.month_year} / Due {invoice.due_date || 'Not set'}</Text>
                      </View>
                      <Badge label={invoice.status} tone={invoice.status === 'Paid' ? 'success' : 'warning'} />
                    </View>
                    <Text style={styles.amountText}>Rs {invoice.amount}</Text>
                  </View>
                ))
              ) : (
                <EmptyState title="No invoices yet" detail="Raised maintenance and billing items will appear here." />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
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
  openButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  alertMeta: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
});
