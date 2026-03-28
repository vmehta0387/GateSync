import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type ResidentTab = 'home' | 'visitors' | 'complaints' | 'facilities' | 'profile';

const ITEMS: Array<{ key: ResidentTab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: 'home', label: 'Home', icon: 'home-variant-outline' },
  { key: 'visitors', label: 'Visitors', icon: 'account-group-outline' },
  { key: 'complaints', label: 'Helpdesk', icon: 'lifebuoy' },
  { key: 'facilities', label: 'Facilities', icon: 'calendar-month-outline' },
  { key: 'profile', label: 'Profile', icon: 'account-circle-outline' },
];

export function TabBar({ activeTab, onChange }: { activeTab: ResidentTab; onChange: (tab: ResidentTab) => void }) {
  return (
    <View style={styles.wrap}>
      {ITEMS.map((item) => {
        const active = item.key === activeTab;
        return (
          <Pressable key={item.key} onPress={() => onChange(item.key)} style={[styles.tab, active ? styles.activeTab : null]}>
            <View style={[styles.iconBox, active ? styles.activeIconBox : null]}>
              <MaterialCommunityIcons
                name={item.icon}
                size={18}
                color={active ? colors.secondary : '#c7d2e5'}
              />
            </View>
            <Text numberOfLines={1} style={[styles.label, active ? styles.activeLabel : null]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 24,
    backgroundColor: colors.secondary,
    padding: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 18,
  },
  activeTab: {
    backgroundColor: '#21344d',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  activeIconBox: {
    backgroundColor: colors.white,
  },
  label: {
    color: '#c7d2e5',
    fontSize: 11,
    fontWeight: '700',
  },
  activeLabel: {
    color: colors.white,
  },
});
