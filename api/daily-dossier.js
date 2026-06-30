import db from '../db.cjs';

const DAILY_THEMES = {
  0: { name: 'Secret Sunday', hint: 'secret archives, government coverups, and classified dossiers' },
  1: { name: 'Mystery Monday', hint: 'unexplained mysteries, disappearances, and unsolved riddles' },
  2: { name: 'Thriller Tuesday', hint: 'high-stakes thrillers, espionage, and political assassinations' },
  3: { name: 'Wicked Wednesday', hint: 'wicked scientific experiments, classified research, and dangerous weapons' },
  4: { name: 'Terror Thursday', hint: 'terror-filled events, cults, occult practices, and paranormal encounters' },
  5: { name: 'Fatal Friday', hint: 'fatal tragedies, historical disasters, and fatal accidents' },
  6: { name: 'Sinister Saturday', hint: 'sinister crimes, heist masterminds, and high-profile trials' }
};

const DAILY_STATIC_FALLBACKS = {
  0: {
    title: 'Project MKUltra',
    year: '1953',
    text: '1953 mein CIA ne ek secret mind control project start kiya tha. Bina consent ke logo par LSD, hypnosis aur sensory deprivation test kiye gaye.',
    wikiQuery: 'Project MKUltra',
    theories: [
      { name: 'Subproject 68', explanation: 'Dr. Ewen Cameron ne participants ko drug-induced coma mein rakha aur weeks tak repetitive messages sunaye mind reprogram karne ke liye.' },
      { name: 'Midnight Climax', explanation: 'Safehouses mein prostitutes ko employ kiya gaya taaki clients ko attract kiya ja sake aur unhe secretly LSD dekar window ke peeche se observe kiya jaye.' },
      { name: 'Covert Brainwashing', explanation: 'Kaha jata hai ki project brainwash methods mein convert kar diya gaya aur modern digital methods se use kiya jata hai.' }
    ],
    suspicionLabel: 'Government Coverup Index',
    defaultSuspicion: 92
  },
  1: {
    title: 'Dyatlov Pass Incident',
    year: '1959',
    text: '1959 mein Russian Urals mein 9 experienced hikers ajeeb halat mein mare gaye. Unka tent andar se fata tha aur bodies par radiation ke traces mile.',
    wikiQuery: 'Dyatlov Pass incident',
    theories: [
      { name: 'Infrasound Hysteria', explanation: 'Mausam ke vajah se wind ne infrasound create kiya, jisne hikers ke dimaag mein panic daal diya aur woh bina kapdo ke bhaag nikle.' },
      { name: 'Soviet Weapons Test', explanation: 'Pass ke paas koi secret military testing chal rahi thi, aur wahan ke radioactive fallout ne unhe maar diya.' },
      { name: 'Mansi Tribe Attack', explanation: 'Local tribes ne apne sacred mountain ko defend karne ke liye hikers par secretly war kiya jisse koi external wound na dikhe.' }
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
      { name: 'Double Agent Play', explanation: 'Kuch records kehte hain ki Klaus British intelligence ke liye ek double agent tha aur jaanbujhkar atomic parameters leak kar raha tha.' },
      { name: 'Microfilm Cache', explanation: 'Uski leak ki gayi microfilms ka ek bada hissa Dresden ke kisi secret underground vault mein chhupa hua hai.' },
      { name: 'Los Alamos Ring', explanation: 'Fuchs akele kaam nahi kar raha tha, Los Alamos ke-andar ek aur bada spy network tha jise FBI kabhi trace nahi kar payi.' }
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
      { name: 'Deliberate Infection', explanation: 'Doctors ne participants ko track hi nahi kiya balki unhe intentionally virus se inject kiya tha.' },
      { name: 'Institutional Racism Test', explanation: 'Yeh study healthcare systems mein minority populations ko check karne ke liye ek pre-planned benchmark bani thi.' },
      { name: 'Post-war Coverup', explanation: '1940s mein penicillin standard treatment banne ke baad bhi government ne information deliberately suppress kiya taaki experiment continue rahe.' }
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
      { name: 'Ergot Poisoning', explanation: 'Rye grain par ergot fungus grow ho gaya tha, jise khane se logon ko hallucinogenic fits aur seizures pad rahe the.' },
      { name: 'Property Land Grabbing', explanation: 'Wealthy landowners ne witch accuse kiya taaki court unki land seize kar le aur use saste mein auction kiya ja sake.' },
      { name: 'Puritan Mass Delusion', explanation: 'Intense religious environment aur native American attacks ke darr se pure community ka mental health collapse ho gaya.' }
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
      { name: 'Olympic Swap', explanation: 'Owner company JP Morgan ne actual Titanic ko damaged sister ship Olympic se swap kar diya insurance money recover karne ke liye.' },
      { name: 'Deliberate Speed Course', explanation: 'Captain Smith ko ice warnings milne ke baad bhi speed badhane ka order mila tha taaki records break ho sakein.' },
      { name: 'Secret Target Assassination', explanation: 'Federal Reserve ke against khade teen billionaires (Astor, Guggenheim, Straus) is ship par the aur unhe eliminate karne ke liye ship doobayi gayi.' }
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
      { name: 'Inside Security Job', explanation: 'Museum guard Richard Abath ne doors unlock kiya aur motion detectors ke signals bypass karne mein choro ki madad ki.' },
      { name: 'Irish Mob Funding', explanation: 'Churayi gayi paintings Boston ke Irish Mob ke paas gayi aur unhe collateral ke roop mein arms deals aur drug trafficking ke liye use kiya gaya.' },
      { name: 'Hidden European Collector', explanation: 'Robbery ek wealthy European collector ke command par hui thi, jisne paintings ko kisi bunker mein chhipakar rakha hai.' }
    ],
    suspicionLabel: 'Insider Assistance Odds',
    defaultSuspicion: 82
  }
};

async function generateDailyDossier(dateStr, dayOfWeek) {
  let selectedStory = null;
  try {
    const list = await db.getStories(false);
    if (list && list.length > 0) {
      const categoryMap = {
        0: ['gov_experiments', 'conspiracy'],
        1: ['paranormal', 'cyber_mysteries'],
        2: ['true_crime', 'conspiracy'],
        3: ['gov_experiments', 'psychology'],
        4: ['paranormal'],
        5: ['true_crime', 'conspiracy'],
        6: ['true_crime']
      };
      const themeCats = categoryMap[dayOfWeek] || [];
      let candidates = list.filter(s => themeCats.includes(s.category));
      if (candidates.length === 0) {
        candidates = list;
      }
      candidates.sort((a, b) => (a.story_id || '').localeCompare(b.story_id || ''));

      let hash = 0;
      for (let i = 0; i < dateStr.length; i++) {
        hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
      }
      hash = Math.abs(hash);

      selectedStory = candidates[hash % candidates.length];
    }
  } catch (err) {
    console.warn('[DailyDossier] Failed to load dynamic stories:', err.message);
  }

  const activeTheme = DAILY_THEMES[dayOfWeek];

  if (selectedStory) {
    const layers = typeof selectedStory.layers === 'string' ? JSON.parse(selectedStory.layers) : (selectedStory.layers || []);
    const theories = [];
    if (layers.length >= 7) {
      theories.push({ 
        name: layers[2].layer_name || 'Conspiracy Hypotheses', 
        explanation: layers[2].content ? (layers[2].content.split('\n\n')[0].substring(0, 180) + '...') : 'Classified records.' 
      });
      theories.push({ 
        name: layers[4].layer_name || 'Anomalous Evidence', 
        explanation: layers[4].content ? (layers[4].content.split('\n\n')[0].substring(0, 180) + '...') : 'Classified evidence.' 
      });
      theories.push({ 
        name: layers[6].layer_name || 'Forbidden Truth', 
        explanation: layers[6].content ? (layers[6].content.split('\n\n')[0].substring(0, 180) + '...') : 'Classified truth.' 
      });
    } else {
      theories.push({ name: 'Classified Records', explanation: selectedStory.hook || 'Access restricted.' });
    }

    return {
      title: selectedStory.title,
      year: selectedStory.added_date ? selectedStory.added_date.substring(0, 4) : 'Classified',
      text: selectedStory.hook || '',
      wikiQuery: selectedStory.image_query || selectedStory.title,
      theories,
      suspicionLabel: 'Dossier Threat Level',
      defaultSuspicion: 50 + ((selectedStory.title || '').length % 40),
      story_id: selectedStory.story_id,
      theme: activeTheme.name,
      wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(selectedStory.image_query || selectedStory.title)}`,
      wikiSummary: selectedStory.hook || '',
      thumbnail: selectedStory.hero_image || 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800'
    };
  }

  // Fallback to static fallback stories
  const fallback = { ...DAILY_STATIC_FALLBACKS[dayOfWeek] };
  return {
    ...fallback,
    theme: activeTheme.name,
    wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(fallback.wikiQuery || fallback.title)}`,
    wikiSummary: fallback.text,
    thumbnail: fallback.thumbnail || `https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=800`
  };
}

const wikiThumbnailCache = new Map();

async function getWikipediaThumbnail(query) {
  if (!query) return null;
  if (wikiThumbnailCache.has(query)) return wikiThumbnailCache.get(query);
  try {
    // 1. Try search API first to resolve capitalization/spelling mismatches
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 6.1; rv:2.2) Gecko/20110201' }
    });
    let resolvedTitle = query;
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData?.query?.search && searchData.query.search.length > 0) {
        resolvedTitle = searchData.query.search[0].title;
      }
    }
    
    // 2. Query Page Summary with the resolved title
    const formattedQuery = encodeURIComponent(resolvedTitle.trim().replace(/ /g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${formattedQuery}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 6.1; rv:2.2) Gecko/20110201' }
    });
    let imgUrl = null;
    if (res.ok) {
      const matched = await res.json();
      imgUrl = matched?.thumbnail?.source || null;
    }
    
    // Fallback directly to original query if resolved title fails or returns no image
    if (!imgUrl && resolvedTitle !== query) {
      const fallbackQuery = encodeURIComponent(query.trim().replace(/ /g, '_'));
      const fallbackRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${fallbackQuery}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 6.1; rv:2.2) Gecko/20110201' }
      });
      if (fallbackRes.ok) {
        const fallbackMatched = await fallbackRes.json();
        imgUrl = fallbackMatched?.thumbnail?.source || null;
      }
    }
    
    wikiThumbnailCache.set(query, imgUrl);
    return imgUrl;
  } catch (err) {
    console.warn(`[WikiCache] Failed to fetch Wikipedia thumbnail for "${query}":`, err.message);
    // Simple direct fallback as last resort
    try {
      const fallbackQuery = encodeURIComponent(query.trim().replace(/ /g, '_'));
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${fallbackQuery}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 6.1; rv:2.2) Gecko/20110201' }
      });
      if (res.ok) {
        const matched = await res.json();
        return matched?.thumbnail?.source || null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function getReactionsWithAiFallback(dateStr, title, category, year) {
  const existing = await db.getDailyReactions(dateStr);
  const total = (existing.intriguing || 0) + (existing.gripping || 0) + (existing.chilling || 0) + (existing.mind_blowing || 0);
  if (total > 0) {
    return existing;
  }

  const hash = dateStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + (title || '').length;
  
  const defaultReactions = {
    intriguing: 25 + (hash % 45),
    gripping: 18 + (hash % 35),
    chilling: (category === 'paranormal' || category === 'true_crime' || category.includes('horror') || category.includes('tragedy')) ? 30 + (hash % 50) : 2 + (hash % 8),
    mind_blowing: (category === 'psychology' || category === 'conspiracy' || category.includes('experiment')) ? 35 + (hash % 60) : 5 + (hash % 12)
  };

  await db.setDailyReactions(dateStr, defaultReactions);
  return defaultReactions;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const todayObj = new Date();
  const dateStr = todayObj.toLocaleDateString('en-CA');
  const dayOfWeek = todayObj.getDay();

  if (req.method === 'GET') {
    const dossier = await generateDailyDossier(dateStr, dayOfWeek);
    dossier.date = dateStr;

    try {
      const query = dossier.wikiQuery || dossier.title;
      const thumbnail = await getWikipediaThumbnail(query);
      if (thumbnail) {
        dossier.thumbnail = thumbnail;
      }
    } catch (err) {
      // Fallback is already set
    }

    try {
      const rx = await getReactionsWithAiFallback(dateStr, dossier.title, dossier.theme, dossier.year);
      dossier.reactions = {
        intriguing: rx.intriguing || 0,
        gripping: rx.gripping || 0,
        chilling: rx.chilling || 0,
        mind_blowing: rx.mind_blowing || 0,
        like: rx.intriguing || 0,
        scared: rx.chilling || 0,
        mindblown: rx.mind_blowing || 0
      };
    } catch (err) {
      dossier.reactions = { intriguing: 0, gripping: 0, chilling: 0, mind_blowing: 0, like: 0, scared: 0, mindblown: 0 };
    }

    return res.status(200).json(dossier);
  }

  if (req.method === 'POST') {
    try {
      const { reaction_type, undo, date, add_reaction, remove_reaction } = req.body || {};
      const targetDate = date || dateStr;
      let updated = false;

      if (add_reaction !== undefined || remove_reaction !== undefined) {
        if (remove_reaction) {
          await db.updateDailyReaction(targetDate, remove_reaction, true);
          updated = true;
        }
        if (add_reaction) {
          await db.updateDailyReaction(targetDate, add_reaction, false);
          updated = true;
        }
      } else if (reaction_type) {
        await db.updateDailyReaction(targetDate, reaction_type, !!undo);
        updated = true;
      }

      if (!updated) {
        return res.status(400).json({ error: 'Missing reaction parameters' });
      }

      const rx = await db.getDailyReactions(targetDate);
      return res.status(200).json({
        success: true,
        reactions: {
          intriguing: rx.intriguing || 0,
          gripping: rx.gripping || 0,
          chilling: rx.chilling || 0,
          mind_blowing: rx.mind_blowing || 0,
          like: rx.intriguing || 0,
          scared: rx.chilling || 0,
          mindblown: rx.mind_blowing || 0
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
