type SpeechRecognitionLib = typeof import('expo-speech-recognition');

let cachedSpeechRecognitionLib: SpeechRecognitionLib | null | undefined;

export function getSpeechRecognitionLib(): SpeechRecognitionLib | null {
  if (cachedSpeechRecognitionLib !== undefined) {
    return cachedSpeechRecognitionLib;
  }

  try {
    cachedSpeechRecognitionLib = require('expo-speech-recognition') as SpeechRecognitionLib;
    return cachedSpeechRecognitionLib;
  } catch {
    cachedSpeechRecognitionLib = null;
    return null;
  }
}

export function isSpeechRecognitionAvailable() {
  const lib = getSpeechRecognitionLib();
  return Boolean(lib?.ExpoSpeechRecognitionModule);
}
