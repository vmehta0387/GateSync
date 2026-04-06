import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabBar, type ResidentTab } from '../components/TabBar';
import { subscribeToNotificationIntents } from '../lib/notifications';
import { colors } from '../theme';
import type { ResidentActionRoute } from '../types/navigation';
import { ResidentComplaintsScreen } from './ResidentComplaintsScreen';
import { ResidentFacilitiesScreen } from './ResidentFacilitiesScreen';
import { ResidentHomeScreen } from './ResidentHomeScreen';
import { ResidentProfileScreen } from './ResidentProfileScreen';
import { ResidentUtilityScreen } from './ResidentUtilityScreen';
import { ResidentVisitorsScreen } from './ResidentVisitorsScreen';

export function ResidentShell() {
  const [activeTab, setActiveTab] = useState<ResidentTab>('home');
  const [activeAction, setActiveAction] = useState<ResidentActionRoute | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToNotificationIntents((intent) => {
      if (intent.type !== 'visitor_pending_approval') {
        return;
      }

      setActiveAction(null);
      setActiveTab('visitors');
    });

    return unsubscribe;
  }, []);

  const handleTabChange = (nextTab: ResidentTab) => {
    setActiveAction(null);
    setActiveTab(nextTab);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TabBar activeTab={activeTab} onChange={handleTabChange} />
        {activeAction ? (
          <ResidentUtilityScreen route={activeAction} onBack={() => setActiveAction(null)} />
        ) : null}
        {!activeAction && activeTab === 'home' ? (
          <ResidentHomeScreen onNavigate={handleTabChange} onOpenAction={setActiveAction} />
        ) : null}
        {!activeAction && activeTab === 'visitors' ? <ResidentVisitorsScreen onBack={() => handleTabChange('home')} /> : null}
        {!activeAction && activeTab === 'complaints' ? <ResidentComplaintsScreen /> : null}
        {!activeAction && activeTab === 'facilities' ? <ResidentFacilitiesScreen /> : null}
        {!activeAction && activeTab === 'profile' ? <ResidentProfileScreen /> : null}
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
    gap: 18,
  },
});
