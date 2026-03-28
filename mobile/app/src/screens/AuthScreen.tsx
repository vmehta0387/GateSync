import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBiometricSupport } from '../lib/biometrics';
import { openLegalPage } from '../lib/legal';
import { readBiometricSettings, writeBiometricSettings } from '../lib/storage';
import { Logo } from '../components/Logo';
import { useSession } from '../providers/SessionProvider';
import { buildStoredSession, sendOtp, verifyOtp } from '../services/auth';
import { colors } from '../theme';

export function AuthScreen() {
  const { biometricLabel, biometricLocked, signIn, unlockSavedSession } = useSession();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { width, height } = useWindowDimensions();

  const cleanPhone = phoneNumber.replace(/\D/g, '').slice(0, 10);
  const isCompactWidth = width < 390;
  const isCompactHeight = height < 780;
  const logoSize = isCompactWidth ? 72 : 88;
  const cardMaxWidth = Math.min(446, width - 32);

  const responsiveStyles = useMemo(
    () =>
      StyleSheet.create({
        scrollContent: {
          paddingHorizontal: isCompactWidth ? 16 : 24,
          paddingVertical: isCompactHeight ? 20 : 28,
        },
        card: {
          width: '100%',
          maxWidth: cardMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: isCompactWidth ? 20 : 24,
          paddingVertical: isCompactHeight ? 22 : 28,
          borderRadius: isCompactWidth ? 26 : 32,
        },
        hero: {
          marginBottom: isCompactHeight ? 20 : 26,
          gap: isCompactWidth ? 10 : 12,
        },
        wordmarkGate: {
          fontSize: isCompactWidth ? 28 : 34,
        },
        wordmarkSync: {
          fontSize: isCompactWidth ? 28 : 34,
        },
        taglineText: {
          fontSize: isCompactWidth ? 11 : 12,
          letterSpacing: isCompactWidth ? 1.3 : 1.8,
        },
        formSection: {
          gap: isCompactWidth ? 12 : 14,
        },
        label: {
          fontSize: isCompactWidth ? 14 : 15,
        },
        phoneInputShell: {
          minHeight: isCompactWidth ? 54 : 58,
          borderRadius: isCompactWidth ? 16 : 18,
          paddingHorizontal: isCompactWidth ? 14 : 16,
        },
        phonePrefix: {
          fontSize: isCompactWidth ? 15 : 16,
        },
        phoneInput: {
          fontSize: isCompactWidth ? 16 : 18,
          paddingVertical: isCompactWidth ? 12 : 14,
        },
        otpInput: {
          minHeight: isCompactWidth ? 54 : 58,
          borderRadius: isCompactWidth ? 16 : 18,
          fontSize: isCompactWidth ? 16 : 18,
          letterSpacing: isCompactWidth ? 4 : 6,
          paddingVertical: isCompactWidth ? 12 : 14,
        },
        otpHelpText: {
          fontSize: isCompactWidth ? 12 : 13,
        },
        primaryButton: {
          borderRadius: isCompactWidth ? 16 : 18,
          paddingVertical: isCompactWidth ? 15 : 17,
          marginTop: isCompactWidth ? 8 : 10,
        },
        primaryButtonText: {
          fontSize: isCompactWidth ? 16 : 17,
        },
        biometricButton: {
          borderRadius: isCompactWidth ? 16 : 18,
          paddingVertical: isCompactWidth ? 13 : 14,
        },
        secondaryButtonText: {
          fontSize: isCompactWidth ? 13 : 14,
        },
        legalText: {
          fontSize: isCompactWidth ? 11 : 12,
          lineHeight: isCompactWidth ? 16 : 18,
        },
      }),
    [cardMaxWidth, isCompactHeight, isCompactWidth],
  );

  const requestOtp = async () => {
    setSubmitting(true);
    const response = await sendOtp(cleanPhone);
    setSubmitting(false);

    if (!response.success) {
      Alert.alert('Unable to send OTP', response.message || 'Please try again.');
      return;
    }

    setOtpSent(true);
    Alert.alert('OTP sent', 'Enter the OTP to continue.');
  };

  const askBiometricOptIn = async () => {
    const settings = await readBiometricSettings();
    if (settings.enabled) {
      return;
    }

    const support = await getBiometricSupport();
    if (!support.available) {
      return;
    }

    const enable = await new Promise<boolean>((resolve) => {
      Alert.alert(
        `Enable ${support.label}?`,
        `${support.label} can unlock GateSync on this device after your first sign-in.`,
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Enable',
            onPress: () => resolve(true),
          },
        ],
      );
    });

    await writeBiometricSettings({ enabled: enable, prompted: true });
  };

  const confirmOtp = async () => {
    setSubmitting(true);
    const response = await verifyOtp(cleanPhone, otp.trim());
    setSubmitting(false);

    const session = buildStoredSession(response);
    if (!session) {
      Alert.alert(
        'Mobile access unavailable',
        response.user?.role
          ? `This mobile app currently supports resident and guard accounts only. Current role: ${response.user.role}.`
          : response.message || 'Unable to sign in.',
      );
      return;
    }

    await askBiometricOptIn();
    await signIn(session);
  };

  const handleBiometricUnlock = async () => {
    setSubmitting(true);
    const unlocked = await unlockSavedSession();
    setSubmitting(false);
    if (!unlocked) {
      Alert.alert('Unable to unlock', `Try ${biometricLabel} again or sign in with OTP.`);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={styles.backgroundGlowOne} />
        <View style={styles.backgroundGlowTwo} />
        <View style={styles.backgroundStripeTop} />
        <View style={styles.backgroundStripeBottom} />

        <ScrollView
          contentContainerStyle={[styles.scrollContent, responsiveStyles.scrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, responsiveStyles.card]}>
            <View style={[styles.hero, responsiveStyles.hero]}>
              <Logo size={logoSize} />
              <View style={styles.wordmarkRow}>
                <Text style={[styles.wordmarkGate, responsiveStyles.wordmarkGate]}>Gate</Text>
                <Text style={[styles.wordmarkSync, responsiveStyles.wordmarkSync]}>Sync</Text>
              </View>
              <View style={styles.taglinePill}>
                <Text style={[styles.taglineText, responsiveStyles.taglineText]}>SECURE. SMART. CONNECTED.</Text>
              </View>
            </View>

            {biometricLocked ? (
              <Pressable
                onPress={() => void handleBiometricUnlock()}
                disabled={submitting}
                style={[styles.biometricButton, responsiveStyles.biometricButton, submitting ? styles.disabledButton : null]}
              >
                <Text style={styles.biometricButtonText}>Unlock with {biometricLabel}</Text>
              </Pressable>
            ) : null}

            {!otpSent ? (
              <View style={[styles.formSection, responsiveStyles.formSection]}>
                <Text style={[styles.label, responsiveStyles.label]}>Phone Number</Text>
                <View style={[styles.phoneInputShell, responsiveStyles.phoneInputShell]}>
                  <Text style={[styles.phonePrefix, responsiveStyles.phonePrefix]}>+91</Text>
                  <View style={styles.phoneDivider} />
                  <TextInput
                    keyboardType="number-pad"
                    value={cleanPhone}
                    onChangeText={setPhoneNumber}
                    maxLength={10}
                    placeholder="00000 00000"
                    placeholderTextColor="rgba(255,255,255,0.28)"
                    style={[styles.phoneInput, responsiveStyles.phoneInput]}
                  />
                </View>

                <Pressable
                  onPress={requestOtp}
                  disabled={submitting || cleanPhone.length !== 10}
                  style={[
                    styles.primaryButton,
                    responsiveStyles.primaryButton,
                    (submitting || cleanPhone.length !== 10) ? styles.disabledButton : null,
                  ]}
                >
                  <Text style={[styles.primaryButtonText, responsiveStyles.primaryButtonText]}>
                    {submitting ? 'Please wait...' : 'Continue Securely  ->'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.formSection, responsiveStyles.formSection]}>
                <Text style={[styles.label, responsiveStyles.label]}>Security PIN</Text>
                <Text style={[styles.otpHelpText, responsiveStyles.otpHelpText]}>Enter the OTP sent to +91 {cleanPhone}</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={setOtp}
                  maxLength={6}
                  placeholder="Enter OTP"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  style={[styles.otpInput, responsiveStyles.otpInput]}
                />

                <Pressable
                  onPress={confirmOtp}
                  disabled={submitting || otp.trim().length !== 6}
                  style={[
                    styles.primaryButton,
                    responsiveStyles.primaryButton,
                    (submitting || otp.trim().length !== 6) ? styles.disabledButton : null,
                  ]}
                >
                  <Text style={[styles.primaryButtonText, responsiveStyles.primaryButtonText]}>
                    {submitting ? 'Please wait...' : 'Verify & Access  ->'}
                  </Text>
                </Pressable>

                <Pressable onPress={() => setOtpSent(false)} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, responsiveStyles.secondaryButtonText]}>Change phone number</Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.legalText, responsiveStyles.legalText]}>
              By using GateSync, you agree to our{' '}
              <Text style={styles.legalLink} onPress={() => void openLegalPage('/terms')}>
                Terms of Service
              </Text>{' '}
              &amp;{' '}
              <Text style={styles.legalLink} onPress={() => void openLegalPage('/privacy')}>
                Privacy Policy
              </Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#10182b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#10182b',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  backgroundGlowOne: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(59,130,246,0.10)',
  },
  backgroundGlowTwo: {
    position: 'absolute',
    bottom: -130,
    left: -110,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(6,182,212,0.08)',
  },
  backgroundStripeTop: {
    position: 'absolute',
    top: 26,
    left: -40,
    width: 220,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.03)',
    transform: [{ rotate: '-28deg' }],
  },
  backgroundStripeBottom: {
    position: 'absolute',
    bottom: 26,
    right: -60,
    width: 240,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.03)',
    transform: [{ rotate: '-28deg' }],
  },
  brand: {
    display: 'none',
  },
  card: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(57,67,92,0.86)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 18,
  },
  biometricButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },
  biometricButtonText: {
    color: '#dbeafe',
    fontSize: 14,
    fontWeight: '800',
  },
  hero: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 26,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  wordmarkGate: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  wordmarkSync: {
    color: '#06B6D4',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  taglinePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  taglineText: {
    color: '#d5def0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  formSection: {
    gap: 14,
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  phoneInputShell: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  phonePrefix: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '700',
  },
  phoneDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingVertical: 14,
  },
  otpInput: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  otpHelpText: {
    marginTop: -6,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: '#2563eb',
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 2,
  },
  secondaryButtonText: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '700',
  },
  legalText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.44)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  legalLink: {
    color: '#93c5fd',
    fontWeight: '700',
  },
});
