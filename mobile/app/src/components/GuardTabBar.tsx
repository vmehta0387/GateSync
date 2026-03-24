import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type GuardTab = 'home' | 'visitors' | 'incidents' | 'profile';

const tabs: Array<{ id: GuardTab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'visitors', label: 'Visitors' },
  { id: 'incidents', label: 'Issues' },
  { id: 'profile', label: 'Profile' },
];

export function GuardTabBar({
  activeTab,
  onChange,
}: {
  activeTab: GuardTab;
  onChange: (tab: GuardTab) => void;
}) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          onPress={() => onChange(tab.id)}
          style={[styles.tab, activeTab === tab.id ? styles.activeTab : null]}
        >
          <View style={[styles.iconTile, activeTab === tab.id ? styles.activeIconTile : null]}>
            <Text style={[styles.iconText, activeTab === tab.id ? styles.activeIconText : null]}>
              {tab.label.charAt(0)}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.label, activeTab === tab.id ? styles.activeLabel : null]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    backgroundColor: '#2c3a49',
    borderRadius: 22,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#3a4a5b',
  },
  iconTile: {
    width: 40,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#415364',
  },
  activeIconTile: {
    backgroundColor: '#ffcc45',
  },
  iconText: {
    color: '#d5dde6',
    fontSize: 14,
    fontWeight: '900',
  },
  activeIconText: {
    color: '#1f2937',
  },
  label: {
    color: '#d5dde6',
    fontSize: 12,
    fontWeight: '700',
  },
  activeLabel: {
    color: colors.white,
  },
});
