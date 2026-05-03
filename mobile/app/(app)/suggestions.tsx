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
import { api } from '../../src/api';
import { colors, TYPE_COLORS, TYPE_LABELS } from '../../src/theme';
import type { SuggestionCitoyen } from '../../src/types';

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

function sortSuggestions(list: SuggestionCitoyen[]): SuggestionCitoyen[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.dateSoumission || a.createdAt || 0).getTime();
    const tb = new Date(b.dateSoumission || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export default function SuggestionsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<SuggestionCitoyen[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const sugRes = await api.suggestions();
      setItems(sortSuggestions(sugRes.suggestions));
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
        <Text style={styles.headerEyebrow}>Demandes citoyennes</Text>
        <Text style={styles.headerTitle}>{items.length} suggestion{items.length > 1 ? 's' : ''}</Text>
        <Text style={styles.headerSub}>
          Anomalies remontées par les habitants depuis le portail public.
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
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="bulb-outline" size={48} color={colors.muted} style={{ marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>Aucune suggestion citoyenne</Text>
          <Text style={styles.emptySub}>
            Quand un citoyen signalera une anomalie depuis le site web, elle apparaîtra ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
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
          renderItem={({ item }) => {
            const color = TYPE_COLORS[item.typeSuggere] || colors.border;
            return (
              <View style={[styles.card, { borderLeftColor: color }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.badgesRow}>
                    <View style={[styles.badge, { backgroundColor: color }]}>
                      <Text style={styles.badgeText}>{TYPE_LABELS[item.typeSuggere]}</Text>
                    </View>
                    {item.traitee ? (
                      <View style={[styles.badge, { backgroundColor: colors.ok }]}>
                        <Text style={styles.badgeText}>TRAITÉE</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, { backgroundColor: colors.warning }]}>
                        <Text style={styles.badgeText}>EN ATTENTE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dateText}>
                    {formatDate(item.dateSoumission || item.createdAt)}
                  </Text>
                </View>

                <Text style={styles.desc}>{item.description}</Text>

                {item.instructionQg && !item.traitee ? (
                  <View style={styles.orderBox}>
                    <Text style={styles.orderEyebrow}>Consigne (historique)</Text>
                    <Text style={styles.orderText}>{item.instructionQg}</Text>
                  </View>
                ) : null}

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="person-outline" size={12} color={colors.muted} />
                    <Text style={styles.author}>{item.pseudoCitoyen || 'Citoyen anonyme'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-sharp" size={12} color={colors.muted} />
                    <Text style={styles.coord}>
                      {item.localisation.latitude.toFixed(4)},{' '}
                      {item.localisation.longitude.toFixed(4)}
                    </Text>
                  </View>
                </View>

                {!item.traitee ? (
                  <TouchableOpacity
                    style={styles.ctaOfficiel}
                    onPress={() =>
                      router.push(`/(app)/report?suggestionId=${encodeURIComponent(item.id)}`)
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaOfficielText}>Constat terrain →</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
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
  emptySub: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 280 },
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
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  author: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  coord: { color: colors.muted, fontSize: 11, fontWeight: '600' },

  orderBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 126, 58, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0, 126, 58, 0.2)',
    gap: 4,
  },
  orderEyebrow: {
    color: '#006c32',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  orderText: { color: colors.text, fontSize: 13, lineHeight: 18 },

  ctaOfficiel: {
    marginTop: 10,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaOfficielText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
