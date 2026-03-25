import * as LocalAuthentication from 'expo-local-authentication';

type BiometricSupport = {
  available: boolean;
  label: string;
};

export async function getBiometricSupport(): Promise<BiometricSupport> {
  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  if (!hasHardware || !isEnrolled) {
    return { available: false, label: 'Biometrics' };
  }

  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return { available: true, label: 'Face ID' };
  }

  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return { available: true, label: 'Fingerprint' };
  }

  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return { available: true, label: 'Iris' };
  }

  return { available: true, label: 'Biometrics' };
}

export async function promptForBiometricUnlock(label = 'Biometrics') {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: `Unlock GateSync with ${label}`,
    cancelLabel: 'Use OTP',
    fallbackLabel: 'Use passcode',
    disableDeviceFallback: false,
  });

  return result.success;
}
