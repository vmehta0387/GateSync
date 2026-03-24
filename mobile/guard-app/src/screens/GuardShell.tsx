import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { TabBar, type GuardTab } from '../components/TabBar';
import { subscribeToGuardLiveUpdates } from '../lib/socket';
import { useSession } from '../providers/SessionProvider';
import {
  checkInApprovedVisitor,
  checkInWithPasscode,
  checkOutVisitor,
  createIncident,
  createWalkInVisitor,
  endShift,
  fetchGuardShifts,
  fetchIncidents,
  fetchSocietyFlats,
  fetchStaffDirectory,
  fetchVisitorLogs,
  logStaffEntry,
  logStaffExit,
  logQuickActivity,
  startShift,
} from '../services/guard';
import { colors } from '../theme';
import { FlatOption, GuardShift, SecurityIncident, StaffMember, VisitorLog } from '../types/guard';
import { HomeScreen } from './HomeScreen';
import { IncidentsScreen } from './IncidentsScreen';
import { ProfileScreen } from './ProfileScreen';
import { VisitorsScreen } from './VisitorsScreen';

export function GuardShell() {
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<GuardTab>('home');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [shifts, setShifts] = useState<GuardShift[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [flatOptions, setFlatOptions] = useState<FlatOption[]>([]);

  const loadAll = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const [logsResponse, shiftsResponse, incidentsResponse, staffResponse, flatsResponse] = await Promise.all([
      fetchVisitorLogs(),
      fetchGuardShifts(),
      fetchIncidents(),
      fetchStaffDirectory(),
      fetchSocietyFlats(),
    ]);

    if (logsResponse.success) setLogs(logsResponse.logs || []);
    if (shiftsResponse.success) setShifts(shiftsResponse.shifts || []);
    if (incidentsResponse.success) setIncidents(incidentsResponse.incidents || []);
    if (staffResponse.success) setStaffList(staffResponse.staff || []);
    if (flatsResponse.success) setFlatOptions(flatsResponse.flats || []);

    if (!logsResponse.success || !shiftsResponse.success || !incidentsResponse.success || !staffResponse.success || !flatsResponse.success) {
      Alert.alert(
        'Some data did not load',
        logsResponse.message || shiftsResponse.message || incidentsResponse.message || staffResponse.message || flatsResponse.message || 'Please refresh again.',
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadAll('initial');
  }, [loadAll]);

  useEffect(() => {
    if (!session?.user.society_id) {
      return undefined;
    }

    return subscribeToGuardLiveUpdates(session.user.society_id, () => {
      void loadAll();
    });
  }, [loadAll, session?.user.society_id]);

  const activeShift = useMemo(() => shifts.find((shift) => shift.status === 'OnDuty') || null, [shifts]);
  const upcomingShift = useMemo(() => shifts.find((shift) => shift.status === 'Scheduled') || null, [shifts]);
  const approvedArrivals = useMemo(() => logs.filter((log) => log.status === 'Approved'), [logs]);
  const insideVisitors = useMemo(() => logs.filter((log) => log.status === 'CheckedIn'), [logs]);
  const openIncidents = useMemo(
    () => incidents.filter((incident) => incident.status === 'Open' || incident.status === 'InReview'),
    [incidents],
  );

  const withReload = async (operation: () => Promise<{ success: boolean; message?: string }>) => {
    const result = await operation();
    if (!result.success) {
      Alert.alert('Action unavailable', result.message || 'Please try again.');
      return;
    }

    await loadAll();
  };

  if (loading && !logs.length && !shifts.length && !incidents.length && !staffList.length && !flatOptions.length) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <EmptyState
            title="Loading guard workspace"
            detail="Pulling today&apos;s shifts, visitor movement, and security incidents."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      >
        <View style={styles.header}>
          <TabBar activeTab={activeTab} onChange={setActiveTab} />
        </View>

        {activeTab === 'home' ? (
          <HomeScreen
            activeShift={activeShift}
            upcomingShift={upcomingShift}
            approvedArrivalsCount={approvedArrivals.length}
            insideVisitorsCount={insideVisitors.length}
            openIncidentsCount={openIncidents.length}
            recentLogs={logs.slice(0, 6)}
            openIncidents={openIncidents.slice(0, 4)}
            onStartShift={() => withReload(() => startShift(upcomingShift?.id || 0))}
            onEndShift={() => withReload(() => endShift(activeShift?.id || 0))}
            onLogActivity={(type, note) => withReload(() => logQuickActivity(type, note))}
          />
        ) : null}

        {activeTab === 'visitors' ? (
          <VisitorsScreen
            logs={logs}
            staffList={staffList}
            flatOptions={flatOptions}
            approvedArrivals={approvedArrivals}
            activeVisitors={insideVisitors}
            onPasscodeCheckIn={(passcode) => withReload(() => checkInWithPasscode(passcode))}
            onWalkInSubmit={(payload) => withReload(() => createWalkInVisitor(payload))}
            onCheckOut={(logId) => withReload(() => checkOutVisitor(logId))}
            onApprovedCheckIn={(logId) => withReload(() => checkInApprovedVisitor(logId))}
            onStaffCheckIn={(staffId) => withReload(() => logStaffEntry(staffId))}
            onStaffCheckOut={(staffId) => withReload(() => logStaffExit(staffId))}
          />
        ) : null}

        {activeTab === 'incidents' ? (
          <IncidentsScreen incidents={incidents} onSubmit={(payload) => withReload(() => createIncident(payload))} />
        ) : null}

        {activeTab === 'profile' ? <ProfileScreen /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 28,
    gap: 20,
  },
  loadingWrap: {
    flex: 1,
    padding: 18,
    justifyContent: 'center',
  },
  header: {
    gap: 10,
  },
});
