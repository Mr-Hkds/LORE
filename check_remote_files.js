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

async function checkRemoteFiles() {
  console.log('Checking remote files on GitHub for repository:', `${owner}/${repo}`);
  
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!res.ok) {
      console.error('Failed to fetch repo tree:', res.status, await res.text());
      return;
    }
    
    const data = await res.json();
    const files = data.tree.map(t => t.path);
    console.log('Files in remote repository:');
    files.forEach(f => {
      if (f.includes('config') || f.includes('stories')) {
        console.log(' -', f);
      }
    });
  } catch (err) {
    console.error('Error fetching tree:', err);
  }
}

checkRemoteFiles();
