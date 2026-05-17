# Anamboatra Mobile (Expo)

App **Agent de patrouille** + **Équipe d'intervention** du système SGRI-2035.

> Charte officielle alignée sur la vitrine web : blanc / vert / rouge
> (drapeau de Madagascar). Carte Google Maps en plein écran avec affichage
> automatique de la commune de l'agent.

## Pré-requis

- Node.js 18+
- App **Expo Go** sur ton téléphone (Play Store / App Store).
- Le **backend** Express tournant sur ton PC (`cd backend && npm run dev`).
- **PC + téléphone sur le même réseau Wi-Fi**.

## Démarrage rapide (recommandé : Expo Go + téléphone réel)

```bash
# 1. Backend (un terminal)
cd backend
npm install            # première fois uniquement
npm run seed           # crée le compte SUPER_ADMIN (cf. README backend)
npm run dev            # écoute sur 0.0.0.0:4000

# 2. Mobile (autre terminal)
cd mobile
npm install            # première fois uniquement
npm run start          # lance Expo en LAN + ouvre un QR code
```

Sur le téléphone :

1. Ouvre **Expo Go**.
2. Scanne le QR code affiché par le terminal mobile.
3. L'app détecte **automatiquement l'IP de ton PC** via le bundler Expo
   (champ `Constants.expoConfig.hostUri`) et se connecte au backend sur
   `http://<IP_PC>:4000`. Aucune configuration manuelle n'est nécessaire.
4. Si la connexion échoue : le bandeau « Serveur : … » de l'écran de
   connexion affiche l'URL utilisée. Vérifie que cette adresse est joignable
   depuis le navigateur du téléphone.

## QR code → "loading" infini ou "Something went wrong"

Symptôme typique sur **Windows** : le terminal affiche

```
› Metro waiting on exp://127.0.0.1:8081
```

→ Metro écoute sur **localhost** au lieu de l'IP LAN, donc le téléphone n'a
aucune chance de télécharger le bundle.

Le script `npm run start` corrige ça automatiquement : il choisit la première
IP LAN « réelle » de ton PC en ignorant les interfaces virtuelles
(VirtualBox, vEthernet WSL, Hyper-V, Docker…) puis force Metro dessus via
`REACT_NATIVE_PACKAGER_HOSTNAME`. Tu verras au démarrage :

```
[anamboatra] Interfaces LAN détectées :
  - Wi-Fi              192.168.1.42  (score 55)
  - vEthernet (WSL)    172.31.0.1    (score -50)
[anamboatra] IP LAN choisie pour Metro : 192.168.1.42
```

### Si ça ne marche toujours pas

1. **Forcer une IP** (utile si tu veux choisir manuellement) :
   ```bash
   npm run start -- 192.168.1.42
   ```
2. **Mode tunnel** (passe par les serveurs Expo, lent mais marche même si le
   PC et le téléphone ne sont pas sur le même réseau) :
   ```bash
   npm run start:tunnel
   ```
3. **Pare-feu Windows** : la première fois que `node.exe` écoute sur :8081 ou
   :4000, Windows Defender propose un popup « Autoriser l'accès ». Coche
   **Réseaux privés** et clique « Autoriser ». Si le popup n'apparaît plus :
   ```powershell
   # PowerShell admin
   New-NetFirewallRule -DisplayName "Anamboatra Metro 8081"  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081 -Profile Private
   New-NetFirewallRule -DisplayName "Anamboatra Backend 4000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private
   ```
4. **Vérifier que ton téléphone joint le PC** : ouvre le navigateur du
   téléphone et tape `http://<IP_LAN_PC>:4000/api/health`. Tu dois voir
   `{"ok":true}`. Si non, c'est un souci réseau/pare-feu — pas l'app.

## Auto-détection de l'API_URL

`mobile/src/config.ts` calcule l'URL du backend dans cet ordre :

1. Une `API_URL` explicite **non-localhost** dans `app.json` → respectée.
2. L'IP du Metro bundler (Expo Go) + port 4000 → automatique.
3. Fallback : `http://10.0.2.2:4000` (émulateur Android) ou
   `http://localhost:4000` (simulateur iOS).

Pour forcer une URL spécifique (ex. backend déployé) :

```json
"extra": { "API_URL": "https://anamboatra.example.com", "GOOGLE_MAPS_API_KEY": "" }
```

## (Optionnel) Clé Google Maps Android

Pour avoir Google Maps natif sur Android (au lieu du fallback) :

1. Active **Maps SDK for Android** dans la console Google Cloud.
2. Renseigne la clé dans `app.json` → `expo.android.config.googleMaps.apiKey`.

Sur **Expo Go**, la carte fonctionne déjà sans clé (Google la fournit pour le client Expo).

## Comptes

La base démarre **vide** sauf le compte **SUPER_ADMIN** créé par `npm run seed`
côté backend :

- `admin@anamboatra.mg` / `admin1234`

Le SUPER_ADMIN passe par le **frontend web** (`/admin`) pour :

1. Créer une **commune / arrondissement** (zone QG) avec sa géométrie.
2. Créer l'**Admin QG** rattaché à cette zone.

L'**Admin QG** se connecte ensuite au web et crée :

- les **agents de patrouille** (`AGENT_PATROUILLE`) → connexion **mobile**,
- les **équipes d'intervention** (`EQUIPE_INTERVENTION`) → connexion **mobile**.

L'app mobile refuse les rôles `ADMIN_QG`, `SUPER_ADMIN` et `CITOYEN` qui
passent par le web.

## Fonctionnalités

| Écran             | Rôle                | Fonction |
|-------------------|---------------------|----------|
| Connexion         | tous                | JWT (`POST /api/auth/login`) |
| Carte             | Agent / Équipe      | `GET /api/map/tiles` + WebSocket temps réel, polygone de la commune, switch satellite/plan |
| Signalement       | Agent de patrouille | photo (caméra/galerie), GPS auto, urgence, type → `POST /api/tickets` |
| Position GPS      | Agent / Équipe      | `PATCH /api/users/me/position` |
| Missions          | Équipe              | tickets affectés via `mission.assignedUserIds` |
| Détail ticket     | Agent / Équipe      | itinéraire (Google Maps / Plans), démarrage, clôture avec photo |

## Dépannage

| Symptôme | Solution |
|---|---|
| « Network request failed » sur le login | Vérifie que le backend tourne et que le PC est joignable depuis le téléphone (même Wi-Fi, pas de pare-feu Windows qui bloque le port 4000). |
| Photos vides dans le détail | Les anciennes données contiennent peut-être encore des URLs `http://localhost:4000/...` non joignables depuis le téléphone. Recrée des tickets : les nouvelles URLs sont relatives (`/static/...`) et seront automatiquement préfixées par l'IP du backend. |
| Carte grise | Active la **Maps SDK Android** ou utilise simplement Expo Go (clé fournie par Google). |
| « Compte non trouvé » | La base est vide après seed. Crée tes agents via le web (`/admin` puis console QG). |
