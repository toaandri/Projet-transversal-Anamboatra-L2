import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../useAuth';

type Phrase = { line1: string; line2: string };

const PHRASES: Phrase[] = [
  { line1: 'Bâti pour les villes,', line2: "pour l'ère post-réactive." },
  { line1: 'Fanjakana miasa', line2: 'ho anao.' },
];

const CITIES = [
  { name: 'Antananarivo', tag: 'Capitale', color: 'blue' },
  { name: 'Toamasina', tag: 'Côte est', color: 'green' },
  { name: 'Mahajanga', tag: 'Nord-ouest', color: 'red' },
  { name: 'Antsirabe', tag: 'Vakinankaratra', color: 'blue' },
  { name: 'Fianarantsoa', tag: 'Hautes terres', color: 'green' },
  { name: 'Toliara', tag: 'Sud-ouest', color: 'red' },
] as const;

// Pins en coordonnées SVG (viewBox 0 0 100 200) — calés sur l'intérieur du contour
const MAP_PREVIEW_PINS = [
  { name: 'Antsiranana', x: 78, y: 14, color: '#c8102e', delay: 0 },
  { name: 'Mahajanga', x: 38, y: 56, color: '#16a34a', delay: 0.5 },
  { name: 'Toamasina', x: 80, y: 92, color: '#1a73e8', delay: 1.0 },
  { name: 'Antananarivo', x: 56, y: 102, color: '#1a73e8', delay: 1.5 },
  { name: 'Antsirabe', x: 50, y: 117, color: '#16a34a', delay: 2.0 },
  { name: 'Fianarantsoa', x: 50, y: 138, color: '#c8102e', delay: 2.5 },
  { name: 'Toliara', x: 12, y: 165, color: '#16a34a', delay: 3.0 },
];

// Contour de Madagascar reconstruit depuis les coordonnées GeoJSON réelles
// (lon 43.25→50.48, lat -25.60→-11.95) projetées sur viewBox 0 0 100 200
const MADAGASCAR_PATH =
  'M 87.05 7.62 L 90.72 13.85 L 94.14 23.53 L 96.37 41.16 L 99.95 48.01 L 98.58 55.04 L 96.13 59.34 L 91.43 50.76 L 88.83 55.10 L 91.47 65.95 L 90.24 72.16 L 86.42 75.55 L 85.55 87.96 L 80.10 105.04 L 73.28 125.23 L 64.74 152.99 L 59.43 173.36 L 53.18 190.35 L 41.93 193.82 L 29.86 200.00 L 21.89 196.26 L 10.91 191.02 L 7.10 183.29 L 6.19 170.30 L 1.32 158.62 L 0.06 148.07 L 2.54 137.51 L 8.91 134.97 L 8.94 130.10 L 15.55 118.99 L 16.80 109.66 L 13.59 102.72 L 10.97 93.49 L 9.86 79.99 L 14.69 71.79 L 16.55 62.50 L 23.44 61.96 L 31.16 58.96 L 36.28 56.30 L 42.35 56.10 L 50.23 47.76 L 61.62 38.74 L 65.77 31.37 L 63.89 25.11 L 69.76 26.87 L 77.39 16.69 L 77.64 7.88 L 82.22 1.33 L 87.05 7.62 Z';

const TYPE_SPEED = 48;
const ERASE_SPEED = 24;
const HOLD_MS = 2600;
const SWITCH_PAUSE = 420;

function useTypewriter(phrases: Phrase[]) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [pos, setPos] = useState(0);
  const [mode, setMode] = useState<'typing' | 'erasing'>('typing');

  const phrase = phrases[phraseIdx];
  const fullText = `${phrase.line1}\n${phrase.line2}`;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    if (mode === 'typing') {
      if (pos < fullText.length) {
        const nextChar = fullText[pos];
        const isPunct = nextChar === ',' || nextChar === '.';
        const isNewline = nextChar === '\n';
        const isSpace = nextChar === ' ';
        const jitter = Math.random() * 24 - 10;
        const delay = isPunct
          ? 240
          : isNewline
            ? 200
            : isSpace
              ? 30
              : Math.max(18, TYPE_SPEED + jitter);
        timeoutId = setTimeout(() => {
          if (!cancelled) setPos((p) => p + 1);
        }, delay);
      } else {
        timeoutId = setTimeout(() => {
          if (!cancelled) setMode('erasing');
        }, HOLD_MS);
      }
    } else {
      if (pos > 0) {
        timeoutId = setTimeout(() => {
          if (!cancelled) setPos((p) => p - 1);
        }, ERASE_SPEED);
      } else {
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setMode('typing');
          setPhraseIdx((i) => (i + 1) % phrases.length);
        }, SWITCH_PAUSE);
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [pos, mode, fullText, phrases.length]);

  const typed = fullText.slice(0, pos);
  const newlineIdx = typed.indexOf('\n');
  const line1 = newlineIdx === -1 ? typed : typed.slice(0, newlineIdx);
  const line2 = newlineIdx === -1 ? '' : typed.slice(newlineIdx + 1);
  const activeLine: 1 | 2 = pos <= phrase.line1.length ? 1 : 2;

  return { line1, line2, activeLine };
}

function useScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return progress;
}

export function PublicLanding() {
  const { user } = useAuth();
  const { line1, line2, activeLine } = useTypewriter(PHRASES);
  const progress = useScrollProgress();
  useScrollReveal();

  return (
    <div className="landing-page">
      <div className="landing-bg" aria-hidden="true">
        <div className="landing-orb orb-a" />
        <div className="landing-orb orb-b" />
        <div className="landing-orb orb-c" />
        <div className="landing-orb orb-d" />
        <div className="landing-grid" />
      </div>

      <div className="landing-progress" style={{ width: `${progress}%` }} aria-hidden="true" />

      <div className="landing-gov-bar">
        <span className="landing-gov-flag" aria-hidden="true" />
        <div className="landing-gov-text">
          <strong>République de Madagascar</strong>
          <span>Ministère des Travaux Publics</span>
        </div>
        <span className="landing-gov-tag">SGRI · Plateforme Anamboatra</span>
      </div>

      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-mark" aria-hidden="true">
            <span className="landing-mark-flag" />
            <span className="landing-mark-pin" />
          </span>
          <span className="landing-brand-text">
            <strong>Anamboatra</strong>
            <small>Système de Gestion et Réponse aux Incidents</small>
          </span>
        </Link>
        <nav className="landing-nav-links">
          <a href="#constat" className="landing-nav-link">
            Le constat
          </a>
          <a href="#promesse" className="landing-nav-link">
            Notre promesse
          </a>
          <a href="#cycle" className="landing-nav-link">
            Cycle de vie
          </a>
          <a href="#missions" className="landing-nav-link">
            Engagements
          </a>
          {user ? (
            <Link to="/app" className="landing-cta-mini">
              Espace connecté
            </Link>
          ) : (
            <Link to="/connexion" className="landing-cta-mini">
              Connexion travailleurs
            </Link>
          )}
        </nav>
      </header>

      <main className="landing-main">
        {/* HERO */}
        <section className="landing-hero">
          <div className="landing-hero-text">
            <span className="landing-chip" data-reveal>
              <span className="landing-chip-dot" />
              Service public · Anamboatra 2035
            </span>
            <h1 className="landing-title" aria-label={`${PHRASES[0].line1} ${PHRASES[0].line2}`}>
              <span className="line line-1">
                {line1}
                {activeLine === 1 ? <span className="caret" aria-hidden="true" /> : null}
              </span>
              <span className="line line-2 grad">
                {line2 || '\u00A0'}
                {activeLine === 2 ? <span className="caret caret-grad" aria-hidden="true" /> : null}
              </span>
            </h1>
            <p className="landing-sub" data-reveal data-reveal-delay="100">
              La plateforme cartographique officielle qui orchestre signalements citoyens,
              agents de patrouille et équipes d'intervention en temps réel — du quartier au
              ministère, sur une seule carte vivante.
            </p>
            <div className="landing-cta-row" data-reveal data-reveal-delay="200">
              <Link to="/travaux" className="landing-cta-primary">
                Regarder les travaux en cours
                <span className="arrow">→</span>
              </Link>
              {user ? (
                <Link to="/app" className="landing-cta-ghost">
                  Ouvrir mon espace
                </Link>
              ) : (
                <Link to="/connexion" className="landing-cta-ghost">
                  Connexion travailleurs
                </Link>
              )}
            </div>
            <div className="landing-meta" data-reveal data-reveal-delay="300">
              <div>
                <strong>24/7</strong>
                <span>supervision continue</span>
              </div>
              <div>
                <strong>4</strong>
                <span>spécialités d'intervention</span>
              </div>
              <div>
                <strong>0</strong>
                <span>signalement perdu</span>
              </div>
            </div>
            <a href="#constat" className="landing-scroll-cue" aria-label="Descendre">
              <span />
            </a>
          </div>

          <aside className="landing-hero-preview" data-reveal data-reveal-delay="200" aria-hidden="true">
            <div className="landing-mapPreview">
              <div className="landing-mapPreview-grid" />
              <div className="landing-mapPreview-scan" />
              <div className="landing-mapPreview-mada">
                <svg viewBox="-6 -6 112 212" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="madaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(0, 126, 58, 0.34)" />
                      <stop offset="100%" stopColor="rgba(11, 61, 145, 0.24)" />
                    </linearGradient>
                  </defs>
                  <path
                    d={MADAGASCAR_PATH}
                    fill="url(#madaGradient)"
                    stroke="#0b3d91"
                    strokeWidth="0.7"
                    strokeLinejoin="round"
                  />
                  {MAP_PREVIEW_PINS.map((pin) => (
                    <g key={pin.name} transform={`translate(${pin.x} ${pin.y})`}>
                      <circle
                        className="landing-mapPin-radarSvg"
                        r="3"
                        fill={pin.color}
                        style={{ animationDelay: `${pin.delay}s` } as React.CSSProperties}
                      />
                      <circle r="1.8" fill={pin.color} stroke="#ffffff" strokeWidth="0.7" />
                      <title>{pin.name}</title>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="landing-mapPreview-badge">
                <span className="landing-mapPreview-live" />
                Anamboatra Maps · LIVE
              </div>
            </div>
          </aside>
        </section>

        {/* SECTION : LE CONSTAT */}
        <section className="landing-section" id="constat">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Le constat</span>
            <h2>Trois fractures qui freinent la maintenance publique.</h2>
            <p className="landing-section-lead">
              Avant Anamboatra, signaler une anomalie d'infrastructure relevait souvent de
              l'acte de foi. Le Ministère reconnaît trois obstacles structurels qu'il s'engage
              aujourd'hui à lever.
            </p>
          </header>
          <div className="landing-cards-3">
            <article className="landing-card" data-reveal data-reveal-delay="100">
              <span className="landing-card-num">01</span>
              <h3>Latence administrative</h3>
              <p>
                Un nid-de-poule signalé pouvait attendre des semaines avant qu'une équipe ne
                se déplace, faute d'information centralisée. La preuve visuelle se perdait
                entre les bureaux.
              </p>
            </article>
            <article className="landing-card" data-reveal data-reveal-delay="200">
              <span className="landing-card-num">02</span>
              <h3>Fragmentation territoriale</h3>
              <p>
                Arrondissements, routes nationales, services techniques — chaque entité
                travaillait en silo. Personne ne voyait la ville dans son ensemble, encore
                moins en temps réel.
              </p>
            </article>
            <article className="landing-card" data-reveal data-reveal-delay="300">
              <span className="landing-card-num">03</span>
              <h3>Silence après signalement</h3>
              <p>
                Le citoyen signalait, puis n'entendait plus parler de rien. Sans retour,
                sans visibilité sur les travaux en cours, la confiance dans le service
                public s'érodait silencieusement.
              </p>
            </article>
          </div>
        </section>

        {/* SECTION : NOTRE PROMESSE */}
        <section className="landing-section landing-section-quote" id="promesse">
          <div className="landing-quote-watermark" aria-hidden="true">
            <svg viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">
              <path d={MADAGASCAR_PATH} />
            </svg>
          </div>
          <div className="landing-quote-block" data-reveal>
            <span className="landing-quote-mark" aria-hidden="true">
              «
            </span>
            <p className="landing-quote-text">
              L'État s'engage à transformer chaque anomalie en donnée, chaque donnée en
              intervention coordonnée, et chaque intervention en preuve publique vérifiable.
            </p>
            <p className="landing-quote-author">
              <strong>Ministère des Travaux Publics</strong>
              <span>Doctrine Anamboatra 2035 — Gouvernance par la donnée</span>
            </p>
          </div>
          <p className="landing-section-lead landing-quote-lead" data-reveal data-reveal-delay="200">
            Anamboatra n'est pas une application de plus. C'est l'infrastructure numérique
            commune à tous les acteurs de la maintenance publique malgache : citoyens,
            agents de patrouille, équipes d'intervention spécialisées et administrateurs de
            quartier général.
          </p>
        </section>

        {/* SECTION : ANAMBOATRA PARLE VOTRE LANGUE */}
        <section className="landing-section landing-section-mada" id="culture">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Anamboatra parle votre langue</span>
            <h2>
              <span className="landing-mg-title">Tsy mba mahay miaina irery ny olona.</span>
              <span className="landing-mg-trans">« Personne ne vit seul. »</span>
            </h2>
            <p className="landing-section-lead">
              Un service public ne s'impose pas. Il se construit avec ceux qu'il sert.
              Anamboatra repose sur trois valeurs malgaches qui guident chaque ligne de code,
              chaque décision du QG, chaque intervention sur le terrain.
            </p>
          </header>
          <div className="landing-cards-3">
            <article className="landing-madaCard" data-reveal data-reveal-delay="100">
              <span className="landing-madaCard-stripe" aria-hidden="true" />
              <h3>Fihavanana</h3>
              <p className="landing-madaCard-fr">Le lien</p>
              <p>
                L'esprit de cohésion qui relie l'agent au citoyen, le QG au quartier, la
                capitale aux régions. Anamboatra rend visible ce lien.
              </p>
            </article>
            <article className="landing-madaCard" data-reveal data-reveal-delay="200">
              <span className="landing-madaCard-stripe" aria-hidden="true" />
              <h3>Fanjakana</h3>
              <p className="landing-madaCard-fr">L'État qui agit</p>
              <p>
                L'État rend des comptes par la donnée, par la preuve, par la transparence.
                Chaque ticket est une promesse tenue ou tracée publiquement.
              </p>
            </article>
            <article className="landing-madaCard" data-reveal data-reveal-delay="300">
              <span className="landing-madaCard-stripe" aria-hidden="true" />
              <h3>Tanindrazana</h3>
              <p className="landing-madaCard-fr">Notre patrimoine</p>
              <p>
                Routes, lumières, eau — tout ce qui fait tenir le pays. Prendre soin de
                l'infrastructure, c'est prendre soin de Madagascar.
              </p>
            </article>
          </div>

          <div className="landing-marquee" aria-hidden="true" data-reveal data-reveal-delay="400">
            <div className="landing-marquee-track">
              {[...CITIES, ...CITIES].map((city, idx) => (
                <span key={`${city.name}-${idx}`} className={`landing-marquee-item pin-${city.color}`}>
                  <span className="landing-marquee-pin" />
                  <strong>{city.name}</strong>
                  <small>{city.tag}</small>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION : UNE CARTE, QUATRE REGARDS */}
        <section className="landing-section" id="anamboatra-maps">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Anamboatra Maps</span>
            <h2>Une seule carte. Quatre regards. Aucune zone d'ombre.</h2>
            <p className="landing-section-lead">
              Au cœur du dispositif, une carte unifiée de type Google Maps, partagée par
              tous les acteurs. Chaque rôle voit la même géographie, mais une couche
              d'information adaptée à sa mission.
            </p>
          </header>
          <div className="landing-cards-4">
            <article className="landing-roleCard role-citoyen" data-reveal data-reveal-delay="100">
              <header>
                <span className="landing-roleDot" />
                <h3>Citoyen</h3>
              </header>
              <p>
                Voit les travaux confirmés et terminés près de chez lui. Peut suggérer une
                anomalie en 30 secondes, sans créer de compte.
              </p>
            </article>
            <article className="landing-roleCard role-agent" data-reveal data-reveal-delay="200">
              <header>
                <span className="landing-roleDot" />
                <h3>Agent de patrouille</h3>
              </header>
              <p>
                Signale les anomalies de sa zone avec photo géolocalisée vérifiée.
                Consulte les suggestions citoyennes pour prioriser ses tournées.
              </p>
            </article>
            <article className="landing-roleCard role-equipe" data-reveal data-reveal-delay="300">
              <header>
                <span className="landing-roleDot" />
                <h3>Équipe d'intervention</h3>
              </header>
              <p>
                Reçoit ses missions sur la carte, navigue jusqu'au site avec le GPS
                intégré, et clôture chaque chantier par une photo de preuve.
              </p>
            </article>
            <article className="landing-roleCard role-qg" data-reveal data-reveal-delay="400">
              <header>
                <span className="landing-roleDot" />
                <h3>Administrateur QG</h3>
              </header>
              <p>
                Confirme les signalements, assigne la bonne spécialité, gère ses agents et
                pilote l'ensemble du Kanban depuis une interface plein écran.
              </p>
            </article>
          </div>
        </section>

        {/* SECTION : CYCLE DE VIE */}
        <section className="landing-section landing-section-cycle" id="cycle">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Cycle de vie d'un ticket</span>
            <h2>Du signalement à la preuve publique, en cinq étapes.</h2>
            <p className="landing-section-lead">
              Chaque ticket suit un cycle strict, journalisé pour l'audit. Les couleurs
              changent en moins de 2 secondes pour tous les utilisateurs connectés, via
              WebSocket.
            </p>
          </header>
          <ol className="landing-cycle">
            <li className="landing-cycle-step step-1 has-radar" data-reveal data-reveal-delay="100">
              <span className="landing-cycle-dot" />
              <span className="landing-cycle-label">Étape 1</span>
              <h4>En attente de confirmation</h4>
              <p>L'agent de patrouille soumet une anomalie avec photo et GPS.</p>
            </li>
            <li className="landing-cycle-step step-2" data-reveal data-reveal-delay="200">
              <span className="landing-cycle-dot" />
              <span className="landing-cycle-label">Étape 2</span>
              <h4>Réparation prévue</h4>
              <p>Le QG confirme, choisit la spécialité et assigne une équipe.</p>
            </li>
            <li className="landing-cycle-step step-3" data-reveal data-reveal-delay="300">
              <span className="landing-cycle-dot" />
              <span className="landing-cycle-label">Étape 3</span>
              <h4>En réparation</h4>
              <p>L'équipe arrive sur site, démarre l'intervention, position visible.</p>
            </li>
            <li className="landing-cycle-step step-4" data-reveal data-reveal-delay="400">
              <span className="landing-cycle-dot" />
              <span className="landing-cycle-label">Étape 4</span>
              <h4>Terminé</h4>
              <p>Photo de clôture obligatoire, mise à jour publique immédiate.</p>
            </li>
            <li className="landing-cycle-step step-5" data-reveal data-reveal-delay="500">
              <span className="landing-cycle-dot" />
              <span className="landing-cycle-label">Étape 5</span>
              <h4>Clôturé</h4>
              <p>Archivé pour audit, traçabilité absolue conservée.</p>
            </li>
          </ol>
        </section>

        {/* SECTION : MÉCANISMES DE CONFIANCE */}
        <section className="landing-section" id="confiance">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Confiance citoyenne</span>
            <h2>Trois verrous techniques pour garantir la parole publique.</h2>
            <p className="landing-section-lead">
              Une carte qui dit la vérité ne peut être ni truquée, ni dupliquée, ni
              oubliée. Trois mécanismes inscrits dans le code en font foi.
            </p>
          </header>
          <div className="landing-cards-3">
            <article className="landing-trustCard" data-reveal data-reveal-delay="100">
              <div className="landing-trustIcon">⚙</div>
              <h3>Vérification EXIF</h3>
              <p>
                Chaque photo de signalement est analysée pour vérifier sa géolocalisation
                d'origine. Aucune image rejouée ne peut entrer dans le système.
              </p>
            </article>
            <article className="landing-trustCard" data-reveal data-reveal-delay="200">
              <div className="landing-trustIcon">⛨</div>
              <h3>Accès gouverné par le rôle</h3>
              <p>
                Super-administrateur, QG, agent de patrouille, équipe
                d'intervention ou citoyen : chaque action est filtrée par le
                rôle, et chaque ticket reste cantonné à sa commune.
              </p>
            </article>
            <article className="landing-trustCard" data-reveal data-reveal-delay="300">
              <div className="landing-trustIcon">▤</div>
              <h3>Journal d'audit immuable</h3>
              <p>
                Chaque transition de statut est horodatée et conservée. La traçabilité
                complète d'un chantier reste accessible, des années après sa clôture.
              </p>
            </article>
          </div>
        </section>

        {/* SECTION : ENGAGEMENTS CHIFFRÉS */}
        <section className="landing-section landing-section-pledges" id="missions">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Engagements chiffrés</span>
            <h2>Notre service public, mesuré au cordeau.</h2>
            <p className="landing-section-lead">
              Le Ministère s'engage publiquement sur des indicateurs vérifiables. Ils sont
              inscrits dans le contrat de service Anamboatra.
            </p>
          </header>
          <div className="landing-pledges">
            <article className="landing-pledge" data-reveal data-reveal-delay="100">
              <strong>&lt; 2 s</strong>
              <span>propagation d'un changement de statut sur la carte de tous les utilisateurs</span>
            </article>
            <article className="landing-pledge" data-reveal data-reveal-delay="200">
              <strong>100 %</strong>
              <span>des tickets auditables avec photo, horodatage et géolocalisation</span>
            </article>
            <article className="landing-pledge" data-reveal data-reveal-delay="300">
              <strong>0</strong>
              <span>signalement citoyen perdu, fusion automatique avec les tickets existants</span>
            </article>
            <article className="landing-pledge" data-reveal data-reveal-delay="400">
              <strong>24/7</strong>
              <span>supervision active, équipes d'astreinte mobilisables en continu</span>
            </article>
          </div>
        </section>

        {/* SECTION : POUR LE CITOYEN */}
        <section className="landing-section" id="citoyen">
          <header className="landing-section-head" data-reveal>
            <span className="landing-section-eyebrow">Pour vous, citoyen</span>
            <h2>Trois gestes pour participer à la ville.</h2>
            <p className="landing-section-lead">
              Vous n'avez besoin de rien : pas de compte, pas de téléchargement, pas de
              démarche. Juste votre regard sur votre quartier.
            </p>
          </header>
          <div className="landing-steps">
            <article className="landing-step" data-reveal data-reveal-delay="100">
              <span className="landing-stepNum">1</span>
              <h3>Ouvrez la carte publique</h3>
              <p>Aucun compte requis. La carte officielle des travaux est accessible à tous, immédiatement.</p>
            </article>
            <article className="landing-step" data-reveal data-reveal-delay="200">
              <span className="landing-stepNum">2</span>
              <h3>Voyez ce qui se passe près de chez vous</h3>
              <p>Marqueurs orange, bleus et verts : chaque couleur dit où en est la réparation, en direct.</p>
            </article>
            <article className="landing-step" data-reveal data-reveal-delay="300">
              <span className="landing-stepNum">3</span>
              <h3>Suggérez une anomalie</h3>
              <p>Un point sur la carte, une description, c'est envoyé. Votre signalement nourrit l'action publique.</p>
            </article>
          </div>
        </section>

        {/* BANDE CTA FINALE */}
        <section className="landing-band" data-reveal>
          <h2>Voir la ville en mouvement.</h2>
          <p className="landing-band-sub">
            Aucun compte requis pour consulter la carte publique des travaux confirmés.
          </p>
          <Link to="/travaux" className="landing-cta-primary">
            Ouvrir la carte publique
            <span className="arrow">→</span>
          </Link>
        </section>

        {/* FOOTER */}
        <footer className="landing-foot" id="partenaires">
          <div className="landing-foot-col">
            <strong>Ministère des Travaux Publics</strong>
            <span>République de Madagascar — Anamboatra 2035</span>
          </div>
          <div className="landing-foot-col">
            <span>Plateforme SGRI</span>
            <span>Système de Gestion et Réponse aux Incidents</span>
          </div>
          <div className="landing-foot-col">
            <span>© 2026 — Tous droits réservés</span>
            <span>Service public numérique</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
