import { useState, useEffect, useMemo } from 'react';
import { Fingerprint, Eye, Skull, HelpCircle, Terminal, Unlock } from 'lucide-react';
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

const WIKIPEDIA_DOSSIERS = [
  {
    title: 'Wow! signal',
    year: '1977',
    text: 'In August 1977, a strong narrowband radio signal was received by Ohio State University\'s Big Ear radio telescope. The signal bore expected hallmarks of extraterrestrial origin.',
    wikiQuery: 'Wow! signal',
    theories: [
      { name: 'Extraterrestrial Source', explanation: 'A highly focused transmission sent by an advanced civilization near the Sagittarius constellation.' },
      { name: 'Comet Outgassing', explanation: 'Hydrogen gas clouds surrounding passing comets 266P/Christensen and P/2008 Y2 generated the radio spike.' },
      { name: 'Satellite Bleed', explanation: 'A secret military satellite transmitting on a protected frequency accidentally bounced off space debris.' }
    ],
    suspicionLabel: 'Extraterrestrial Probability',
    defaultSuspicion: 89
  },
  {
    title: 'Project MKUltra',
    year: '1953',
    text: 'A highly classified CIA mind-control project started in 1953, exposing unwitting citizens to chemical agents, sensory deprivation, and hypnosis.',
    wikiQuery: 'Project MKUltra',
    theories: [
      { name: 'Subproject 68', explanation: 'Dr. Ewen Cameron kept patients in drug-induced comas for weeks to reprogram their subconscious minds.' },
      { name: 'Midnight Climax', explanation: 'CIA safehouses used operatives to secretly dose clients with LSD to study behavioral effects.' },
      { name: 'Continuous Operation', explanation: 'The program was officially shut down, but some believe it transitioned into sub-audible digital waves.' }
    ],
    suspicionLabel: 'Government Coverup Index',
    defaultSuspicion: 95
  },
  {
    title: 'Dyatlov Pass Incident',
    year: '1959',
    text: 'Nine experienced Soviet hikers died under mysterious circumstances in the Ural Mountains. Their tent was cut open from the inside and their bodies showed bizarre trauma.',
    wikiQuery: 'Dyatlov Pass incident',
    theories: [
      { name: 'Infrasound Panic', explanation: 'Wind patterns generated low-frequency infrasound that induced extreme panic, driving hikers out into freezing winds.' },
      { name: 'Soviet Weapons Test', explanation: 'Pass was near a secret Soviet weapons testing range; hikers were killed by a shockwave or chemical exposure.' },
      { name: 'Indigenous Mansi Attack', explanation: 'Local tribesfolk defended their sacred mountain by attacking hikers with invisible concussive forces.' }
    ],
    suspicionLabel: 'Anomalous Threat Level',
    defaultSuspicion: 88
  },
  {
    title: 'Cicada 3301',
    year: '2012',
    text: 'An anonymous organization posted complex cryptographic puzzles online to recruit highly intelligent cryptanalysts. Its organizers and purpose remain unknown.',
    wikiQuery: 'Cicada 3301',
    theories: [
      { name: 'Intelligence Agency Recruitment', explanation: 'The CIA, NSA, or MI6 created the puzzles to scout high-level mathematical talent without bureaucratic overhead.' },
      { name: 'Cyber Mercenary Syndicate', explanation: 'A black-hat cyber-mercenary organization recruited elite hackers to build secure communication networks.' },
      { name: 'Ancient Cyber Cult', explanation: 'An esoteric online society seeking to develop digital cryptography into a new technologist philosophy.' }
    ],
    suspicionLabel: 'Cryptographic Complexity',
    defaultSuspicion: 82
  },
  {
    title: 'Voynich Manuscript',
    year: '15th Century',
    text: 'An illustrated codex handwritten in an unknown writing system. Carbon-dated to the early 15th century, its pages depict bizarre plants, astronomical charts, and bathing females.',
    wikiQuery: 'Voynich manuscript',
    theories: [
      { name: 'Cipher Codebook', explanation: 'An early European alchemist encoded secret medicinal formulas to protect them from the Inquisition.' },
      { name: 'Elaborate Hoax', explanation: 'A clever Renaissance con artist manufactured the document to sell as a rare manuscript to wealthy patrons.' },
      { name: 'Unknown Lost Language', explanation: 'Written in a natural phonetic language that has since vanished, utilizing a custom phonetic script.' }
    ],
    suspicionLabel: 'Unsolved Cipher Index',
    defaultSuspicion: 90
  },
  {
    title: 'Bermuda Triangle',
    year: '1945',
    text: 'A region in the western part of the North Atlantic Ocean where a number of aircraft and surface vessels are rumored to have disappeared under mysterious circumstances.',
    wikiQuery: 'Bermuda Triangle',
    theories: [
      { name: 'Methane Hydrate Eruptions', explanation: 'Gas pockets releasing from the seabed decreased water density, instantly sinking ships and stalling plane engines.' },
      { name: 'Magnetic Anomaly', explanation: 'Local electromagnetic distortions caused navigational instruments to spin erratically, leading pilots off course.' },
      { name: 'Temporal Portals', explanation: 'Fringe hypotheses suggest wormhole gateways that bend local space-time coordinates.' }
    ],
    suspicionLabel: 'Anomaly Probability',
    defaultSuspicion: 72
  },
  {
    title: 'Roswell UFO Incident',
    year: '1947',
    text: 'In mid-1947, a United States Army Air Forces balloon crashed at a ranch near Roswell, New Mexico, sparking decades of alien spacecraft recovery rumors.',
    wikiQuery: 'Roswell UFO incident',
    theories: [
      { name: 'Project Mogul', explanation: 'The crash was a top-secret spy balloon designed to detect Soviet atomic bomb tests using low-frequency acoustics.' },
      { name: 'Extraterrestrial Recovery', explanation: 'A genuine alien disc crashed, and the occupants were transported to Wright-Patterson Air Force Base.' },
      { name: 'Experimental Jet Crash', explanation: 'An advanced Horten flying wing prototype crashed, and the military fabricated the flying saucer story to distract foreign agents.' }
    ],
    suspicionLabel: 'Coverup Threat Rating',
    defaultSuspicion: 91
  },
  {
    title: 'Tunguska Event',
    year: '1908',
    text: 'A massive 12-megaton explosion flattened 80 million trees over 830 square miles of Siberian forest. No impact crater was ever found.',
    wikiQuery: 'Tunguska event',
    theories: [
      { name: 'Air Burst Meteorite', explanation: 'A stony asteroid exploded 5 miles above the surface, releasing massive thermal energy without a surface impact.' },
      { name: 'Micro Black Hole', explanation: 'A microscopic black hole passed through Earth, entering in Siberia and exiting through the Atlantic Ocean.' },
      { name: 'Wardenclyffe Discharge', explanation: 'Nikola Tesla was testing his wireless power transmitter in New York, and the electrical beam overshot to Siberia.' }
    ],
    suspicionLabel: 'Destruction Anomaly Index',
    defaultSuspicion: 80
  },
  {
    title: 'Mary Celeste',
    year: '1872',
    text: 'An American merchant brigantine was discovered under partial sail in the Atlantic Ocean, completely abandoned. The crew was never heard from again, leaving cargo and personal items intact.',
    wikiQuery: 'Mary Celeste',
    theories: [
      { name: 'Alcohol Vapor Explosion', explanation: 'Fumes leaking from the ship\'s cargo of denatured alcohol caused a minor explosion, prompting a panic evacuation.' },
      { name: 'Waterspout Strike', explanation: 'A violent waterspout hit the vessel, disabling instruments and convincing the captain that the ship was sinking.' },
      { name: 'Mutiny', explanation: 'The crew murdered the captain, threw the body overboard, and sailed to a nearby island in a secret lifeboat.' }
    ],
    suspicionLabel: 'Disappearance Mystery',
    defaultSuspicion: 75
  },
  {
    title: 'D. B. Cooper',
    year: '1971',
    text: 'An unidentified man extorted $200,000 in ransom and parachuted from a Boeing 727 flying over Washington state. He was never seen or identified again.',
    wikiQuery: 'D. B. Cooper',
    theories: [
      { name: 'Fatal Jump', explanation: 'Cooper jumped into freezing rain over dense forest without proper goggles or winter gear, dying upon landing.' },
      { name: 'Richard McCoy Jr.', explanation: 'A copycat hijacker who executed an identical heist months later was the real D.B. Cooper under an alias.' },
      { name: 'CIA Asset Escape', explanation: 'Cooper was a black-ops operative who used the heist to disappear from surveillance, aided by an inside ground crew.' }
    ],
    suspicionLabel: 'Survival Probability',
    defaultSuspicion: 68
  },
  {
    title: 'Zodiac Killer',
    year: '1968',
    text: 'A serial killer who terrorized Northern California in the late 1960s, sending taunting letters and complex cryptograms containing details of his victims to local newspapers.',
    wikiQuery: 'Zodiac Killer',
    theories: [
      { name: 'Arthur Leigh Allen', explanation: 'The prime suspect who possessed a Zodiac watch and matches, but whose handwriting and DNA never matched the forensic print.' },
      { name: 'Multiple Copycats', explanation: 'The letters were written by a single mastermind, but the murders were executed by different copycat killers.' },
      { name: 'Decoy Informant', explanation: 'An inside member of the local police department used the identity to distract investigators from department corruption.' }
    ],
    suspicionLabel: 'Identity Unresolved Rate',
    defaultSuspicion: 96
  },
  {
    title: 'Black Knight Satellite',
    year: '1954',
    text: 'Conspiracy theorists claim an alien satellite has orbited Earth in a near-polar trajectory for over 13,000 years, broadcasting radio signals.',
    wikiQuery: 'Black Knight satellite conspiracy theory',
    theories: [
      { name: 'Thermal Blanket Debris', explanation: 'Photographs of the object from a 1998 Space Shuttle mission actually show a lost thermal protection blanket.' },
      { name: 'Tesla Signal Intercept', explanation: 'In 1899, Nikola Tesla intercepted repeating radio signals which modern advocates trace back to this polar satellite.' },
      { name: 'LDE Echoes', explanation: 'Long Delay Echoes (LDE) received by ham radio operators in the 1920s were reflection pings from the probe.' }
    ],
    suspicionLabel: 'Orbital Anomaly Odds',
    defaultSuspicion: 83
  },
  {
    title: 'Tamam Shud Case',
    year: '1948',
    text: 'An unidentified man was found dead on Somerton Beach in Australia. Inside a secret pocket in his trousers, police found a scrap of paper torn from a Persian poetry book reading "Tamam Shud" (Finished).',
    wikiQuery: 'Tamam Shud case',
    theories: [
      { name: 'Soviet Espionage', explanation: 'The Somerton Man was a Soviet spy poisoned with an untraceable toxin, and the book contained a matching code key.' },
      { name: 'Forbidden Romance Suicide', explanation: 'He traveled to Adelaide to find a former nurse who had given him the book, committing suicide after being rejected.' },
      { name: 'Military Chemical Agent', explanation: 'A military researcher who strayed too close to Australia\'s Woomera chemical testing facility and was silenced.' }
    ],
    suspicionLabel: 'Unsolved Case Rating',
    defaultSuspicion: 87
  },
  {
    title: 'Antikythera Mechanism',
    year: '150 BC',
    text: 'A complex 2,000-year-old bronze geared mechanism recovered from a Greek shipwreck, capable of calculating astronomical positions and eclipses centuries ahead of its time.',
    wikiQuery: 'Antikythera mechanism',
    theories: [
      { name: 'Lost Hellenistic Technology', explanation: 'Ancient Greek mechanicians possessed gearing capabilities that were completely lost during the dark ages.' },
      { name: 'Archimedean Prototype', explanation: 'Constructed by or heavily inspired by Archimedes, designed as a teaching model of the geocentric solar system.' },
      { name: 'Anachronistic Intercept', explanation: 'A highly controversial theory that the device was dropped by a time-displaced traveler.' }
    ],
    suspicionLabel: 'Technical Anachronism Rating',
    defaultSuspicion: 60
  },
  {
    title: 'Georgia Guidestones',
    year: '1980',
    text: 'A large granite monument erected in Georgia inscribed with ten guidelines for a post-apocalyptic era in eight modern languages, commissioned by an anonymous client under the pseudonym R.C. Christian.',
    wikiQuery: 'Georgia Guidestones',
    theories: [
      { name: 'Rosicrucian Blueprint', explanation: 'The monument was funded by the Rosicrucian Order, using "R.C. Christian" as a tribute to their founder Christian Rosenkreuz.' },
      { name: 'New World Order Manifesto', explanation: 'An elite global group commissioned the stones to outline instructions for massive population reduction.' },
      { name: 'Nuclear Cold War Target', explanation: 'Built during the height of the Cold War as a survival compass and beacon for fallout survivors.' }
    ],
    suspicionLabel: 'Conspiracy Intent Index',
    defaultSuspicion: 79
  },
  {
    title: 'Dancing Plague of 1518',
    year: '1518',
    text: 'In July 1518, a woman stepped into a street in Strasbourg and began to dance. Within a month, 400 people were dancing uncontrollably, some dying of heart attacks.',
    wikiQuery: 'Dancing plague of 1518',
    theories: [
      { name: 'Ergot Poisoning', explanation: 'Ingestion of psychotropic ergot fungi growing on damp rye caused mass hallucinations and muscle spasms.' },
      { name: 'St. Vitus Demonic Curse', explanation: 'A religious mass panic triggered by a local belief in the St. Vitus curse, causing hysterical mimics.' },
      { name: 'Occult Gathering', explanation: 'A secret heretical cult conducting trans-state ritualistic movements to escape social pressures.' }
    ],
    suspicionLabel: 'Hysteria Anomaly Rating',
    defaultSuspicion: 74
  },
  {
    title: 'The Bloop',
    year: '1997',
    text: 'An ultra-low-frequency, high-amplitude underwater sound detected by NOAA in 1997. It was traced to a remote point in the Pacific, reminiscent of H.P. Lovecraft\'s R\'lyeh.',
    wikiQuery: 'Bloop',
    theories: [
      { name: 'Glacial Icequake', explanation: 'A giant Antarctic iceberg cracking, breaking, and dragging across the sea floor, creating a deep resonance.' },
      { name: 'Gargantuan Marine Species', explanation: 'An unknown deep-sea organism, several times larger than a blue whale, vocalizing at extreme depth.' },
      { name: 'Secret Sonar Project', explanation: 'A highly classified underwater naval acoustic weapon test using low-frequency shock waves.' }
    ],
    suspicionLabel: 'Deep Sea Threat Level',
    defaultSuspicion: 81
  },
  {
    title: 'Kryptos',
    year: '1990',
    text: 'A sculpture on the grounds of the CIA Headquarters in Langley, Virginia. Containing four encrypted messages, the final fourth section remains unsolved to this day.',
    wikiQuery: 'Kryptos',
    theories: [
      { name: 'Coordinates to Vault', explanation: 'The decoded letters reveal geographic coordinates to a buried time capsule or secret archive at CIA grounds.' },
      { name: 'Double Transposition Cipher', explanation: 'The fourth passage uses a custom, multi-layered matrix cipher that requires a specific paper key.' },
      { name: 'Sanborn\'s Riddle', explanation: 'The sculptor Jim Sanborn left the puzzle unresolved as an artistic commentary on the nature of secrets.' }
    ],
    suspicionLabel: 'Intrusion Difficulty',
    defaultSuspicion: 94
  },
  {
    title: 'Max Headroom Hijacking',
    year: '1987',
    text: 'In November 1987, two television stations in Chicago had their broadcast signals hijacked by an unknown intruder wearing a Max Headroom mask.',
    wikiQuery: 'Max Headroom signal hijacking',
    theories: [
      { name: 'Local Video Hobbyists', explanation: 'Underground telecom hobbyists used a home-built transmitter targeting the line-of-sight microwave link dish.' },
      { name: 'Insider Station Hack', explanation: 'An engineer within the station setup the override patch from the inside to demonstrate security flaws.' },
      { name: 'Experimental Syndicate', explanation: 'An art collective testing signal interception vectors for tactical media disruptions.' }
    ],
    suspicionLabel: 'Signal Security Failure',
    defaultSuspicion: 77
  },
  {
    title: 'Lead Masks Case',
    year: '1966',
    text: 'In 1966, two Brazilian electronic technicians were found dead on a hill wearing formal suits and lead eye masks. Beside them was a notebook with cryptic instructions.',
    wikiQuery: 'Lead Masks Case',
    theories: [
      { name: 'Psychedelic Contact Experiment', explanation: 'The technicians took LSD and constructed lead masks to protect their eyes from blinding cosmic radiation during contact.' },
      { name: 'UFO Cult Deception', explanation: 'A spiritualist group tricked the men into taking ingestion pills to transcend their physical bodies.' },
      { name: 'Espionage Coverup', explanation: 'The technicians were assembling a secret radio transmitter for smugglers and were executed with custom toxins.' }
    ],
    suspicionLabel: 'Occult Intrigue Level',
    defaultSuspicion: 86
  }
];

const getTheoriesForType = (type) => {
  if (type === 'disappearance') {
    return [
      { name: "Sudden Environmental Hazard", explanation: "The subjects encountered a rapid, localized atmospheric or oceanographic anomaly that bypassed standard radio frequencies." },
      { name: "Covert Extraction", explanation: "High-level intelligence agencies orchestrated a complete identity scrub and relocation for espionage purposes." },
      { name: "Uncharted Dimensional Rift", explanation: "Fringe investigators claim the coordinates align with repeating space-time fluctuation zones." }
    ];
  } else if (type === 'crime') {
    return [
      { name: "Lone Wolf Distraction", explanation: "The perpetrator acted as a decoy to draw security forces away while a secondary, professional operator executed the target." },
      { name: "Deep-State Directive", explanation: "Unclassified archives suggest the target was silenced due to their imminent exposure of classified projects." },
      { name: "Altered Forensic Evidence", explanation: "Subsequent autopsy reviews showed entry wounds and toxicology profiles inconsistent with the official weapon." }
    ];
  } else if (type === 'accident') {
    return [
      { name: "Systemic Sabotage", explanation: "A concealed explosive device or targeted electromagnetic pulse was deployed to disable navigation and communications." },
      { name: "Experimental Weapons Fail", explanation: "The event was a catastrophic misfire of a classified prototype weapon tested in public corridors." },
      { name: "Systemic Oversight", explanation: "Corporate or military commanders ignored critical safety warnings to force a specific political or financial timeline." }
    ];
  } else {
    return [
      { name: "Classified Intervention", explanation: "Foreign intelligence operatives deployed advanced technology to execute the event and vanish without a trace." },
      { name: "Hidden Coordinates", explanation: "The event occurred at a precise geomagnetic grid node, triggering a short-lived physical anomaly." },
      { name: "Mass Delusion Trigger", explanation: "Local media reports and panic amplified minor incidents into a widespread psychological contagion." }
    ];
  }
};

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

function ReactionPill({ reaction, isSelected, count, onReact, animating }) {
  const { id, label, Icon, activeColor, activeBg, activeBorder, glowColor, emoji } = reaction;
  return (
    <div className="relative flex-1 min-w-[75px]">
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
        className="relative w-full flex flex-row items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border overflow-hidden transition-all duration-300 cursor-pointer group select-none focus:outline-none hover:-translate-y-0.5 active:scale-95"
        style={{
          backgroundColor: isSelected ? activeBg : 'rgba(15,13,11,0.5)',
          borderColor: isSelected ? activeBorder : 'rgba(237,232,223,0.06)',
          boxShadow: isSelected 
            ? `0 6px 20px -6px rgba(0,0,0,0.6), 0 0 12px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.05)` 
            : '0 3px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
      >
        {isSelected && (
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: `radial-gradient(circle at center, ${activeColor} 0%, transparent 80%)`,
            }}
          />
        )}
        <div 
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[1.5px] transition-all duration-500 rounded-full"
          style={{
            width: isSelected ? '40%' : '0%',
            backgroundColor: activeColor,
            boxShadow: `0 0 6px ${activeColor}`,
          }}
        />
        <Icon
          className="w-3.5 h-3.5 relative z-10 transition-all duration-500 ease-out"
          style={{
            color: isSelected ? activeColor : '#6B6560',
            filter: isSelected ? `drop-shadow(0 0 3px ${glowColor})` : 'none',
            transform: isSelected ? 'scale(1.1) rotate(4deg)' : 'scale(1)',
          }}
        />
        <span
          className="text-[8px] sm:text-[8.5px] font-mono tracking-wider uppercase leading-none relative z-10 transition-all duration-300"
          style={{ color: isSelected ? activeColor : '#5A5650' }}
        >
          {label}
        </span>
        <span
          className="text-[9px] sm:text-[9.5px] font-bold font-mono relative z-10 transition-all duration-300"
          style={{ color: isSelected ? activeColor : '#3A3630' }}
        >
          ({count})
        </span>
      </button>
    </div>
  );
}

export default function TodayInShadows() {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);
  const [wikiImgUrl, setWikiImgUrl] = useState(null);
  const [wikiPageUrl, setWikiPageUrl] = useState('');
  const [reactions, setReactions] = useState({ intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0 });
  const [userReaction, setUserReaction] = useState(null);
  const [animatingReaction, setAnimatingReaction] = useState(null);

  // ── Decryption States ──────────────────────────────────────────────────
  const [isDecrypted] = useState(true);

  const dateKey = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const dayOfWeek = new Date().getDay();
  const activeTheme = DAY_THEMES[dayOfWeek];

  // Pick the daily dossier based on the date hash
  const selectedDossier = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < dateKey.length; i++) {
      hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
    }
    hash = Math.abs(hash);
    return WIKIPEDIA_DOSSIERS[hash % WIKIPEDIA_DOSSIERS.length];
  }, [dateKey]);

  // Decryption grid removed. Dossier decrypted directly.

  // Load dossier and fetch Wikipedia thumbnail/details dynamically
  useEffect(() => {
    let active = true;
    const fetchWikiInfo = async () => {
      let resolvedDossier = null;

      try {
        const today = new Date();
        const monthNum = String(today.getMonth() + 1).padStart(2, '0');
        const dayNum = String(today.getDate()).padStart(2, '0');

        // 1. Fetch Wikipedia's Selected Events for Today
        const onThisDayUrl = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${monthNum}/${dayNum}`;
        const res = await fetch(onThisDayUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SevenDescents/1.0' }
        });

        if (res.ok) {
          const data = await res.json();
          const events = data.selected || data.events || [];
          
          let bestEvent = null;
          let bestScore = -1;
          let bestType = 'general';

          for (const ev of events) {
            const textLower = (ev.text || '').toLowerCase();
            let score = 0;
            let type = 'general';

            if (/\b(disappear|missing|lost|vanish|abduction|ufo|alien|ghost|paranormal|occult|conspiracy|secret)\b/.test(textLower)) {
              score += 10;
              type = 'disappearance';
            }
            if (/\b(assassinated|assassination|murder|killed|shot|executed|hanged|poisoned|killer|crime|theft|robbery|heist)\b/.test(textLower)) {
              score += 8;
              type = 'crime';
            }
            if (/\b(crash|accident|sank|sunk|disaster|tragedy|explosion|destroyed|fire|plague|epidemic)\b/.test(textLower)) {
              score += 6;
              type = 'accident';
            }

            if (score > bestScore) {
              bestScore = score;
              bestEvent = ev;
              bestType = type;
            }
          }

          if (bestEvent) {
            const primaryPage = bestEvent.pages?.[0];
            const cleanText = bestEvent.text.replace(/^\d+\s*[-–—]\s*/, '');
            resolvedDossier = {
              title: primaryPage?.title || "Classified Incident",
              year: String(bestEvent.year || today.getFullYear()),
              text: cleanText,
              wikiQuery: primaryPage?.title || "",
              theories: getTheoriesForType(bestType),
              suspicionLabel: 'Threat Assessment Level',
              defaultSuspicion: 50 + ((primaryPage?.title?.length || 0) % 45),
              story_id: 'WIKI_OTD_' + String(bestEvent.year || '0000'),
              wikiUrl: primaryPage?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(primaryPage?.title || '')}`,
              thumbnail: primaryPage?.thumbnail?.source || null
            };

            if (active) {
              setWikiImgUrl(resolvedDossier.thumbnail);
              setWikiPageUrl(resolvedDossier.wikiUrl);
            }
          }
        }
      } catch (err) {
        console.warn('[Dossier OnThisDay Fetch] Failed, falling back to static dossiers:', err.message);
      }

      // 2. Fallback to static date-hashed dossiers if OnThisDay fetch failed or returned nothing
      if (!resolvedDossier) {
        resolvedDossier = {
          ...selectedDossier,
          wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(selectedDossier.wikiQuery.replace(/ /g, '_'))}`
        };
        try {
          const query = selectedDossier.wikiQuery || selectedDossier.title;
          const cleanQuery = query.split(/[:\-–—]/)[0].trim();
          
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=1&format=json&origin=*`;
          const searchRes = await fetch(searchUrl);
          let resolvedTitle = cleanQuery;
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData?.query?.search && searchData.query.search.length > 0) {
              resolvedTitle = searchData.query.search[0].title;
            }
          }
          
          const formattedQuery = encodeURIComponent(resolvedTitle.trim().replace(/ /g, '_'));
          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${formattedQuery}`;
          const summaryRes = await fetch(summaryUrl);
          if (summaryRes.ok && active) {
            const matched = await summaryRes.json();
            resolvedDossier.thumbnail = matched.thumbnail?.source || null;
            resolvedDossier.wikiUrl = matched.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${formattedQuery}`;
            if (active) {
              setWikiImgUrl(resolvedDossier.thumbnail);
              setWikiPageUrl(resolvedDossier.wikiUrl);
            }
          }
        } catch (err) {
          console.warn('[Dossier Fallback Wiki Fetch] Failed:', err.message);
        }
      }

      // Load server-side reactions counts
      try {
        const res = await fetch(`/api/daily-dossier?date=${dateKey}`);
        if (res.ok && active) {
          const data = await res.json();
          if (data?.reactions) {
            const rx = data.reactions;
            setReactions({
              intriguing: rx.intriguing || rx.likes || rx.like || 0,
              gripping: rx.gripping || 0,
              chilling: rx.chilling || rx.scared || 0,
              mind_blowing: rx.mind_blowing || rx.mindblown || 0
            });
          }
        }
      } catch (err) {
        console.warn('[Reactions Fetch] Failed:', err.message);
      }

      if (active) {
        setDossier({
          ...resolvedDossier,
          date: dateKey,
          theme: activeTheme.name
        });
        setLoading(false);
      }
    };

    fetchWikiInfo();
    return () => { active = false; };
  }, [selectedDossier, dateKey, activeTheme.name]);

  // Load reactions from localStorage fallback
  useEffect(() => {
    if (!dossier) return;
    setImgFailed(false);
    const stored = localStorage.getItem(`lore:dossier:reaction:${dateKey}`);
    setUserReaction(stored || null);
  }, [dossier, dateKey]);

  // Decryption event handlers removed.

  const handleReact = async (type) => {
    if (!dossier) return;
    const wasSelected = userReaction === type;
    const oldReaction = userReaction;
    const newReaction = wasSelected ? null : type;

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
      try { localStorage.setItem(`lore:dossier:counts:${dateKey}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

    if (wasSelected) {
      localStorage.removeItem(`lore:dossier:reaction:${dateKey}`);
    } else {
      localStorage.setItem(`lore:dossier:reaction:${dateKey}`, type);
    }

    try {
      const res = await fetch('/api/daily-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add_reaction: wasSelected ? null : type,
          remove_reaction: oldReaction,
          date: dateKey
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reactions) {
          const rx = data.reactions;
          const normalized = {
            intriguing: rx.intriguing || rx.likes || rx.like || 0,
            gripping: rx.gripping || 0,
            chilling: rx.chilling || rx.scared || 0,
            mind_blowing: rx.mind_blowing || rx.mindblown || 0
          };
          setReactions(normalized);
          try { localStorage.setItem(`lore:dossier:counts:${dateKey}`, JSON.stringify(normalized)); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn('Failed to save dossier reaction:', err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-5 rounded-xl border border-neutral-800/40 bg-neutral-950/20 animate-pulse flex items-center justify-center min-h-[150px]">
        <span className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase">INCOMING SIGNAL INTERCEPT...</span>
      </div>
    );
  }

  if (!dossier) return null;

  return (
    <>
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
        .tis-card {
          position: relative;
          overflow: hidden;
        }
        .tis-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(158,123,76,0.4), transparent);
          z-index: 5;
          pointer-events: none;
        }
      `}</style>

      {/* ── Outer Shell ── */}
      <div
        className="tis-card rounded-xl border flex flex-col transition-all duration-300 hover:border-[#9E7B4C]/40 group relative overflow-hidden min-h-[320px] sm:min-h-[400px]"
        style={{
          backgroundColor: '#151311',
          borderColor: 'rgba(158, 123, 76, 0.18)',
          boxShadow: '0 12px 40px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* ── 2. DECRYPTED DAILY DOSSIER CONTENT ── */}
        {isDecrypted && (
          <>
            {/* Cinematic Banner Image */}
            {wikiImgUrl && (
              <div className="w-full h-40 sm:h-56 md:h-72 overflow-hidden bg-[#090807] flex flex-col border-b border-neutral-900/60 relative">
                {imgFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/60 text-[#9E7B4C]/70">
                    <LoreMark size={24} color="currentColor" />
                    <span className="text-[8px] font-mono tracking-[0.15em] uppercase mt-2">DECRYPTED</span>
                  </div>
                ) : (
                  <>
                    {/* Top Dossier Bar */}
                    <div className="w-full h-8 sm:h-9 z-20 flex-shrink-0 flex items-center justify-between px-3 sm:px-3.5 bg-black/55 backdrop-blur-md border-b border-white/5 select-none">
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <Unlock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#9E7B4C]" />
                        <span className="font-mono text-[7px] sm:text-[7.5px] text-[#EDE8DF] tracking-[0.16em] sm:tracking-[0.22em] font-bold">SIGNAL DECRYPTED</span>
                      </div>
                      <span className="font-mono text-[6px] sm:text-[6.5px] text-neutral-500 tracking-wider">
                        SEC-DOSS.00{dossier.story_id ? dossier.story_id.slice(-2) : 'XX'}
                      </span>
                    </div>

                    {/* Viewport */}
                    <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-[#110F0D]">
                      <img
                        src={wikiImgUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-20 pointer-events-none scale-115"
                      />
                      <img
                        src={wikiImgUrl}
                        alt={dossier.title}
                        onError={() => setImgFailed(true)}
                        className="relative z-10 max-h-full max-w-full object-contain md:grayscale-[30%] md:opacity-90 md:group-hover:grayscale-0 md:group-hover:opacity-100 transition-all duration-700 group-hover:scale-[1.015]"
                        loading="lazy"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Content Block */}
            <div className="p-4 sm:p-6 flex flex-col justify-between flex-1">
              <div>
                <div className="flex items-center gap-2 mb-3.5 flex-wrap">
                  <span className="text-[8.5px] sm:text-[9px] font-mono tracking-[0.24em] uppercase text-[#9E7B4C] bg-[#9E7B4C]/10 border border-[#9E7B4C]/25 px-2 py-0.5 rounded-sm">
                    INTELLIGENCE DISPATCH · {dossier.theme?.toUpperCase()}
                  </span>
                  {dossier.year && (
                    <span className="text-[9.5px] sm:text-[10px] font-mono text-[#8F8A82] tracking-widest uppercase">
                      YEAR: {dossier.year}
                    </span>
                  )}
                </div>
                <h4 className="font-serif italic text-lg sm:text-2xl text-[#EDE8DF] tracking-normal mb-3 font-semibold">{dossier.title}</h4>
                <p className="font-serif text-xs sm:text-sm md:text-base leading-relaxed text-[#D4CFC7] mb-5">
                  {dossier.text}
                </p>

                {/* Theories List Section */}
                <div className="space-y-3.5 mb-5 border-t border-neutral-900/60 pt-4">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[9px] font-mono tracking-widest uppercase text-neutral-500 mb-1.5">
                    <Terminal className="w-3 h-3 text-[#9E7B4C]" />
                    <span>Investigative Hypotheses</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    {dossier.theories && dossier.theories.map((t, idx) => (
                      <div key={idx} className="bg-neutral-900/20 border border-neutral-900/60 p-2.5 sm:p-3 rounded-lg flex flex-col">
                        <span className="text-[8.5px] font-mono text-[#9E7B4C] uppercase tracking-wider mb-1 font-bold">
                          0{idx + 1} · {t.name}
                        </span>
                        <p className="text-[10px] sm:text-[11px] leading-relaxed text-neutral-400 font-sans">
                          {t.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action & Reaction Footer */}
              <div className="flex flex-col gap-5 pt-4 border-t border-neutral-900/60 w-full">
                {wikiPageUrl ? (
                  <a
                    href={wikiPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-[#9E7B4C] hover:text-[#b08c5c] uppercase transition-colors active:scale-95 duration-200 cursor-pointer focus:outline-none w-fit"
                  >
                    Read Declassified Wikipedia Source <span className="text-xs">→</span>
                  </a>
                ) : <div />}

                {/* Animated reaction pills */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center w-full">
                  {REACTION_CONFIG.map((r) => {
                    const isSelected = userReaction === r.id;
                    const count = reactions[r.id] || 0;
                    return (
                      <ReactionPill
                        key={r.id}
                        reaction={r}
                        isSelected={isSelected}
                        count={count}
                        onReact={handleReact}
                        animating={animatingReaction === r.id}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
