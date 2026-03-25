import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../providers/SessionProvider';
import { colors } from '../theme';

export function GuardProfileScreen() {
  const { session, signOut } = useSession();
  const name = session?.user.name?.trim() || `Guard #${session?.user.id ?? ''}`;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';

  return (
    <View style={styles.screen}>
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>Guard Console</Text>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subtitle}>{session?.user.phone_number || 'No phone linked'}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Duty profile</Text>
        <ProfileRow label="Guard ID" value={`#${session?.user.id ?? 'NA'}`} />
        <ProfileRow label="Role" value={session?.user.role || 'GUARD'} />
        <ProfileRow label="Society" value={session?.user.society_name || (session?.user.society_id ? `Society #${session.user.society_id}` : 'Not linked')} />
        <ProfileRow label="Login phone" value={session?.user.phone_number || 'Not available'} />
      </View>

      <View style={styles.logoutPanel}>
        <View style={styles.logoutCopy}>
          <Text style={styles.logoutTitle}>End duty session</Text>
          <Text style={styles.logoutSubtitle}>Log out from this device when your shift or handover is complete.</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  heroCopy: {
    flex: 1,
    gap: 4,
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
    fontSize: 26,
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
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-start',
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  infoValue: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  logoutPanel: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  logoutCopy: {
    gap: 4,
  },
  logoutTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  logoutSubtitle: {
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
});
