module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Extracts clean username from full links (e.g. 'https://www.instagram.com/nike/' -> 'nike')
  function extractCleanHandle(input) {
    if (!input) return '';
    let str = input.trim();
    str = str.split('?')[0].split('#')[0];
    str = str.replace(/\/+$/, '');
    const parts = str.split('/');
    let last = parts[parts.length - 1];
    return last.replace(/^@/, '').trim();
  }

  const cleanHandle = extractCleanHandle(handle);
  const plat = platform.toLowerCase().trim();

  const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const fbBotUA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

  try {
    let count = null;

    // ==========================================
    // 1. TIKTOK
    // ==========================================
    if (plat.includes('tiktok')) {
      const url = `https://www.tiktok.com/@${cleanHandle}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': browserUA, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const match = 
        html.match(/"followerCount":\s*(\d+)/) ||
        html.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/) ||
        html.match(/followerCount":(\d+)/) ||
        html.match(/([0-9.,KMBkmb]+)\s*Followers/i);

      if (match && match[1]) count = match[1];

    // ==========================================
    // 2. INSTAGRAM (App-ID Header Query)
    // ==========================================
    } else if (plat.includes('instagram')) {
      // Query Instagram's native internal API using the official web App-ID
      try {
        const apiUrl = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${cleanHandle}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent': browserUA,
            'x-ig-app-id': '936619743392459',
            'Accept': '*/*'
          }
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json?.data?.user?.edge_followed_by?.count !== undefined) {
            count = json.data.user.edge_followed_by.count;
          }
        }
      } catch (e) {}

      // Backup: OpenGraph metadata parser
      if (!count) {
        try {
          const res = await fetch(`https://www.instagram.com/${cleanHandle}/`, {
            headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
          });
          const html = await res.text();
          const match = html.match(/meta property="og:description" content="([^"]+)"/i) ||
                        html.match(/meta name="description" content="([^"]+)"/i);
          if (match && match[1]) {
            const numMatch = match[1].match(/([0-9.,KMBkmb]+)\s*Followers/i);
            if (numMatch && numMatch[1]) count = numMatch[1];
          }
        } catch (e) {}
      }

    // ==========================================
    // 3. FACEBOOK (Extracts ONLY clean numbers)
    // ==========================================
    } else if (plat.includes('facebook')) {
      let targetUrl = handle.startsWith('http') ? handle : `https://www.facebook.com/${cleanHandle}`;
      targetUrl = targetUrl.split('?')[0];

      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const match = html.match(/meta property="og:description" content="([^"]+)"/i) ||
                    html.match(/meta name="description" content="([^"]+)"/i);

      if (match && match[1]) {
        const text = match[1];
        // Extracts digits right before "likes", "followers", or "people follow this"
        const numMatch = text.match(/([0-9.,KMBkmb]+)\s*(?:likes|followers|people follow this)/i);
        if (numMatch && numMatch[1]) {
          count = numMatch[1];
        }
      }
    }

    if (count !== null) {
      return res.status(200).json({ success: true, platform: plat, handle: cleanHandle, followers: count });
    } else {
      return res.status(404).json({ success: false, error: `Pattern not found for ${platform}.` });
    }

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
