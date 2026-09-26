module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
  const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const fbBotUA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

  function cleanHandleFromUrl(urlStr) {
    if (!urlStr) return '';
    let str = urlStr.trim();
    if (str.includes('/groups/')) {
      let match = str.match(/groups\/([^\/\?#]+)/);
      if (match && match[1]) return 'groups/' + match[1];
    }
    if (str.includes('/communities/')) {
      let match = str.match(/communities\/([^\/\?#]+)/);
      if (match && match[1]) return 'communities/' + match[1];
    }
    if (!str.includes('profile.php')) {
      str = str.split('?')[0].split('#')[0];
    }
    str = str.replace(/\/+$/, '');
    const parts = str.split('/');
    let last = parts[parts.length - 1];
    return last.replace(/^@/, '').trim();
  }

  function validateAndCleanCount(val) {
    if (val === null || val === undefined) return null;
    let str = val.toString().trim();
    str = str.replace(/^[^0-9]+|[^0-9KMBkmb]+$/g, '').trim();
    if (!/\d/.test(str)) return null;
    return str;
  }

  let cleanHandle = cleanHandleFromUrl(handle);
  const plat = platform.toLowerCase().trim();

  try {
    let rawCount = null;

    // ==========================================
    // 1. TIKTOK (API First -> HTML Fallback)
    // ==========================================
    if (plat.includes('tiktok')) {
      // Try Internal API First
      try {
        const apiRes = await fetch(`https://www.tiktok.com/api/user/detail/?uniqueId=${encodeURIComponent(cleanHandle)}`, {
          headers: { 'User-Agent': desktopUA, 'Referer': `https://www.tiktok.com/@${cleanHandle}` }
        });
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          if (apiJson?.userInfo?.stats?.followerCount !== undefined) {
            rawCount = apiJson.userInfo.stats.followerCount;
          }
        }
      } catch (e) {}

      // Fallback to HTML Scraping
      if (!rawCount) {
        try {
          const response = await fetch(`https://www.tiktok.com/@${cleanHandle}`, {
            headers: { 'User-Agent': desktopUA, 'Accept-Language': 'en-US,en;q=0.9' },
            redirect: 'follow'
          });
          const html = await response.text();
          const match = 
            html.match(/"followerCount":\s*(\d+)/) ||
            html.match(/"fansCount":\s*(\d+)/) ||
            html.match(/follower-count[^>]*>([0-9.,KMBkmb]+)</i) ||
            html.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/);

          if (match && match[1]) rawCount = match[1];
        } catch (e) {}
      }

    // ==========================================
    // 2. INSTAGRAM (Search Index + Mirror Rotation)
    // ==========================================
    } else if (plat.includes('instagram')) {
      const parseSnippet = (text) => {
        if (!text) return null;
        const m1 = text.match(/([0-9.,KMBkmb]+)\s*Followers/i);
        if (m1 && m1[1]) return m1[1];
        const m2 = text.match(/Followers\s*:?\s*([0-9.,KMBkmb]+)/i);
        if (m2 && m2[1]) return m2[1];
        return null;
      };

      // 1. Try DuckDuckGo Index First
      try {
        const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2F${encodeURIComponent(cleanHandle)}`, { 
          headers: { 'User-Agent': desktopUA } 
        });
        if (ddgRes.ok) rawCount = parseSnippet(await ddgRes.text());
      } catch (e) {}

      // 2. Try Mirrors Array
      if (!rawCount) {
        const mirrors = [
          `https://imginn.com/${cleanHandle}/`,
          `https://dumpoir.com/v/${cleanHandle}`,
          `https://www.picuki.com/profile/${cleanHandle}`
        ];

        for (let url of mirrors) {
          if (rawCount) break;
          try {
            const res = await fetch(url, { headers: { 'User-Agent': desktopUA } });
            if (res.ok) rawCount = parseSnippet(await res.text());
          } catch (e) { continue; }
        }
      }

    // ==========================================
    // 3. FACEBOOK (Mobile + OpenGraph Fallback)
    // ==========================================
    } else if (plat.includes('facebook')) {
      const parseFbText = (htmlText) => {
        if (!htmlText) return null;
        const metaMatch = htmlText.match(/meta property="og:description" content="([^"]+)"/i) ||
                          htmlText.match(/meta name="description" content="([^"]+)"/i);
        if (metaMatch && metaMatch[1]) {
          const numMatch = metaMatch[1].match(/(\d[\d.,KMBkmb]*)\s*(?:likes|followers|people follow this|people like this|friends|members)/i);
          if (numMatch && numMatch[1]) return numMatch[1];
        }
        const match = htmlText.match(/([0-9.,KMBkmb]+)\s*followers/i) ||
                      htmlText.match(/([0-9.,KMBkmb]+)\s*people follow this/i) ||
                      htmlText.match(/([0-9.,KMBkmb]+)\s*likes/i) ||
                      htmlText.match(/"follower_count":\s*(\d+)/);
        if (match && match[1]) return match[1];
        return null;
      };

      // Try Mobile View
      try {
        const response = await fetch(`https://m.facebook.com/${cleanHandle}`, {
          headers: { 'User-Agent': mobileUA, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (response.ok) rawCount = parseFbText(await response.text());
      } catch (e) {}

      // Try Open Graph Crawler View if Mobile Fails
      if (!rawCount) {
        try {
          const response = await fetch(`https://www.facebook.com/${cleanHandle}`, {
            headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
          });
          if (response.ok) rawCount = parseFbText(await response.text());
        } catch (e) {}
      }
    }

    // ==========================================
    // FINAL VALIDATION & RETURN
    // ==========================================
    const finalCount = validateAndCleanCount(rawCount);

   // AFTER
if (finalCount !== null) {
  return res.status(200).json({ success: true, platform: plat, handle: cleanHandle, followers: finalCount });
} else {
  return res.status(200).json({ success: false, error: `Pattern not found for ${platform}.` });
}

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
