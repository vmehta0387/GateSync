import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { useSession } from '../providers/SessionProvider';
import { colors } from '../theme';
import { GuardShift, SecurityIncident, VisitorLog } from '../types/guard';
import { formatDateTime, formatDayLabel, formatShiftWindow, getDateKey, toValidDate } from '../utils/format';

export function GuardHomeScreen({
  activeShift,
  upcomingShift,
  approvedArrivalsCount,
  insideVisitorsCount,
  openIncidentsCount,
  visitorLogs,
  openIncidents,
  onStartShift,
  onEndShift,
  onLogActivity,
}: {
  activeShift: GuardShift | null;
  upcomingShift: GuardShift | null;
  approvedArrivalsCount: number;
  insideVisitorsCount: number;
  openIncidentsCount: number;
  visitorLogs: VisitorLog[];
  openIncidents: SecurityIncident[];
  onStartShift: () => Promise<void>;
  onEndShift: () => Promise<void>;
  onLogActivity: (type: 'Patrol' | 'Mistake', note: string) => Promise<void>;
}) {
  const { session, signOut } = useSession();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [movementTab, setMovementTab] = useState<'today' | 'past'>('today');
  const guardName = session?.user.name?.trim() || `Guard #${session?.user.id ?? ''}`;
  const todayKey = useMemo(() => getDateKey(new Date().toISOString()), []);

  const sortedVisitorLogs = useMemo(
    () => [...visitorLogs].sort((a, b) => {
      const aTime = toValidDate(a.entry_time || a.expected_time || a.approval_requested_at)?.getTime() || 0;
      const bTime = toValidDate(b.entry_time || b.expected_time || b.approval_requested_at)?.getTime() || 0;
      return bTime - aTime;
    }),
    [visitorLogs],
  );

  const todayLogs = useMemo(
    () => sortedVisitorLogs
      .filter((log) => getDateKey(log.entry_time || log.expected_time || log.approval_requested_at) === todayKey)
      .slice(0, 6),
    [sortedVisitorLogs, todayKey],
  );

  const pastLogs = useMemo(
    () => sortedVisitorLogs
      .filter((log) => {
        const logDateKey = getDateKey(log.entry_time || log.expected_time || log.approval_requested_at);
        return Boolean(logDateKey && logDateKey !== todayKey);
      })
      .slice(0, 6),
    [sortedVisitorLogs, todayKey],
  );

  const visibleLogs = movementTab === 'today' ? todayLogs : pastLogs;

  const submitActivity = async (type: 'Patrol' | 'Mistake') => {
    setSubmitting(true);
    await onLogActivity(type, note);
    setNote('');
    setSubmitting(false);
  };

  const handleShiftAction = async () => {
    try {
      if (activeShift) {
        await onEndShift();
      } else if (upcomingShift) {
        await onStartShift();
      }
    } catch {
      Alert.alert('Action unavailable', 'Please try again.');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.panelStrong}>
        <View style={styles.shiftHeader}>
          <View style={styles.shiftCopy}>
            <Text style={styles.panelKicker}>Welcome, {guardName}</Text>
            <Text style={styles.shiftTitle}>
              {activeShift?.shift_label || upcomingShift?.shift_label || 'No shift assigned'}
            </Text>
            <Text style={styles.shiftSubtitle}>
              {activeShift
                ? formatShiftWindow(activeShift.scheduled_start, activeShift.scheduled_end)
                : upcomingShift
                  ? `Upcoming: ${formatShiftWindow(upcomingShift.scheduled_start, upcomingShift.scheduled_end)}`
                  : 'Admin has not scheduled a roster window yet.'}
            </Text>
          </View>
          <Badge
            label={activeShift ? 'On duty' : upcomingShift ? 'Scheduled' : 'Unassigned'}
            tone={activeShift ? 'success' : upcomingShift ? 'warning' : 'neutral'}
          />
        </View>

        {activeShift || upcomingShift ? (
          <Pressable style={styles.primaryAction} onPress={() => void handleShiftAction()}>
            <Text style={styles.primaryActionText}>{activeShift ? 'End Duty' : 'Start Duty'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Awaiting arrival" value={approvedArrivalsCount} tone="primary" />
        <StatCard label="Inside campus" value={insideVisitorsCount} />
        <StatCard label="Open incidents" value={openIncidentsCount} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Quick guard log</Text>
        <Text style={styles.sectionSubtitle}>
          Drop fast notes for patrol rounds, misses, or suspicious movement.
        </Text>
        <TextInput
          multiline
          value={note}
          onChangeText={setNote}
          placeholder="Checkpoint cleared, gate mismatch, vendor dispute..."
          placeholderTextColor={colors.textMuted}
          style={styles.textArea}
        />
        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => void submitActivity('Patrol')}
            disabled={submitting}
            style={[styles.inlineButton, styles.successButton]}
          >
            <Text style={styles.inlineButtonText}>Log Patrol</Text>
          </Pressable>
          <Pressable
            onPress={() => void submitActivity('Mistake')}
            disabled={submitting}
            style={[styles.inlineButton, styles.warningButton]}
          >
            <Text style={styles.warningButtonText}>Log Mistake</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Recent visitor movement</Text>
        <View style={styles.tabRow}>
          <Pressable onPress={() => setMovementTab('today')} style={[styles.tabButton, movementTab === 'today' ? styles.tabButtonActive : null]}>
            <Text style={[styles.tabButtonText, movementTab === 'today' ? styles.tabButtonTextActive : null]}>Today</Text>
          </Pressable>
          <Pressable onPress={() => setMovementTab('past')} style={[styles.tabButton, movementTab === 'past' ? styles.tabButtonActive : null]}>
            <Text style={[styles.tabButtonText, movementTab === 'past' ? styles.tabButtonTextActive : null]}>Past</Text>
          </Pressable>
        </View>
        <View style={styles.list}>
          {visibleLogs.length ? visibleLogs.map((log, index) => (
            <View key={log.id} style={styles.listCard}>
              {movementTab === 'past' && (index === 0 || getDateKey(visibleLogs[index - 1].entry_time || visibleLogs[index - 1].expected_time || visibleLogs[index - 1].approval_requested_at) !== getDateKey(log.entry_time || log.expected_time || log.approval_requested_at)) ? (
                <Text style={styles.dayLabel}>{formatDayLabel(log.entry_time || log.expected_time || log.approval_requested_at)}</Text>
              ) : null}
              <View style={styles.listHeader}>
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{log.visitor_name}</Text>
                  <Text style={styles.listMeta}>{log.block_name}-{log.flat_number} / {log.purpose}</Text>
                </View>
                <Badge
                  label={log.status}
                  tone={log.status === 'CheckedIn' ? 'success' : log.status === 'Pending' ? 'warning' : 'info'}
                />
              </View>
              <Text style={styles.listTimestamp}>
                {formatDateTime(log.entry_time || log.expected_time || log.approval_requested_at)}
              </Text>
            </View>
          )) : (
            <EmptyState
              title={movementTab === 'today' ? 'No visitor movement today' : 'No past visitor movement'}
              detail={movementTab === 'today' ? 'New arrivals, approvals, and check-outs will show up here.' : 'Older visitor activity will show up here when available.'}
            />
          )}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Open incidents</Text>
        <View style={styles.list}>
          {openIncidents.length ? openIncidents.map((incident) => (
            <View key={incident.id} style={styles.listCard}>
              <View style={styles.listHeader}>
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle}>{incident.title}</Text>
                  <Text style={styles.listMeta}>{incident.category} / {incident.location || 'Security zone'}</Text>
                </View>
                <Badge
                  label={incident.severity}
                  tone={incident.severity === 'Critical' || incident.severity === 'High' ? 'danger' : 'warning'}
                />
              </View>
              <Text style={styles.bodyText}>{incident.description}</Text>
            </View>
          )) : (
            <EmptyState
              title="No open incidents"
              detail="Your live security queue is clear right now."
            />
          )}
        </View>
      </View>

      <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  panelStrong: {
    backgroundColor: colors.secondary,
    borderRadius: 24,
    padding: 20,
    gap: 18,
  },
  panelKicker: {
    color: '#90c2ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  shiftHeader: {
    gap: 12,
  },
  shiftCopy: {
    gap: 6,
  },
  shiftTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  shiftSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryAction: {
    borderRadius: 18,
    backgroundColor: colors.primary,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  panel: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
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
  textArea: {
    minHeight: 108,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    textAlignVertical: 'top',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successButton: {
    backgroundColor: colors.success,
  },
  warningButton: {
    backgroundColor: '#fff5e7',
    borderWidth: 1,
    borderColor: '#f5c47b',
  },
  inlineButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  warningButtonText: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '800',
  },
  list: {
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabButtonActive: {
    backgroundColor: '#e7efff',
    borderColor: '#bfd3ff',
  },
  tabButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  tabButtonTextActive: {
    color: colors.primaryDeep,
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
    gap: 12,
    alignItems: 'flex-start',
  },
  listCopy: {
    flex: 1,
    gap: 3,
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
  dayLabel: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  listTimestamp: {
    color: colors.textMuted,
    fontSize: 12,
  },
  bodyText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  logoutButton: {
    borderRadius: 18,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: '#203247',
    alignItems: 'center',
    paddingVertical: 15,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
