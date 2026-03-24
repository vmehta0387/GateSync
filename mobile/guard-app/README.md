# GatePulse Guard App

Expo-based mobile app for GatePulse guards.

## Run

```bash
npm install
npm run start
```

## Backend URL

By default the app uses:

- Android emulator: `http://10.0.2.2:5000`
- iOS simulator / web: `http://localhost:5000`

For a physical device, update `expo.extra.apiBaseUrl` and `expo.extra.socketUrl` in `app.json` to your machine's LAN IP.

## Current MVP

- OTP login for `GUARD` accounts
- Shift overview and start/end duty
- Visitor passcode check-in
- Walk-in visitor logging
- Live visitor/security refresh via Socket.IO
- Incident reporting
- Quick guard activity log
