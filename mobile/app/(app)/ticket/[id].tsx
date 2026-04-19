import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/api';
import { resolveAssetUrl } from '../../../src/config';
import { useAuth } from '../../../src/AuthContext';
import { colors, STATUT_COLORS, STATUT_LABELS, TYPE_COLORS, TYPE_LABELS } from '../../../src/theme';
import type { Ticket } from '../../../src/types';

/* ─── OSRM routing ────────────────────────────────────────────────────────── */

interface RouteResult {
  coords: { latitude: number; longitude: number }[];
  distanceM: number;
  durationS: number;
}

async function fetchOsrmRoute(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?overview=full&geometries=geojson`;
  const res  = await fetch(url);
  const json = await res.json() as {
    code: string;
    routes?: {
      geometry: { coordinates: [number, number][] };
      distance: number;
      duration: number;
    }[];
  };
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('Itinéraire indisponible');
  const route = json.routes[0];
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    distanceM: route.distance,
    durationS: route.duration,
  };
}

function fmtDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Distance Haversine en mètres entre deux points GPS. */
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Cap (bearing) en degrés [0..360[ entre deux points GPS. */
function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const Δλ = toRad(bLng - aLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Trouve le prochain point de la route situé > LOOKAHEAD_M devant le user.
 * Renvoie aussi le cap à suivre pour l'orienter "vers le haut".
 */
function nextHeadingFromRoute(
  uLat: number,
  uLng: number,
  coords: { latitude: number; longitude: number }[],
): number | null {
  if (coords.length < 2) return null;
  const LOOKAHEAD_M = 25;
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineM(uLat, uLng, coords[i].latitude, coords[i].longitude);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }
  for (let i = nearestIdx; i < coords.length; i++) {
    if (haversineM(uLat, uLng, coords[i].latitude, coords[i].longitude) >= LOOKAHEAD_M) {
      return bearingDeg(uLat, uLng, coords[i].latitude, coords[i].longitude);
    }
  }
  const last = coords[coords.length - 1];
  if (haversineM(uLat, uLng, last.latitude, last.longitude) < 1) return null;
  return bearingDeg(uLat, uLng, last.latitude, last.longitude);
}

const ARRIVAL_RADIUS_M = 30;

/* ─── Modal d'itinéraire ──────────────────────────────────────────────────── */

function RouteModal({
  ticket,
  onClose,
}: {
  ticket: Ticket;
  onClose: () => void;
}) {
  const mapRef = useRef<MapView>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; msg: string }
    | { status: 'ready'; route: RouteResult; userLat: number; userLng: number }
  >({ status: 'loading' });
  const [follow, setFollow]         = useState(false);
  const [arrived, setArrived]       = useState(false);
  const [liveDistance, setLiveDist] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  const dest = ticket.localisation;

  /* 1) Calcul initial : permission GPS + position + route OSRM */
  useEffect(() => {
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('Accès GPS refusé.');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: uLat, longitude: uLng } = pos.coords;
        const route = await fetchOsrmRoute(uLat, uLng, dest.latitude, dest.longitude);
        setState({ status: 'ready', route, userLat: uLat, userLng: uLng });
        setLiveDist(haversineM(uLat, uLng, dest.latitude, dest.longitude));
      } catch (e) {
        setState({ status: 'error', msg: e instanceof Error ? e.message : 'Erreur inconnue' });
      }
    })();
  }, [dest.latitude, dest.longitude]);

  /* 2) Cadrage initial sur les deux points + route */
  useEffect(() => {
    if (state.status !== 'ready' || follow) return;
    mapRef.current?.fitToCoordinates(state.route.coords, {
      edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
  }, [state, follow]);

  /* 3) Mode "Suivre" : abonnement aux updates GPS, recentrage carte,
        détection d'arrivée dans un rayon ARRIVAL_RADIUS_M. */
  useEffect(() => {
    if (!follow || arrived) {
      watchSubRef.current?.remove();
      watchSubRef.current = null;
      return;
    }

    setAutoRotate(true);
    let cancelled = false;
    void (async () => {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (pos) => {
          if (cancelled) return;
          const { latitude, longitude, heading: gpsHeading } = pos.coords;
          const d = haversineM(latitude, longitude, dest.latitude, dest.longitude);
          setLiveDist(d);

          if (autoRotate && state.status === 'ready') {
            const routeHeading = nextHeadingFromRoute(
              latitude,
              longitude,
              state.route.coords,
            );
            const heading =
              routeHeading != null
                ? routeHeading
                : typeof gpsHeading === 'number' && gpsHeading >= 0
                  ? gpsHeading
                  : 0;

            mapRef.current?.animateCamera(
              {
                center: { latitude, longitude },
                pitch: 45,
                heading,
                zoom: 17,
              },
              { duration: 700 },
            );
          }

          if (d <= ARRIVAL_RADIUS_M) {
            setArrived(true);
            setFollow(false);
          }
        },
      );
      if (cancelled) sub.remove();
      else watchSubRef.current = sub;
    })();

    return () => {
      cancelled = true;
      watchSubRef.current?.remove();
      watchSubRef.current = null;
    };
  }, [follow, arrived, autoRotate, state, dest.latitude, dest.longitude]);

  /** Recentre immédiatement sur la dernière position connue + remet la rotation auto. */
  const recenterNow = useCallback(async () => {
    setAutoRotate(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      const heading =
        state.status === 'ready'
          ? nextHeadingFromRoute(latitude, longitude, state.route.coords) ?? 0
          : 0;
      mapRef.current?.animateCamera(
        { center: { latitude, longitude }, pitch: 45, heading, zoom: 17 },
        { duration: 600 },
      );
    } catch {
      /* ignore */
    }
  }, [state]);

  /* 4) Cleanup à la fermeture */
  useEffect(() => {
    return () => {
      watchSubRef.current?.remove();
      watchSubRef.current = null;
    };
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={[rStyles.flex, { backgroundColor: '#0e2a14' }]}>
        <StatusBar barStyle="light-content" />

        {/* ── Topbar ─────────────────────────────────────────── */}
        <View style={rStyles.topBar}>
          <TouchableOpacity onPress={onClose} style={rStyles.closeBtn} accessibilityLabel="Fermer">
            <Ionicons name="chevron-down" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={rStyles.topTitle}>
              {follow ? 'Suivi en cours' : arrived ? 'Arrivé à destination' : 'Itinéraire'}
            </Text>
            <Text style={rStyles.topSub} numberOfLines={1}>
              {TYPE_LABELS[ticket.typeInfrastructure]} · {ticket.description.slice(0, 40)}
            </Text>
          </View>
          {follow ? (
            <View style={rStyles.liveDot}>
              <View style={rStyles.liveDotInner} />
            </View>
          ) : null}
        </View>

        {/* ── Carte ──────────────────────────────────────────── */}
        <View style={rStyles.mapWrap}>
          <MapView
            ref={mapRef}
            style={rStyles.map}
            provider={PROVIDER_GOOGLE}
            showsUserLocation
            showsMyLocationButton={false}
            onPanDrag={() => {
              if (follow && autoRotate) setAutoRotate(false);
            }}
            initialRegion={{
              latitude: dest.latitude,
              longitude: dest.longitude,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            }}
          >
            {/* Marqueur destination */}
            <Marker coordinate={dest} anchor={{ x: 0.5, y: 1 }}>
              <View style={rStyles.destPin}>
                <View style={rStyles.destPinHead}>
                  <Ionicons name="construct" size={13} color={colors.white} />
                </View>
                <View style={rStyles.destPinTail} />
              </View>
            </Marker>

            {/* Polyline route */}
            {state.status === 'ready' ? (
              <Polyline
                coordinates={state.route.coords}
                strokeColor={colors.info}
                strokeWidth={4}
              />
            ) : null}
          </MapView>

          {/* Overlay état chargement / erreur */}
          {state.status === 'loading' ? (
            <View style={rStyles.mapOverlay}>
              <ActivityIndicator color={colors.white} size="large" />
              <Text style={rStyles.mapOverlayText}>Calcul de l'itinéraire…</Text>
            </View>
          ) : state.status === 'error' ? (
            <View style={rStyles.mapOverlay}>
              <Ionicons name="warning-outline" size={32} color={colors.warning} />
              <Text style={rStyles.mapOverlayText}>{state.msg}</Text>
            </View>
          ) : null}

          {/* Bandeau "Vous êtes arrivé" */}
          {arrived ? (
            <View style={rStyles.arrivedBanner}>
              <View style={rStyles.arrivedBannerIcon}>
                <Ionicons name="checkmark-circle" size={28} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rStyles.arrivedBannerTitle}>Vous êtes arrivé !</Text>
                <Text style={rStyles.arrivedBannerSub}>
                  Vous êtes à proximité du site d'intervention.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Bouton flottant "Recentrer" — apparaît si suivi actif mais
              que l'utilisateur a touché la carte (autoRotate désactivé). */}
          {follow && !autoRotate && !arrived ? (
            <TouchableOpacity
              style={rStyles.recenterBtn}
              onPress={recenterNow}
              accessibilityLabel="Recentrer et réactiver la rotation automatique"
            >
              <Ionicons name="locate" size={18} color={colors.white} />
              <Text style={rStyles.recenterBtnText}>Recentrer</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Bandeau bas : infos route + actions ─────────────── */}
        <View style={rStyles.bottom}>
          {state.status === 'ready' && !arrived ? (
            <View style={rStyles.routeInfo}>
              <View style={rStyles.routeStat}>
                <Ionicons name="navigate" size={18} color={colors.accent} />
                <Text style={rStyles.routeStatValue}>
                  {liveDistance != null
                    ? fmtDistance(liveDistance)
                    : fmtDistance(state.route.distanceM)}
                </Text>
                <Text style={rStyles.routeStatLabel}>
                  {follow ? 'Distance restante' : 'Distance'}
                </Text>
              </View>
              <View style={rStyles.routeDivider} />
              <View style={rStyles.routeStat}>
                <Ionicons name="time" size={18} color={colors.accent} />
                <Text style={rStyles.routeStatValue}>{fmtDuration(state.route.durationS)}</Text>
                <Text style={rStyles.routeStatLabel}>Durée estimée</Text>
              </View>
            </View>
          ) : null}

          {/* Bouton principal contextuel */}
          {arrived ? (
            <TouchableOpacity style={rStyles.arrivedBtn} onPress={onClose}>
              <Ionicons name="flag" size={20} color={colors.white} />
              <Text style={rStyles.navBtnText}>Terminer l'itinéraire</Text>
            </TouchableOpacity>
          ) : follow ? (
            <TouchableOpacity
              style={rStyles.followStopBtn}
              onPress={() => setFollow(false)}
            >
              <Ionicons name="pause" size={18} color={colors.accent} />
              <Text style={rStyles.followStopBtnText}>Mettre en pause le suivi</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[rStyles.navBtn, state.status !== 'ready' && { opacity: 0.5 }]}
              disabled={state.status !== 'ready'}
              onPress={() => setFollow(true)}
            >
              <Ionicons name="navigate-circle" size={20} color={colors.white} />
              <Text style={rStyles.navBtnText}>Suivre</Text>
            </TouchableOpacity>
          )}

          {!arrived ? (
            <TouchableOpacity style={rStyles.closeBottomBtn} onPress={onClose}>
              <Text style={rStyles.closeBottomBtnText}>Fermer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const rStyles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  topSub:   { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  mapWrap: { flex: 1, position: 'relative' },
  map:     { flex: 1 },

  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,42,20,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapOverlayText: { color: colors.white, fontSize: 14, fontWeight: '600' },

  /* Pin destination */
  destPin: { alignItems: 'center' },
  destPinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  destPinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.accent,
  },

  /* Infos route */
  bottom: {
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    padding: 14,
    gap: 0,
  },
  routeStat: { flex: 1, alignItems: 'center', gap: 2 },
  routeStatValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  routeStatLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  routeDivider: { width: 1, height: 36, backgroundColor: colors.border },

  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  navBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },

  closeBottomBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeBottomBtnText: { color: colors.muted, fontWeight: '600', fontSize: 14 },

  /* Indicateur "live" pendant le suivi */
  liveDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },

  /* Bouton "Mettre en pause le suivi" */
  followStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accentSoft,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followStopBtnText: { color: colors.accent, fontWeight: '800', fontSize: 15 },

  /* Bandeau "Vous êtes arrivé" */
  arrivedBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  arrivedBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivedBannerTitle: { color: colors.white, fontWeight: '800', fontSize: 15 },
  arrivedBannerSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },

  /* Bouton "Terminer l'itinéraire" */
  arrivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#16a34a',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  /* Bouton flottant "Recentrer" sur la carte */
  recenterBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  recenterBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { ticket: t } = await api.ticket(id);
      setTicket(t);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/map');
  }

  if (loading || !ticket) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityLabel="Fermer">
            <Text style={styles.closeBtnText}>×</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Détail du signalement</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const isAssigned = !!user && ticket.mission?.assignedUserIds?.includes(user.id);
  const isEquipe = user?.role === 'EQUIPE_INTERVENTION';
  const canStart = isEquipe && isAssigned && ticket.statut === 'REPARATION_PREVUE';
  const canFinish = isEquipe && isAssigned && ticket.statut === 'EN_REPARATION';

  const photoSignal = resolveAssetUrl(ticket.photoSignalement);
  const photoCloture = resolveAssetUrl(ticket.mission?.photoCloture);

  function openMaps() {
    const { latitude, longitude } = ticket!.localisation;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
    });
    if (url) void Linking.openURL(url);
  }

  async function start() {
    setBusy(true);
    try {
      const { ticket: t } = await api.patchTicket(ticket!.id, { statut: 'EN_REPARATION' });
      setTicket(t);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function finishWithPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('Permission', 'Caméra refusée.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setBusy(true);
    try {
      const photoUrl = await api.closurePhoto(
        ticket!.id,
        a.uri,
        a.fileName ?? undefined,
        a.mimeType ?? undefined,
      );
      const { ticket: t } = await api.patchTicket(ticket!.id, {
        statut: 'TERMINE',
        photoCloture: photoUrl,
      });
      setTicket(t);
      Alert.alert('Clôture envoyée', 'Le QG validera la clôture.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const statutColor = STATUT_COLORS[ticket.statut] || colors.muted;
  const typeColor = TYPE_COLORS[ticket.typeInfrastructure] || colors.muted;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityLabel="Fermer">
          <Text style={styles.closeBtnText}>×</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Détail du signalement
        </Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      >
      {photoSignal ? (
        <View style={styles.heroPhotoWrap}>
          <Image source={{ uri: photoSignal }} style={styles.heroPhoto} />
          <View style={[styles.heroBadge, { backgroundColor: statutColor }]}>
            <Text style={styles.heroBadgeText}>{STATUT_LABELS[ticket.statut]}</Text>
          </View>
          {ticket.urgence === 'URGENT' ? (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentBadgeText}>URGENT</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.heroPlaceholder, { backgroundColor: colors.panel2 }]}>
          <Text style={{ color: colors.muted }}>Pas de photo de signalement</Text>
        </View>
      )}

      <View style={styles.row}>
        <View style={[styles.badge, { borderColor: typeColor }]}>
          <View style={[styles.badgeDot, { backgroundColor: typeColor }]} />
          <Text style={[styles.badgeText, { color: typeColor }]}>
            {TYPE_LABELS[ticket.typeInfrastructure]}
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: statutColor }]}>
          <View style={[styles.badgeDot, { backgroundColor: statutColor }]} />
          <Text style={[styles.badgeText, { color: statutColor }]}>
            {STATUT_LABELS[ticket.statut]}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Description</Text>
        <Text style={styles.text}>{ticket.description}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Position GPS</Text>
        <Text style={styles.text}>
          {ticket.localisation.latitude.toFixed(5)}, {ticket.localisation.longitude.toFixed(5)}
        </Text>
        {/* Bouton itinéraire in-app — uniquement pour l'équipe assignée */}
        {isEquipe && isAssigned ? (
          <TouchableOpacity
            style={[styles.btnPrimary, { marginTop: 10 }]}
            onPress={() => setRouteOpen(true)}
          >
            <Ionicons name="navigate" size={16} color={colors.white} />
            <Text style={styles.btnPrimaryText}>Voir l'itinéraire</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btnGhost, { marginTop: 10 }]} onPress={openMaps}>
            <Ionicons name="navigate-outline" size={15} color={colors.textSoft} />
            <Text style={styles.btnGhostText}>Ouvrir dans Google Maps / Plans</Text>
          </TouchableOpacity>
        )}
      </View>

      {photoCloture ? (
        <View style={styles.card}>
          <Text style={styles.label}>Photo de clôture</Text>
          <Image source={{ uri: photoCloture }} style={styles.photo} />
        </View>
      ) : null}

      {canStart ? (
        <TouchableOpacity style={styles.primary} onPress={() => void start()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryText}>Démarrer la réparation</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {canFinish ? (
        <TouchableOpacity
          style={styles.primary}
          onPress={() => void finishWithPhoto()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryText}>Terminer (avec photo)</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {isEquipe && !isAssigned ? (
        <Text style={[styles.text, { color: colors.muted, textAlign: 'center' }]}>
          Cette mission n'est pas assignée à votre équipe.
        </Text>
      ) : null}
      </ScrollView>

      {routeOpen ? (
        <RouteModal ticket={ticket} onClose={() => setRouteOpen(false)} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: -2,
  },

  heroPhotoWrap: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.panel2,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroPhoto: { width: '100%', height: '100%' },
  heroPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroBadgeText: { color: '#ffffff', fontWeight: '700', fontSize: 11, letterSpacing: 0.4 },
  urgentBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  urgentBadgeText: { color: '#ffffff', fontWeight: '800', fontSize: 11, letterSpacing: 0.6 },

  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: colors.panel,
  },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  card: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  photo: { width: '100%', height: 200, borderRadius: 12, marginTop: 6 },

  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: { color: colors.textSoft, fontWeight: '600' },

  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  btnPrimaryText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  primary: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryText: { color: '#ffffff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
});
