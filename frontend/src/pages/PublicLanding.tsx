import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const MADAGASCAR_PATH =
  'M 87.05 7.62 L 90.72 13.85 L 94.14 23.53 L 96.37 41.16 L 99.95 48.01 L 98.58 55.04 L 96.13 59.34 L 91.43 50.76 L 88.83 55.10 L 91.47 65.95 L 90.24 72.16 L 86.42 75.55 L 85.55 87.96 L 80.10 105.04 L 73.28 125.23 L 64.74 152.99 L 59.43 173.36 L 53.18 190.35 L 41.93 193.82 L 29.86 200.00 L 21.89 196.26 L 10.91 191.02 L 7.10 183.29 L 6.19 170.30 L 1.32 158.62 L 0.06 148.07 L 2.54 137.51 L 8.91 134.97 L 8.94 130.10 L 15.55 118.99 L 16.80 109.66 L 13.59 102.72 L 10.97 93.49 L 9.86 79.99 L 14.69 71.79 L 16.55 62.50 L 23.44 61.96 L 31.16 58.96 L 36.28 56.30 L 42.35 56.10 L 50.23 47.76 L 61.62 38.74 L 65.77 31.37 L 63.89 25.11 L 69.76 26.87 L 77.39 16.69 L 77.64 7.88 L 82.22 1.33 L 87.05 7.62 Z';

/** ID YouTube de référence (poster + iframe de secours si le MP4 local indisponible). */
const HERO_REFERENCE_YOUTUBE_ID = '1roGkBs8NbA';

/** Fichier servi depuis `frontend/public/` (non versionné dans git par défaut). */
const LOCAL_HERO_MP4 = 'videos/tana-hero-1080p.mp4';

/**
 * Villes capitales régionales — coordonnées user space du viewBox SVG (alignées au `MADAGASCAR_PATH`,
 * axe N→S comme sur une carte géographique réelle).
 */
const MAP_PINS = [
  /* NE presqu’île ; x plus bas qu’extrême pointe vide */
  { name: 'Antsiranana', x: 86, y: 11, color: '#c8102e', delay: 200 },
  /* Golfe de Mojanga : même bande latérale que L 31–42 / y≈56–59 du path (évite l’« océan » à gauche) */
  { name: 'Mahajanga', x: 38, y: 56, color: '#16a34a', delay: 400 },
  { name: 'Toamasina', x: 80, y: 83, color: '#1a73e8', delay: 600 },
  { name: 'Antananarivo', x: 51, y: 101, color: '#1a73e8', delay: 800 },
  { name: 'Antsirabe', x: 45, y: 110, color: '#16a34a', delay: 1000 },
  { name: 'Fianarantsoa', x: 55, y: 138, color: '#c8102e', delay: 1200 },
  { name: 'Toliara', x: 34, y: 172, color: '#16a34a', delay: 1400 },
];

const SCREENS = [
  { id: 'manifesto', label: 'Présentation du dispositif', navLabel: 'Présentation' },
  { id: 'carte', label: 'Référentiel cartographique', navLabel: 'Carte' },
  { id: 'roles', label: 'Acteurs et périmètres', navLabel: 'Acteurs' },
  { id: 'agir', label: 'Consultation et signalement officiel', navLabel: 'Accès' },
] as const;

type ScreenId = (typeof SCREENS)[number]['id'];

const SCREEN_ORDER: ScreenId[] = SCREENS.map((s) => s.id);

function usePrefersReducedMotion(): boolean {
  const [pref, setPref] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPref(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return pref;
}

/**
 * Associe une section dominante selon ce qui coupe le mieux la ligne médiane du
 * conteneur (plus stable que plusieurs seuils avec l’observer), met à jour
 * `is-active` pour rejouer les animations, et expose `active` / `goTo`.
 */
function useStoryScreen(scrollerRef: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<ScreenId>('manifesto');

  const goTo = useCallback((id: ScreenId) => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-screen="${id}"]`);
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [scrollerRef]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-screen]'));
    if (sections.length === 0) return;

    let raf = 0;
    const tick = () => {
      const rc = root.getBoundingClientRect();
      const midY = rc.top + rc.height / 2;
      let best: ScreenId | null = null;
      let bestScore = -Infinity;
      for (const el of sections) {
        const r = el.getBoundingClientRect();
        const overlap = Math.min(r.bottom, rc.bottom) - Math.max(r.top, rc.top);
        if (overlap <= 8) continue;
        const overlapRatio =
          overlap / Math.min(Math.max(r.height, 1), Math.max(rc.height, 1));
        const centerDist = Math.abs(r.top + r.height / 2 - midY);
        const score = overlapRatio * 180 - centerDist * 0.35;
        if (score > bestScore) {
          bestScore = score;
          best = el.dataset.screen as ScreenId;
        }
      }
      if (best) {
        sections.forEach((el) => {
          el.classList.toggle('is-active', el.dataset.screen === best);
        });
        setActive((p) => (p === best ? p : best!));
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    tick();
    root.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [scrollerRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[contenteditable="true"]')) return;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;

      const i = SCREEN_ORDER.indexOf(active);
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        if (i < SCREEN_ORDER.length - 1) {
          e.preventDefault();
          goTo(SCREEN_ORDER[i + 1]!);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (i > 0) {
          e.preventDefault();
          goTo(SCREEN_ORDER[i - 1]!);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo('manifesto');
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo('agir');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, goTo]);

  return { active, goTo };
}

function StoryMadagascarMapCard({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const applyTilt = useCallback((nx: number, ny: number) => {
    const p = parallaxRef.current;
    if (!p) return;
    const maxDeg = 6.5;
    const maxMove = 6;
    const rx = -ny * maxDeg;
    const ry = nx * maxDeg;
    const tx = nx * maxMove;
    const ty = ny * maxMove;
    p.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.018, 1.018, 1)`;
  }, []);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const root = rootRef.current;
      const p = parallaxRef.current;
      if (!root || !p) return;
      p.style.transition = 'none';
      root.classList.add('story-mapcard--hover');
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
        const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
        applyTilt(nx, ny);
      });
    },
    [applyTilt, reducedMotion],
  );

  const onLeave = useCallback(() => {
    const root = rootRef.current;
    const p = parallaxRef.current;
    root?.classList.remove('story-mapcard--hover');
    if (!p) return;
    p.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
    p.style.transform = 'translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={rootRef}
      className="story-mapcard"
      onMouseMove={reducedMotion ? undefined : onMove}
      onMouseLeave={reducedMotion ? undefined : onLeave}
    >
      <div ref={parallaxRef} className="story-mapcard-parallax">
        <div className="story-mapcard-grid" />
        <div className="story-mapcard-scan" />
        <div className="story-mapcard-badge">
          <span className="story-mapcard-live" aria-hidden />
          Référentiel MTP · mise à jour des statuts selon circuits habilités
        </div>
        <svg
          className="story-mapcard-svg"
          viewBox="-6 -8 112 218"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="storyMadaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(0, 126, 58, 0.45)" />
              <stop offset="100%" stopColor="rgba(11, 61, 145, 0.32)" />
            </linearGradient>
          </defs>
          <path
            d={MADAGASCAR_PATH}
            fill="url(#storyMadaGrad)"
            stroke="#0b3d91"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          {MAP_PINS.map((pin) => (
            <g key={pin.name} transform={`translate(${pin.x} ${pin.y})`}>
              <g
                className="story-pin-anim"
                style={{ animationDelay: `${pin.delay}ms` } as React.CSSProperties}
              >
                <circle className="story-pin-radar" r="2.4" fill={pin.color} />
                <circle r="1.65" fill={pin.color} stroke="#fff" strokeWidth="0.65" />
                <title>{pin.name}</title>
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function PublicLanding() {
  const scrollerRef = useRef<HTMLElement>(null);
  const { active, goTo } = useStoryScreen(scrollerRef);
  const prefersReducedMotion = usePrefersReducedMotion();
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const [heroStreamFallback, setHeroStreamFallback] = useState(false);

  const stepIndex = SCREEN_ORDER.indexOf(active);
  const liveLabel =
    stepIndex >= 0
      ? `Écran ${stepIndex + 1} sur ${SCREENS.length} · ${SCREENS[stepIndex]!.label}`
      : '';

  const youtubeIdResolved = useMemo(() => {
    const v = import.meta.env.VITE_ANTANANARIVO_VIDEO_ID?.trim();
    if (v && /^[a-zA-Z0-9_-]{8,14}$/.test(v)) return v;
    return HERO_REFERENCE_YOUTUBE_ID;
  }, []);

  const heroPosterUrl = useMemo(
    () => `https://i.ytimg.com/vi/${youtubeIdResolved}/maxresdefault.jpg`,
    [youtubeIdResolved],
  );
  const heroYoutubeEmbedSrc = useMemo(
    () =>
      `https://www.youtube-nocookie.com/embed/${youtubeIdResolved}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1` +
      `&playlist=${youtubeIdResolved}&rel=0&modestbranding=1&disablekb=1`,
    [youtubeIdResolved],
  );

  const heroResolvedMp4Src = useMemo(() => {
    const custom = import.meta.env.VITE_HERO_VIDEO_SRC?.trim();
    const root = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}`;
    if (custom) {
      if (/^https?:\/\//i.test(custom)) return custom;
      return `${root}${custom.replace(/^\//, '')}`;
    }
    return `${root}${LOCAL_HERO_MP4}`;
  }, []);

  useEffect(() => {
    const v = heroVideoRef.current;
    if (!v || prefersReducedMotion || heroStreamFallback) return;
    void v.play().catch(() => setHeroStreamFallback(true));
  }, [prefersReducedMotion, heroStreamFallback]);

  return (
    <div className="story-page" data-story-active={active}>
      {/* Marque + nav flottante */}

      <span className="story-sr-only" aria-live="polite">
        {liveLabel}
      </span>

      {/* Indicateur latéral 4 points */}
      <aside className="story-dots" aria-label="Sommaire des sections">
        {SCREENS.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            className={`story-dot${active === s.id ? ' is-on' : ''}${stepIndex > idx ? ' is-past' : ''}`}
            aria-label={`${s.label} — étape ${idx + 1} sur ${SCREENS.length}`}
            aria-current={active === s.id ? 'step' : undefined}
            onClick={() => goTo(s.id)}
          >
            <span className="story-dot-chip" aria-hidden="true">
              <span className="story-dot-inner">
                <span className="story-dot-num">{idx + 1}</span>
              </span>
            </span>
            <span className="story-dot-label">{s.navLabel}</span>
          </button>
        ))}
      </aside>

      {/* Vidéo plein viewport : net sur l’écran 1, floutée + teintée sur les suivants */}
      <div className="story-global-video" aria-hidden="true">
        <div className="story-manifesto-video-inner story-global-video-inner">
          <div className="story-manifesto-poster" style={{ backgroundImage: `url(${heroPosterUrl})` }} />
          {!prefersReducedMotion && !heroStreamFallback ? (
            <video
              ref={heroVideoRef}
              className="story-manifesto-file-video"
              src={heroResolvedMp4Src}
              poster={heroPosterUrl}
              muted
              loop
              playsInline
              preload="metadata"
              onError={() => setHeroStreamFallback(true)}
            />
          ) : null}
          {!prefersReducedMotion && heroStreamFallback ? (
            <iframe
              className="story-manifesto-iframe"
              src={heroYoutubeEmbedSrc}
              title="Aperçu Antananarivo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen={false}
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null}
        </div>
      </div>

      <main className="story-scroller" ref={scrollerRef}>
        {/* Écran 1 — Manifeste plein écran */}
        <section className="story-screen story-screen--manifesto" data-screen="manifesto">
          <div className="story-screen-content story-manifesto">
            <p className="story-manifesto-intro" data-anim="fade-up" data-delay="50">
              <span lang="mg">Ministere du travaux public · Anamboatra </span>
              <br />
              <span className="story-manifesto-subfr" lang="fr">
                Projet Transversal L2 SIO Maharavo
              </span>
            </p>
            <h1 className="story-h1" data-anim="fade-up" data-delay="100">
              <span className="story-h1-line">Signalement, instruction et mise à jour des statuts</span>
              <span className="story-h1-line story-h1-grad story-gradient-flow">
                Une cartographie nationale tenue sous responsabilité du MTP
              </span>
            </h1>
            <div className="story-cta-row" data-anim="fade-up" data-delay="400">
              <Link to="/travaux" className="story-cta-primary">
                Consultation cartographique
                <span className="story-cta-arrow">→</span>
              </Link>
            </div>
            <button
              type="button"
              className="story-scroll-hint"
              aria-label={`Section suivante : ${SCREENS[1]!.label}`}
              onClick={() => goTo('carte')}
              data-anim="fade-up"
              data-delay="600"
            >
              Section suivante
              <span className="story-scroll-cue" aria-hidden="true">
                <span />
              </span>
            </button>
          </div>
        </section>

        {/* Écran 2 — La carte vivante */}
        <section className="story-screen story-screen--carte" data-screen="carte">
          <div className="story-screen-tint story-screen-tint--carte" aria-hidden="true" />
          <div className="story-screen-bg" aria-hidden="true">
            <span className="story-grid story-grid--bright" />
          </div>
          <div className="story-screen-content story-carte">
            <div className="story-carte-text story-panel story-panel--carte">
              <h2 className="story-h2" data-anim="fade-up" data-delay="120">
                Une vue nationale des territoires et des axes suivis&nbsp;<br />
                <span className="story-h2-grad">Instruction et publication selon périmètres MTP</span>
              </h2>
              <p className="story-lede story-lede--compact" data-anim="fade-up" data-delay="240">
                Les géométries et statuts figurant sur cette carte résultent de saisies et validations effectuées
                par les acteurs désignés. La consultation reproduit ces données institutionnelles, pas des sources tiers.
              </p>
              <ul className="story-stats" data-anim="fade-up" data-delay="360">
                <li>
                  <strong>Réseau</strong>
                  <span>diffusion des mises à jour de statut entre postes MTP, QG et applications terrain autorisées</span>
                </li>
                <li>
                  <strong>Géolocalisation</strong>
                  <span>chaque dossier actif rattache coordonnées et zone administrative</span>
                </li>
                <li>
                  <strong>Habilitation</strong>
                  <span>référentiel conservé hors procédés parallèles sans mandat MTP</span>
                </li>
              </ul>
            </div>
            <div className="story-carte-visual" data-anim="zoom-in" data-delay="180" aria-hidden="true">
              <StoryMadagascarMapCard reducedMotion={prefersReducedMotion} />
            </div>
          </div>
        </section>

        {/* Écran 3 — Quatre regards */}
        <section className="story-screen story-screen--roles" data-screen="roles">
          <div className="story-screen-tint story-screen-tint--roles" aria-hidden="true" />
          <div className="story-screen-bg" aria-hidden="true">
            <span className="story-orb story-orb-d" />
            <span className="story-orb story-orb-e" />
          </div>
          <div className="story-screen-content story-roles">
            <div className="story-roles-intro story-panel story-panel--roles">
              <header className="story-roles-head">
                <h2 className="story-h2 story-h2--center" data-anim="fade-up" data-delay="120">
                  Répartition fonctionnelle des statuts&nbsp;<br />
                  <span className="story-h2-grad">du signalement jusqu’à la clôture</span>
                </h2>
              </header>
            </div>
            <div className="story-roles-grid">
              <article className="story-role role-citoyen" data-anim="slide-up" data-delay="100">
                <span className="story-role-num">01</span>
                <h3>Grand public · consultation</h3>
                <p>
                  Consultation conforme aux éléments mis à disposition par le MTP. Une observation peut être transmise
                  depuis la carte publique ; après saisie, le dossier est instruit uniquement dans les circuits
                  patrouille et QG. Aucune opération carte ne se substitue à une décision publiée officiellement.
                </p>
              </article>
              <article className="story-role role-agent" data-anim="slide-up" data-delay="220">
                <span className="story-role-num">02</span>
                <h3>Patrouille · terrain</h3>
                <p>
                  Qualification géolocalisée des dossiers du périmètre assigné&nbsp;: comptes rendus, pièces photo
                  horodatées et synchronisation sur le référentiel partagé avec le QG.
                </p>
              </article>
              <article className="story-role role-equipe" data-anim="slide-up" data-delay="340">
                <span className="story-role-num">03</span>
                <h3>Intervention · exécution</h3>
                <p>
                  Exécution des missions planifiées, documentation des chantiers terminés ou reportés ; les statuts
                  affichés reflètent l’état courant communiqué par l’unité désignée.
                </p>
              </article>
              <article className="story-role role-qg" data-anim="slide-up" data-delay="460">
                <span className="story-role-num">04</span>
                <h3>QG · pilotage ministériel</h3>
                <p>
                  Pilotage territorial&nbsp;: rattachements, mesures agrégées et coordination avec les cellules MTP
                  pour faire circuler décisions statutaires jusqu’aux acteurs mobiles.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Écran 4 — Agir */}
        <section className="story-screen story-screen--agir" data-screen="agir">
          <div className="story-screen-tint story-screen-tint--agir" aria-hidden="true" />
          <div className="story-screen-bg" aria-hidden="true">
            <span className="story-orb story-orb-f" />
            <span className="story-orb story-orb-g" />
          </div>
          <div className="story-screen-content story-agir">
            <h2 className="story-h2 story-h2--center story-h2--light" data-anim="fade-up" data-delay="120">
              Consultation et signalement officiels
            </h2>
            <p className="story-lede story-lede--center story-lede--light" data-anim="fade-up" data-delay="240">
              Visitez la carte anamboatra, ou vous pouvez voir toute la carte de Madagascar avec toutes les reparations prevues en toute transparence
            </p>
            <div className="story-cta-row story-cta-row--center" data-anim="fade-up" data-delay="360">
              <Link to="/travaux" className="story-cta-primary story-cta-primary--xl">
                Ouvrir la carte publique officielle
                <span className="story-cta-arrow">→</span>
              </Link>
            </div>
            <footer className="story-foot" data-anim="fade-up" data-delay="500">
              <span>
                <strong>Projet Transversal</strong> - By Maharavo     
              </span>
              <span>Anamboatra</span>
              <span>© 2026 — Repoblikan'i Madagasikara</span>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
