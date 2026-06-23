/**
 * Vercel Serverless Function: /api/feedback
 * Uses GitHub Issues as a 100% free, zero-config global database.
 * Open issues with the 'feedback' label represent active user comments.
 * Closed issues represent addressed feedback items.
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

  // GET /api/feedback
  if (req.method === 'GET') {
    try {
      const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues?labels=feedback&state=all&per_page=100`, { headers });
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
      }
      const issues = await response.json();
      
      const feedbackItems = issues.map(issue => {
        const body = issue.body || '';
        const match = body.match(/```json\s*([\s\S]*?)\s*```/);
        let data = {};
        if (match) {
          try {
            data = JSON.parse(match[1]);
          } catch (e) {
            console.warn(`[Feedback API] Failed to parse JSON for issue #${issue.number}`);
          }
        }

        return {
          id: String(issue.number),
          rating: data.rating || (issue.title.match(/Rating:\s*(\d)/)?.[1] ? parseInt(issue.title.match(/Rating:\s*(\d)/)[1]) : 3),
          tags: data.tags || [],
          note: typeof data.note === 'string' ? data.note : (body || ''),
          timestamp: data.timestamp || issue.created_at,
          page: data.page || '/',
          addressed: issue.state === 'closed'
        };
      });

      return res.status(200).json(feedbackItems);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/feedback
  if (req.method === 'POST') {
    try {
      const { rating, tags, note, timestamp, page } = req.body || {};
      if (!rating) {
        return res.status(400).json({ error: 'Missing rating' });
      }

      const payload = {
        rating,
        tags: tags || [],
        note: note || '',
        timestamp: timestamp || new Date().toISOString(),
        page: page || '/'
      };

      const issueBody = `### ✦ LORE User Feedback

| Parameter | Value |
| --- | --- |
| **Rating** | ${rating} / 5 |
| **Tags** | ${(tags || []).join(', ') || '*None*'} |
| **Comment** | ${note ? `"${note}"` : '*None*'} |
| **Page** | \`${page || '/'}\` |
| **Timestamp** | ${payload.timestamp} |

---

#### Developer Data (JSON)
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
`;

      const createRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `[Feedback] Rating: ${rating}/5 - ${(tags || []).join(', ') || 'No Tags'}`,
          body: issueBody,
          labels: ['feedback']
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create GitHub issue: ${createRes.status} - ${errText}`);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH /api/feedback
  if (req.method === 'PATCH') {
    try {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing feedback ID (issue number)' });
      }

      // Fetch current issue state first
      const getRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${id}`, { headers });
      if (!getRes.ok) {
        throw new Error(`Failed to fetch issue details for #${id}`);
      }
      const issue = await getRes.json();
      
      // Toggle state: open <-> closed
      const newState = issue.state === 'closed' ? 'open' : 'closed';

      const updateRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state: newState })
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update issue #${id} to state ${newState}`);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/feedback
  if (req.method === 'DELETE') {
    try {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing feedback ID (issue number)' });
      }

      // Close the issue as 'not_planned'
      const updateRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' })
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to delete issue #${id}`);
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
