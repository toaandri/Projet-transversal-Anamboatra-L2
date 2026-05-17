import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { resolveAssetUrl } from '@/lib/config';
import { useAuth } from '@/auth/AuthContext';
import { OsrmRouteModal } from '@/components/OsrmRouteModal';
import { colors, STATUT_COLORS, STATUT_LABELS, TYPE_COLORS, TYPE_LABELS } from '@/theme/theme';
import type { Ticket } from '@/lib/types';

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
        <OsrmRouteModal
          destination={ticket.localisation}
          subtitle={`${TYPE_LABELS[ticket.typeInfrastructure]} · ${ticket.description.slice(0, 40)}`}
          onClose={() => setRouteOpen(false)}
        />
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
