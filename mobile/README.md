# Caveau Mobile (Expo)

React Native companion app for Caveau’s web platform (feature #29).

## Run locally

```bash
cd mobile
npm install

# Default: http://localhost:3000
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 npm start
```

Notes:
- If you’re running on a physical phone, `localhost` won’t resolve to your laptop. Use your laptop’s LAN IP, e.g. `http://192.168.1.20:3000`.
- The mobile app talks to the web app’s bearer-token endpoints under `/api/mobile/*` (not NextAuth cookie sessions).

## Push notifications

Server-side push is **disabled by default**. To enable:
- Set `EXPO_PUSH_ENABLED=true` in the **web app** environment.
- In the mobile app, open **Settings → Push notifications → Enable**.

If push isn’t configured, the app shows a disabled state and the server returns a friendly `503` from `/api/mobile/push/*`.

## Staff locker scan

Staff-only scan flow lives in the **Scan** tab:
- Select a facility
- Scan a bottle barcode
- Choose a match
- Check in (pick a target slot) or check out (removes from current slot)

