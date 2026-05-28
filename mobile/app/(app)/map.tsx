import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ZONE_CHIP_ANIM = LayoutAnimation.create(
  220,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.scaleXY,
);
import MapView, {
  Marker,
  Polygon,
  PROVIDER_GOOGLE,
  type LatLng,
  type MapType,
  type Region,
} from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { api } from '@/lib/api';
import { connectMapSocket } from '@/lib/socket';
import {
  colors,
  markerColorForFeature,
  ROLE_LABELS,
  STATUT_LABELS,
  TYPE_LABELS,
} from '@/theme/theme';
import type { GeoFeature, Zone } from '@/lib/types';

const TANA: Region = {
  latitude: -18.8792,
  longitude: 47.5079,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function zoneToCoords(zone: Zone | null): LatLng[] | null {
  const geo = zone?.geometrie as { type?: string; coordinates?: unknown } | null | undefined;
  if (!geo || geo.type !== 'Polygon') return null;
  const rings = geo.coordinates as number[][][] | undefined;
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const ring = rings[0];
  if (!Array.isArray(ring)) return null;
  const out: LatLng[] = [];
  for (const pt of ring) {
    if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
      out.push({ latitude: pt[1], longitude: pt[0] });
    }
  }
  return out.length >= 3 ? out : null;
}

function centroid(coords: LatLng[]): LatLng | null {
  if (coords.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const c of coords) {
    lat += c.latitude;
    lng += c.longitude;
  }
  return { latitude: lat / coords.length, longitude: lng / coords.length };
}

function regionForCoords(coords: LatLng[]): Region | null {
  if (coords.length === 0) return null;
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }
  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * 1.4, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

const ZONE_CHIP_AUTOCOLLAPSE_MS = 4000;

export default function MapScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [posSending, setPosSending] = useState(false);
  const [mapType, setMapType] = useState<MapType>('hybrid');
  const [zoneChipOpen, setZoneChipOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<GeoFeature | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const initiallyCenteredRef = useRef(false);

  const role = user?.role;
  const isEquipe = role === 'EQUIPE_INTERVENTION';

  const zoneCoords = useMemo(() => zoneToCoords(zone), [zone]);
  const zoneCenter = useMemo(() => (zoneCoords ? centroid(zoneCoords) : null), [zoneCoords]);

  const load = useCallback(async () => {
    try {
      const tiles = await api.mapTiles();
      setFeatures(tiles.geojson.features);
    } catch (e) {
      console.warn('Carte indisponible :', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const off = await connectMapSocket(load);
      if (mounted) cleanupRef.current = off;
      else off();
    })();
    return () => {
      mounted = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    if (!user || !user.zoneId) {
      setZone(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { zone: z } = await api.myZone();
        if (!cancelled) setZone(z);
      } catch {
        if (!cancelled) setZone(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (initiallyCenteredRef.current) return;
    if (!zoneCoords || !mapRef.current) return;
    const region = regionForCoords(zoneCoords);
    if (region) {
      mapRef.current.animateToRegion(region, 700);
      initiallyCenteredRef.current = true;
    }
  }, [zoneCoords]);

  function recenterOnZone() {
    if (!zoneCoords || !mapRef.current) return;
    const region = regionForCoords(zoneCoords);
    if (region) mapRef.current.animateToRegion(region, 600);
  }

  function scheduleCollapse() {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      LayoutAnimation.configureNext(ZONE_CHIP_ANIM);
      setZoneChipOpen(false);
      collapseTimerRef.current = null;
    }, ZONE_CHIP_AUTOCOLLAPSE_MS);
  }

  function handleZoneChipPress() {
    if (zoneChipOpen) {

      recenterOnZone();
    } else {

      LayoutAnimation.configureNext(ZONE_CHIP_ANIM);
      setZoneChipOpen(true);
    }
    scheduleCollapse();
  }

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  async function sendCurrentPosition() {
    setPosSending(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission requise', 'Localisation refusée.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.updatePosition(pos.coords.latitude, pos.coords.longitude);
      Alert.alert('Position envoyée', 'Le QG voit votre position.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setPosSending(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerEyebrow}>République de Madagascar</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {user?.prenom} {user?.nom}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {role ? ROLE_LABELS[role as keyof typeof ROLE_LABELS] : ''}
                {zone ? ` · ${zone.nom}` : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.mapBlock}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={TANA}
            mapType={mapType}
            showsUserLocation
            showsMyLocationButton
            toolbarEnabled={false}
            showsPointsOfInterest={false}
            showsBuildings={false}
          >
            {zoneCoords ? (
              <Polygon
                coordinates={zoneCoords}
                strokeColor={colors.accent}
                strokeWidth={3}
                fillColor="rgba(0, 126, 58, 0.10)"
              />
            ) : null}

            {zoneCenter ? (
              <Marker coordinate={zoneCenter} pinColor={colors.red} title={zone?.nom || 'Ma commune'}>
                <View style={styles.zonePin}>
                  <View style={styles.zonePinInner} />
                </View>
              </Marker>
            ) : null}

            {features
              .filter((f) => f.geometry?.coordinates?.length === 2)
              .map((f) => {
                const [lng, lat] = f.geometry.coordinates;
                const color = markerColorForFeature(f.properties);
                const isSuggestion = f.properties.kind === 'suggestion';
                const iconName: React.ComponentProps<typeof Ionicons>['name'] =
                  isSuggestion ? 'bulb' :
                  f.properties.urgence === 'URGENT' ? 'warning' : 'alert-circle';

                return (
                  <Marker
                    key={`${f.properties.kind}-${f.properties.id}`}
                    coordinate={{ latitude: lat, longitude: lng }}
                    anchor={{ x: 0.5, y: 1 }}
                    tracksViewChanges={Platform.OS === 'android'}
                    onPress={() => setSelectedFeature(f)}
                  >
                    <View style={styles.pinWrap}>
                      <View style={[styles.pinHead, { backgroundColor: color }]}>
                        <Ionicons name={iconName} size={14} color={colors.white} />
                      </View>
                      <View style={[styles.pinTail, { borderTopColor: color }]} />
                    </View>
                  </Marker>
                );
              })}
          </MapView>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}

          {selectedFeature ? (() => {
            const f = selectedFeature;
            const color = markerColorForFeature(f.properties);
            const isSuggestion = f.properties.kind === 'suggestion';
            const typeKey = (f.properties.typeInfrastructure ||
              f.properties.typeSuggere ||
              'ROUTE') as keyof typeof TYPE_LABELS;
            const statutKey = (f.properties.statut ||
              'EN_ATTENTE_CONFIRMATION') as keyof typeof STATUT_LABELS;
            const title = isSuggestion ? 'Suggestion citoyenne' : 'Signalement';
            const subtitle = isSuggestion
              ? `Type : ${TYPE_LABELS[typeKey]}`
              : `${STATUT_LABELS[statutKey]} · ${TYPE_LABELS[typeKey]}`;
            return (
              <View style={styles.pinPopupWrap}>
                <TouchableOpacity
                  style={StyleSheet.absoluteFillObject}
                  activeOpacity={1}
                  onPress={() => setSelectedFeature(null)}
                />
                <View style={styles.pinPopup}>
                  <View style={styles.pinPopupHeader}>
                    <View style={[styles.calloutDot, { backgroundColor: color }]} />
                    <Text style={styles.pinPopupTitle} numberOfLines={1}>{title}</Text>
                    <TouchableOpacity onPress={() => setSelectedFeature(null)} style={styles.pinPopupClose}>
                      <Text style={styles.pinPopupCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.pinPopupSubtitle}>{subtitle}</Text>
                  {!isSuggestion ? (
                    <TouchableOpacity
                      style={styles.pinPopupBtn}
                      onPress={() => {
                        setSelectedFeature(null);
                        router.push(`/(app)/ticket/${f.properties.id}`);
                      }}
                    >
                      <Text style={styles.pinPopupBtnText}>Voir les détails →</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.calloutCtaMuted}>Suggestion publique</Text>
                  )}
                </View>
              </View>
            );
          })() : null}

          <View style={styles.mapTypeSwitch}>
            <TouchableOpacity
              style={[styles.mapTypeBtn, mapType === 'hybrid' && styles.mapTypeBtnOn]}
              onPress={() => setMapType('hybrid')}
            >
              <Text style={[styles.mapTypeText, mapType === 'hybrid' && styles.mapTypeTextOn]}>
                Satellite
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapTypeBtn, mapType === 'standard' && styles.mapTypeBtnOn]}
              onPress={() => setMapType('standard')}
            >
              <Text
                style={[styles.mapTypeText, mapType === 'standard' && styles.mapTypeTextOn]}
              >
                Plan
              </Text>
            </TouchableOpacity>
          </View>

          {zone ? (
            <TouchableOpacity
              style={zoneChipOpen ? styles.zoneChip : styles.zoneChipCollapsed}
              onPress={handleZoneChipPress}
              activeOpacity={0.85}
              accessibilityLabel={zoneChipOpen ? 'Centrer sur ma commune' : 'Afficher ma commune'}
            >
              <View style={styles.zoneChipIcon}>
                <Ionicons name="locate" size={16} color={colors.white} />
              </View>
              {zoneChipOpen ? (
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.zoneChipEyebrow}>Ma commune</Text>
                  <Text style={styles.zoneChipName} numberOfLines={1}>
                    {zone.nom}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}

          <View style={styles.fabRow}>
            {isEquipe ? (
              <TouchableOpacity
                style={[styles.fab, styles.fabSecondary]}
                onPress={() => router.push('/(app)/missions')}
              >
                <Text style={styles.fabText}>Missions</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.fab, styles.fabSecondary]}
              onPress={() => void sendCurrentPosition()}
              disabled={posSending}
            >
              {posSending ? (
                <ActivityIndicator size="small" color={colors.textSoft} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location-sharp" size={15} color={colors.textSoft} />
                  <Text style={styles.fabText}>Position GPS</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLogo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandFlag: {
    width: 22,
    height: 16,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  brandFlagBand: { flex: 1 },
  headerEyebrow: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  headerSub: { color: colors.muted, fontSize: 12 },

  mapBlock: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  loading: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  mapTypeSwitch: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0e2a14',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapTypeBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  mapTypeBtnOn: { backgroundColor: colors.accent },
  mapTypeText: { color: colors.textSoft, fontSize: 12, fontWeight: '600' },
  mapTypeTextOn: { color: colors.white },

  zoneChip: {
    position: 'absolute',
    left: 12,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 6,
    paddingRight: 14,
    paddingLeft: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    maxWidth: 220,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  zoneChipCollapsed: {
    position: 'absolute',
    left: 12,
    bottom: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0e2a14',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  zoneChipIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneChipIconText: { color: colors.white, fontSize: 14, fontWeight: '700' },  zoneChipEyebrow: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  zoneChipName: { color: colors.text, fontSize: 13, fontWeight: '700' },

  zonePin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.red,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0e2a14',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  zonePinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },

  pinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0e2a14',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  pinTail: {
    marginTop: -3,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  calloutDot: { width: 10, height: 10, borderRadius: 5 },
  calloutCtaMuted: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },

  pinPopupWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 90,
  },
  pinPopup: {
    marginHorizontal: 16,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  pinPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pinPopupTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  pinPopupClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPopupCloseText: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  pinPopupSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  pinPopupBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  pinPopupBtnText: { color: colors.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },

  fabRow: {
    position: 'absolute',
    right: 12,
    bottom: 24,
    gap: 10,
    alignItems: 'flex-end',
  },
  fab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    elevation: 4,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fabText: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
