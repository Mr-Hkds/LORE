/**
 * Vercel Serverless Function: /api/recommendations
 * Uses GitHub Issues as a 100% free, zero-config global database.
 * Open issues with the 'recommendation' label represent pending topics.
 * Closed issues represent already generated topics.
 */
export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN;
  const repoOwner = 'Mr-Hkds';
  const repoName = 'LORE';

  if (!token) {
    console.error('GITHUB_TOKEN environment variable is missing.');
    return res.status(500).json({ error: 'GitHub API authentication token is missing. Please set GITHUB_TOKEN on Vercel.' });
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'LORE-App'
  };

  // Handle request methods
  if (req.method === 'GET') {
    try {
      const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues?labels=recommendation&state=all&per_page=100`, { headers });
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
      }
      const issues = await response.json();
      
      // Map GitHub issues to our recommendation format
      const recs = issues.map(issue => ({
        id: String(issue.number), // use issue number as the recommendation ID
        topic: issue.title,
        date: new Date(issue.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        status: issue.state === 'open' ? 'pending' : 'generated'
      }));

      return res.status(200).json(recs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { topic } = req.body || {};
      if (!topic) {
        return res.status(400).json({ error: 'Missing topic parameter' });
      }

      // Check if an issue already exists for this topic to avoid duplicates
      const checkRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues?labels=recommendation&state=all`, { headers });
      const allIssues = checkRes.ok ? await checkRes.json() : [];
      const existingIssue = allIssues.find(issue => issue.title.toLowerCase() === topic.toLowerCase());

      if (existingIssue) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          status: existingIssue.state === 'open' ? 'pending' : 'generated'
        });
      }

      if (!existingIssue) {
        const createRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: topic.trim(),
            body: `User recommendation submitted via LORE website.`,
            labels: ['recommendation']
          })
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Failed to create GitHub issue: ${createRes.status} - ${errText}`);
        }
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, status } = req.body || {};
      if (!id || !status) {
        return res.status(400).json({ error: 'Missing id or status' });
      }

      // Map 'generated' to 'closed' and 'pending' to 'open'
      const state = status === 'generated' ? 'closed' : 'open';

      const updateRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state })
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update GitHub issue: ${updateRes.status}`);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing id' });
      }

      // Close the issue as 'not_planned'
      const updateRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' })
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to delete GitHub issue: ${updateRes.status}`);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }


  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
