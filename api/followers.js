module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
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
    // 1. TIKTOK
    // ==========================================
    if (plat.includes('tiktok')) {
      try {
        const apiUrl = `https://www.tiktok.com/api/user/detail/?uniqueId=${encodeURIComponent(cleanHandle)}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent': browserUA,
            'Accept': 'application/json',
            'Referer': `https://www.tiktok.com/@${cleanHandle}`
          }
        });
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          if (apiJson?.userInfo?.stats?.followerCount !== undefined) {
            rawCount = apiJson.userInfo.stats.followerCount;
          }
        }
      } catch (e) {}

      if (!rawCount) {
        let targetUrl = handle.trim();
        if (!targetUrl.startsWith('http')) {
          targetUrl = `https://www.tiktok.com/@${cleanHandle}`;
        }

        try {
          const response = await fetch(targetUrl, {
            headers: { 'User-Agent': browserUA, 'Accept-Language': 'en-US,en;q=0.9' },
            redirect: 'follow'
          });

          if (response.url && response.url.includes('/@')) {
            cleanHandle = cleanHandleFromUrl(response.url);
          }

          const html = await response.text();
          const match = 
            html.match(/"followerCount":\s*(\d+)/) ||
            html.match(/"followersCount":\s*(\d+)/) ||
            html.match(/"fansCount":\s*(\d+)/) ||
            html.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/) ||
            html.match(/([0-9.,KMBkmb]+)\s*Followers/i);

          if (match && match[1]) rawCount = match[1];
        } catch (e) {}
      }

    // ==========================================
    // 2. INSTAGRAM (Search Snippet Parsing Engine)
    // ==========================================
    } else if (plat.includes('instagram')) {

      const parseSnippet = (text) => {
        if (!text) return null;
        // Matches "15.2K Followers", "15K followers", "15,200 Followers"
        const m1 = text.match(/([0-9.,KMBkmb]+)\s*Followers/i);
        if (m1 && m1[1]) return m1[1];
        const m2 = text.match(/Followers\s*:?\s*([0-9.,KMBkmb]+)/i);
        if (m2 && m2[1]) return m2[1];
        return null;
      };

      // Tier 1: DuckDuckGo Search Index
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2F${encodeURIComponent(cleanHandle)}`;
        const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': browserUA } });
        if (ddgRes.ok) {
          rawCount = parseSnippet(await ddgRes.text());
        }
      } catch (e) {}

      // Tier 2: Imginn Web Mirror
      if (!rawCount) {
        try {
          const res = await fetch(`https://imginn.com/${cleanHandle}/`, { headers: { 'User-Agent': browserUA } });
          if (res.ok) rawCount = parseSnippet(await res.text());
        } catch (e) {}
      }

      // Tier 3: Picuki Web Mirror
      if (!rawCount) {
        try {
          const res = await fetch(`https://www.picuki.com/profile/${cleanHandle}`, { headers: { 'User-Agent': browserUA } });
          if (res.ok) rawCount = parseSnippet(await res.text());
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
          const numMatch = metaMatch[1].match(/(\d[\d.,KMBkmb]*)\s*(?:likes|followers|people follow this|people like this|friends|members)/i);
          if (numMatch && numMatch[1]) return numMatch[1];
        }

        const jsonMatch = htmlText.match(/"follower_count":\s*(\d+)/) || 
                          htmlText.match(/"followers_count":\s*(\d+)/) ||
                          htmlText.match(/"subscriber_count":\s*(\d+)/) ||
                          htmlText.match(/"friend_count":\s*(\d+)/) ||
                          htmlText.match(/"group_member_count":\s*(\d+)/);
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
          const ddgUrl = `https://html.duckduckgo.com/html/?q=site%3Afacebook.com%2F${encodeURIComponent(cleanHandle)}`;
          const response = await fetch(ddgUrl, { headers: { 'User-Agent': browserUA } });
          if (response.ok) rawCount = parseFbHTML(await response.text());
        } catch (e) {}
      }
    }

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
