import type { ComponentProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/theme';

export type RouteDestination = { latitude: number; longitude: number };

interface RouteResult {
  coords: { latitude: number; longitude: number }[];
  distanceM: number;
  durationS: number;
}

async function fetchOsrmRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const json = (await res.json()) as {
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

export function fmtDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
export function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const Δλ = toRad(bLng - aLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

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

export function OsrmRouteModal({
  destination,
  subtitle,
  markerIcon = 'construct',
  arriveHint = "Vous êtes à proximité du lieu d'arrivée.",
  onClose,
}: {
  destination: RouteDestination;
    subtitle: string;
    markerIcon?: ComponentProps<typeof Ionicons>['name'];
  arriveHint?: string;
  onClose: () => void;
}) {
  const mapRef = useRef<MapView>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; msg: string }
    | { status: 'ready'; route: RouteResult; userLat: number; userLng: number }
  >({ status: 'loading' });
  const [follow, setFollow] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [liveDistance, setLiveDist] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  const dest = destination;

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

  useEffect(() => {
    if (state.status !== 'ready' || follow) return;
    mapRef.current?.fitToCoordinates(state.route.coords, {
      edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
  }, [state, follow]);

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
            const routeHeading = nextHeadingFromRoute(latitude, longitude, state.route.coords);
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
          }
  }, [state]);

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

        <View style={rStyles.topBar}>
          <TouchableOpacity onPress={onClose} style={rStyles.closeBtn} accessibilityLabel="Fermer">
            <Ionicons name="chevron-down" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={rStyles.topTitle}>
              {follow ? 'Suivi en cours' : arrived ? 'Arrivé à destination' : 'Itinéraire'}
            </Text>
            <Text style={rStyles.topSub} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          {follow ? (
            <View style={rStyles.liveDot}>
              <View style={rStyles.liveDotInner} />
            </View>
          ) : null}
        </View>

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
            <Marker coordinate={dest} anchor={{ x: 0.5, y: 1 }}>
              <View style={rStyles.destPin}>
                <View style={rStyles.destPinHead}>
                  <Ionicons name={markerIcon} size={13} color={colors.white} />
                </View>
                <View style={rStyles.destPinTail} />
              </View>
            </Marker>

            {state.status === 'ready' ? (
              <Polyline
                coordinates={state.route.coords}
                strokeColor={colors.info}
                strokeWidth={4}
              />
            ) : null}
          </MapView>

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

          {arrived ? (
            <View style={rStyles.arrivedBanner}>
              <View style={rStyles.arrivedBannerIcon}>
                <Ionicons name="checkmark-circle" size={28} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rStyles.arrivedBannerTitle}>Vous êtes arrivé !</Text>
                <Text style={rStyles.arrivedBannerSub}>{arriveHint}</Text>
              </View>
            </View>
          ) : null}

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

          {arrived ? (
            <TouchableOpacity style={rStyles.arrivedBtn} onPress={onClose}>
              <Ionicons name="flag" size={20} color={colors.white} />
              <Text style={rStyles.navBtnText}>Terminer l'itinéraire</Text>
            </TouchableOpacity>
          ) : follow ? (
            <TouchableOpacity style={rStyles.followStopBtn} onPress={() => setFollow(false)}>
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
  topSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  mapWrap: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,42,20,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mapOverlayText: { color: colors.white, fontSize: 14, fontWeight: '600' },

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
  arrivedBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },

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
