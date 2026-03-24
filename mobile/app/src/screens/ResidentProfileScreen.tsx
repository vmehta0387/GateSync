import { Pressable, StyleSheet, Text, View } from 'react-native';
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

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>About this app</Text>
        <Text style={styles.note}>
          Use GateSync to manage visitors, dues, complaints, amenities, and important society updates from one place.
        </Text>
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>Quick reminder</Text>
          <Text style={styles.tipBody}>
            Keep push notifications enabled so you do not miss gate approvals, complaint updates, or important notices.
          </Text>
        </View>
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
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  tipCard: {
    borderRadius: 18,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#cfe0ff',
    padding: 14,
    gap: 4,
  },
  tipTitle: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  tipBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
});
