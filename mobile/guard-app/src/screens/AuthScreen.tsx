import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { buildStoredSession, sendOtp, verifyOtp } from '../services/auth';
import { colors } from '../theme';

export function AuthScreen() {
  const { signIn } = useSession();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cleanPhone = phoneNumber.replace(/\D/g, '').slice(0, 10);

  const requestOtp = async () => {
    setSubmitting(true);
    const response = await sendOtp(cleanPhone);
    setSubmitting(false);

    if (!response.success) {
      Alert.alert('Unable to send OTP', response.message || 'Please try again.');
      return;
    }

    setOtpSent(true);
    Alert.alert('OTP sent', 'Use 123456 in the current development setup.');
  };

  const confirmOtp = async () => {
    setSubmitting(true);
    const response = await verifyOtp(cleanPhone, otp.trim());
    setSubmitting(false);

    const session = buildStoredSession(response);
    if (!session) {
      Alert.alert(
        'Guard access only',
        response.user?.role && response.user.role !== 'GUARD'
          ? `This mobile app is only for guard accounts. Current role: ${response.user.role}.`
          : response.message || 'Unable to sign in.',
      );
      return;
    }

    await signIn(session);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={styles.hero}>
          <Text style={styles.brand}>GatePulse</Text>
          <Text style={styles.title}>Guard Operations App</Text>
          <Text style={styles.subtitle}>
            Fast gate operations for visitor entry, duty shifts, and security incidents.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in with OTP</Text>
          <Text style={styles.cardSubtitle}>
            Use the guard login phone already linked in GatePulse admin.
          </Text>

          <TextInput
            keyboardType="number-pad"
            value={cleanPhone}
            onChangeText={setPhoneNumber}
            maxLength={10}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          {otpSent ? (
            <TextInput
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              placeholder="Enter OTP"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          ) : null}

          <Pressable
            onPress={otpSent ? confirmOtp : requestOtp}
            disabled={submitting || cleanPhone.length !== 10 || (otpSent && otp.trim().length !== 6)}
            style={[
              styles.primaryButton,
              (submitting || cleanPhone.length !== 10 || (otpSent && otp.trim().length !== 6)) ? styles.disabledButton : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {submitting ? 'Please wait...' : otpSent ? 'Verify OTP' : 'Send OTP'}
            </Text>
          </Pressable>

          {otpSent ? (
            <Pressable onPress={() => setOtpSent(false)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Use another phone number</Text>
            </Pressable>
          ) : null}

          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>Dev note</Text>
            <Text style={styles.tipText}>Current mock OTP is 123456 until SMS is fully productionized.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  screen: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 24,
  },
  hero: {
    gap: 8,
  },
  brand: {
    color: '#90c2ff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 28,
    backgroundColor: colors.surface,
    padding: 22,
    gap: 14,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  tipBox: {
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: '#edf4ff',
    padding: 14,
    gap: 4,
  },
  tipTitle: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  tipText: {
    color: colors.primaryDeep,
    fontSize: 13,
    lineHeight: 18,
  },
});
