const fs = require('fs');
let c = fs.readFileSync('generate_stories.cjs', 'utf-8');
c = c.replace(/image_query:\s*["']https:\/\/static\.india\.com[^"']*["']/g, 'image_query: "/content/images/burari_family.jpg"');
c = c.replace(/image_query:\s*["']https:\/\/pbs\.twimg\.com[^"']*["']/g, 'image_query: "/content/images/pipes_toi.jpg"');
c = c.replace(/image_query:\s*["']https:\/\/static\.toiimg\.com[^"']*["']/g, 'image_query: "/content/images/burari_diary.jpg"');
fs.writeFileSync('generate_stories.cjs', c);
console.log('Replaced local image URLs in generate_stories.cjs');
