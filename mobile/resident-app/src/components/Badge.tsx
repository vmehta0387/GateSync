import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <View style={[styles.badge, styles[`${tone}Badge`]]}>
      <Text style={[styles.label, styles[`${tone}Label`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  neutralBadge: {
    backgroundColor: colors.surfaceMuted,
  },
  neutralLabel: {
    color: colors.textMuted,
  },
  infoBadge: {
    backgroundColor: '#e7efff',
  },
  infoLabel: {
    color: colors.primaryDeep,
  },
  successBadge: {
    backgroundColor: '#def7ec',
  },
  successLabel: {
    color: colors.success,
  },
  warningBadge: {
    backgroundColor: '#fdf0d5',
  },
  warningLabel: {
    color: colors.warning,
  },
  dangerBadge: {
    backgroundColor: '#fde2e2',
  },
  dangerLabel: {
    color: colors.danger,
  },
});
