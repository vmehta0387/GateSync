# GateSync Mobile App

Expo-based mobile app for GateSync residents and guards.

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

- OTP login for `RESIDENT` and `GUARD` accounts
- Role-based mobile shell after login
- Resident flows for visitors, complaints, facilities, bills, notices, staff, documents, and society info
- Guard flows for shifts, visitor entry, staff entry, incidents, and gate operations
- Live refresh via Socket.IO
