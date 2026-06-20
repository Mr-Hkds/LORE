const fs = require('fs');
let c = fs.readFileSync('generate_stories.cjs', 'utf-8');
c = c.replace(/image_query:\s*["']\/content\/images\/burari_diary\.jpg["']/g, 'image_query: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Old_book_bindings.jpg/800px-Old_book_bindings.jpg"');
fs.writeFileSync('generate_stories.cjs', c);
console.log('Replaced diary image URL with Wikipedia URL');
