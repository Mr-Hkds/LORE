import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { storyId, filename, base64Data } = req.body || {};
    if (!filename || !base64Data) {
      return res.status(400).json({ error: 'Missing filename or base64Data' });
    }

    // Since Vercel is read-only, we check Vercel environment
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      return res.status(200).json({ success: true, path: null });
    }

    const folderName = storyId || 'general';
    const storyImagesDir = path.join(__dirname, '..', 'public', 'content', 'images', folderName);
    if (!fs.existsSync(storyImagesDir)) {
      fs.mkdirSync(storyImagesDir, { recursive: true });
    }

    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    
    const localPath = path.join(storyImagesDir, filename);
    fs.writeFileSync(localPath, buffer);

    const relativePath = `/content/images/${folderName}/${filename}`;
    return res.status(200).json({ success: true, path: relativePath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
