type GlobalWithRuntimePolyfills = typeof globalThis & {
  FormData?: unknown;
  WebSocket?: unknown;
  setImmediate?: unknown;
  clearImmediate?: unknown;
};

type RuntimePolyfillKey = 'FormData' | 'WebSocket' | 'setImmediate' | 'clearImmediate';

function assignRuntimeGlobal(key: RuntimePolyfillKey, value: any) {
  (globalThis as GlobalWithRuntimePolyfills)[key] = value;

  if (typeof global !== 'undefined') {
    (global as GlobalWithRuntimePolyfills)[key] = value;
  }
}

try {
  if (!(globalThis as GlobalWithRuntimePolyfills).setImmediate) {
    assignRuntimeGlobal(
      'setImmediate',
      ((callback: (...args: any[]) => void, ...args: any[]) => setTimeout(() => callback(...args), 0)) as unknown,
    );
  }

  if (!(globalThis as GlobalWithRuntimePolyfills).clearImmediate) {
    assignRuntimeGlobal('clearImmediate', ((handle: ReturnType<typeof setTimeout>) => clearTimeout(handle)) as unknown);
  }

  if (!(globalThis as GlobalWithRuntimePolyfills).FormData) {
    // React Native ships its own FormData implementation, but some runtimes do
    // not expose it on the global object early enough during bundle startup.
    const runtimeFormDataModule = require('react-native/Libraries/Network/FormData');
    const RuntimeFormData = runtimeFormDataModule?.default || runtimeFormDataModule;
    if (RuntimeFormData) {
      assignRuntimeGlobal('FormData', RuntimeFormData);
    }
  }

  if (!(globalThis as GlobalWithRuntimePolyfills).WebSocket) {
    const runtimeWebSocketModule = require('react-native/Libraries/WebSocket/WebSocket');
    const RuntimeWebSocket = runtimeWebSocketModule?.default || runtimeWebSocketModule;
    if (RuntimeWebSocket) {
      assignRuntimeGlobal('WebSocket', RuntimeWebSocket);
    }
  }
} catch {
  // If the fallback cannot be loaded, the app will continue and surface a more
  // specific upload error later rather than crashing during bootstrap.
}

const { registerRootComponent } = require('expo');
const App = require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
