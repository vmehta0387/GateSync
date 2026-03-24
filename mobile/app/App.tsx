import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { syncPushRegistration } from './src/lib/notifications';
import { SessionProvider, useSession } from './src/providers/SessionProvider';
import { AuthScreen } from './src/screens/AuthScreen';
import { colors } from './src/theme';

function AppContent() {
  const { hydrated, session } = useSession();

  useEffect(() => {
    if (!hydrated || !session) {
      return;
    }

    void syncPushRegistration(session);
  }, [hydrated, session]);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style={session?.user.role === 'GUARD' ? 'light' : 'dark'} />
      {session?.user.role === 'GUARD'
        ? (() => {
            const { GuardShell } = require('./src/screens/GuardShell');
            return <GuardShell />;
          })()
        : session?.user.role === 'RESIDENT'
          ? (() => {
              const { ResidentShell } = require('./src/screens/ResidentShell');
              return <ResidentShell />;
            })()
          : <AuthScreen />}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AppContent />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
