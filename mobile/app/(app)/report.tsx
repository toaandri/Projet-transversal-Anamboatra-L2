import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { OsrmRouteModal } from '../../src/OsrmRouteModal';
import { colors, TYPE_COLORS, TYPE_LABELS } from '../../src/theme';
import type { SuggestionCitoyen, TerrainClotureCodePatrouille, TypeInfrastructure, Urgence } from '../../src/types';

const TYPES: TypeInfrastructure[] = ['ROUTE', 'ELECTRICITE_EAU', 'PROPRIETE_PUBLIQUE', 'SALUBRITE'];

const CLOTURE_OPTIONS: { code: TerrainClotureCodePatrouille; label: string; hint: string }[] = [
  {
    code: 'NON_CONFORME',
    label: 'Non conforme (arnaque / tromperie)',
    hint: 'La remontée est frauduleuse ou sans fondement vérifiable sur place.',
  },
  {
    code: 'NON_REPERE',
    label: 'Non retrouvé',
    hint: 'Lieu parcouru : défaut invisible ou erreur de localisation.',
  },
  {
    code: 'AUTRE',
    label: 'Autre motif',
    hint: 'Préciser (accès impossible, événement déjà résolu…).',
  },
];

export default function ReportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ suggestionId?: string | string[] }>();
  const sidParam = params.suggestionId;
  const suggestionId =
    typeof sidParam === 'string' ? sidParam : Array.isArray(sidParam) ? sidParam[0] : '';

  const [orderSuggestion, setOrderSuggestion] = useState<SuggestionCitoyen | null>(null);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TypeInfrastructure>('ROUTE');
  const [urgence, setUrgence] = useState<Urgence>('NORMAL');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mime?: string; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  /** Mission QG (CDC v2) : rejoindre le lieu → puis constat officiel OU clôture terrain. */
  const [surZone, setSurZone] = useState(false);
  /** null = pas encore choisi après confirmation sur zone ; TICKET | CLOTURE */
  const [terrainChoice, setTerrainChoice] = useState<null | 'TICKET' | 'CLOTURE'>(null);

  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closeCode, setCloseCode] = useState<TerrainClotureCodePatrouille>('NON_REPERE');
  const [closeComment, setCloseComment] = useState('');
  const [routeOpen, setRouteOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionCitoyen[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const isMissionQg = !!(suggestionId.trim() && orderSuggestion);
  const dest = orderSuggestion?.localisation;
  const linkedId = orderSuggestion?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setOrderSuggestion(null);
    setSurZone(false);
    setTerrainChoice(null);

    if (!suggestionId?.trim()) {
      return () => {
        cancelled = true;
      };
    }

    void api
      .suggestionCitoyenne(suggestionId)
      .then(({ suggestion }) => {
        if (cancelled) return;
        setOrderSuggestion(suggestion);
        setType(suggestion.typeSuggere);
        setCoords({
          lat: suggestion.localisation.latitude,
          lng: suggestion.localisation.longitude,
        });
        setDescription((prev) =>
          prev.trim()
            ? prev
            : `Suite suggestion citoyenne — constat terrain :\n${suggestion.description}`,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setOrderSuggestion(null);
        Alert.alert(
          'Suggestion citoyenne',
          'Suggestion introuvable dans votre zone ou déjà traitée.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [suggestionId]);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== 'AGENT_PATROUILLE' || suggestionId?.trim()) {
        setPendingSuggestions([]);
        return;
      }
      let cancelled = false;
      void (async () => {
        setSuggestionsLoading(true);
        try {
          const { suggestions } = await api.suggestions();
          if (cancelled) return;
          setPendingSuggestions(suggestions.filter((s) => !s.traitee));
        } catch {
          if (!cancelled) setPendingSuggestions([]);
        } finally {
          if (!cancelled) setSuggestionsLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.role, suggestionId]),
  );

  useEffect(() => {
    if (suggestionId?.trim()) return;
    void captureGps(true);
  }, [suggestionId]);

  function openExternalMapsSuggestion() {
    if (!dest) return;
    const { latitude, longitude } = dest;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
    });
    if (url)
      void Linking.openURL(url).catch(() =>
        Alert.alert('Navigation', 'Impossible d’ouvrir Plans / Maps.'),
      );
  }

  async function captureGps(silent = false) {
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        if (!silent) Alert.alert('Permission requise', 'Localisation refusée.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      if (!silent) Alert.alert('GPS', e instanceof Error ? e.message : String(e));
    } finally {
      setGpsBusy(false);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission requise', 'Caméra refusée.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: true });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setPhoto({ uri: a.uri, mime: a.mimeType, name: a.fileName ?? undefined });
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission requise', 'Galerie refusée.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setPhoto({ uri: a.uri, mime: a.mimeType, name: a.fileName ?? undefined });
    }
  }

  async function submitTerrainCloture() {
    if (!linkedId) return;
    const comment = closeComment.trim();
    if (comment.length < 8) {
      Alert.alert('Observation', 'Détaillez au moins 8 caractères pour la traçabilité QG.');
      return;
    }
    setBusy(true);
    try {
      await api.clotureSuggestionTerrain(linkedId, { code: closeCode, comment });
      setCloseModalVisible(false);
      setCloseComment('');
      Alert.alert(
        'Clôture transmise',
        'Le QG est informé : aucun ticket officiel créé.',
        [{ text: 'OK', onPress: () => router.replace('/(app)/suggestions') }],
      );
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitTicket() {
    if (!description.trim()) return Alert.alert('Description', 'Décrivez l’anomalie.');
    if (!coords) return Alert.alert('GPS', 'Position non disponible.');
    if (!photo) return Alert.alert('Photo', 'Photo obligatoire.');
    setBusy(true);
    try {
      await api.createTicket({
        description: description.trim(),
        urgence,
        typeInfrastructure: type,
        latitude: coords.lat,
        longitude: coords.lng,
        photoUri: photo.uri,
        photoMime: photo.mime,
        photoName: photo.name,
        originSuggestionId: linkedId ?? undefined,
      });
      setPhoto(null);
      setUrgence('NORMAL');
      setType('ROUTE');
      Alert.alert('Signalement officiel créé', 'Soumis au QG pour confirmation (CDC Anamboatra).', [
        { text: 'Voir mes signalements', onPress: () => router.replace('/(app)/tickets') },
        { text: 'OK', style: 'cancel', onPress: () => router.replace('/(app)/map') },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const showTicketSections =
    !isMissionQg || (surZone && terrainChoice === 'TICKET');

  const readyTicket =
    !!description.trim() &&
    !!coords &&
    !!photo &&
    showTicketSections;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <Text style={styles.introEyebrow}>Agent de patrouille</Text>
            <Text style={styles.introTitle}>
              {isMissionQg ? 'Suggestion citoyenne' : 'Nouveau signalement'}
            </Text>
            {user?.role === 'AGENT_PATROUILLE' && !suggestionId?.trim() ? (
              <View style={styles.pickSugSection}>
                <Text style={styles.pickSugTitle}>Suggestions ouvertes dans votre zone</Text>
                <Text style={styles.pickSugLead}>
                  Touchez une fiche pour rejoindre le lieu (itinéraire comme les équipes d&apos;intervention),
                  puis constater sur place.
                </Text>
                {suggestionsLoading ? (
                  <ActivityIndicator color={colors.accent} style={{ marginVertical: 14 }} />
                ) : pendingSuggestions.length === 0 ? (
                  <Text style={styles.helper}>Aucune suggestion en attente.</Text>
                ) : (
                  pendingSuggestions.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.pickSugCard}
                      onPress={() =>
                        router.push(`/(app)/report?suggestionId=${encodeURIComponent(s.id)}`)
                      }
                      activeOpacity={0.88}
                    >
                      <View
                        style={[
                          styles.pickSugStripe,
                          { backgroundColor: TYPE_COLORS[s.typeSuggere] || colors.accent },
                        ]}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.pickSugType}>{TYPE_LABELS[s.typeSuggere]}</Text>
                        <Text style={styles.pickSugDesc} numberOfLines={2}>
                          {s.description}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}
            {isMissionQg && orderSuggestion ? (
              <View style={styles.missionCard}>
                <View style={styles.missionIconRow}>
                  <Ionicons name="bulb-outline" size={18} color="#7c3aed" />
                  <Text style={styles.missionTitle}>Remontée citoyenne à vérifier</Text>
                </View>
                <Text style={styles.missionBody}>
                  Rendez-vous sur le lieu indiqué, contrôlez la situation, puis créez le signalement officiel
                  ou clôturez la suggestion (non conforme, non retrouvé…).
                </Text>
                <View style={styles.citizenBox}>
                  <Text style={styles.citizenEyebrow}>Détail signalé</Text>
                  <Text style={styles.citizenText}>{orderSuggestion.description}</Text>
                  <Text style={styles.citizenMeta}>
                    {TYPE_LABELS[orderSuggestion.typeSuggere]} ·{' '}
                    {orderSuggestion.pseudoCitoyen || 'Anonyme'}
                  </Text>
                </View>
                {dest ? (
                  <>
                    <TouchableOpacity
                      style={styles.btnItineraire}
                      onPress={() => setRouteOpen(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="navigate" size={18} color="#ffffff" />
                      <Text style={styles.btnItineraireText}>Voir l&apos;itinéraire (carte + suivi)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnMapsExt} onPress={openExternalMapsSuggestion}>
                      <Ionicons name="open-outline" size={16} color={colors.textSoft} />
                      <Text style={styles.btnMapsExtText}>Ouvrir dans Google Maps / Plans</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                {!surZone ? (
                  <TouchableOpacity
                    style={styles.btnSurZone}
                    onPress={() => setSurZone(true)}
                  >
                    <Text style={styles.btnSurZoneText}>J&apos;ai rejoint le secteur · suite du constat</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {!terrainChoice ? (
                      <View style={styles.terrainChoices}>
                        <Text style={styles.terrainChoicesTitle}>Sur place — que constatez-vous ?</Text>
                        <TouchableOpacity
                          style={styles.btnConstat}
                          onPress={() => setTerrainChoice('TICKET')}
                        >
                          <Ionicons name="camera" size={20} color="#fff" />
                          <Text style={styles.btnConstatText}>
                            Anomalie constatée — photo & signalement officiel
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnNoIncident}
                          onPress={() => {
                            setTerrainChoice('CLOTURE');
                            setCloseModalVisible(true);
                          }}
                        >
                          <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                          <Text style={styles.btnNoIncidentText}>
                            Pas d&apos;incident réel — non conforme / non retrouvé…
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : terrainChoice === 'TICKET' ? (
                      <Text style={styles.helperMission}>
                        Complétez le formulaire ci-dessous : photo obligatoire, cohérente avec le lieu (CDC Anamboatra).
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.introLead}>
                Décrivez l’anomalie, photographiez-la sur place, votre position GPS est captée
                automatiquement.
              </Text>
            )}
          </View>

          {showTicketSections ? (
            <>
              <Section title="Type d'infrastructure" eyebrow="Étape 1">
                <View style={styles.chipsRow}>
                  {TYPES.map((t) => (
                    <Chip
                      key={t}
                      label={TYPE_LABELS[t]}
                      selected={type === t}
                      color={TYPE_COLORS[t]}
                      onPress={() => setType(t)}
                    />
                  ))}
                </View>
              </Section>

              <Section title="Niveau d'urgence" eyebrow="Étape 2">
                <View style={styles.chipsRow}>
                  <Chip
                    label="Normal"
                    selected={urgence === 'NORMAL'}
                    color={colors.warning}
                    onPress={() => setUrgence('NORMAL')}
                  />
                  <Chip
                    label="Urgent"
                    selected={urgence === 'URGENT'}
                    color={colors.danger}
                    onPress={() => setUrgence('URGENT')}
                  />
                </View>
              </Section>

              <Section title="Description" eyebrow="Étape 3">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                  style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
                  placeholder="Ex. Nid de poule profond sur la voie principale, devant l'école…"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.helper}>{description.trim().length}/2000 caractères</Text>
              </Section>

              <Section title="Position GPS" eyebrow="Étape 4">
                <View style={styles.gpsBox}>
                  <View style={[styles.statusDot, coords ? styles.statusDotOk : styles.statusDotNo]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gpsLine}>
                      {coords
                        ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                        : 'Position non encore captée'}
                    </Text>
                    <Text style={styles.helper}>
                      {isMissionQg
                        ? 'Position liée au lieu de la suggestion ; vous pouvez recapter votre GPS actuel si besoin.'
                        : coords
                          ? 'GPS valide. Bougez pour rafraîchir si besoin.'
                          : 'Activez la localisation puis touchez « Recapter ».'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.btnGhost}
                    onPress={() => void captureGps(false)}
                    disabled={gpsBusy}
                  >
                    {gpsBusy ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Text style={styles.btnGhostText}>Recapter</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Section>

              <Section title="Photo de l'anomalie" eyebrow="Étape 5">
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera-outline" size={32} color={colors.muted} style={{ opacity: 0.6 }} />
                    <Text style={styles.helper}>Une photo claire est obligatoire</Text>
                  </View>
                )}
                <View style={[styles.row, { gap: 8 }]}>
                  <TouchableOpacity style={[styles.btnGhost, { flex: 1 }]} onPress={() => void takePhoto()}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="camera-outline" size={16} color={colors.textSoft} />
                      <Text style={styles.btnGhostText}>Prendre une photo</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnGhost, { flex: 1 }]}
                    onPress={() => void pickFromGallery()}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="image-outline" size={16} color={colors.textSoft} />
                      <Text style={styles.btnGhostText}>Galerie</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </Section>

              <TouchableOpacity
                style={[styles.submit, !readyTicket && styles.submitDisabled]}
                onPress={() => void submitTicket()}
                disabled={busy || !readyTicket}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>
                    {readyTicket ? 'Envoyer le signalement officiel' : 'Compléter les étapes…'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          <Text style={styles.legalNote}>
            Conformément au cahier des charges Anamboatra : traçabilité QG, cohérence photo / GPS, et
            responsabilité en cas de fausse déclaration.
          </Text>
        </ScrollView>

        <Modal
          visible={closeModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            if (!busy) setCloseModalVisible(false);
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Clôture terrain (sans ticket)</Text>
              <Text style={styles.modalLead}>
                Le QG recevra votre motif. Soyez factuel : cela alimente le pilotage communal.
              </Text>
              {CLOTURE_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.code}
                  style={[styles.codeRow, closeCode === o.code && styles.codeRowOn]}
                  onPress={() => setCloseCode(o.code)}
                >
                  <View style={[styles.codeDot, { backgroundColor: closeCode === o.code ? colors.accent : colors.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.codeLabel}>{o.label}</Text>
                    <Text style={styles.codeHint}>{o.hint}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={styles.modalInputLabel}>Observation terrain (obligatoire)</Text>
              <TextInput
                value={closeComment}
                onChangeText={setCloseComment}
                multiline
                numberOfLines={4}
                style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
                placeholder="Ex. Voie praticable, aucun défaut visible à l’emplacement indiqué…"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.helper}>{closeComment.trim().length}/800 (min. 8)</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnGhost}
                  onPress={() => {
                    if (!busy) {
                      setCloseModalVisible(false);
                      setTerrainChoice(null);
                    }
                  }}
                >
                  <Text style={styles.modalBtnGhostText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnPrimary,
                    (closeComment.trim().length < 8 || busy) && styles.submitDisabled,
                  ]}
                  disabled={closeComment.trim().length < 8 || busy}
                  onPress={() => void submitTerrainCloture()}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Valider le retour QG</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {routeOpen && dest && orderSuggestion ? (
          <OsrmRouteModal
            destination={{ latitude: dest.latitude, longitude: dest.longitude }}
            subtitle={`Suggestion · ${TYPE_LABELS[orderSuggestion.typeSuggere]} · ${orderSuggestion.description.slice(0, 56)}`}
            markerIcon="location"
            arriveHint="Vous êtes à proximité du lieu signalé par le citoyen."
            onClose={() => setRouteOpen(false)}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  const c = color ?? colors.accent;
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected && {
          backgroundColor: c,
          borderColor: c,
          shadowColor: c,
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.chipDot, { backgroundColor: selected ? colors.white : c }]} />
      <Text style={[styles.chipText, selected && { color: colors.white, fontWeight: '700' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },

  intro: { gap: 4, marginBottom: 4 },
  introEyebrow: {
    color: colors.accentDark,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  introTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  introLead: { color: colors.muted, fontSize: 13, lineHeight: 18 },

  pickSugSection: {
    marginTop: 8,
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickSugTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  pickSugLead: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  pickSugCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickSugStripe: { width: 4, alignSelf: 'stretch', borderRadius: 4, minHeight: 40 },
  pickSugType: { fontSize: 11, fontWeight: '800', color: colors.accentDark, letterSpacing: 0.8 },
  pickSugDesc: { fontSize: 13, color: colors.text, marginTop: 2 },

  missionCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(124, 58, 237, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.28)',
    gap: 12,
  },
  missionIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionTitle: { fontSize: 13, fontWeight: '800', color: '#5b21b6', letterSpacing: 0.3 },
  missionBody: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '600' },
  citizenBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  citizenEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  citizenText: { fontSize: 14, lineHeight: 19, color: colors.text },
  citizenMeta: { fontSize: 12, color: colors.muted, fontWeight: '600' },

  btnItineraire: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007e3a',
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnItineraireText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  btnMapsExt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  btnMapsExtText: { color: colors.textSoft, fontWeight: '700', fontSize: 14 },

  btnSurZone: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  btnSurZoneText: { color: colors.accent, fontWeight: '800', fontSize: 14 },

  terrainChoices: { gap: 10, marginTop: 4 },
  terrainChoicesTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  btnConstat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 14,
  },
  btnConstatText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 19 },
  btnNoIncident: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(220, 38, 38, 0.45)',
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
  },
  btnNoIncidentText: { flex: 1, color: colors.danger, fontWeight: '800', fontSize: 14, lineHeight: 19 },
  helperMission: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    textAlign: 'center',
  },

  section: {
    gap: 8,
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionEyebrow: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: colors.textSoft, fontSize: 14 },

  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  helper: { color: colors.muted, fontSize: 12 },

  row: { flexDirection: 'row' },
  btnGhost: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: { color: colors.textSoft, fontWeight: '600' },

  gpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusDotOk: { backgroundColor: colors.ok },
  statusDotNo: { backgroundColor: colors.muted },
  gpsLine: { color: colors.text, fontSize: 14, fontWeight: '700' },

  photo: { width: '100%', height: 200, borderRadius: 12, marginBottom: 6 },
  photoPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },

  submit: {
    marginTop: 6,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  submitDisabled: {
    backgroundColor: colors.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: { color: '#ffffff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  legalNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 22, 18, 0.45)',
    justifyContent: 'flex-end',
    padding: 12,
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalLead: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeRowOn: { borderColor: colors.accent, backgroundColor: 'rgba(0, 126, 58, 0.06)' },
  codeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  codeLabel: { fontWeight: '800', fontSize: 14, color: colors.text },
  codeHint: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
  modalInputLabel: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalBtnGhostText: { fontWeight: '700', color: colors.textSoft },
  modalBtnPrimary: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  modalBtnPrimaryText: { fontWeight: '800', color: '#fff' },
});
