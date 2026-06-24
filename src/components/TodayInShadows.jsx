import { useState, useEffect } from 'react';
import { ShieldCheck, Activity, AlertTriangle, HelpCircle } from 'lucide-react';
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



export default function TodayInShadows() {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [wikiImgUrl, setWikiImgUrl] = useState(null);

  const [reactions, setReactions] = useState({ gripping: 0, scared: 0, mindblown: 0, like: 0 });
  const [userReaction, setUserReaction] = useState(null); // 'gripping' | 'scared' | 'mindblown' | 'like' | null



  const dayOfWeek = new Date().getDay();
  const activeTheme = DAY_THEMES[dayOfWeek];

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
        console.warn('[Dossier Widget] Failed to fetch daily dossier:', err.message);
      }

      // Failsafe client fallback
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

  // Load custom reaction values when dossier is loaded
  useEffect(() => {
    if (dossier) {
      setImgFailed(false);
      setWikiImgUrl(null);
      const storedReaction = localStorage.getItem(`lore:dossier:reaction:${dossier.date}`);
      setUserReaction(storedReaction);
      setReactions(dossier.reactions || { like: 0, gripping: 0, scared: 0, mindblown: 0 });
    }
  }, [dossier]);

  // Escape key handler to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);



  const handleReact = async (type) => {
    if (!dossier) return;
    
    const wasSelected = userReaction === type;
    const oldReaction = userReaction;
    const newReaction = wasSelected ? null : type;
    
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
      return next;
    });

    if (wasSelected) {
      localStorage.removeItem(`lore:dossier:reaction:${dossier.date}`);
    } else {
      localStorage.setItem(`lore:dossier:reaction:${dossier.date}`, type);
    }

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
        }
      }
    } catch (err) {
      console.warn('Failed to save daily dossier reaction:', err.message);
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
      {/* Dossier Card on Homepage */}
      <div
        className="p-5 md:p-6 rounded-xl border flex flex-col md:flex-row gap-5 items-start transition-all duration-300 hover:border-[#9E7B4C]/35"
        style={{
          backgroundColor: 'rgba(15, 13, 10, 0.65)',
          borderColor: 'rgba(158, 123, 76, 0.15)',
          boxShadow: '0 8px 32px -10px rgba(0, 0, 0, 0.5)',
        }}
      >
        {dossier.thumbnail && (
          <div className="w-full aspect-[4/3] md:aspect-auto md:w-[120px] md:h-[90px] rounded-lg overflow-hidden flex-shrink-0 border border-neutral-800/60 bg-black/40 relative group">
            {imgFailed ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
                <LoreMark size={20} color="currentColor" />
                <span className="text-[7px] font-mono tracking-[0.15em] uppercase mt-2">CLASSIFIED</span>
              </div>
            ) : (
              <div 
                className="relative w-full h-full overflow-hidden flex items-center justify-center"
                style={{
                  backgroundColor: '#090807',
                  backgroundImage: 'linear-gradient(rgba(158, 123, 76, 0.03) 1px, transparent 1px)',
                  backgroundSize: '100% 4px',
                }}
              >
                {/* Vignette shadow */}
                <div 
                  className="absolute inset-0 z-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at center, transparent 30%, rgba(5, 4, 3, 0.85) 100%)'
                  }}
                />

                {/* Brand Watermark / Stamp */}
                <div className="absolute top-2 left-2 z-20 flex items-center gap-1 opacity-35 pointer-events-none select-none">
                  <LoreMark size={8} color="#EDE8DF" />
                  <span className="text-[6.5px] font-mono tracking-[0.2em] text-[#EDE8DF] uppercase font-bold">LORE</span>
                </div>

                {/* Crisp foreground contained image */}
                <img
                  src={wikiImgUrl || (dossier.thumbnail ? `${dossier.thumbnail}?v=${dossier.date || ''}` : '')}
                  alt={dossier.title}
                  onError={() => setImgFailed(true)}
                  className="relative z-10 w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-[700ms] group-hover:scale-[1.02] shadow-[0_0_16px_rgba(0,0,0,0.6)]"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[9.5px] sm:text-[10px] font-mono tracking-[0.2em] uppercase text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/20 px-2 py-0.5 rounded-sm">
              WHAT HAPPENED TODAY IN HISTORY · {dossier.theme?.toUpperCase()}
            </span>
            {dossier.year && (
              <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
                YEAR: {dossier.year}
              </span>
            )}
          </div>
          <h4 className="font-sans font-bold text-[13px] uppercase tracking-wider text-neutral-300 mb-1">
            {dossier.title}
          </h4>
          <p className="font-serif italic text-sm md:text-base leading-relaxed text-[#EDE8DF] mb-3" style={{ opacity: 0.95 }}>
            {dossier.text}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 pt-4 border-t border-neutral-900/40">
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-[#9E7B4C] hover:text-[#b08c5c] uppercase transition-colors active:scale-95 duration-200 cursor-pointer focus:outline-none"
            >
              Read Entry <span className="text-xs">→</span>
            </button>
            
            <div className="flex gap-2 items-center flex-wrap">
              {[
                { id: 'like', Icon: ShieldCheck, label: 'Credible', colorClass: 'text-amber-400' },
                { id: 'gripping', Icon: Activity, label: 'Intense', colorClass: 'text-violet-400' },
                { id: 'scared', Icon: AlertTriangle, label: 'Unsettling', colorClass: 'text-red-400' },
                { id: 'mindblown', Icon: HelpCircle, label: 'Enigmatic', colorClass: 'text-cyan-400' }
              ].map((r) => {
                const isSelected = userReaction === r.id;
                const count = reactions[r.id] || 0;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleReact(r.id)}
                    className="py-1 px-2.5 rounded border text-center transition-all duration-200 cursor-pointer focus:outline-none flex items-center gap-1.5 hover:border-[#9E7B4C]/40 active:scale-95 text-[11px]"
                    style={{
                      backgroundColor: isSelected ? 'rgba(158, 123, 76, 0.08)' : 'rgba(10, 9, 7, 0.3)',
                      borderColor: isSelected ? '#9E7B4C' : 'rgba(237, 232, 223, 0.06)',
                      color: isSelected ? '#EDE8DF' : '#8F8A82'
                    }}
                    title={r.label}
                  >
                    <r.Icon className={`w-3.5 h-3.5 ${isSelected ? r.colorClass : 'opacity-70'}`} />
                    <span className="text-[10px] font-mono opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Deep-Dive Decryption Overlay Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0A0907]/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-full max-w-[620px] bg-[#110F0D] border border-[#9E7B4C]/25 rounded-xl p-6 md:p-8 space-y-6 shadow-2xl overflow-hidden my-8"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)'
            }}
          >
            {/* Decryption grid lines overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(158,123,76,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(158,123,76,0.1)_1px,transparent_1px)] bg-[size:24px_24px]" />

            {/* Header */}
            <div className="flex justify-between items-start border-b border-neutral-900 pb-4 relative z-10">
              <div className="space-y-1">
                <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/20 px-2.5 py-0.5 rounded-sm">
                  Today in History
                </span>
                <h3 className="font-serif italic text-2xl md:text-3xl text-[#EDE8DF] font-light pt-1">
                  {dossier.title}
                </h3>
                <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 pt-0.5">
                  <span>THEME: {dossier.theme?.toUpperCase()}</span>
                  <span>·</span>
                  <span>YEAR: {dossier.year}</span>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors cursor-pointer text-[11px] font-mono tracking-widest uppercase focus:outline-none border border-neutral-800 hover:border-neutral-700 px-2.5 py-1 rounded"
              >
                Close [Esc]
              </button>
            </div>

            {/* Content Body */}
            <div className="space-y-6 relative z-10 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              
              {/* Intel Briefing */}
              <div className="space-y-2">
                <h5 className="text-[11px] font-mono tracking-widest uppercase text-neutral-300 border-l border-[#9E7B4C] pl-2">
                  Wikipedia Summary
                </h5>
                <p className="font-serif text-sm md:text-base leading-relaxed text-neutral-300">
                  {dossier.wikiSummary || dossier.text}
                </p>
              </div>

              {/* Classified Theories */}
              {dossier.theories && dossier.theories.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h5 className="text-[11px] font-mono tracking-widest uppercase text-neutral-300 border-l border-[#9E7B4C] pl-2">
                    Alternative Theories
                  </h5>
                  <div className="grid grid-cols-1 gap-3">
                    {dossier.theories.map((theory, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-lg border bg-neutral-950/40 border-neutral-900/60"
                      >
                        <span className="text-[10.5px] font-mono text-[#9E7B4C] uppercase tracking-wider block mb-1 font-bold">
                          Theory {idx + 1}: {theory.name}
                        </span>
                        <p className="font-serif italic text-xs sm:text-sm leading-relaxed text-[#EDE8DF]">
                          {theory.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Simple Reaction Toolbar */}
              <div className="space-y-3 pt-2">
                <h5 className="text-[11px] font-mono tracking-widest uppercase text-neutral-300 border-l border-[#9E7B4C] pl-2">
                  Reader Sentiment
                </h5>
                <div className="flex gap-2 sm:gap-3 flex-wrap xs:flex-nowrap">
                  {[
                    { id: 'like', label: 'Credible', Icon: ShieldCheck, colorClass: 'text-amber-400' },
                    { id: 'gripping', label: 'Intense', Icon: Activity, colorClass: 'text-violet-400' },
                    { id: 'scared', label: 'Unsettling', Icon: AlertTriangle, colorClass: 'text-red-400' },
                    { id: 'mindblown', label: 'Enigmatic', Icon: HelpCircle, colorClass: 'text-cyan-400' }
                  ].map((r) => {
                    const isSelected = userReaction === r.id;
                    const count = reactions[r.id] || 0;
                    return (
                      <button
                        key={r.id}
                        onClick={() => handleReact(r.id)}
                        className="flex-1 py-2.5 px-3 rounded-lg border text-center transition-all duration-200 cursor-pointer focus:outline-none flex items-center justify-center gap-1.5 hover:border-[#9E7B4C]/40 active:scale-95 text-xs font-medium min-w-[70px]"
                        style={{
                          backgroundColor: isSelected ? 'rgba(158, 123, 76, 0.08)' : 'rgba(10, 9, 7, 0.3)',
                          borderColor: isSelected ? '#9E7B4C' : 'rgba(237, 232, 223, 0.06)',
                          color: isSelected ? '#EDE8DF' : '#8F8A82'
                        }}
                      >
                        <r.Icon className={`w-4 h-4 ${isSelected ? r.colorClass : 'opacity-70'}`} />
                        <span className="hidden xs:inline">{r.label}</span>
                        <span className="text-[10.5px] sm:text-xs font-mono opacity-60">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>



            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-neutral-900 pt-4 relative z-10 gap-3">
              {dossier.wikiUrl && (
                <a
                  href={dossier.wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono tracking-widest text-[#9E7B4C] hover:text-[#b08c5c] uppercase transition-colors"
                >
                  Read Wikipedia Article <span className="text-xs">→</span>
                </a>
              )}
              <button
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-5 py-2 bg-[#9E7B4C] text-white text-[11px] font-bold tracking-[0.25em] uppercase rounded hover:bg-[#b08c5c] active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none"
              >
                Close File
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
