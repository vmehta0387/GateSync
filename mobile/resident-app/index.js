function assignRuntimeGlobal(key, value) {
  globalThis[key] = value;

  if (typeof global !== 'undefined') {
    global[key] = value;
  }
}

try {
  assignRuntimeGlobal('global', globalThis);

  if (typeof globalThis.self === 'undefined') {
    assignRuntimeGlobal('self', globalThis);
  }

  if (typeof globalThis.window === 'undefined') {
    assignRuntimeGlobal('window', globalThis);
  }

  if (typeof globalThis.setImmediate === 'undefined') {
    assignRuntimeGlobal('setImmediate', (callback, ...args) => setTimeout(() => callback(...args), 0));
  }

  if (typeof globalThis.clearImmediate === 'undefined') {
    assignRuntimeGlobal('clearImmediate', (handle) => clearTimeout(handle));
  }

  if (typeof globalThis.FormData === 'undefined') {
    const runtimeFormDataModule = require('react-native/Libraries/Network/FormData');
    const RuntimeFormData = runtimeFormDataModule?.default || runtimeFormDataModule;
    if (RuntimeFormData) {
      assignRuntimeGlobal('FormData', RuntimeFormData);
    }
  }

  if (typeof globalThis.WebSocket === 'undefined') {
    const runtimeWebSocketModule = require('react-native/Libraries/WebSocket/WebSocket');
    const RuntimeWebSocket = runtimeWebSocketModule?.default || runtimeWebSocketModule;
    if (RuntimeWebSocket) {
      assignRuntimeGlobal('WebSocket', RuntimeWebSocket);
    }
  }
} catch {
  // Let the app continue so Expo can surface a more specific runtime error if needed.
}

const { registerRootComponent } = require('expo');
const App = require('./App').default;

registerRootComponent(App);
