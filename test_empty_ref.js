/* global Buffer */
import fs from 'fs';
import path from 'path';

const configPath = path.resolve('config/admin_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

function xorObfuscate(str, key) {
  return Array.from(str).map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
}

function storedToToken(stored) {
  return xorObfuscate(Buffer.from(stored, 'base64').toString('binary'), '0407');
}

const token = storedToToken(config.tok);
const owner = config.owner;
const repo = config.repo;
const filePath = 'config/admin_config.json';

async function testEmptyRef() {
  console.log('--- Testing empty ref vs explicit ref ---');
  
  // 1. Fetch with ref=main
  const resMain = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=main&t=${Date.now()}`, {
    headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  console.log('Status with ref=main:', resMain.status);

  // 2. Fetch with ref= (empty)
  const resEmptyRef = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=&t=${Date.now()}`, {
    headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  console.log('Status with ref= (empty):', resEmptyRef.status);

  // 3. Fetch without ref parameter
  const resNoRef = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?t=${Date.now()}`, {
    headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  console.log('Status without ref parameter:', resNoRef.status);
}

testEmptyRef();
