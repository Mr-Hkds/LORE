import fs from 'fs';
import path from 'path';

// Read .env file manually
const envPath = path.resolve('.env');
let apiKey = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/VITE_GEMINI_API_KEY\s*=\s*([^\s#]+)/);
  if (match) {
    apiKey = match[1];
  }
}

console.log('Using API key (first 8 chars):', apiKey.slice(0, 8) + '...');
if (!apiKey) {
  console.error('No API key found in .env');
  process.exit(1);
}

const modelsToTry = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

async function testModel(model) {
  console.log(`Testing model: ${model}...`);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello, respond with exactly "OK"' }]
        }]
      })
    });

    const status = res.status;
    const text = await res.text();
    console.log(`Status: ${status}`);
    console.log(`Response: ${text.slice(0, 500)}`);
    console.log('--------------------------------------------------');
    return res.ok;
  } catch (error) {
    console.error(`Error with ${model}:`, error);
    console.log('--------------------------------------------------');
    return false;
  }
}

(async () => {
  for (const model of modelsToTry) {
    const success = await testModel(model);
    if (success) {
      console.log(`SUCCESS with model: ${model}`);
    }
  }
})();
