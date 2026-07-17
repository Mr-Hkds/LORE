import db from '../db.cjs';

export default async function handler(req, res) {
  const { story_id, layer } = req.query;
  const layerNum = parseInt(layer, 10) || 1;

  if (!story_id) {
    return res.redirect('/');
  }

  try {
    const story = await db.getStory(story_id);
    if (!story) {
      return res.redirect('/');
    }

    const title = story.title || 'Classified Dossier';
    const description = story.hook || 'Explore this classified archive file on SevenDescents.';
    
    // Resolve the absolute image URL and share URL dynamically using the request host
    const host = req.headers.host || 'sevendescents.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    let imageUrl = `${protocol}://${host}/og-preview.png`;
    if (story.hero_image) {
      if (story.hero_image.startsWith('http://') || story.hero_image.startsWith('https://')) {
        imageUrl = story.hero_image;
      } else {
        imageUrl = `${protocol}://${host}${story.hero_image.startsWith('/') ? '' : '/'}${story.hero_image}`;
      }
    }
    const shareUrl = `${protocol}://${host}/api/share?story_id=${encodeURIComponent(story_id)}&layer=${layerNum}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} | VII DESCENTS</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title} | VII DESCENTS">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:site_name" content="VII DESCENTS">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} | VII DESCENTS">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- Instant Client Redirect -->
  <script>
    window.location.href = "/#story-${story_id}-layer-${layerNum}";
  </script>
</head>
<body style="background-color: #0D0B08; color: #F5F2EB; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="text-align: center; padding: 20px;">
    <h2 style="font-style: italic; font-weight: normal; margin-bottom: 8px;">DECRYPTING DOSSIER...</h2>
    <p style="color: #A5A096; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;">Please wait while the rabbit hole compiles.</p>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Share endpoint error:', err);
    return res.redirect('/');
  }
}
