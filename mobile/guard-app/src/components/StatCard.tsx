import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'primary';
}) {
  return (
    <View style={[styles.card, tone === 'primary' ? styles.primaryCard : null]}>
      <Text style={[styles.label, tone === 'primary' ? styles.primaryLabel : null]}>{label}</Text>
      <Text style={[styles.value, tone === 'primary' ? styles.primaryValue : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 120,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  primaryCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryLabel: {
    color: 'rgba(255,255,255,0.78)',
  },
  value: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  primaryValue: {
    color: colors.white,
  },
});
