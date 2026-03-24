import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../providers/SessionProvider';
import { colors } from '../theme';

export function ResidentProfileScreen() {
  const { session, signOut } = useSession();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>My profile</Text>
        <Text style={styles.label}>Resident ID</Text>
        <Text style={styles.value}>#{session?.user.id}</Text>
        <Text style={styles.label}>Phone number</Text>
        <Text style={styles.value}>{session?.user.phone_number}</Text>
        <Text style={styles.label}>Society</Text>
        <Text style={styles.value}>#{session?.user.society_id || 'Unassigned'}</Text>
        <Text style={styles.helperText}>This resident app is linked to your GateSync account and apartment mapping.</Text>
      </View>

      <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  card: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', marginBottom: 6 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  value: { color: colors.text, fontSize: 16, fontWeight: '800' },
  helperText: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  logoutButton: {
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: 15,
  },
  logoutText: { color: colors.white, fontSize: 14, fontWeight: '800' },
});
