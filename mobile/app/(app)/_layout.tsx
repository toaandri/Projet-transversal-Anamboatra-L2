import { Redirect, Tabs, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/AuthContext';
import { colors } from '../../src/theme';

/**
 * Bottom tab bar Anamboatra Terrain (5 tabs) :
 *
 *   [ Carte ]  [ Signalements ]  [   +   ]  [ Citoyens ]  [ Compte ]
 *                                  ^ FAB central, vert, surélevé
 */

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={24}
      color={focused ? colors.accent : colors.muted}
      style={{ marginTop: 2 }}
    />
  );
}

/**
 * Bouton central « + » : on n'utilise pas du tout le rendu par défaut du tab,
 * on dessine un gros cercle vert qui dépasse au-dessus de la barre.
 *
 * Pour les rôles non-agents (équipe, QG) on rend simplement un slot vide :
 * le tab reste présent dans la barre mais n'est plus cliquable.
 */
function PlusTabButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  if (!enabled) {
    return <View style={styles.plusContainer} />;
  }
  return (
    <View style={styles.plusContainer} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouveau signalement"
        onPress={() => router.push('/(app)/report')}
        style={({ pressed }) => [
          styles.plusButton,
          pressed && { transform: [{ scale: 0.94 }], opacity: 0.92 },
        ]}
      >
        <Text style={styles.plusGlyph}>＋</Text>
      </Pressable>
    </View>
  );
}

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  const isAgent  = user.role === 'AGENT_PATROUILLE';
  const isEquipe = user.role === 'EQUIPE_INTERVENTION';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: { paddingTop: 6 },
      }}
    >
      {/* ── Carte ────────────────────────────────────────────── */}
      <Tabs.Screen
        name="map"
        options={{
          title: 'Carte',
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />

      {/* ── Signalements (AGENT) / Missions (EQUIPE) ─────────── */}
      <Tabs.Screen
        name="tickets"
        options={{
          href: isEquipe ? null : undefined,
          title: 'Signalements',
          tabBarIcon: ({ focused }) => <TabIcon name="alert-circle" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          href: isEquipe ? undefined : null,
          title: 'Missions',
          tabBarIcon: ({ focused }) => <TabIcon name="construct" focused={focused} />,
        }}
      />

      {/* ── Bouton central FAB (agent) / slot vide (équipe) ───── */}
      <Tabs.Screen
        name="report"
        options={{
          title: '',
          tabBarButton: () => <PlusTabButton enabled={isAgent} />,
        }}
      />

      {/* ── Citoyens (AGENT seulement) ────────────────────────── */}
      <Tabs.Screen
        name="suggestions"
        options={{
          href: isEquipe ? null : undefined,
          title: 'Citoyens',
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubble-ellipses" focused={focused} />,
        }}
      />

      {/* ── Compte ────────────────────────────────────────────── */}
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: ({ focused }) => <TabIcon name="person-circle" focused={focused} />,
        }}
      />

      {/* Écrans sans tab (navigation programmatique uniquement) */}
      <Tabs.Screen name="ticket/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 84 : 64;
const PLUS_SIZE = 64;

const styles = StyleSheet.create({
  tabBar: {
    height: TAB_BAR_HEIGHT,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 6,
    // ombre légère vers le haut
    shadowColor: '#0e2a14',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  plusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  plusButton: {
    width: PLUS_SIZE,
    height: PLUS_SIZE,
    borderRadius: PLUS_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // surélever au-dessus de la barre
    marginBottom: Platform.OS === 'ios' ? 16 : 14,
    borderWidth: 4,
    borderColor: colors.panel,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  plusGlyph: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '900',
    marginTop: -2,
  },
});
