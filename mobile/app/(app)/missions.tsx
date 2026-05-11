import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { colors, STATUT_COLORS, STATUT_LABELS, TYPE_COLORS, TYPE_LABELS } from '../../src/theme';
import type { Ticket } from '../../src/types';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Barre de progression de statut ─────────────────────────────────────── */
const STEPS: Ticket['statut'][] = ['REPARATION_PREVUE', 'EN_REPARATION', 'TERMINE'];
const STEPS_INDEX = new Map<Ticket['statut'], number>(STEPS.map((s, i) => [s, i]));

const STATUT_RANK_MISSIONS = new Map<Ticket['statut'], number>([
  ['EN_REPARATION', 0],
  ['REPARATION_PREVUE', 1],
  ['TERMINE', 2],
  ['CLOTURE', 3],
  ['EN_ATTENTE_CONFIRMATION', 4],
]);

const ACTIVE_TAB_STATUTS = new Set<Ticket['statut']>(['EN_REPARATION', 'REPARATION_PREVUE']);
const HIST_TAB_STATUTS = new Set<Ticket['statut']>(['TERMINE', 'CLOTURE']);

function StatusStepper({ statut }: { statut: Ticket['statut'] }) {
  const currentIdx = STEPS_INDEX.get(statut as (typeof STEPS)[number]) ?? -1;
  return (
    <View style={styles.stepper}>
      {STEPS.map((step, i) => {
        const done    = i <= currentIdx;
        const active  = i === currentIdx;
        const color   = done ? STATUT_COLORS[step] : colors.border;
        return (
          <View key={step} style={styles.stepRow}>
            <View style={[styles.stepDot, { backgroundColor: color, borderColor: color }]}>
              {done ? (
                <Ionicons name={active ? 'ellipse' : 'checkmark'} size={10} color={colors.white} />
              ) : null}
            </View>
            <Text style={[styles.stepLabel, done && { color: STATUT_COLORS[step], fontWeight: '700' }]}>
              {STATUT_LABELS[step]}
            </Text>
            {i < STEPS.length - 1 ? (
              <View style={[styles.stepLine, { backgroundColor: i < currentIdx ? colors.ok : colors.border }]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ─── Carte de mission active (EN_REPARATION) ─────────────────────────────── */
function ActiveMissionCard({ ticket, onRefresh }: { ticket: Ticket; onRefresh: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const typeColor = TYPE_COLORS[ticket.typeInfrastructure] || colors.muted;

  async function handleCloture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Accès refusé', 'Autorisez l\'accès à la caméra pour la photo de clôture.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setLoading(true);
    try {
      const photoUrl = await api.closurePhoto(
        ticket.id,
        asset.uri,
        asset.fileName ?? 'cloture.jpg',
        asset.mimeType ?? 'image/jpeg',
      );
      await api.patchTicket(ticket.id, { statut: 'TERMINE', photoCloture: photoUrl });
      onRefresh();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de clôturer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.activeCard}>
      {/* Bandeau coloré type infra */}
      <View style={[styles.activeStripe, { backgroundColor: typeColor }]} />

      <View style={styles.activeBody}>
        {/* En-tête */}
        <View style={styles.activeHeader}>
          <View style={styles.activeHeaderLeft}>
            <View style={[styles.activePulse, { backgroundColor: colors.info + '20' }]}>
              <View style={[styles.activePulseDot, { backgroundColor: colors.info }]} />
            </View>
            <Text style={styles.activeEyebrow}>EN COURS</Text>
          </View>
          {ticket.urgence === 'URGENT' ? (
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={10} color={colors.white} />
              <Text style={styles.urgentText}>URGENT</Text>
            </View>
          ) : null}
        </View>

        {/* Type + description */}
        <View style={styles.activeTypeRow}>
          <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
          <Text style={[styles.activeTypeLabel, { color: typeColor }]}>
            {TYPE_LABELS[ticket.typeInfrastructure]}
          </Text>
        </View>
        <Text style={styles.activeDesc} numberOfLines={3}>{ticket.description}</Text>

        {/* Photo signalement */}
        {ticket.photoSignalement ? (
          <Image source={{ uri: ticket.photoSignalement }} style={styles.activePhoto} resizeMode="cover" />
        ) : null}

        {/* Stepper */}
        <StatusStepper statut={ticket.statut} />

        {/* Actions */}
        <View style={styles.activeActions}>
          <Pressable
            style={styles.detailBtn}
            onPress={() => router.push(`/(app)/ticket/${ticket.id}`)}
          >
            <Ionicons name="document-text-outline" size={14} color={colors.accent} />
            <Text style={styles.detailBtnText}>Détail</Text>
          </Pressable>

          <Pressable
            style={[styles.clotureBtn, loading && { opacity: 0.6 }]}
            onPress={handleCloture}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="camera" size={15} color={colors.white} />
                <Text style={styles.clotureBtnText}>Clôturer — prendre photo</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ─── Carte mission standard ──────────────────────────────────────────────── */
function MissionCard({
  ticket,
  onRefresh,
}: {
  ticket: Ticket;
  onRefresh: () => void;
}) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const typeColor   = TYPE_COLORS[ticket.typeInfrastructure] || colors.muted;
  const statutColor = STATUT_COLORS[ticket.statut] || colors.muted;
  const done = ticket.statut === 'TERMINE' || ticket.statut === 'CLOTURE';

  async function handleStart() {
    setLoading(true);
    try {
      await api.patchTicket(ticket.id, { statut: 'EN_REPARATION' });
      onRefresh();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de démarrer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { borderLeftColor: typeColor }, pressed && { opacity: 0.85 }]}
      onPress={() => router.push(`/(app)/ticket/${ticket.id}`)}
    >
      {/* En-tête */}
      <View style={styles.cardHeader}>
        <View style={[styles.typePill, { borderColor: typeColor }]}>
          <View style={[styles.typePillDot, { backgroundColor: typeColor }]} />
          <Text style={[styles.typePillText, { color: typeColor }]}>
            {TYPE_LABELS[ticket.typeInfrastructure]}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {ticket.urgence === 'URGENT' ? (
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={10} color={colors.white} />
              <Text style={styles.urgentText}>URGENT</Text>
            </View>
          ) : null}
          <View style={[styles.statutPill, { backgroundColor: statutColor + '18', borderColor: statutColor + '44' }]}>
            {done ? <Ionicons name="checkmark-circle" size={11} color={statutColor} /> : null}
            <Text style={[styles.statutPillText, { color: statutColor }]}>
              {STATUT_LABELS[ticket.statut]}
            </Text>
          </View>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.cardDesc} numberOfLines={2}>{ticket.description}</Text>

      {/* Date fin si terminé */}
      {done && ticket.mission?.dateFin ? (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-done" size={13} color={colors.ok} />
          <Text style={styles.doneText}>Terminé le {formatDate(ticket.mission.dateFin)}</Text>
        </View>
      ) : null}

      {/* Bouton Démarrer si REPARATION_PREVUE */}
      {ticket.statut === 'REPARATION_PREVUE' ? (
        <Pressable
          style={[styles.startBtn, loading && { opacity: 0.6 }]}
          onPress={(e) => { e.stopPropagation?.(); void handleStart(); }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="play" size={13} color={colors.white} />
              <Text style={styles.startBtnText}>Démarrer la réparation</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/* ─── Écran principal ─────────────────────────────────────────────────────── */
export default function MissionsScreen() {
  const { user } = useAuth();
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState<'actives' | 'historique'>('actives');

  const load = useCallback(async () => {
    try {
      const { tickets: list } = await api.tickets();
      const myId = user?.id ?? '';
      const mine = list.filter((t) => t.mission?.assignedUserIds?.includes(myId));
      mine.sort((a, b) => (STATUT_RANK_MISSIONS.get(a.statut) ?? 9) - (STATUT_RANK_MISSIONS.get(b.statut) ?? 9));
      setTickets(mine);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => { void load(); }, [load]),
  );

  const { activeMissions, histMissions, currentActiveMission } = useMemo(() => {
    const active: Ticket[] = [];
    const hist: Ticket[] = [];
    let current: Ticket | null = null;
    for (const t of tickets) {
      if (t.statut === 'EN_REPARATION' && !current) current = t;
      if (ACTIVE_TAB_STATUTS.has(t.statut)) active.push(t);
      if (HIST_TAB_STATUTS.has(t.statut)) hist.push(t);
    }
    return { activeMissions: active, histMissions: hist, currentActiveMission: current };
  }, [tickets]);

  const displayed = tab === 'actives' ? activeMissions : histMissions;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageEyebrow}>ÉQUIPE D'INTERVENTION</Text>
            <Text style={styles.pageTitle}>Mes missions</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeNum}>{tickets.length}</Text>
          </View>
        </View>

        {/* ── Toggle Actives / Historique ─────────────────────── */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, tab === 'actives' && styles.tabBtnActive]}
            onPress={() => setTab('actives')}
          >
            <Ionicons
              name="construct"
              size={13}
              color={tab === 'actives' ? colors.white : colors.muted}
            />
            <Text style={[styles.tabBtnText, tab === 'actives' && styles.tabBtnTextActive]}>
              Actives
            </Text>
            {activeMissions.length > 0 ? (
              <View style={[styles.tabCount, tab === 'actives' && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, tab === 'actives' && styles.tabCountTextActive]}>
                  {activeMissions.length}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            style={[styles.tabBtn, tab === 'historique' && styles.tabBtnActive]}
            onPress={() => setTab('historique')}
          >
            <Ionicons
              name="checkmark-done-circle"
              size={13}
              color={tab === 'historique' ? colors.white : colors.muted}
            />
            <Text style={[styles.tabBtnText, tab === 'historique' && styles.tabBtnTextActive]}>
              Historique
            </Text>
            {histMissions.length > 0 ? (
              <View style={[styles.tabCount, tab === 'historique' && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, tab === 'historique' && styles.tabCountTextActive]}>
                  {histMissions.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* ── KPIs (onglet actives seulement) ─────────────────── */}
        {tab === 'actives' && tickets.length > 0 ? (
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiNum}>{activeMissions.length}</Text>
              <Text style={styles.kpiLabel}>Actives</Text>
            </View>
            <View style={[styles.kpiCard, styles.kpiCardGreen]}>
              <Text style={[styles.kpiNum, { color: colors.ok }]}>{histMissions.length}</Text>
              <Text style={styles.kpiLabel}>Terminées</Text>
            </View>
            <View style={[
              styles.kpiCard,
              tickets.some((t) => t.urgence === 'URGENT') && styles.kpiCardRed,
            ]}>
              <Text style={[
                styles.kpiNum,
                tickets.some((t) => t.urgence === 'URGENT') && { color: colors.danger },
              ]}>
                {tickets.filter((t) => t.urgence === 'URGENT').length}
              </Text>
              <Text style={styles.kpiLabel}>Urgentes</Text>
            </View>
          </View>
        ) : null}

        {/* ── Mission EN_REPARATION en vedette (actives seulement) */}
        {tab === 'actives' && currentActiveMission ? (
          <>
            <Text style={styles.sectionTitle}>
              <Ionicons name="radio-button-on" size={12} color={colors.info} /> Mission en cours
            </Text>
            <ActiveMissionCard ticket={currentActiveMission} onRefresh={load} />
          </>
        ) : null}

        {/* ── Liste principale ─────────────────────────────────── */}
        {displayed.filter((t) => t.id !== currentActiveMission?.id).length > 0 ? (
          <>
            {tab === 'actives' ? (
              <Text style={styles.sectionTitle}>
                {currentActiveMission ? 'En attente' : 'Toutes les missions actives'}
              </Text>
            ) : (
              <Text style={styles.sectionTitle}>
                <Ionicons name="checkmark-done" size={12} color={colors.ok} /> Missions terminées
              </Text>
            )}
            {displayed
              .filter((t) => t.id !== currentActiveMission?.id)
              .map((t) => (
                <MissionCard key={t.id} ticket={t} onRefresh={load} />
              ))}
          </>
        ) : null}

        {/* ── Empty state ──────────────────────────────────────── */}
        {displayed.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name={tab === 'historique' ? 'checkmark-done-circle-outline' : 'construct-outline'}
                size={40}
                color={colors.accent + '60'}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {tab === 'historique' ? 'Aucune mission terminée' : 'Aucune mission active'}
            </Text>
            <Text style={styles.emptyHint}>
              {tab === 'historique'
                ? 'Les missions clôturées apparaîtront ici.'
                : 'Le QG vous assignera des missions dès qu\'un ticket sera confirmé.'}
            </Text>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  flex:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 10 },

  /* Header page */
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  pageEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.12,
    textTransform: 'uppercase',
    color: colors.accent,
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  countBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  countBadgeNum: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
  },

  /* Toggle Actives / Historique */
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  tabBtnTextActive: {
    color: colors.white,
  },
  tabCount: {
    backgroundColor: colors.border,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
  },
  tabCountTextActive: {
    color: colors.white,
  },

  /* KPIs */
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  kpiCardGreen: { borderColor: colors.ok + '44', backgroundColor: colors.ok + '0d' },
  kpiCardRed:   { borderColor: colors.danger + '44', backgroundColor: colors.danger + '0d' },
  kpiNum: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.06 },

  /* Section title */
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    marginTop: 6,
    marginBottom: 2,
  },

  /* ── Carte active ──────────────────────────────────────── */
  activeCard: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.info + '33',
    shadowColor: colors.info,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  activeStripe: { height: 4 },
  activeBody:   { padding: 16, gap: 10 },

  activeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activePulse: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  activePulseDot: { width: 10, height: 10, borderRadius: 5 },
  activeEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.12,
    textTransform: 'uppercase',
    color: colors.info,
  },

  activeTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeDot:       { width: 9, height: 9, borderRadius: 5 },
  activeTypeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05 },

  activeDesc: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    fontWeight: '500',
  },
  activePhoto: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: colors.border,
  },

  activeActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  detailBtnText: { fontSize: 13, fontWeight: '700', color: colors.accent },

  clotureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  clotureBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  /* ── Stepper ───────────────────────────────────────────── */
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 0, marginVertical: 4 },
  stepRow:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
  },
  stepLabel: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: '600',
    marginLeft: 3,
    flex: 1,
    flexWrap: 'wrap',
  },
  stepLine: { width: 18, height: 2, marginHorizontal: 2 },

  /* ── Carte standard ────────────────────────────────────── */
  card: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    gap: 7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  typePillDot:  { width: 7, height: 7, borderRadius: 4 },
  typePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  statutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statutPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.04 },

  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.danger,
  },
  urgentText: { color: colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  cardDesc: { color: colors.textSoft, fontSize: 13, lineHeight: 18 },

  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  doneText: { fontSize: 12, color: colors.ok, fontWeight: '600' },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignSelf: 'flex-start',
  },
  startBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  /* ── Empty state ───────────────────────────────────────── */
  empty: { paddingVertical: 60, alignItems: 'center', gap: 10 },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  emptyHint:  { color: colors.muted, fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
});
