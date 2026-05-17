import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { colors, ROLE_LABELS } from '@/theme/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Zone } from '@/lib/types';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const [zone, setZone] = useState<Zone | null>(null);

  useEffect(() => {
    if (!user?.zoneId) {
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

  function confirmLogout() {
    Alert.alert(
      'Déconnexion',
      'Vous allez devoir vous reconnecter pour reprendre votre patrouille.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
      ],
    );
  }

  if (!user) return null;

  const initials = `${user.prenom?.[0] || ''}${user.nom?.[0] || ''}`.toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.flagStrip}>
            <View style={[styles.flagBand, { backgroundColor: colors.white }]} />
            <View style={[styles.flagBand, { backgroundColor: colors.red }]} />
            <View style={[styles.flagBand, { backgroundColor: colors.accent }]} />
          </View>
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarText}>{initials}</Text>
            ) : (
              <Ionicons name="person" size={32} color={colors.white} />
            )}
          </View>
          <Text style={styles.name}>
            {user.prenom} {user.nom}
          </Text>
          <Text style={styles.role}>{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mon compte</Text>
          <Row label="E-mail" value={user.email} />
          <Row label="Commune affectée" value={zone?.nom || '—'} />
          <Row
            label="Code zone"
            value={zone?.code || '—'}
            mono
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Application</Text>
          <Row label="Serveur API" value={API_URL} mono small />
          <Row label="Version" value="0.1.0" />
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          République de Madagascar · Anamboatra Terrain
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.mono,
          small && { fontSize: 11 },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 16, paddingBottom: 40, gap: 14 },

  heroCard: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    overflow: 'hidden',
  },
  flagStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    flexDirection: 'row',
  },
  flagBand: { flex: 1 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '800' },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  role: { color: colors.muted, fontSize: 13, marginTop: 2, fontWeight: '600' },

  section: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowLabel: { color: colors.textSoft, fontSize: 13, fontWeight: '600' },
  rowValue: {
    color: colors.text,
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
  mono: { fontFamily: 'monospace' },

  logoutBtn: {
    backgroundColor: colors.red,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  logoutText: { color: colors.white, fontWeight: '800', fontSize: 15, letterSpacing: 0.4 },

  legal: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});
