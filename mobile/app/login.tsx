import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme/theme';
import { API_URL } from '@/lib/config';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!email.trim() || !password) {
      Alert.alert('Informations manquantes', 'Renseigner l’adresse e-mail et le mot de passe.');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/(app)/map');
    } catch (e) {
      Alert.alert('Connexion impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <View style={styles.logoFlag}>
                <View style={[styles.flagBand, { backgroundColor: colors.white }]} />
                <View style={[styles.flagBand, { backgroundColor: colors.red }]} />
                <View style={[styles.flagBand, { backgroundColor: colors.accent }]} />
              </View>
              <View style={styles.logoPin} />
            </View>
            <Text style={styles.brandEyebrow}>République de Madagascar</Text>
            <Text style={styles.title}>Anamboatra</Text>
            <Text style={styles.subtitle}>
              Application terrain · Ministère des Travaux Publics
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connexion agent</Text>
            <Text style={styles.cardLead}>
              Réservé aux agents de patrouille et aux équipes d’intervention. Les identifiants sont délivrés par le
              QG de rattachement.
            </Text>

            <Text style={styles.label}>Adresse e-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              placeholder="prenom.nom@anamboatra.mg"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
            />

            <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.btnText}>Se connecter</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerLine}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={styles.footerText}>Serveur : {API_URL}</Text>
            </View>
            <Text style={styles.footerHint}>
              En environnement local : téléphone serveur exposé depuis le même segment réseau que le poste de
              développement ; vérifiez que le backend Anamboatra est démarré.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 40, paddingBottom: 32, gap: 22 },
  brand: { alignItems: 'center', gap: 6 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 8,
    position: 'relative',
  },
  logoFlag: {
    width: 30,
    height: 22,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  flagBand: { flex: 1 },
  logoPin: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.red,
    bottom: 8,
    right: 12,
    borderWidth: 2,
    borderColor: colors.white,
  },
  brandEyebrow: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 2 },

  card: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0e2a14',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cardLead: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  label: { color: colors.textSoft, fontSize: 12, marginTop: 10, fontWeight: '600' },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  btn: {
    marginTop: 18,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },

  footer: { gap: 6, paddingHorizontal: 4 },
  footerLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footerText: { color: colors.textSoft, fontSize: 12, fontWeight: '600' },
  footerHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
