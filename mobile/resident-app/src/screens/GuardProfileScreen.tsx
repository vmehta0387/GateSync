import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL, SOCKET_URL } from '../config/env';
import { useSession } from '../providers/SessionProvider';
import { colors } from '../theme';

export function GuardProfileScreen() {
  const { session, signOut } = useSession();

  return (
    <View style={styles.screen}>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>Logged in as</Text>
        <Text style={styles.title}>Guard #{session?.user.id}</Text>
        <Text style={styles.subtitle}>{session?.user.phone_number}</Text>
      </View>

      <View style={styles.actionPanel}>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>Session actions</Text>
          <Text style={styles.actionSubtitle}>Use this tab for account actions like logout.</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Session</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={styles.infoValue}>{session?.user.role}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Society ID</Text>
          <Text style={styles.infoValue}>{session?.user.society_id ?? 'Not linked'}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Environment</Text>
        <Text style={styles.configLabel}>API Base</Text>
        <Text style={styles.configValue}>{API_BASE_URL}</Text>
        <Text style={styles.configLabel}>Socket URL</Text>
        <Text style={styles.configValue}>{SOCKET_URL}</Text>
        <Text style={styles.note}>
          For physical-device testing, point these values in app.json to your machine&apos;s LAN IP.
        </Text>
      </View>

      <Pressable
        onPress={() => Alert.alert('Next pass', 'Camera capture, QR scan, and push alerts fit best here next.')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>What comes next?</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: colors.secondary,
    padding: 20,
    gap: 6,
  },
  kicker: {
    color: '#90c2ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 14,
  },
  panel: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  actionPanel: {
    borderRadius: 24,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#cfe0ff',
    padding: 18,
    gap: 14,
  },
  actionCopy: {
    gap: 4,
  },
  actionTitle: {
    color: colors.primaryDeep,
    fontSize: 18,
    fontWeight: '800',
  },
  actionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  configLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  configValue: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  logoutButton: {
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: 15,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 15,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
