import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { subscribeToResidentVisitorUpdates } from '../lib/socket';
import { useSession } from '../providers/SessionProvider';
import {
  fetchCommitteeDirectory,
  fetchComplaints,
  fetchInvoices,
  fetchPendingApprovals,
  fetchResidentFlats,
  fetchVisitorLogs,
} from '../services/resident';
import { colors } from '../theme';
import { CommitteeDirectoryItem, ComplaintSummaryItem, Invoice, ResidentFlat, VisitorLog } from '../types/resident';
import type { ResidentActionRoute } from '../types/navigation';
import type { ResidentTab } from '../components/TabBar';
import { formatDateTime } from '../utils/format';

type HomeAction = {
  code: string;
  label: string;
  helper: string;
  tab?: ResidentTab;
  actionRoute?: ResidentActionRoute;
  tone?: 'primary' | 'neutral';
  badge?: string;
};

export function ResidentHomeScreen({
  onNavigate,
  onOpenAction,
}: {
  onNavigate: (tab: ResidentTab) => void;
  onOpenAction: (route: ResidentActionRoute) => void;
}) {
  const { session } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [flats, setFlats] = useState<ResidentFlat[]>([]);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<VisitorLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [committees, setCommittees] = useState<CommitteeDirectoryItem[]>([]);
  const [complaints, setComplaints] = useState<ComplaintSummaryItem[]>([]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const [flatsRes, logsRes, pendingRes, invoicesRes, committeesRes, complaintsRes] = await Promise.all([
      fetchResidentFlats(),
      fetchVisitorLogs(),
      fetchPendingApprovals(),
      fetchInvoices(),
      fetchCommitteeDirectory(),
      fetchComplaints(),
    ]);

    if (flatsRes.success) setFlats(flatsRes.flats || []);
    if (logsRes.success) setLogs(logsRes.logs || []);
    if (pendingRes.success) setPendingApprovals(pendingRes.approvals || []);
    if (invoicesRes.success) setInvoices(invoicesRes.invoices || []);
    if (committeesRes.success) setCommittees(committeesRes.committees || []);
    if (complaintsRes.success) setComplaints(complaintsRes.complaints || []);
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
  const activeVisitors = useMemo(() => logs.filter((log) => log.status === 'CheckedIn'), [logs]);
  const unpaidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === 'Unpaid'), [invoices]);
  const unpaidTotal = useMemo(
    () => unpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    [unpaidInvoices],
  );
  const openComplaints = useMemo(
    () => complaints.filter((complaint) => !['Resolved', 'Closed'].includes(complaint.status)),
    [complaints],
  );
  const residentName = useMemo(() => {
    const rawName = session?.user?.name?.trim();
    return rawName || 'Resident';
  }, [session?.user?.name]);

  const quickCategories: HomeAction[] = [
    { code: 'VS', label: 'Visitors', helper: 'Entry and approvals', tab: 'visitors', tone: 'primary' },
    { code: 'BL', label: 'Bills', helper: `${unpaidInvoices.length} unpaid`, actionRoute: 'bills' },
    { code: 'SC', label: 'Society', helper: `${committees.length} public groups`, actionRoute: 'society' },
    { code: 'HD', label: 'Helpdesk', helper: `${openComplaints.length} open`, tab: 'complaints' },
  ];

  const mainActions: HomeAction[] = [
    { code: 'VP', label: 'Visit Pass', helper: 'Create entry pass', tab: 'visitors', tone: 'primary' },
    { code: 'AE', label: 'Approve Entry', helper: 'Gate requests', tab: 'visitors', badge: pendingApprovals.length ? String(pendingApprovals.length) : '' },
    { code: 'AM', label: 'Amenities', helper: 'Book facilities', tab: 'facilities' },
    { code: 'CP', label: 'Complaints', helper: 'Raise issue', tab: 'complaints' },
    { code: 'NT', label: 'Notices', helper: 'Society updates', actionRoute: 'notices' },
    { code: 'MF', label: 'My Flat', helper: flats[0] ? `${flats[0].block_name}-${flats[0].flat_number}` : 'Apartment info', actionRoute: 'myFlat' },
    { code: 'SF', label: 'Staff', helper: 'Household staff', actionRoute: 'staff' },
    { code: 'DC', label: 'Documents', helper: 'Rules and files', actionRoute: 'documents' },
  ];

  const handleAction = (action: HomeAction) => {
    if (action.tab) {
      onNavigate(action.tab);
      return;
    }

    if (action.actionRoute) {
      onOpenAction(action.actionRoute);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>GateSync Resident</Text>
          <Text style={styles.title}>Welcome, {residentName}</Text>
        </View>

        <View style={styles.categoryRow}>
          {quickCategories.map((item) => (
            <Pressable key={item.code} onPress={() => handleAction(item)} style={[styles.categoryCard, item.tone === 'primary' ? styles.categoryCardPrimary : null]}>
              <View style={[styles.categoryIcon, item.tone === 'primary' ? styles.categoryIconPrimary : null]}>
                <Text style={[styles.categoryIconText, item.tone === 'primary' ? styles.categoryIconTextPrimary : null]}>{item.code}</Text>
              </View>
              <Text style={[styles.categoryTitle, item.tone === 'primary' ? styles.categoryTitlePrimary : null]}>{item.label}</Text>
              <Text style={[styles.categoryHelper, item.tone === 'primary' ? styles.categoryHelperPrimary : null]}>{item.helper}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.mainPanel}>
          <Text style={styles.panelTitle}>Quick actions</Text>
          <View style={styles.actionGrid}>
            {mainActions.map((action) => (
              <Pressable key={action.code} onPress={() => handleAction(action)} style={[styles.actionCard, action.tone === 'primary' ? styles.actionCardPrimary : null]}>
                <View style={styles.actionTopRow}>
                  <View style={[styles.actionIcon, action.tone === 'primary' ? styles.actionIconPrimary : null]}>
                    <Text style={[styles.actionIconText, action.tone === 'primary' ? styles.actionIconTextPrimary : null]}>{action.code}</Text>
                  </View>
                  {action.badge ? (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionBadgeText}>{action.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.actionTitle}>{action.label}</Text>
                <Text style={styles.actionHelper}>{action.helper}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.statusGrid}>
          <StatusCard label="Pending approvals" value={pendingApprovals.length} helper="Gate requests waiting on you" tone="warning" />
          <StatusCard label="Upcoming visitors" value={upcomingVisitors.length} helper="Pre-approved passes" tone="primary" />
          <StatusCard label="Pending dues" value={`Rs ${unpaidTotal.toFixed(0)}`} helper={`${unpaidInvoices.length} unpaid invoice(s)`} tone="danger" />
          <StatusCard label="Open complaints" value={openComplaints.length} helper="Issues still being resolved" tone="neutral" />
        </View>

        <View style={styles.mainPanel}>
          <Text style={styles.panelTitle}>Operational updates</Text>
          <View style={styles.dualColumn}>
            <View style={styles.infoColumn}>
              <Text style={styles.infoTitle}>Pending approvals</Text>
              {pendingApprovals.length ? pendingApprovals.slice(0, 3).map((log) => (
                <InfoRow key={log.id} title={log.visitor_name} detail={`${log.purpose} / ${log.block_name}-${log.flat_number}`} meta={formatDateTime(log.approval_requested_at || null)} badgeLabel="Pending" badgeTone="warning" />
              )) : (
                <EmptyState title="No approvals waiting" detail="Guard requests needing your approval will appear here." />
              )}
            </View>

            <View style={styles.infoColumn}>
              <Text style={styles.infoTitle}>Upcoming visitors</Text>
              {upcomingVisitors.length ? upcomingVisitors.slice(0, 3).map((log) => (
                <InfoRow key={log.id} title={log.visitor_name} detail={`${log.purpose} / ${log.block_name}-${log.flat_number}`} meta={log.passcode || 'Approved'} badgeLabel="Pass ready" badgeTone="info" />
              )) : (
                <EmptyState title="No upcoming visitors" detail="Generated gate passes will be listed here." />
              )}
            </View>
          </View>
        </View>

        <View style={styles.mainPanel}>
          <Text style={styles.panelTitle}>Society desk</Text>
          <View style={styles.dualColumn}>
            <View style={styles.infoColumn}>
              <Text style={styles.infoTitle}>My flats</Text>
              {flats.length ? flats.map((flat) => (
                <View key={flat.flat_id} style={styles.simpleCard}>
                  <Text style={styles.simpleTitle}>{flat.block_name}-{flat.flat_number}</Text>
                  <Text style={styles.simpleMeta}>{flat.type}</Text>
                </View>
              )) : (
                <EmptyState title="No flats linked" detail="Ask your society admin to map your resident account." />
              )}
            </View>

            <View style={styles.infoColumn}>
              <Text style={styles.infoTitle}>Committee directory</Text>
              {committees.length ? committees.slice(0, 3).map((committee) => (
                <View key={committee.id} style={styles.simpleCard}>
                  <Text style={styles.simpleTitle}>{committee.name}</Text>
                  {committee.members.slice(0, 3).map((member) => (
                    <Text key={member.id} style={styles.simpleMeta}>
                      {member.role_title}: {member.name}{member.is_primary_contact ? ' (primary)' : ''}
                    </Text>
                  ))}
                </View>
              )) : (
                <EmptyState title="No public committees yet" detail="Once your society publishes committees, member names and roles will appear here." />
              )}
            </View>
          </View>
        </View>

        <View style={styles.mainPanel}>
          <Text style={styles.panelTitle}>Resident health</Text>
          <View style={styles.dualColumn}>
            <View style={styles.infoColumn}>
              <Text style={styles.infoTitle}>Pending dues</Text>
              {unpaidInvoices.length ? unpaidInvoices.slice(0, 3).map((invoice) => (
                <InfoRow key={invoice.id} title={`${invoice.block_name}-${invoice.flat_number}`} detail={`${invoice.month_year} / Rs ${invoice.amount}`} meta={invoice.due_date || 'No due date'} badgeLabel="Unpaid" badgeTone="warning" />
              )) : (
                <EmptyState title="No pending dues" detail="Your unpaid invoices will show up here when billing is raised." />
              )}
            </View>

            <View style={styles.infoColumn}>
              <Text style={styles.infoTitle}>Open complaints</Text>
              {openComplaints.length ? openComplaints.slice(0, 3).map((complaint) => (
                <InfoRow key={complaint.id} title={complaint.ticket_id} detail={complaint.category_name} meta={complaint.description} badgeLabel={complaint.status} badgeTone={complaint.is_overdue ? 'danger' : 'info'} />
              )) : (
                <EmptyState title="No active complaints" detail="Raised issues that are still open will appear here." />
              )}
            </View>
          </View>
        </View>

        <View style={styles.mainPanel}>
          <Text style={styles.panelTitle}>Live presence</Text>
          {activeVisitors.length ? activeVisitors.slice(0, 4).map((log) => (
            <InfoRow key={log.id} title={log.visitor_name} detail={`${log.purpose} / ${log.block_name}-${log.flat_number}`} meta={`Entered ${formatDateTime(log.entry_time)}`} badgeLabel="Inside" badgeTone="success" />
          )) : (
            <EmptyState title="No visitors inside" detail="Live gate check-ins will appear here once a visitor is marked inside." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatusCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone: 'primary' | 'warning' | 'danger' | 'neutral';
}) {
  const toneStyles = {
    primary: { bg: '#e9f1ff', ink: colors.primaryDeep },
    warning: { bg: '#fff4e3', ink: colors.warning },
    danger: { bg: '#fff0f0', ink: colors.danger },
    neutral: { bg: colors.surfaceMuted, ink: colors.text },
  }[tone];

  return (
    <View style={[styles.statusCard, { backgroundColor: toneStyles.bg }]}>
      <Text style={[styles.statusValue, { color: toneStyles.ink }]}>{value}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusHelper}>{helper}</Text>
    </View>
  );
}

function InfoRow({
  title,
  detail,
  meta,
  badgeLabel,
  badgeTone,
}: {
  title: string;
  detail: string;
  meta: string;
  badgeLabel: string;
  badgeTone: 'info' | 'warning' | 'success' | 'danger';
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoRowHeader}>
        <View style={styles.infoCopy}>
          <Text style={styles.infoRowTitle}>{title}</Text>
          <Text style={styles.infoRowDetail}>{detail}</Text>
        </View>
        <Badge label={badgeLabel} tone={badgeTone} />
      </View>
      <Text style={styles.infoRowMeta}>{meta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  content: {
    gap: 16,
    paddingBottom: 12,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: colors.secondary,
    padding: 20,
    gap: 8,
  },
  eyebrow: {
    color: '#9fc0ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  categoryCardPrimary: {
    backgroundColor: '#edf3ff',
    borderColor: '#cddcff',
  },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconPrimary: {
    backgroundColor: colors.primary,
  },
  categoryIconText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  categoryIconTextPrimary: {
    color: colors.white,
  },
  categoryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  categoryTitlePrimary: {
    color: colors.primaryDeep,
  },
  categoryHelper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  categoryHelperPrimary: {
    color: colors.primaryDeep,
  },
  mainPanel: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 10,
  },
  actionCardPrimary: {
    backgroundColor: '#edf3ff',
  },
  actionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: colors.primary,
  },
  actionIconText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  actionIconTextPrimary: {
    color: colors.white,
  },
  actionBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  actionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  actionHelper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusCard: {
    width: '47%',
    borderRadius: 22,
    padding: 14,
    gap: 4,
  },
  statusValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  statusLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  statusHelper: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  dualColumn: {
    gap: 14,
  },
  infoColumn: {
    gap: 10,
  },
  infoTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  infoCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 8,
  },
  infoRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoCopy: {
    flex: 1,
    gap: 4,
  },
  infoRowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  infoRowDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  infoRowMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  simpleCard: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  simpleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  simpleMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
});
