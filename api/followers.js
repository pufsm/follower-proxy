module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Extract clean username from URLs
  function extractCleanHandle(input) {
    if (!input) return '';
    let str = input.trim();
    if (!str.includes('profile.php')) {
      str = str.split('?')[0].split('#')[0];
    }
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
    // 2. INSTAGRAM (3-Tier Bypass Engine)
    // ==========================================
    } else if (plat.includes('instagram')) {
      
      const parseFollowers = (text) => {
        if (!text) return null;
        const m1 = text.match(/([0-9.,KMBkmb]+)\s*Followers/i);
        if (m1 && m1[1]) return m1[1];
        const m2 = text.match(/Followers\s*:?\s*([0-9.,KMBkmb]+)/i);
        if (m2 && m2[1]) return m2[1];
        return null;
      };

      // Tier 1: Imginn Mirror
      try {
        const res = await fetch(`https://imginn.com/${cleanHandle}/`, {
          headers: { 'User-Agent': browserUA }
        });
        if (res.ok) {
          const html = await res.text();
          count = parseFollowers(html);
        }
      } catch (e) {}

      // Tier 2: DuckDuckGo Search Indexing (if Imginn fails)
      if (!count) {
        try {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2F${cleanHandle}`;
          const res = await fetch(ddgUrl, {
            headers: { 'User-Agent': browserUA }
          });
          if (res.ok) {
            const html = await res.text();
            count = parseFollowers(html);
          }
        } catch (e) {}
      }

      // Tier 3: Picuki Mirror (if both fail)
      if (!count) {
        try {
          const res = await fetch(`https://www.picuki.com/profile/${cleanHandle}`, {
            headers: { 'User-Agent': browserUA }
          });
          if (res.ok) {
            const html = await res.text();
            count = parseFollowers(html);
          }
        } catch (e) {}
      }

    // ==========================================
    // 3. FACEBOOK
    // ==========================================
    } else if (plat.includes('facebook')) {
      let targetUrl = handle.trim();
      
      if (!targetUrl.startsWith('http')) {
        targetUrl = `https://www.facebook.com/${cleanHandle}`;
      }

      if (!targetUrl.includes('profile.php')) {
        targetUrl = targetUrl.split('?')[0];
      }

      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const metaMatch = html.match(/meta property="og:description" content="([^"]+)"/i) ||
                        html.match(/meta name="description" content="([^"]+)"/i);

      if (metaMatch && metaMatch[1]) {
        const text = metaMatch[1];
        const numMatch = text.match(/([0-9.,KMBkmb]+)\s*(?:likes|followers|people follow this)/i);
        if (numMatch && numMatch[1]) {
          count = numMatch[1];
        }
      }

      if (!count) {
        const jsonMatch = html.match(/"follower_count":\s*(\d+)/) || 
                          html.match(/"followers_count":\s*(\d+)/) ||
                          html.match(/"subscriber_count":\s*(\d+)/);
        if (jsonMatch && jsonMatch[1]) {
          count = jsonMatch[1];
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
