import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import {
  colors,
  STATUT_COLORS,
  STATUT_LABELS,
  TYPE_COLORS,
  TYPE_LABELS,
} from '@/theme/theme';
import type { Ticket } from '@/lib/types';

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function TicketsScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { tickets: list } = await api.tickets();
      setTickets(list);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Mes signalements</Text>
        <Text style={styles.headerTitle}>{tickets.length} ticket{tickets.length > 1 ? 's' : ''}</Text>
        <Text style={styles.headerSub}>
          Tous les signalements que vous avez envoyés au QG.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.errText}>{err}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={48} color={colors.muted} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>Aucun signalement</Text>
          <Text style={styles.emptySub}>
            Touchez le bouton « + » au centre pour créer votre premier ticket.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: TYPE_COLORS[item.typeInfrastructure] || colors.border }]}
              onPress={() => router.push(`/(app)/ticket/${item.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                <View style={styles.badgesRow}>
                  <View style={[styles.badge, { backgroundColor: TYPE_COLORS[item.typeInfrastructure] }]}>
                    <Text style={styles.badgeText}>{TYPE_LABELS[item.typeInfrastructure]}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: STATUT_COLORS[item.statut] || colors.muted },
                    ]}
                  >
                    <Text style={styles.badgeText}>{STATUT_LABELS[item.statut]}</Text>
                  </View>
                  {item.urgence === 'URGENT' ? (
                    <View style={[styles.badge, { backgroundColor: colors.red }]}>
                      <Text style={styles.badgeText}>URGENT</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.dateText}>{formatDate(item.dateSignalement || item.updatedAt)}</Text>
              </View>
              <Text style={styles.desc} numberOfLines={3}>
                {item.description}
              </Text>
              <View style={styles.coordRow}>
                <Ionicons name="location-sharp" size={12} color={colors.muted} />
                <Text style={styles.coord}>
                  {item.localisation.latitude.toFixed(4)}, {item.localisation.longitude.toFixed(4)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerEyebrow: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  headerSub: { color: colors.muted, fontSize: 12, marginTop: 4 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  emptySub: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 260 },
  errText: { color: colors.danger, marginBottom: 12, textAlign: 'center' },
  retry: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.white, fontWeight: '700' },

  listContent: { padding: 12, gap: 10, paddingBottom: 30 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  dateText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  desc: { color: colors.text, fontSize: 14, lineHeight: 19 },
  coord: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
