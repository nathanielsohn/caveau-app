import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type Role = "admin" | "staff" | "member";
type Tier = "gold" | "reserve" | "platinum" | "black";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  tier: Tier;
};

type WineListRow = {
  id: string;
  name: string;
  vintage: number;
  region: string;
  varietal: string;
  producer: string;
  purchasePrice: number;
  currentValue: number;
  photoUrl: string | null;
  drinkWindowStart: number | null;
  drinkWindowEnd: number | null;
  createdAt: string;
};

type WineDetail = {
  id: string;
  name: string;
  vintage: number;
  region: string;
  varietal: string;
  producer: string;
  status: string;
  purchasePrice: number;
  currentValue: number;
  tastingNotes: string | null;
  drinkWindowStart: number | null;
  drinkWindowEnd: number | null;
  createdAt: string;
  photoUrl: string | null;
  lockerSlots: Array<{
    slotPosition: number;
    dateStored: string | null;
    locker: { id: string; lockerNumber: number; zone: string; facilityId: string };
  }>;
  certificate: null | {
    certificateNumber: string;
    dataIntegrityHash: string;
    monitoringStart: string;
    monitoringEnd: string;
    verifyPath: string;
  };
};

type FacilityRow = { id: string; name: string; location: string };

type WineScanMatch = {
  id: string;
  name: string;
  vintage: number;
  producer: string;
  member: { id: string; name: string };
  status: string;
  currentSlot: null | {
    facilityId: string;
    facilityName: string;
    lockerId: string;
    lockerNumber: number;
    zone: string;
    slotPosition: number;
    dateStored: string | null;
  };
};

type CheckInLockerOption = {
  id: string;
  lockerNumber: number;
  zone: string;
  emptySlots: number[];
};

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/g, "");
}

const API_BASE_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
);

const COLORS = {
  bg: "#0A0A0B",
  card: "#141416",
  border: "#2A2A30",
  text: "#F3F4F6",
  muted: "#A1A1AA",
  gold: "#FFD166",
  danger: "#FB7185",
  ok: "#4ADE80",
} as const;

const STORAGE = {
  token: "caveau_mobile_token",
  member: "caveau_mobile_member",
  scanFacilityId: "caveau_mobile_scan_facility_id",
  expoPushToken: "caveau_mobile_expo_push_token",
} as const;

async function apiRequest<T>(input: {
  path: string;
  token?: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<T> {
  const url = `${API_BASE_URL}${input.path.startsWith("/") ? "" : "/"}${input.path}`;
  const res = await fetch(url, {
    method: input.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

type TabKey = "collection" | "scan" | "settings";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [tab, setTab] = useState<TabKey>("collection");
  const [selectedWineId, setSelectedWineId] = useState<string | null>(null);

  const isStaff = member?.role === "admin" || member?.role === "staff";

  useEffect(() => {
    void (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(STORAGE.token);
        if (!storedToken) return;

        const me = await apiRequest<{ member: Member }>({
          path: "/api/mobile/me",
          token: storedToken,
        });
        setToken(storedToken);
        setMember(me.member);
      } catch {
        await AsyncStorage.multiRemove([STORAGE.token, STORAGE.member]);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const apiConfigured = useMemo(() => {
    return API_BASE_URL.startsWith("http://") || API_BASE_URL.startsWith("https://");
  }, []);

  async function signIn(email: string, password: string) {
    if (!apiConfigured) {
      Alert.alert(
        "Not configured",
        "Set EXPO_PUBLIC_API_BASE_URL to your Caveau web app URL.",
      );
      return;
    }

    const res = await apiRequest<{
      token: string;
      expiresAt: string;
      member: Member;
    }>({
      path: "/api/mobile/login",
      method: "POST",
      body: { email, password },
    });

    setToken(res.token);
    setMember(res.member);
    await AsyncStorage.setItem(STORAGE.token, res.token);
    await AsyncStorage.setItem(STORAGE.member, JSON.stringify(res.member));
  }

  async function signOut() {
    setSelectedWineId(null);
    setTab("collection");

    const storedPush = await AsyncStorage.getItem(STORAGE.expoPushToken);
    if (token && storedPush) {
      try {
        await apiRequest<{ ok: true }>({
          path: "/api/mobile/push/unregister",
          token,
          method: "POST",
          body: { expoPushToken: storedPush },
        });
      } catch {
        // Best-effort: push may be disabled server-side or the device may be offline.
      }
    }

    setToken(null);
    setMember(null);
    await AsyncStorage.multiRemove([STORAGE.token, STORAGE.member, STORAGE.expoPushToken]);
  }

  if (booting) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center" }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.gold} />
      </SafeAreaView>
    );
  }

  if (!token || !member) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LoginScreen
          apiBaseUrl={API_BASE_URL}
          apiConfigured={apiConfigured}
          onSignIn={signIn}
        />
      </SafeAreaView>
    );
  }

  if (selectedWineId) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <WineDetailScreen
          token={token}
          wineId={selectedWineId}
          onBack={() => setSelectedWineId(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <Header member={member} />
      <View style={{ flex: 1 }}>
        {tab === "collection" && (
          <CollectionScreen
            token={token}
            onOpenWine={(id) => setSelectedWineId(id)}
          />
        )}
        {tab === "scan" && isStaff && (
          <ScanScreen token={token} actor={member} />
        )}
        {tab === "settings" && (
          <SettingsScreen token={token} onSignOut={signOut} />
        )}
      </View>

      <TabBar
        active={tab}
        staff={isStaff}
        onSelect={(t) => setTab(t)}
      />
    </SafeAreaView>
  );
}

function Header({ member }: { member: Member }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>◈ Caveau</Text>
        <Text style={styles.subtle}>
          {member.name} • {member.tier}
        </Text>
      </View>
    </View>
  );
}

function TabBar({
  active,
  staff,
  onSelect,
}: {
  active: TabKey;
  staff: boolean;
  onSelect: (t: TabKey) => void;
}) {
  const tabs: Array<{ key: TabKey; label: string; show: boolean }> = [
    { key: "collection", label: "Collection", show: true },
    { key: "scan", label: "Scan", show: staff },
    { key: "settings", label: "Settings", show: true },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.filter((t) => t.show).map((t) => {
        const selected = active === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onSelect(t.key)}
            style={[
              styles.tabItem,
              selected ? { borderColor: COLORS.gold } : null,
            ]}
          >
            <Text style={[styles.tabText, selected ? { color: COLORS.gold } : null]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LoginScreen({
  apiBaseUrl,
  apiConfigured,
  onSignIn,
}: {
  apiBaseUrl: string;
  apiConfigured: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("robert@caveau.com");
  const [password, setPassword] = useState("demo1234");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onSignIn(email, password);
    } catch (err) {
      Alert.alert("Sign in failed", err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={styles.h1}>Welcome back</Text>
      <Text style={[styles.subtle, { marginTop: 6 }]}>
        Sign in to browse your collection and share reports.
      </Text>

      {!apiConfigured && (
        <View style={[styles.callout, { borderColor: `${COLORS.danger}55` }]}>
          <Text style={[styles.calloutText, { color: COLORS.danger }]}>
            Missing config: set{" "}
            <Text style={{ color: COLORS.gold }}>EXPO_PUBLIC_API_BASE_URL</Text>.
          </Text>
        </View>
      )}

      <View style={{ marginTop: 18 }}>
        <Text style={styles.label}>API base URL</Text>
        <Text style={styles.mono}>{apiBaseUrl}</Text>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          placeholder="you@caveau.com"
          placeholderTextColor={COLORS.muted}
        />
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={COLORS.muted}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={busy || !apiConfigured}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed ? { opacity: 0.9 } : null,
          busy || !apiConfigured ? { opacity: 0.5 } : null,
        ]}
      >
        <Text style={styles.primaryButtonText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

function CollectionScreen({
  token,
  onOpenWine,
}: {
  token: string;
  onOpenWine: (id: string) => void;
}) {
  const [rows, setRows] = useState<WineListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const data = await apiRequest<WineListRow[]>({
      path: "/api/mobile/wines",
      token,
    });
    setRows(data);
  }

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load wines");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { padding: 20 }]}>
        <Text style={[styles.subtle, { textAlign: "center" }]}>{error}</Text>
        <Pressable onPress={onRefresh} style={[styles.secondaryButton, { marginTop: 12 }]}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.subtle}>No wines yet.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => onOpenWine(item.id)} style={styles.wineRow}>
          {item.photoUrl ? (
            <Image
              source={{ uri: item.photoUrl }}
              style={styles.winePhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.winePhoto, styles.winePhotoPlaceholder]}>
              <Text style={styles.winePhotoPlaceholderText}>◈</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.wineName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.wineMeta} numberOfLines={1}>
              {item.vintage} • {item.producer}
            </Text>
            <Text style={styles.wineMeta} numberOfLines={1}>
              {item.region} • {item.varietal}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.value}>${item.currentValue.toLocaleString()}</Text>
            <Text style={styles.subtle}>est.</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

function WineDetailScreen({
  token,
  wineId,
  onBack,
}: {
  token: string;
  wineId: string;
  onBack: () => void;
}) {
  const [wine, setWine] = useState<WineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiRequest<WineDetail>({
          path: `/api/mobile/wines/${wineId}`,
          token,
        });
        setWine(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load wine");
      } finally {
        setLoading(false);
      }
    })();
  }, [wineId]);

  async function shareCertificate() {
    if (!wine?.certificate) return;
    const url = `${API_BASE_URL}${wine.certificate.verifyPath}`;
    await Share.share({ message: url });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  if (error || !wine) {
    return (
      <View style={[styles.center, { padding: 20 }]}>
        <Text style={styles.subtle}>{error ?? "Not found"}</Text>
        <Pressable onPress={onBack} style={[styles.secondaryButton, { marginTop: 12 }]}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const slot = wine.lockerSlots[0] ?? null;
  const verifyUrl = wine.certificate ? `${API_BASE_URL}${wine.certificate.verifyPath}` : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Pressable onPress={onBack} style={{ marginBottom: 10 }}>
        <Text style={{ color: COLORS.gold }}>← Back</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.h2}>{wine.name}</Text>
        <Text style={[styles.subtle, { marginTop: 4 }]}>
          {wine.vintage} • {wine.producer}
        </Text>
        <Text style={[styles.subtle, { marginTop: 2 }]}>
          {wine.region} • {wine.varietal}
        </Text>
        <Text style={[styles.value, { marginTop: 12 }]}>
          ${wine.currentValue.toLocaleString()}
        </Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Locker</Text>
        {slot ? (
          <Text style={styles.subtle}>
            Locker {slot.locker.lockerNumber} • {slot.locker.zone} • Slot {slot.slotPosition}
          </Text>
        ) : (
          <Text style={styles.subtle}>Not currently assigned to a slot.</Text>
        )}
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Custody & Condition Report</Text>
        {wine.certificate ? (
          <>
            <Text style={styles.subtle}>
              Report No. <Text style={styles.mono}>{wine.certificate.certificateNumber}</Text>
            </Text>
            <Text style={[styles.subtle, { marginTop: 6 }]} numberOfLines={1}>
              {verifyUrl}
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={shareCertificate} style={styles.primaryButtonInline}>
                <Text style={styles.primaryButtonText}>Share certificate</Text>
              </Pressable>
              <Pressable
                onPress={() => (verifyUrl ? Linking.openURL(verifyUrl) : undefined)}
                style={styles.secondaryButtonInline}
              >
                <Text style={styles.secondaryButtonText}>Open</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.subtle}>
            No certificate available for this bottle yet.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function ScanScreen({ token, actor }: { token: string; actor: Member }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [matches, setMatches] = useState<WineScanMatch[]>([]);
  const [selected, setSelected] = useState<WineScanMatch | null>(null);
  const [targets, setTargets] = useState<null | {
    lockers: CheckInLockerOption[];
    suggested: { lockerId: string; slotPosition: number } | null;
  }>(null);
  const [target, setTarget] = useState<{ lockerId: string; slotPosition: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest<{ facilities: FacilityRow[] }>({
          path: "/api/mobile/facilities",
          token,
        });
        setFacilities(res.facilities);
        const stored = await AsyncStorage.getItem(STORAGE.scanFacilityId);
        const preferred =
          stored && res.facilities.some((f) => f.id === stored) ? stored : null;
        setFacilityId(preferred ?? res.facilities[0]?.id ?? null);
      } catch (err) {
        Alert.alert(
          "Unable to load facilities",
          err instanceof Error ? err.message : "Error",
        );
      }
    })();
  }, []);

  const facility = facilities.find((f) => f.id === facilityId) ?? null;

  function reset() {
    setScanEnabled(true);
    setBarcode(null);
    setMatches([]);
    setSelected(null);
    setTargets(null);
    setTarget(null);
    setNotes("");
  }

  async function onScanned(data: string) {
    if (!facilityId || !scanEnabled) return;
    setScanEnabled(false);
    setBarcode(data);
    setBusy(true);
    try {
      const res = await apiRequest<{ ok: true; wines: WineScanMatch[] }>({
        path: "/api/mobile/lockers/scan/lookup",
        token,
        method: "POST",
        body: { facilityId, barcode: data },
      });
      setMatches(res.wines);
    } catch (err) {
      Alert.alert("Lookup failed", err instanceof Error ? err.message : "Error");
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function startCheckIn(w: WineScanMatch) {
    if (!facilityId) return;
    setSelected(w);
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: true;
        lockers: CheckInLockerOption[];
        suggested: { lockerId: string; slotPosition: number } | null;
      }>({
        path: "/api/mobile/lockers/scan/targets",
        token,
        method: "POST",
        body: { facilityId, wineId: w.id },
      });
      setTargets({ lockers: res.lockers, suggested: res.suggested });
      setTarget(res.suggested);
    } catch (err) {
      Alert.alert(
        "Unable to load targets",
        err instanceof Error ? err.message : "Error",
      );
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function confirmCheckIn() {
    if (!facilityId || !selected || !target) return;
    setBusy(true);
    try {
      await apiRequest<{ ok: true }>({
        path: "/api/mobile/lockers/scan/check-in",
        token,
        method: "POST",
        body: {
          facilityId,
          wineId: selected.id,
          lockerId: target.lockerId,
          slotPosition: target.slotPosition,
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
        },
      });
      Alert.alert("Checked in", "Bottle stored successfully.");
      reset();
    } catch (err) {
      Alert.alert("Check-in failed", err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCheckOut() {
    if (!facilityId || !selected?.currentSlot) return;
    setBusy(true);
    try {
      await apiRequest<{ ok: true }>({
        path: "/api/mobile/lockers/scan/check-out",
        token,
        method: "POST",
        body: {
          facilityId,
          wineId: selected.id,
          lockerId: selected.currentSlot.lockerId,
          slotPosition: selected.currentSlot.slotPosition,
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
        },
      });
      Alert.alert("Checked out", "Bottle removed successfully.");
      reset();
    } catch (err) {
      Alert.alert("Check-out failed", err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function pickFacility(id: string) {
    setFacilityId(id);
    await AsyncStorage.setItem(STORAGE.scanFacilityId, id);
    setFacilityModalOpen(false);
    reset();
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.scanHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.h2}>Locker scan</Text>
          <Text style={styles.subtle} numberOfLines={1}>
            {actor.role.toUpperCase()} • {facility ? facility.name : "Select a facility"}
          </Text>
        </View>
        <Pressable onPress={() => setFacilityModalOpen(true)} style={styles.secondaryButtonInline}>
          <Text style={styles.secondaryButtonText}>Facility</Text>
        </Pressable>
      </View>

      <Modal visible={facilityModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Select facility</Text>
            <ScrollView style={{ marginTop: 10, maxHeight: 260 }}>
              {facilities.map((f) => {
                const selected = f.id === facilityId;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => pickFacility(f.id)}
                    style={[
                      styles.modalRow,
                      selected ? { borderColor: COLORS.gold } : null,
                    ]}
                  >
                    <Text style={styles.wineName}>{f.name}</Text>
                    <Text style={styles.subtle}>{f.location}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setFacilityModalOpen(false)} style={[styles.secondaryButton, { marginTop: 12 }]}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {!permission?.granted ? (
        <View style={[styles.center, { padding: 20 }]}>
          <Text style={styles.subtle}>
            Camera access is required to scan barcodes.
          </Text>
          <Pressable
            onPress={async () => {
              const res = await requestPermission();
              if (!res.granted) {
                Alert.alert("Camera denied", "Enable camera access in Settings to scan bottles.");
              }
            }}
            style={[styles.primaryButton, { marginTop: 12 }]}
          >
            <Text style={styles.primaryButtonText}>Enable camera</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {!barcode && (
            <View style={{ flex: 1 }}>
              <CameraView
                style={{ flex: 1 }}
                onBarcodeScanned={
                  scanEnabled
                    ? (result) => {
                        const data = (result as any)?.data as string | undefined;
                        if (data) void onScanned(data);
                      }
                    : undefined
                }
              />
              <View style={styles.scanOverlay}>
                <Text style={styles.scanHint}>
                  Point your camera at a bottle barcode
                </Text>
              </View>
            </View>
          )}

          {barcode && (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Scanned barcode</Text>
                <Text style={styles.mono}>{barcode}</Text>
              </View>

              {busy && (
                <View style={[styles.center, { marginTop: 14 }]}>
                  <ActivityIndicator color={COLORS.gold} />
                </View>
              )}

              {!busy && !selected && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.sectionTitle}>Matches</Text>
                  {matches.length === 0 ? (
                    <Text style={styles.subtle}>No wines found for that barcode.</Text>
                  ) : (
                    matches.map((w) => (
                      <Pressable
                        key={w.id}
                        onPress={() => setSelected(w)}
                        style={styles.wineRow}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.wineName} numberOfLines={2}>
                            {w.name}
                          </Text>
                          <Text style={styles.wineMeta}>
                            {w.vintage} • {w.producer}
                          </Text>
                          <Text style={styles.wineMeta}>Member: {w.member.name}</Text>
                        </View>
                        <Text style={{ color: COLORS.gold }}>›</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}

              {!busy && selected && (
                <View style={{ marginTop: 12 }}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Selected wine</Text>
                    <Text style={styles.h2}>{selected.name}</Text>
                    <Text style={styles.subtle}>
                      {selected.vintage} • {selected.producer}
                    </Text>
                    <Text style={[styles.subtle, { marginTop: 6 }]}>
                      Member: {selected.member.name}
                    </Text>
                    <Text style={[styles.subtle, { marginTop: 6 }]}>
                      Current slot:{" "}
                      {selected.currentSlot
                        ? `Locker ${selected.currentSlot.lockerNumber} • ${selected.currentSlot.zone} • Slot ${selected.currentSlot.slotPosition} (${selected.currentSlot.facilityName})`
                        : "Not stored"}
                    </Text>
                  </View>

                  <View style={[styles.card, { marginTop: 12 }]}>
                    <Text style={styles.sectionTitle}>Notes (optional)</Text>
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="e.g. intake, label condition, client call"
                      placeholderTextColor={COLORS.muted}
                      style={styles.input}
                    />
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <Pressable
                      onPress={() => {
                        setSelected(null);
                        setTargets(null);
                        setTarget(null);
                        setNotes("");
                      }}
                      style={styles.secondaryButtonInline}
                    >
                      <Text style={styles.secondaryButtonText}>Change</Text>
                    </Pressable>

                    <Pressable onPress={reset} style={styles.secondaryButtonInline}>
                      <Text style={styles.secondaryButtonText}>New scan</Text>
                    </Pressable>
                  </View>

                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.sectionTitle}>Actions</Text>

                    <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                      <Pressable
                        onPress={() => void startCheckIn(selected)}
                        disabled={busy}
                        style={[
                          styles.primaryButtonInline,
                          busy ? { opacity: 0.5 } : null,
                        ]}
                      >
                        <Text style={styles.primaryButtonText}>Check in</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void confirmCheckOut()}
                        disabled={!selected.currentSlot || busy}
                        style={[
                          styles.secondaryButtonInline,
                          !selected.currentSlot || busy ? { opacity: 0.5 } : null,
                        ]}
                      >
                        <Text style={styles.secondaryButtonText}>Check out</Text>
                      </Pressable>
                    </View>
                  </View>

                  {targets && (
                    <View style={{ marginTop: 12 }}>
                      <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Check-in target</Text>
                        {target ? (
                          <Text style={styles.subtle}>
                            Selected: Locker{" "}
                            {targets.lockers.find((l) => l.id === target.lockerId)?.lockerNumber ?? "?"}{" "}
                            • Slot {target.slotPosition}
                          </Text>
                        ) : (
                          <Text style={styles.subtle}>
                            No empty slots found for this member in the selected facility.
                          </Text>
                        )}

                        {target && (
                          <Pressable
                            onPress={() => void confirmCheckIn()}
                            disabled={busy}
                            style={[
                              styles.primaryButton,
                              { marginTop: 12 },
                              busy ? { opacity: 0.5 } : null,
                            ]}
                          >
                            <Text style={styles.primaryButtonText}>
                              {busy ? "Saving…" : "Confirm check-in"}
                            </Text>
                          </Pressable>
                        )}
                      </View>

                      {targets.lockers.map((l) => (
                        <View key={l.id} style={[styles.card, { marginTop: 10 }]}>
                          <Text style={styles.sectionTitle}>
                            Locker {l.lockerNumber} • {l.zone}
                          </Text>
                          {l.emptySlots.length === 0 ? (
                            <Text style={styles.subtle}>No empty slots.</Text>
                          ) : (
                            <View style={styles.slotWrap}>
                              {l.emptySlots.slice(0, 32).map((pos) => {
                                const selectedSlot =
                                  target?.lockerId === l.id && target.slotPosition === pos;
                                return (
                                  <Pressable
                                    key={pos}
                                    onPress={() => setTarget({ lockerId: l.id, slotPosition: pos })}
                                    style={[
                                      styles.slotChip,
                                      selectedSlot ? { borderColor: COLORS.gold } : null,
                                    ]}
                                  >
                                    <Text style={[styles.slotChipText, selectedSlot ? { color: COLORS.gold } : null]}>
                                      {pos}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function SettingsScreen({
  token,
  onSignOut,
}: {
  token: string;
  onSignOut: () => Promise<void>;
}) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await AsyncStorage.getItem(STORAGE.expoPushToken);
      setExpoPushToken(stored);
    })();
  }, []);

  async function enablePush() {
    if (!Device.isDevice) {
      Alert.alert("Unsupported", "Push notifications require a physical device.");
      return;
    }

    setBusy(true);
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        finalStatus = req.status;
      }
      if (finalStatus !== "granted") {
        Alert.alert("Permission denied", "Enable notifications in Settings to receive alerts.");
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const projectId =
        (Constants as any)?.easConfig?.projectId ??
        (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
        undefined;

      const tokenRes = await Notifications.getExpoPushTokenAsync(
        projectId ? ({ projectId } as any) : ({} as any),
      );
      const pushToken = tokenRes.data;

      await apiRequest<{ ok: true }>({
        path: "/api/mobile/push/register",
        token,
        method: "POST",
        body: {
          expoPushToken: pushToken,
          platform: Platform.OS === "ios" ? "ios" : "android",
        },
      });

      setExpoPushToken(pushToken);
      await AsyncStorage.setItem(STORAGE.expoPushToken, pushToken);
      Alert.alert("Enabled", "This device will receive Caveau alert notifications.");
    } catch (err) {
      Alert.alert(
        "Push unavailable",
        err instanceof Error ? err.message : "Unable to enable push",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (!expoPushToken) return;
    setBusy(true);
    try {
      await apiRequest<{ ok: true }>({
        path: "/api/mobile/push/unregister",
        token,
        method: "POST",
        body: { expoPushToken },
      });
      setExpoPushToken(null);
      await AsyncStorage.removeItem(STORAGE.expoPushToken);
      Alert.alert("Disabled", "Push notifications are disabled on this device.");
    } catch (err) {
      Alert.alert(
        "Unable to disable",
        err instanceof Error ? err.message : "Error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Push notifications</Text>
        <Text style={[styles.subtle, { marginTop: 6 }]}>
          Opt in to receive alert notifications on this device.
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => void enablePush()}
            disabled={busy || Boolean(expoPushToken)}
            style={[
              styles.primaryButtonInline,
              busy || expoPushToken ? { opacity: 0.5 } : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {expoPushToken ? "Enabled" : "Enable"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void disablePush()}
            disabled={busy || !expoPushToken}
            style={[
              styles.secondaryButtonInline,
              busy || !expoPushToken ? { opacity: 0.5 } : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Disable</Text>
          </Pressable>
        </View>

        {expoPushToken && (
          <Text style={[styles.mono, { marginTop: 12 }]} numberOfLines={1}>
            {expoPushToken}
          </Text>
        )}
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable
          onPress={() => void onSignOut()}
          style={[styles.secondaryButton, { marginTop: 12 }]}
        >
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brand: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  h1: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
  },
  h2: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  subtle: {
    color: COLORS.muted,
    fontSize: 13,
  },
  mono: {
    color: COLORS.muted,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonInline: {
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    minWidth: 110,
  },
  primaryButtonText: {
    color: "#0A0A0B",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryButtonInline: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    minWidth: 100,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
  },
  callout: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
  },
  calloutText: {
    fontSize: 13,
    color: COLORS.text,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  value: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  wineRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    alignItems: "center",
  },
  winePhoto: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
  },
  winePhotoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  winePhotoPlaceholderText: {
    color: COLORS.gold,
    fontSize: 18,
  },
  wineName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  wineMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  scanHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  scanOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "rgba(10,10,11,0.75)",
  },
  scanHint: {
    color: COLORS.text,
    fontSize: 13,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 14,
  },
  modalRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  slotChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 36,
    alignItems: "center",
  },
  slotChipText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
});
