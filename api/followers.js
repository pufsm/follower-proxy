module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Extract clean username from URLs like 'https://www.instagram.com/dylenefajardo/'
  function extractCleanHandle(input) {
    if (!input) return '';
    let str = input.trim();
    str = str.split('?')[0].split('#')[0]; // strip query params
    str = str.replace(/\/+$/, '');         // strip trailing slash
    const parts = str.split('/');
    let last = parts[parts.length - 1];
    return last.replace(/^@/, '').trim();
  }

  const cleanHandle = extractCleanHandle(handle);
  const plat = platform.toLowerCase().trim();

  const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const botUserAgent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  const googleBotAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

  try {
    let count = null;

    // ==========================================
    // 1. TIKTOK
    // ==========================================
    if (plat.includes('tiktok')) {
      const url = `https://www.tiktok.com/@${cleanHandle}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': browserUserAgent,
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = await response.text();

      const match = 
        html.match(/"followerCount":\s*(\d+)/) ||
        html.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/) ||
        html.match(/followerCount":(\d+)/) ||
        html.match(/([0-9.,KMBkmb]+)\s*Followers/i);

      if (match && match[1]) count = match[1];

    // ==========================================
    // 2. INSTAGRAM (Uses internal Web API + Googlebot fallback)
    // ==========================================
    } else if (plat.includes('instagram')) {
      // Attempt A: Internal Instagram Web API
      try {
        const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${cleanHandle}`;
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent': browserUserAgent,
            'X-IG-App-ID': '936619743392459',
            'Accept': '*/*'
          }
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (json?.data?.user?.edge_followed_by?.count !== undefined) {
            count = json.data.user.edge_followed_by.count;
          }
        }
      } catch (e) {
        // Fall back to HTML parsing if API fails
      }

      // Attempt B: Scraping OpenGraph tags via Googlebot header
      if (count === null) {
        const url = `https://www.instagram.com/${cleanHandle}/`;
        const response = await fetch(url, {
          headers: { 'User-Agent': googleBotAgent, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        const html = await response.text();

        const match = html.match(/meta property="og:description" content="([^"]+)"/i) ||
                      html.match(/meta name="description" content="([^"]+)"/i);

        if (match && match[1]) {
          const followerMatch = match[1].match(/([0-9.,KMBkmb]+)\s*Followers/i);
          if (followerMatch && followerMatch[1]) {
            count = followerMatch[1];
          }
        }
      }

    // ==========================================
    // 3. FACEBOOK (Extracts ONLY digits before 'likes' or 'followers')
    // ==========================================
    } else if (plat.includes('facebook')) {
      let targetUrl = handle.startsWith('http') ? handle : `https://www.facebook.com/${cleanHandle}`;
      targetUrl = targetUrl.split('?')[0];

      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': botUserAgent, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const match = html.match(/meta property="og:description" content="([^"]+)"/i) ||
                    html.match(/meta name="description" content="([^"]+)"/i);

      if (match && match[1]) {
        const text = match[1];
        // Clean extraction: isolates numbers like "2,283" from "Dylene May Fajardo. 2,283 likes..."
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
