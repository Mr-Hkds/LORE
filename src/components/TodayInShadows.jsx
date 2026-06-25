import { useState, useEffect, useRef } from 'react';
import { Fingerprint, Eye, Skull, HelpCircle, X } from 'lucide-react';
import LoreMark from './LoreMark';

const DAY_THEMES = {
  0: { name: 'Secret Sunday' },
  1: { name: 'Mystery Monday' },
  2: { name: 'Thriller Tuesday' },
  3: { name: 'Wicked Wednesday' },
  4: { name: 'Terror Thursday' },
  5: { name: 'Fatal Friday' },
  6: { name: 'Sinister Saturday' }
};

const STATIC_FALLBACKS = {
  0: {
    title: 'Project MKUltra',
    year: '1953',
    text: '1953 mein CIA ne ek secret mind control project start kiya tha. Bina consent ke logo par LSD, hypnosis aur sensory deprivation test kiye gaye.',
    wikiQuery: 'Project MKUltra',
    theories: [
      { name: 'Mind Control Success', explanation: 'Suno to, kuch logs sochte hain ki CIA ne actually mind control achieve kar liya tha aur aaj bhi secret agents trigger words se activate hote hain.' },
      { name: 'Mass Drug Tests', explanation: 'Yeh theory kehti hai ki MKUltra sirf ek pilot project tha, aur actual chemicals ko local water supply ya public areas mein test kiya gaya tha.' },
      { name: 'Covert Brainwashing', explanation: 'Kaha jata hai ki project band nahi hua, balki use modern digital methods aur sub-audible frequencies mein convert kar diya gaya.' }
    ],
    suspicionLabel: 'Government Coverup Index',
    defaultSuspicion: 92
  },
  1: {
    title: 'Diatlov Pass Incident',
    year: '1959',
    text: '1959 mein Russian Urals mein 9 experienced hikers ajeeb halat mein mare gaye. Unka tent andar se fata tha aur bodies par radiation ke traces mile.',
    wikiQuery: 'Diatlov Pass incident',
    theories: [
      { name: 'Infrasound Hysteria', explanation: 'Mausam ke vajah se wind ne infrasound create kiya, jisne hikers ke dimaag mein panic daal diya aur woh bina kapdo ke baahar bhaag nikle.' },
      { name: 'Soviet Weapons Test', explanation: 'Pass ke paas koi secret military testing chal rahi thi, aur wahan ke radioactive fallout ya kisi shockwave ne unhe maar diya.' },
      { name: 'Indigenous Mansi Attack', explanation: 'Local tribes ne apne sacred mountain ko defend karne ke liye hikers par secretly aisi techniques se war kiya jisse koi external wound na dikhe.' }
    ],
    suspicionLabel: 'Supernatural Odds',
    defaultSuspicion: 85
  },
  2: {
    title: 'Klaus Fuchs Espionage',
    year: '1950',
    text: 'Klaus Fuchs ek German physicist aur atomic spy tha, jisne Manhattan Project ke secrets secretly Soviet Union ko leak kar diye, jiske baad use 9 saal ki saza hui.',
    wikiQuery: 'Klaus Fuchs',
    theories: [
      { name: 'Double Agent Play', explanation: 'Kuch records kehte hain ki Klaus British intelligence ke liye ek double agent tha aur jaanbujhkar misinformation leak kar raha tha.' },
      { name: 'Hidden Microfilm Cache', explanation: 'Uski leak ki gayi microfilms ka ek bada hissa aaj bhi Dresden ke kisi secret underground vault mein chhupa hua hai.' },
      { name: 'Los Alamos Ring', explanation: 'Fuchs akele kaam nahi kar raha tha, balki Los Alamos ke andar ek aur bada spy network tha jise FBI kabhi pakad nahi payi.' }
    ],
    suspicionLabel: 'Espionage Intrigue Level',
    defaultSuspicion: 78
  },
  3: {
    title: 'Tuskegee Syphilis Study',
    year: '1932',
    text: '1932 mein government doctors ne 600 black individuals par bina consent ke clinical trials chalaye aur unhe treatment se door rakha taaki disease ka development track ho sake.',
    wikiQuery: 'Tuskegee Syphilis Study',
    theories: [
      { name: 'Deliberate Infection', explanation: 'Kuch claims kehte hain ki doctors ne participants ko track hi nahi kiya balki unhe intentionally virus se inject kiya tha.' },
      { name: 'Institutional Racism Test', explanation: 'Yeh study healthcare systems mein minority populations ko check karne ke liye ek pre-planned psychological benchmark bani thi.' },
      { name: 'Post-war Coverup', explanation: '1940s mein penicillin standard treatment banne ke baad bhi government ne information ko deliberately suppress kiya taaki experiment continue rahe.' }
    ],
    suspicionLabel: 'Medical Betrayal Index',
    defaultSuspicion: 95
  },
  4: {
    title: 'Salem Witch Trials',
    year: '1692',
    text: '1692 mein Salem Massachusetts mein mass hysteria fail gaya. Aapas mein hi ek doosre par witchcraft ka jhootha arop lagakar kai masoom logo ko execute kar diya gaya.',
    wikiQuery: 'Salem witch trials',
    theories: [
      { name: 'Ergot Poisoning', explanation: 'Rye grain par ek fungus (ergot) grow ho gaya tha, jise khane se logon ko hallucinogenic fits aur seizures pad rahe the, jise unhone witchcraft samajh liya.' },
      { name: 'Property Land Grabbing', explanation: 'Wealthy landowners ne poor families ko witch accuse kiya taaki court unki land seize kar le aur use saste mein auction kiya ja sake.' },
      { name: 'Puritan Mass Delusion', explanation: 'Ek intense religious environment aur native American attacks ke darr se pure community ka mental health collapse ho gaya tha.' }
    ],
    suspicionLabel: 'Mass Hysteria Probability',
    defaultSuspicion: 88
  },
  5: {
    title: 'Sinking of the Titanic',
    year: '1912',
    text: '1912 ki raat ko us waqt ka sabse bada aur secure ship Titanic ek iceberg se takra kar Atlantic Ocean ke freezing paani mein doob gaya, jismein 1500 se zyada log maare gaye.',
    wikiQuery: 'Sinking of the Titanic',
    theories: [
      { name: 'Olympic Insurance Swap', explanation: 'Owner company JP Morgan ne actual Titanic ko uski damaged sister ship Olympic se swap kar diya tha insurance money recover karne ke liye.' },
      { name: 'Deliberate Iceberg Course', explanation: 'Kaha jata hai ki Captain Smith ko ice warnings milne ke baad bhi speed badhane ka order mila tha taaki travel records break ho sakein.' },
      { name: 'Secret Target Assassination', explanation: 'Federal Reserve ke against khade teen sabse bade billionaires (Astor, Guggenheim, Straus) is ship par the aur unhe eliminate karne ke liye ship doobayi gayi.' }
    ],
    suspicionLabel: 'Sinking Conspiracy Index',
    defaultSuspicion: 65
  },
  6: {
    title: 'Isabella Stewart Gardner Heist',
    year: '1990',
    text: '1990 mein do chor police officer bankar Boston ke museum mein ghuse aur 500 million dollars ki paintings chura kar gayab ho gaye. Yeh robbery aaj tak unresolved hai.',
    wikiQuery: 'Isabella Stewart Gardner Museum heist',
    theories: [
      { name: 'Inside Security Job', explanation: 'Museum guard Richard Abath ne doors ko unlock kiya aur motion detectors ke signals bypass karne mein choro ki madad ki.' },
      { name: 'Irish Mob Funding', explanation: 'Churayi gayi paintings Boston ke Irish Mob ke paas gayi aur unhe collateral ke roop mein arms deals aur drug trafficking ke liye use kiya gaya.' },
      { name: 'Hidden European Collector', explanation: 'Yeh theft ek wealthy European private collector ke command par hui thi, jisne paintings ko kisi bunker mein chhipakar rakha hai.' }
    ],
    suspicionLabel: 'Insider Assistance Odds',
    defaultSuspicion: 82
  }
};

// ── Reaction config ───────────────────────────────────────────────────────
const REACTION_CONFIG = [
  {
    id: 'intriguing',
    label: 'Intriguing',
    Icon: Fingerprint,
    activeColor: '#F59E0B',
    activeBg: 'rgba(245,158,11,0.10)',
    activeBorder: 'rgba(245,158,11,0.45)',
    glowColor: 'rgba(245,158,11,0.25)',
    emoji: '🔍',
  },
  {
    id: 'gripping',
    label: 'Gripping',
    Icon: Eye,
    activeColor: '#A78BFA',
    activeBg: 'rgba(167,139,250,0.10)',
    activeBorder: 'rgba(167,139,250,0.45)',
    glowColor: 'rgba(167,139,250,0.25)',
    emoji: '👁',
  },
  {
    id: 'chilling',
    label: 'Chilling',
    Icon: Skull,
    activeColor: '#F87171',
    activeBg: 'rgba(248,113,113,0.10)',
    activeBorder: 'rgba(248,113,113,0.45)',
    glowColor: 'rgba(248,113,113,0.25)',
    emoji: '💀',
  },
  {
    id: 'mind_blowing',
    label: 'Mind Blowing',
    Icon: HelpCircle,
    activeColor: '#22D3EE',
    activeBg: 'rgba(34,211,238,0.10)',
    activeBorder: 'rgba(34,211,238,0.45)',
    glowColor: 'rgba(34,211,238,0.25)',
    emoji: '🌀',
  },
];

// ── Premium animated reaction pill ───────────────────────────────────────
function ReactionPill({ reaction, isSelected, count, onReact, animating }) {
  const { id, label, Icon, activeColor, activeBg, activeBorder, glowColor, emoji } = reaction;
  return (
    <div className="relative flex-1 min-w-[75px]">
      {/* Floating emoji + plus-one burst */}
      {animating && (
        <div className="absolute top-[-18px] left-1/2 -translate-x-1/2 pointer-events-none select-none z-30 flex flex-col items-center">
          <span
            className="text-base"
            style={{ animation: 'floatEmoji 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards' }}
          >
            {emoji}
          </span>
          <span
            className="text-[9px] font-bold font-mono"
            style={{
              color: activeColor,
              textShadow: `0 0 4px ${glowColor}`,
              animation: 'floatUp 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards',
              marginTop: '-4px'
            }}
          >
            +1
          </span>
        </div>
      )}
      <button
        onClick={() => onReact(id)}
        className="relative w-full flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border overflow-hidden transition-all duration-300 cursor-pointer group select-none focus:outline-none hover:-translate-y-0.5 active:scale-95"
        style={{
          backgroundColor: isSelected ? activeBg : 'rgba(15,13,11,0.5)',
          borderColor: isSelected ? activeBorder : 'rgba(237,232,223,0.06)',
          boxShadow: isSelected 
            ? `0 8px 24px -6px rgba(0,0,0,0.6), 0 0 16px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.05)` 
            : '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
      >
        {/* Shimmer / light effect on select */}
        {isSelected && (
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: `radial-gradient(circle at center, ${activeColor} 0%, transparent 80%)`,
            }}
          />
        )}
        
        {/* Bottom light bar */}
        <div 
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] transition-all duration-500 rounded-full"
          style={{
            width: isSelected ? '40%' : '0%',
            backgroundColor: activeColor,
            boxShadow: `0 0 8px ${activeColor}`,
          }}
        />

        <Icon
          className="w-4.5 h-4.5 relative z-10 transition-all duration-500 ease-out"
          style={{
            color: isSelected ? activeColor : '#6B6560',
            filter: isSelected ? `drop-shadow(0 0 5px ${glowColor})` : 'none',
            transform: isSelected ? 'scale(1.12) rotate(6deg)' : 'scale(1)',
          }}
        />
        <span
          className="text-[8.5px] font-mono tracking-wider uppercase leading-none relative z-10 transition-all duration-300"
          style={{ color: isSelected ? activeColor : '#5A5650' }}
        >
          {label}
        </span>
        <span
          className="text-[10.5px] font-bold font-mono relative z-10 transition-all duration-300"
          style={{ color: isSelected ? activeColor : '#3A3630' }}
        >
          {count}
        </span>
      </button>
    </div>
  );
}

export default function TodayInShadows() {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [wikiImgUrl, setWikiImgUrl] = useState(null);
  const [reactions, setReactions] = useState({ intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0 });
  const [userReaction, setUserReaction] = useState(null);
  const [animatingReaction, setAnimatingReaction] = useState(null);

  const dayOfWeek = new Date().getDay();
  const activeTheme = DAY_THEMES[dayOfWeek];

  // Load dossier
  useEffect(() => {
    let active = true;
    const fetchDossier = async () => {
      try {
        const res = await fetch('/api/daily-dossier');
        if (res.ok) {
          const data = await res.json();
          if (data && data.title && active) {
            setDossier(data);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('[Dossier Widget] Failed to fetch:', err.message);
      }
      if (active) {
        const fallback = STATIC_FALLBACKS[dayOfWeek];
        const dateStr = new Date().toISOString().split('T')[0];
        setDossier({
          ...fallback,
          date: dateStr,
          thumbnail: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800',
          wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(fallback.wikiQuery.replace(/ /g, '_'))}`,
          wikiSummary: fallback.text,
          theme: activeTheme.name
        });
        setLoading(false);
      }
    };
    fetchDossier();
    return () => { active = false; };
  }, [dayOfWeek, activeTheme.name]);

  // Load reactions from localStorage + server when dossier is ready
  useEffect(() => {
    if (!dossier) return;
    setImgFailed(false);
    setWikiImgUrl(null);
    const dateKey = dossier.date || new Date().toISOString().split('T')[0];

    // Always restore the user's vote from localStorage first
    const stored = localStorage.getItem(`lore:dossier:reaction:${dateKey}`);
    setUserReaction(stored || null);

    // Load counts: prefer server, fall back to persisted local counts
    const localCounts = (() => {
      try {
        const raw = localStorage.getItem(`lore:dossier:counts:${dateKey}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();

    if (dossier.reactions && Object.values(dossier.reactions).some(v => v > 0)) {
      setReactions(dossier.reactions);
    } else if (localCounts) {
      setReactions(localCounts);
    } else {
      setReactions({ intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0 });
    }
  }, [dossier]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && modalOpen) setModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  const handleReact = async (type) => {
    if (!dossier) return;
    const wasSelected = userReaction === type;
    const oldReaction = userReaction;
    const newReaction = wasSelected ? null : type;
    const dateKey = dossier.date || new Date().toISOString().split('T')[0];

    if (!wasSelected) {
      setAnimatingReaction(type);
      setTimeout(() => setAnimatingReaction(null), 700);
    }

    setUserReaction(newReaction);
    setReactions(prev => {
      const next = { ...prev };
      if (wasSelected) {
        next[type] = Math.max(0, (next[type] || 1) - 1);
      } else {
        next[type] = (next[type] || 0) + 1;
        if (oldReaction && oldReaction !== type) {
          next[oldReaction] = Math.max(0, (next[oldReaction] || 1) - 1);
        }
      }
      // Persist counts locally so they never reset on page load
      try { localStorage.setItem(`lore:dossier:counts:${dateKey}`, JSON.stringify(next)); } catch {}
      return next;
    });

    if (wasSelected) {
      localStorage.removeItem(`lore:dossier:reaction:${dateKey}`);
    } else {
      localStorage.setItem(`lore:dossier:reaction:${dateKey}`, type);
    }

    // Sync to server silently
    try {
      if (oldReaction && oldReaction !== type) {
        await fetch('/api/daily-dossier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reaction_type: oldReaction, undo: true })
        });
      }
      const res = await fetch('/api/daily-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: type, undo: wasSelected })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reactions) {
          setReactions(data.reactions);
          try { localStorage.setItem(`lore:dossier:counts:${dateKey}`, JSON.stringify(data.reactions)); } catch {}
        }
      }
    } catch (err) {
      console.warn('Failed to save dossier reaction:', err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-5 rounded-xl border border-neutral-800/40 bg-neutral-950/20 animate-pulse flex items-center justify-center min-h-[100px]">
        <span className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase">Retrieving daily dossier...</span>
      </div>
    );
  }

  if (!dossier) return null;

  return (
    <>
      {/* ── Dossier Card on Homepage ──────────────────────────────────── */}
      <div
        className="p-5 md:p-6 rounded-xl border flex flex-col md:flex-row gap-5 items-start transition-all duration-300 hover:border-[#9E7B4C]/35"
        style={{
          backgroundColor: 'rgba(15, 13, 10, 0.65)',
          borderColor: 'rgba(158, 123, 76, 0.15)',
          boxShadow: '0 8px 32px -10px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Thumbnail */}
        {dossier.thumbnail && (
          <div className="w-full aspect-[4/3] md:aspect-auto md:w-[120px] md:h-[90px] rounded-lg overflow-hidden flex-shrink-0 border border-neutral-800/60 bg-black/40 relative group">
            {imgFailed ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
                <LoreMark size={20} color="currentColor" />
                <span className="text-[7px] font-mono tracking-[0.15em] uppercase mt-2">CLASSIFIED</span>
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#090807' }}>
                <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 30%, rgba(5, 4, 3, 0.85) 100%)' }} />
                <div className="absolute top-2 left-2 z-20 flex items-center gap-1 opacity-35 pointer-events-none select-none">
                  <LoreMark size={8} color="#EDE8DF" />
                  <span className="text-[6.5px] font-mono tracking-[0.2em] text-[#EDE8DF] uppercase font-bold">LORE</span>
                </div>
                <img
                  src={wikiImgUrl || dossier.thumbnail}
                  alt={dossier.title}
                  onError={() => setImgFailed(true)}
                  className="relative z-10 w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 group-hover:scale-[1.02]"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}

        {/* Text block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[9.5px] sm:text-[10px] font-mono tracking-[0.2em] uppercase text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/20 px-2 py-0.5 rounded-sm">
              WHAT HAPPENED TODAY · {dossier.theme?.toUpperCase()}
            </span>
            {dossier.year && <span className="text-[10px] font-mono text-neutral-400 tracking-wider">YEAR: {dossier.year}</span>}
          </div>
          <h4 className="font-sans font-bold text-[13px] uppercase tracking-wider text-neutral-300 mb-1">{dossier.title}</h4>
          <p className="font-serif italic text-sm md:text-base leading-relaxed text-[#EDE8DF] mb-3" style={{ opacity: 0.95 }}>
            {dossier.text}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 pt-4 border-t border-neutral-900/40">
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-[#9E7B4C] hover:text-[#b08c5c] uppercase transition-colors active:scale-95 duration-200 cursor-pointer focus:outline-none flex-shrink-0"
            >
              Read Entry <span className="text-xs">→</span>
            </button>
            {/* Mini reaction pills on card */}
            <div className="flex gap-1.5 items-center flex-wrap">
              {REACTION_CONFIG.map((r) => {
                const isSelected = userReaction === r.id;
                const count = reactions[r.id] || 0;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleReact(r.id)}
                    title={r.label}
                    className="py-1 px-2 rounded-lg border text-center transition-all duration-200 cursor-pointer focus:outline-none flex items-center gap-1 active:scale-95 text-[8.5px] font-mono uppercase tracking-wider group"
                    style={{
                      backgroundColor: isSelected ? r.activeBg : 'rgba(10,9,7,0.4)',
                      borderColor: isSelected ? r.activeBorder : 'rgba(237,232,223,0.06)',
                      boxShadow: isSelected ? `0 0 10px ${r.glowColor}` : 'none',
                    }}
                  >
                    <r.Icon className="w-3 h-3 transition-all duration-200" style={{ color: isSelected ? r.activeColor : '#5A5650' }} />
                    <span style={{ color: isSelected ? r.activeColor : '#6B6560' }}>{r.label}</span>
                    <span className="opacity-60" style={{ color: isSelected ? r.activeColor : '#4A4440' }}>({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL — Full-screen overlay, centering flex wrapper, max height constraint ──── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 md:p-8"
          style={{ backgroundColor: 'rgba(5,4,3,0.92)', backdropFilter: 'blur(10px)' }}
          onClick={() => setModalOpen(false)}
        >
          {/* Modal card — stops click propagation, flex layout with max-height and hidden overflow */}
          <div
            className="relative w-full max-h-[90vh] rounded-2xl flex flex-col overflow-hidden animate-fadeIn"
            style={{
              maxWidth: '680px',
              backgroundColor: '#110F0D',
              border: '1px solid rgba(158,123,76,0.22)',
              boxShadow: '0 32px 64px -16px rgba(0,0,0,0.95), 0 0 0 1px rgba(158,123,76,0.06)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grid lines overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] rounded-2xl" style={{ backgroundImage: 'linear-gradient(rgba(158, 123, 76, 1) 1px, transparent 1px), linear-gradient(90deg,rgba(158, 123, 76, 1) 1px,transparent 1px)', backgroundSize: '24px 24px' }} />

            {/* ── Modal Header (Sticky/Fixed inside Card) ── */}
            <div className="flex justify-between items-start border-b border-neutral-900/60 p-6 md:p-8 pb-5 relative z-10 bg-[#110F0D]">
              <div className="space-y-1.5 flex-1 pr-4">
                <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/20 px-2.5 py-0.5 rounded-sm inline-block">
                  Today in History
                </span>
                <h3 className="font-serif italic text-2xl md:text-3xl text-[#EDE8DF] font-light pt-1 leading-tight">{dossier.title}</h3>
                <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500 pt-0.5">
                  <span>THEME: {dossier.theme?.toUpperCase()}</span>
                  <span>·</span>
                  <span>YEAR: {dossier.year}</span>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="flex-shrink-0 w-8 h-8 rounded-lg border border-neutral-800 hover:border-neutral-700 text-neutral-500 hover:text-white transition-all cursor-pointer focus:outline-none flex items-center justify-center hover:bg-neutral-900/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Modal Content (Scrollable Area) ── */}
            <div className="p-6 md:p-8 pt-6 space-y-6 relative z-10 overflow-y-auto flex-1 custom-scrollbar bg-[#110F0D]">
              {/* Wikipedia Summary */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 border-l-2 border-[#9E7B4C] pl-3">
                  Wikipedia Summary
                </h5>
                <p className="font-serif text-sm md:text-[15px] leading-relaxed text-neutral-300">
                  {dossier.wikiSummary || dossier.text}
                </p>
              </div>

              {/* Alternative Theories */}
              {dossier.theories && dossier.theories.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 border-l-2 border-[#9E7B4C] pl-3">
                    Alternative Theories
                  </h5>
                  <div className="grid grid-cols-1 gap-3">
                    {dossier.theories.map((theory, idx) => (
                      <div key={idx} className="p-4 rounded-xl border bg-neutral-950/60 border-neutral-800/60">
                        <span className="text-[10px] font-mono text-[#9E7B4C] uppercase tracking-wider block mb-1.5 font-bold">
                          {idx + 1}. {theory.name}
                        </span>
                        <p className="font-serif italic text-sm leading-relaxed text-[#D4CFC7]">
                          {theory.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Premium Reactions Section ── */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <h5 className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 border-l-2 border-[#9E7B4C] pl-3">
                    Reader Sentiment
                  </h5>
                  {userReaction && (
                    <span className="text-[9px] font-mono text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Your vote: {userReaction.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <style>{`
                  @keyframes floatUp {
                    0%   { transform: translate(-50%, 0); opacity: 0; }
                    20%  { opacity: 1; }
                    100% { transform: translate(-50%, -32px); opacity: 0; }
                  }
                  @keyframes floatEmoji {
                    0%   { transform: translate(-50%, 0) scale(0.5) rotate(0deg); opacity: 0; }
                    20%  { opacity: 1; transform: translate(-50%, -10px) scale(1.3) rotate(15deg); }
                    100% { transform: translate(calc(-50% + 12px), -44px) scale(0.8) rotate(-15deg); opacity: 0; }
                  }
                `}</style>
                <div className="flex gap-2 sm:gap-3">
                  {REACTION_CONFIG.map((r) => (
                    <ReactionPill
                      key={r.id}
                      reaction={r}
                      isSelected={userReaction === r.id}
                      count={reactions[r.id] || 0}
                      onReact={handleReact}
                      animating={animatingReaction === r.id}
                    />
                  ))}
                </div>
                <p className="text-[8.5px] font-mono text-neutral-600 tracking-wider">
                  // ONE VOTE PER DAY — CLICK AGAIN TO UNDO
                </p>
              </div>
            </div>

            {/* ── Modal Footer (Sticky/Fixed at bottom) ── */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-neutral-900 p-6 md:p-8 pt-5 gap-3 relative z-10 bg-[#110F0D]">
              {dossier.wikiUrl ? (
                <a
                  href={dossier.wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono tracking-widest text-[#9E7B4C] hover:text-[#b08c5c] uppercase transition-colors"
                >
                  Read Wikipedia Article <span className="text-xs">→</span>
                </a>
              ) : <span />}
              <button
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#9E7B4C] text-white text-[11px] font-bold tracking-[0.25em] uppercase rounded-lg hover:bg-[#b08c5c] active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none"
              >
                CLOSE FILE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
