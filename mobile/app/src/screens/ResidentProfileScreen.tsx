import { Pressable, StyleSheet, Text, View } from 'react-native';
import { openLegalPage } from '../lib/legal';
import { useSession } from '../providers/SessionProvider';
import { colors } from '../theme';

export function ResidentProfileScreen() {
  const { session, signOut } = useSession();
  const name = session?.user.name?.trim() || 'Resident';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R';
  const societyLabel = session?.user.society_name || (session?.user.society_id ? `Society #${session.user.society_id}` : 'Not linked');

  return (
    <View style={styles.screen}>
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>Resident Account</Text>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{session?.user.phone_number || 'No phone linked'}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Account details</Text>
        <ProfileRow label="Resident ID" value={`#${session?.user.id ?? 'NA'}`} />
        <ProfileRow label="Role" value={session?.user.role || 'Resident'} />
        <ProfileRow label="Society" value={societyLabel} />
        <ProfileRow label="Login phone" value={session?.user.phone_number || 'Not available'} />
      </View>

      <View style={styles.logoutPanel}>
        <View style={styles.logoutCopy}>
          <Text style={styles.logoutTitle}>End session</Text>
          <Text style={styles.logoutSubtitle}>Log out safely from this phone when you are done.</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </View>

      <View style={styles.footerPanel}>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => void openLegalPage('/terms')} style={styles.footerLink}>
            <Text style={styles.footerLinkText}>Terms of Service</Text>
          </Pressable>
          <View style={styles.footerDivider} />
          <Pressable onPress={() => void openLegalPage('/privacy')} style={styles.footerLink}>
            <Text style={styles.footerLinkText}>Privacy Policy</Text>
          </Pressable>
        </View>
        <Text style={styles.versionLabel}>Version 1.0.0 (Release)</Text>
      </View>
    </View>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
  },
  heroCard: {
    borderRadius: 26,
    backgroundColor: colors.primaryDeep,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    color: '#a9c4ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  name: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '900',
  },
  meta: {
    color: 'rgba(255,255,255,0.78)',
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  rowValue: {
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
  logoutText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  footerPanel: {
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerLink: {
    padding: 8,
  },
  footerLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  versionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});
