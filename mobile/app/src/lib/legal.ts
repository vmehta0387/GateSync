import { Alert, Linking } from 'react-native';
import { FRONTEND_BASE_URL } from '../config/env';

function buildLegalUrl(path: '/privacy' | '/terms') {
  return `${FRONTEND_BASE_URL}${path}`;
}

export async function openLegalPage(path: '/privacy' | '/terms') {
  const url = buildLegalUrl(path);

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Link unavailable', 'This page is not available right now.');
      return;
    }

    await Linking.openURL(url);
  } catch {
    Alert.alert('Link unavailable', 'This page could not be opened right now.');
  }
}

