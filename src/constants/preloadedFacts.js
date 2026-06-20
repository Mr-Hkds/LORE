export const TOPIC_FACTS = {
  'psychology': [
    "Kya tumhe pata hai? The brain often hallucinates shadows in the dark just to keep you alert. Woh bas tumhara dimag tha... ya shayad nahi.",
    "Jab tum akele hote ho aur lagta hai koi dekh raha hai, it's an evolutionary instinct. Millions of years ago, hum shikar the. Aaj kaun shikar kar raha hai?",
    "Socho agar kal subah tum utho aur tumhari ek memory missing ho. Tumhe kaise pata chalega ki woh kabhi thi bhi?",
    "Har raat tum 2 ghante dekhte ho aisi duniya jo exist nahi karti (dreams). Aur jab uthte ho, you accept this one as real.",
    "Psychological conditioning se kisi ko bhi murder karne pe majboor kiya jaa sakta hai. Tumhara breakpoint kya hai?"
  ],
  'mythology': [
    "Kya tum jaante ho? Puranon mein varnit 'Asuras' hamesha evil nahi the. Kai baar Devtaon ne apne ego ke liye unhe punish kiya.",
    "Angkor Wat ke reliefs mein 'Churning of the Ocean' (Samudra Manthan) dikhaya gaya hai. Par socho, kya woh ocean ke andar ki cheezein sach mein baahar nikal aayi hain?",
    "Rigveda mein varnit 'Tamas' (darkness) ko creation se pehle ka state bataya gaya hai. Dark is not the opposite of light; it is the default state.",
    "Ganga ke niche forgotten ancient temples aur structures mile hain. Un rituals ke symbols kya keh rahe hain, humne kabhi decode nahi kiya.",
    "Mahabharat ke description ke anusar, Brahmashira Astra se poore biological environments tabah ho jate the. Socho, kya ancient nuclear warfare sach mein hua tha?"
  ],
  'true-crime': [
    "Burari case mein sabse scary part the pipes nahi the. Sabse scary part tha ki 11 log ek saath ek shared delusion pe believe kar sakte hain. Tum kis pe believe karte ho?",
    "Stoneman serial killer case mein, victims ko tab mara gaya jab woh so rahe the. Sleep is the most vulnerable state. Are you sure you are safe tonight?",
    "Nithari case ke uncovered skeletal remains ne yeh proof kiya ki monsters live among us, looking like ordinary neighbors. Tumhara neighbor kaun hai?",
    "Cybercrime reports dikhati hain ki webcam hacking ke 92% cases mein user ko pata bhi nahi chalta ki unhe koi live dekh raha hai.",
    "Indian judicial files ke mutabiq, serial crime ke cases mein killers aksar police ke investigation groups ko follow kar rahe hote hain."
  ],
  'gov-experiments': [
    "Duniya ki 90% digital information pichle 2 saal mein generate hui hai. Tumhara har ek secret ek server pe baitha hai.",
    "Internet ka 96% deep web hai. Tum bas surface pe tair rahe ho. Niche kya hai, kisi ko nahi pata.",
    "Cold War ke dauran, intelligence departments ne drugs aur conditioning ke jariye human minds control karne ke liye 'Project MKUltra' chalaaya tha.",
    "Classified documents prove that bio-hazard testing was carried out in remote Indian borders during the late 60s, hiding under weather research.",
    "Signal intercepts dikhate hain ki kai inactive satellite frequencies aaj bhi encrypted data relay kar rahi hain. Kis program ke liye?"
  ],
  'paranormal-reports': [
    "Sleep paralysis mein dikhne wala 'Hat Man' globally logo ko dikhta hai, across different cultures. Ek shared hallucination... ya kuch aur?",
    "Awaaz record karte waqt jo 'white noise' aata hai... kuch researchers mante hain it's the frequency of things we can't see.",
    "Indian highway cases mein 'ghost riders' aur roadside entities ke claims aksar driver hallucinations nahi hote. Multiple witnesses same description dete hain.",
    "Kuldhara village ek hi raat mein poora khali ho gaya tha. Local folklore kehta hai wahan ek curse hai. Par real logs khali hone ki alag hi vajah hint karte hain.",
    "Voice electronic phenomenon (EVP) recordings mein aksar aisi aawazein aati hain jo background hum ya ambient sounds se match nahi karti."
  ]
};

export function getRandomFact(topicId) {
  const list = TOPIC_FACTS[topicId] || TOPIC_FACTS['psychology'];
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}
