module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Clean handle extractor: Strips out query params like ?is_from_webapp=1
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

  // Sanitizer: Validates that the result contains actual numbers
  function validateAndCleanCount(val) {
    if (!val) return null;
    let str = val.toString().trim();
    str = str.replace(/^[^0-9]+|[^0-9KMBkmb]+$/g, '').trim();
    if (!/\d/.test(str)) return null;
    return str;
  }

  const cleanHandle = extractCleanHandle(handle);
  const plat = platform.toLowerCase().trim();

  const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const fbBotUA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

  try {
    let rawCount = null;

    // ==========================================
    // 1. TIKTOK (Multi-Tier Parser with Index Fallback)
    // ==========================================
    if (plat.includes('tiktok')) {
      
      const parseTikTokHTML = (htmlText) => {
        if (!htmlText) return null;

        // 1. Extract from JSON web payloads (followerCount, fansCount, stats)
        const jsonMatch = 
          htmlText.match(/"followerCount":\s*(\d+)/) ||
          htmlText.match(/"followersCount":\s*(\d+)/) ||
          htmlText.match(/"fansCount":\s*(\d+)/) ||
          htmlText.match(/"fans":\s*(\d+)/) ||
          htmlText.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/) ||
          htmlText.match(/followerCount":(\d+)/);

        if (jsonMatch && jsonMatch[1]) return jsonMatch[1];

        // 2. Extract from Meta tags
        const metaMatch = htmlText.match(/meta property="og:description" content="([^"]+)"/i) ||
                          htmlText.match(/meta name="description" content="([^"]+)"/i);
        if (metaMatch && metaMatch[1]) {
          const numMatch = metaMatch[1].match(/([0-9.,KMBkmb]+)\s*(?:Followers|Fans)/i);
          if (numMatch && numMatch[1]) return numMatch[1];
        }

        // 3. General regex match
        const genMatch = htmlText.match(/([0-9.,KMBkmb]+)\s*(?:Followers|Fans)/i);
        if (genMatch && genMatch[1]) return genMatch[1];

        return null;
      };

      // Tier 1: Direct TikTok page request
      try {
        const url = `https://www.tiktok.com/@${cleanHandle}`;
        const response = await fetch(url, {
          headers: { 
            'User-Agent': browserUA, 
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        if (response.ok) {
          rawCount = parseTikTokHTML(await response.text());
        }
      } catch (e) {}

      // Tier 2: Search Indexing Fallback (If TikTok limits Vercel IP)
      if (!rawCount) {
        try {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=site%3Atiktok.com%2F%40${cleanHandle}`;
          const response = await fetch(ddgUrl, {
            headers: { 'User-Agent': browserUA }
          });
          if (response.ok) {
            rawCount = parseTikTokHTML(await response.text());
          }
        } catch (e) {}
      }

    // ==========================================
    // 2. INSTAGRAM
    // ==========================================
    } else if (plat.includes('instagram')) {
      const parseFollowers = (text) => {
        if (!text) return null;
        const m1 = text.match(/([0-9.,KMBkmb]+\s*Followers)/i);
        if (m1 && m1[1]) return m1[1].replace(/Followers/i, '');
        const m2 = text.match(/(Followers\s*:?\s*[0-9.,KMBkmb]+)/i);
        if (m2 && m2[1]) return m2[1].replace(/Followers\s*:?/i, '');
        return null;
      };

      try {
        const res = await fetch(`https://imginn.com/${cleanHandle}/`, { headers: { 'User-Agent': browserUA } });
        if (res.ok) rawCount = parseFollowers(await res.text());
      } catch (e) {}

      if (!rawCount) {
        try {
          const res = await fetch(`https://www.picuki.com/profile/${cleanHandle}`, { headers: { 'User-Agent': browserUA } });
          if (res.ok) rawCount = parseFollowers(await res.text());
        } catch (e) {}
      }

    // ==========================================
    // 3. FACEBOOK
    // ==========================================
    } else if (plat.includes('facebook')) {
      
      const parseFbHTML = (htmlText) => {
        if (!htmlText) return null;

        const metaMatch = htmlText.match(/meta property="og:description" content="([^"]+)"/i) ||
                          htmlText.match(/meta name="description" content="([^"]+)"/i);
        if (metaMatch && metaMatch[1]) {
          const numMatch = metaMatch[1].match(/(\d[\d.,KMBkmb]*)\s*(?:likes|followers|people follow this|people like this|friends)/i);
          if (numMatch && numMatch[1]) return numMatch[1];
        }

        const jsonMatch = htmlText.match(/"follower_count":\s*(\d+)/) || 
                          htmlText.match(/"followers_count":\s*(\d+)/) ||
                          htmlText.match(/"subscriber_count":\s*(\d+)/) ||
                          htmlText.match(/"friend_count":\s*(\d+)/) ||
                          htmlText.match(/"friends_count":\s*(\d+)/);
        if (jsonMatch && jsonMatch[1]) return jsonMatch[1];

        return null;
      };

      let fullUrl = handle.trim();
      if (!fullUrl.startsWith('http')) {
        fullUrl = `https://www.facebook.com/${cleanHandle}`;
      }

      try {
        const response = await fetch(fullUrl, {
          headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (response.ok) rawCount = parseFbHTML(await response.text());
      } catch (e) {}

      if (!rawCount) {
        try {
          const pluginUrl = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(fullUrl)}&tabs=timeline`;
          const response = await fetch(pluginUrl, {
            headers: { 'User-Agent': browserUA, 'Accept-Language': 'en-US,en;q=0.9' }
          });
          if (response.ok) rawCount = parseFbHTML(await response.text());
        } catch (e) {}
      }
    }

    // Validate and clean extracted result
    const finalCount = validateAndCleanCount(rawCount);

    if (finalCount !== null) {
      return res.status(200).json({ success: true, platform: plat, handle: cleanHandle, followers: finalCount });
    } else {
      return res.status(404).json({ success: false, error: `Pattern not found for ${platform}.` });
    }

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
