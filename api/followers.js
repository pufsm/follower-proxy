module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Smart URL Cleaner
  function extractCleanHandle(input) {
    if (!input) return '';
    let str = input.trim();
    // Do NOT strip query params if it's a Facebook profile ID link
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
    // 2. INSTAGRAM
    // ==========================================
    } else if (plat.includes('instagram')) {
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
    // 3. FACEBOOK (Handles both custom handles & profile.php?id= URLs)
    // ==========================================
    } else if (plat.includes('facebook')) {
      let targetUrl = handle.trim();
      
      if (!targetUrl.startsWith('http')) {
        targetUrl = `https://www.facebook.com/${cleanHandle}`;
      }

      // If not an ID link, safely strip tracking parameters
      if (!targetUrl.includes('profile.php')) {
        targetUrl = targetUrl.split('?')[0];
      }

      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': fbBotUA, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      // Attempt A: OpenGraph Description Meta Tag
      const metaMatch = html.match(/meta property="og:description" content="([^"]+)"/i) ||
                        html.match(/meta name="description" content="([^"]+)"/i);

      if (metaMatch && metaMatch[1]) {
        const text = metaMatch[1];
        const numMatch = text.match(/([0-9.,KMBkmb]+)\s*(?:likes|followers|people follow this)/i);
        if (numMatch && numMatch[1]) {
          count = numMatch[1];
        }
      }

      // Attempt B: Internal Script Payload (Fallback if Meta Tag fails)
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
