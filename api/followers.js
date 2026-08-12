module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Clean username/URL extractor
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

  // Sanitizer: Ensures the count contains real numbers and strips accidental punctuation
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

      if (match && match[1]) rawCount = match[1];

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
    // 3. FACEBOOK (4-Tier Fallback including Search Indexing)
    // ==========================================
    } else if (plat.includes('facebook')) {
      
      const parseFbHTML = (htmlText) => {
        if (!htmlText) return null;

        // OG Description Tag Matcher
        const metaMatch = htmlText.match(/meta property="og:description" content="([^"]+)"/i) ||
                          htmlText.match(/meta name="description" content="([^"]+)"/i);
        if (metaMatch && metaMatch[1]) {
          const numMatch = metaMatch[1].match(/(\d[\d.,KMBkmb]*)\s*(?:likes|followers|people follow this|people like this|friends)/i);
          if (numMatch && numMatch[1]) return numMatch[1];
        }

        // JSON Payload Matcher
        const jsonMatch = htmlText.match(/"follower_count":\s*(\d+)/) || 
                          htmlText.match(/"followers_count":\s*(\d+)/) ||
                          htmlText.match(/"subscriber_count":\s*(\d+)/) ||
                          htmlText.match(/"friend_count":\s*(\d+)/) ||
                          htmlText.match(/"friends_count":\s*(\d+)/);
        if (jsonMatch && jsonMatch[1]) return jsonMatch[1];

        // General text pattern matcher
        const textMatch = htmlText.match(/(\d[\d.,KMBkmb]*)\s*(?:followers|people follow this|likes|friends)/i);
        if (textMatch && textMatch[1]) return textMatch[1];

        return null;
      };

      let fullUrl = handle.trim();
      if (!fullUrl.startsWith('http')) {
        fullUrl = `https://www.facebook.com/${cleanHandle}`;
      }

      // Tier 1: Direct Facebook fetch via Bot Header
      try {
        const response = await fetch(fullUrl, {
          headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (response.ok) rawCount = parseFbHTML(await response.text());
      } catch (e) {}

      // Tier 2: Facebook Page Plugin Iframe
      if (!rawCount) {
        try {
          const pluginUrl = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(fullUrl)}&tabs=timeline`;
          const response = await fetch(pluginUrl, {
            headers: { 'User-Agent': browserUA, 'Accept-Language': 'en-US,en;q=0.9' }
          });
          if (response.ok) rawCount = parseFbHTML(await response.text());
        } catch (e) {}
      }

      // Tier 3: Search Indexing Fallback (For profiles hiding stats behind "Join Facebook")
      if (!rawCount) {
        try {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=site%3Afacebook.com%2F${cleanHandle}`;
          const response = await fetch(ddgUrl, {
            headers: { 'User-Agent': browserUA }
          });
          if (response.ok) rawCount = parseFbHTML(await response.text());
        } catch (e) {}
      }
    }

    // Final clean check
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
