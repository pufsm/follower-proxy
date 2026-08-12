module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Extract clean username from URLs while preserving profile.php?id= links
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
    // 2. INSTAGRAM (Multi-tier bypass)
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

      // Tier 1: Imginn
      try {
        const res = await fetch(`https://imginn.com/${cleanHandle}/`, { headers: { 'User-Agent': browserUA } });
        if (res.ok) count = parseFollowers(await res.text());
      } catch (e) {}

      // Tier 2: DuckDuckGo Search Indexing
      if (!count) {
        try {
          const res = await fetch(`https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2F${cleanHandle}`, { headers: { 'User-Agent': browserUA } });
          if (res.ok) count = parseFollowers(await res.text());
        } catch (e) {}
      }

      // Tier 3: Picuki
      if (!count) {
        try {
          const res = await fetch(`https://www.picuki.com/profile/${cleanHandle}`, { headers: { 'User-Agent': browserUA } });
          if (res.ok) count = parseFollowers(await res.text());
        } catch (e) {}
      }

    // ==========================================
    // 3. FACEBOOK (3-Tier Bypass Engine)
    // ==========================================
    } else if (plat.includes('facebook')) {
      
      const parseFbFollowers = (htmlText) => {
        if (!htmlText) return null;

        // 1. Check meta tags for likes or followers
        const metaMatch = htmlText.match(/meta property="og:description" content="([^"]+)"/i) ||
                          htmlText.match(/meta name="description" content="([^"]+)"/i);
        if (metaMatch && metaMatch[1]) {
          const numMatch = metaMatch[1].match(/([0-9.,KMBkmb]+)\s*(?:likes|followers|people follow this|people like this)/i);
          if (numMatch && numMatch[1]) return numMatch[1];
        }

        // 2. Check JSON payload strings
        const jsonMatch = htmlText.match(/"follower_count":\s*(\d+)/) || 
                          htmlText.match(/"followers_count":\s*(\d+)/) ||
                          htmlText.match(/"subscriber_count":\s*(\d+)/) ||
                          htmlText.match(/"user_followers":\s*\{\s*"count":\s*(\d+)/);
        if (jsonMatch && jsonMatch[1]) return jsonMatch[1];

        // 3. General text match
        const textMatch = htmlText.match(/([0-9.,KMBkmb]+)\s*(?:followers|people follow this)/i);
        if (textMatch && textMatch[1]) return textMatch[1];

        return null;
      };

      let targetUrl = handle.trim();
      if (!targetUrl.startsWith('http')) {
        targetUrl = `https://www.facebook.com/${cleanHandle}`;
      }
      if (!targetUrl.includes('profile.php')) {
        targetUrl = targetUrl.split('?')[0];
      }

      // Tier 1: Desktop request with Bot User-Agent
      try {
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (response.ok) {
          count = parseFbFollowers(await response.text());
        }
      } catch (e) {}

      // Tier 2: Mobile Facebook (m.facebook.com)
      if (!count) {
        try {
          const mobileUrl = targetUrl.replace('www.facebook.com', 'm.facebook.com');
          const response = await fetch(mobileUrl, {
            headers: { 'User-Agent': browserUA, 'Accept-Language': 'en-US,en;q=0.9' }
          });
          if (response.ok) {
            count = parseFbFollowers(await response.text());
          }
        } catch (e) {}
      }

      // Tier 3: DuckDuckGo Search Indexing Fallback
      if (!count) {
        try {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=site%3Afacebook.com%2F${cleanHandle}`;
          const response = await fetch(ddgUrl, {
            headers: { 'User-Agent': browserUA }
          });
          if (response.ok) {
            count = parseFbFollowers(await response.text());
          }
        } catch (e) {}
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
