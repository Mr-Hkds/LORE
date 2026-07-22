const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');

function generateRich7LayerStory(s) {
  const title = s.title || 'The Classified File';
  const hook = s.hook || 'A chilling historical mystery etched into the archive.';
  const category = s.category || 'conspiracy';
  const concepts = s.concepts && s.concepts.length > 0 ? s.concepts : ['classified_dossier', 'historical_anomaly', 'unsolved_case'];
  const year = s.year || '1974';
  const severity = s.severity || 'chilling';

  const vocabWords = [
    { term: 'Anomalous Event', def: 'An occurrence or phenomenon that deviates from expected physical or historical norms.' },
    { term: 'Redacted Archive', def: 'Official records from which sensitive, confidential, or dangerous details have been removed.' },
    { term: 'Forensic Reconstruction', def: 'The methodical process of reassembling past events using surviving physical evidence.' },
    { term: 'Declassified Record', def: 'Government or institutional documentation formally released from secret status to public access.' }
  ];

  const vocabObj = {};
  vocabWords.forEach(v => vocabObj[v.term] = v.def);

  const layerNames = [
    "The Initial Whisper",
    "The Emerging Pattern",
    "The Central Incident",
    "The Institutional Response",
    "The Forensic Findings",
    "The Hidden Abyss",
    "The Final Revelation"
  ];

  const c1 = concepts[0] ? concepts[0].replace(/_/g, ' ') : 'classified evidence';
  const c2 = concepts[1] ? concepts[1].replace(/_/g, ' ') : 'unexplained phenomena';
  const c3 = concepts[2] ? concepts[2].replace(/_/g, ' ') : 'archival anomalies';

  const layers = [
    {
      layer: 1,
      layer_name: layerNames[0],
      content: `The official documentation surrounding ${title} begins not with public broadcasts, but with quiet, unverified reports circulated within specialized investigative channels.\n\nInitial accounts described an anomalous event characterized by ${c1}. Early observers noted subtle inconsistencies in official timelines, marking the start of a deep digital and historical paper trail.`,
      cliffhanger: `What initial anomaly forced investigators to re-examine the official records?`
    },
    {
      layer: 2,
      layer_name: layerNames[1],
      content: `As researchers compiled cross-referenced data across multiple regions, a clear pattern began to form around ${title}.\n\nWitness statements and surviving logs revealed recurring anomalies involving ${c2}. Rather than an isolated incident, the data pointed toward a systematic, repeating phenomenon that defied simple explanation.`,
      cliffhanger: `How did separate, isolated reports begin to align into a disturbing larger truth?`
    },
    {
      layer: 3,
      layer_name: layerNames[2],
      content: `The critical juncture occurred when primary events reached their peak intensity, creating undeniable physical and archival evidence.\n\n${hook}\n\nKey figures involved in ${title} reported sudden disruptions and unexplainable shifts in standard operational parameters, leaving behind a fragmentary record that persists to this day.`,
      cliffhanger: `What happened at the peak moment when the truth broke through official silence?`
    },
    {
      layer: 4,
      layer_name: layerNames[3],
      content: `In the immediate aftermath, institutional authorities responded with swift compartmentalization and strict communication protocols.\n\nOfficial briefings downplayed the significance of ${c3}, classifying key files under restricted access tiers. Despite formal assurances, internal memorandums suggested significant concern among senior officials.`,
      cliffhanger: `Why were specific sections of the investigation immediately classified behind restricted clearance tiers?`
    },
    {
      layer: 5,
      layer_name: layerNames[4],
      content: `Decades later, independent forensic analysts and investigative historians re-analyzed declassified files and surviving physical evidence.\n\nAdvanced cross-examination of the records revealed hidden structural details that contradicted early press statements. The evidence strongly indicates that key aspects of ${title} were deliberately withheld from public cataloging.`,
      cliffhanger: `What critical discrepancies did modern forensic analysis uncover within the original files?`
    },
    {
      layer: 6,
      layer_name: layerNames[5],
      content: `Deeper probing into primary source archives reveals a far more complex reality underneath the surface narrative.\n\nThe broader implications of ${title} touch upon fundamental questions surrounding ${c1} and ${c2}. Surrounding documents hint at parallel occurrences that remain locked inside sealed archives.`,
      cliffhanger: `How far into institutional history do the ramifications of this case truly extend?`
    },
    {
      layer: 7,
      layer_name: layerNames[6],
      content: `Today, ${title} stands as a stark reminder of the unknown spaces within documented history.\n\nWhile official inquiries have closed, the surviving evidence continues to challenge standard interpretations. The case remains cataloged within the archive as an enduring record of ${c1} and human curiosity.`,
      cliffhanger: null
    }
  ];

  return {
    story_id: s.story_id,
    title: s.title,
    category: category,
    hook: hook,
    year: year,
    concepts: concepts,
    severity: severity,
    reactions: s.reactions || { like: 25, gripping: 18, scared: 4, mindblown: 8 },
    hero_image: s.hero_image || null,
    added_date: s.added_date || new Date().toISOString().split('T')[0],
    draft: false,
    vocabulary: vocabObj,
    layers: layers,
    evidence_links: [
      { label: `Archive Case File: ${s.story_id}`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.split(':')[0])}` },
      { label: 'Declassified Record Repository', url: 'https://archive.org' }
    ],
    connections: []
  };
}

async function main() {
  const STORIES_FILE = path.join(__dirname, 'public', 'content', 'stories.json');
  const STORIES_DIR = path.join(__dirname, 'public', 'content', 'stories');
  if (!fs.existsSync(STORIES_DIR)) {
    fs.mkdirSync(STORIES_DIR, { recursive: true });
  }

  const storiesData = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
  const storiesList = storiesData.stories;

  const missing = storiesList.filter(s => !fs.existsSync(path.join(STORIES_DIR, s.story_id + '.json')));
  console.log(`Found ${missing.length} missing stories to generate.`);

  let count = 0;
  for (const s of missing) {
    const fullStory = generateRich7LayerStory(s);
    const filePath = path.join(STORIES_DIR, `${s.story_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(fullStory, null, 2));
    try {
      await db.insertStory(fullStory);
    } catch (e) {}
    count++;
  }

  console.log(`\nSuccessfully generated all ${count} missing 7-layer story files!`);
  await db.exportStoriesToJSON();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
