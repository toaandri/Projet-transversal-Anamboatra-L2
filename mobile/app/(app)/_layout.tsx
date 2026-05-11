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

function TabIcon({ name, focused, equipe }: { name: IoniconsName; focused: boolean; equipe?: boolean }) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={equipe ? 25 : 24}
      color={focused ? colors.accent : colors.muted}
      style={{ marginTop: equipe ? 4 : 2 }}
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
function PlusTabButton({ enabled, equipe }: { enabled: boolean; equipe?: boolean }) {
  const router = useRouter();
  if (!enabled) {
    return (
      <View
        style={[styles.plusContainer, equipe && styles.plusContainerEquipe]}
        pointerEvents="none"
      />
    );
  }
  return (
    <View style={[styles.plusContainer, equipe && styles.plusContainerEquipe]} pointerEvents="box-none">
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
          fontSize: isEquipe ? 11 : 10,
          fontWeight: '700',
          marginBottom: Platform.OS === 'ios' ? 2 : isEquipe ? 6 : 4,
          marginTop: isEquipe ? 2 : 0,
          letterSpacing: isEquipe ? 0.15 : 0,
        },
        tabBarStyle: {
          ...styles.tabBar,
          ...(isEquipe ? styles.tabBarEquipe : {}),
        },
        // Équipe : largeur par onglet (3 boutons répartis + mince séparateur au centre.
        tabBarItemStyle: isEquipe ? undefined : styles.tabBarItemDefault,
      }}
    >
      {/* ── Carte ────────────────────────────────────────────── */}
      <Tabs.Screen
        name="map"
        options={{
          title: 'Carte',
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} equipe={isEquipe} />,
          ...(isEquipe ? { tabBarItemStyle: styles.tabBarItemEquipeTab } : {}),
        }}
      />

      {/* ── Signalements (AGENT) / Missions (EQUIPE) ─────────── */}
      <Tabs.Screen
        name="tickets"
        options={{
          href: isEquipe ? null : undefined,
          title: 'Signalements',
          tabBarIcon: ({ focused }) => <TabIcon name="alert-circle" focused={focused} equipe={isEquipe} />,
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          href: isEquipe ? undefined : null,
          title: 'Missions',
          tabBarIcon: ({ focused }) => <TabIcon name="construct" focused={focused} equipe={isEquipe} />,
          ...(isEquipe ? { tabBarItemStyle: styles.tabBarItemEquipeTab } : {}),
        }}
      />

      {/* ── Bouton central FAB (agent) / slot vide (équipe) ───── */}
      <Tabs.Screen
        name="report"
        options={{
          title: '',
          tabBarButton: () => <PlusTabButton enabled={isAgent} equipe={isEquipe} />,
          ...(isEquipe ? { tabBarItemStyle: styles.tabBarItemEquipeSpacer } : {}),
        }}
      />

      {/* ── Citoyens (AGENT seulement) ────────────────────────── */}
      <Tabs.Screen
        name="suggestions"
        options={{
          href: isEquipe ? null : undefined,
          title: 'Citoyens',
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubble-ellipses" focused={focused} equipe={isEquipe} />,
        }}
      />

      {/* ── Compte ────────────────────────────────────────────── */}
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: ({ focused }) => <TabIcon name="person-circle" focused={focused} equipe={isEquipe} />,
          ...(isEquipe ? { tabBarItemStyle: styles.tabBarItemEquipeTab } : {}),
        }}
      />

      {/* Écrans sans tab (navigation programmatique uniquement) */}
      <Tabs.Screen name="ticket/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 84 : 64;
const TAB_BAR_HEIGHT_EQUIPE = Platform.OS === 'ios' ? 88 : 72;
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
  /** Onglets redistribués (4 pers. visibles) + labels un peu plus aérés */
  tabBarEquipe: {
    height: TAB_BAR_HEIGHT_EQUIPE,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 10 : 6,
  },
  tabBarItemDefault: {
    paddingTop: 6,
  },
  /** Équipe : 3 onglets utiles se partagent la largeur ; le « trou » du FAB est minimal. */
  tabBarItemEquipeTab: {
    flex: 1,
    paddingTop: 4,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
  },
  tabBarItemEquipeSpacer: {
    flexGrow: 0,
    flexShrink: 0,
    width: 10,
    minWidth: 10,
    maxWidth: 10,
    paddingHorizontal: 0,
  },
  plusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  plusContainerEquipe: {
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'ios' ? 4 : 2,
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
