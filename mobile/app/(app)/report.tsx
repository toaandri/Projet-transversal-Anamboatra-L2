import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { Ionicons } from '@expo/vector-icons';
import { colors, TYPE_COLORS, TYPE_LABELS } from '../../src/theme';
import type { TypeInfrastructure, Urgence } from '../../src/types';

const TYPES: TypeInfrastructure[] = ['ROUTE', 'ELECTRICITE', 'EAU'];

export default function ReportScreen() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TypeInfrastructure>('ROUTE');
  const [urgence, setUrgence] = useState<Urgence>('NORMAL');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mime?: string; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  useEffect(() => {
    void captureGps(true);
  }, []);

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

  async function submit() {
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
      });
      setDescription('');
      setPhoto(null);
      setUrgence('NORMAL');
      setType('ROUTE');
      Alert.alert('Signalement créé', 'En attente de confirmation par le QG.', [
        { text: 'Voir mes signalements', onPress: () => router.replace('/(app)/tickets') },
        { text: 'OK', style: 'cancel', onPress: () => router.replace('/(app)/map') },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = !!description.trim() && !!coords && !!photo;

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
          <Text style={styles.introTitle}>Nouveau signalement</Text>
          <Text style={styles.introLead}>
            Décrivez l’anomalie, photographiez-la sur place, votre position GPS est captée
            automatiquement.
          </Text>
        </View>

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
                {coords
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
          style={[styles.submit, !ready && styles.submitDisabled]}
          onPress={() => void submit()}
          disabled={busy || !ready}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>
              {ready ? 'Envoyer le signalement' : 'Compléter les étapes…'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legalNote}>
          Le signalement reste « en attente » jusqu'à validation du QG. Les fausses alertes
          peuvent entraîner des sanctions.
        </Text>
      </ScrollView>
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
});
