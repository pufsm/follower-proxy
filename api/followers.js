module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

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

  const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const botUserAgent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

  try {
    let count = null;

    // ==========================================
    // 1. TIKTOK
    // ==========================================
    if (plat.includes('tiktok')) {
      const url = `https://www.tiktok.com/@${cleanHandle}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': browserUserAgent, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const match = 
        html.match(/"followerCount":\s*(\d+)/) ||
        html.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/) ||
        html.match(/followerCount":(\d+)/) ||
        html.match(/([0-9.,KMBkmb]+)\s*Followers/i);

      if (match && match[1]) count = match[1];

    // ==========================================
    // 2. INSTAGRAM (Uses Anonymous Viewers to bypass Vercel IP ban)
    // ==========================================
    } else if (plat.includes('instagram')) {
      
      // Helper function: Finds "123k Followers" or "Followers 123k" in raw text
      const extractFollowers = (text) => {
        if (!text) return null;
        const m1 = text.match(/([0-9.,KMBkmb]+)\s*Followers/i);
        if (m1 && m1[1]) return m1[1];
        const m2 = text.match(/Followers\s*:?\s*([0-9.,KMBkmb]+)/i);
        if (m2 && m2[1]) return m2[1];
        return null;
      };

      // Attempt 1: Official Instagram (Just in case the IP block lifts)
      try {
        const res = await fetch(`https://www.instagram.com/${cleanHandle}/`, {
          headers: { 'User-Agent': botUserAgent }
        });
        const html = await res.text();
        const meta = html.match(/meta property="og:description" content="([^"]+)"/i);
        if (meta) count = extractFollowers(meta[1]);
      } catch (e) {}

      // Attempt 2: Picuki Proxy (Very Reliable)
      if (!count) {
        try {
          const res = await fetch(`https://www.picuki.com/profile/${cleanHandle}`, {
            headers: { 'User-Agent': browserUserAgent }
          });
          const html = await res.text();
          const cleanText = html.replace(/<[^>]*>/g, ' '); // Strip HTML tags to raw text
          count = extractFollowers(cleanText);
        } catch (e) {}
      }

      // Attempt 3: Dumpor Proxy (Backup)
      if (!count) {
        try {
          const res = await fetch(`https://dumpoir.com/v/${cleanHandle}`, {
            headers: { 'User-Agent': browserUserAgent }
          });
          const html = await res.text();
          const cleanText = html.replace(/<[^>]*>/g, ' ');
          count = extractFollowers(cleanText);
        } catch (e) {}
      }

    // ==========================================
    // 3. FACEBOOK (Extracts ONLY the clean number)
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
        // Look specifically for the number right before the word 'likes' or 'followers'
        const numMatch = match[1].match(/([0-9.,KMBkmb]+)\s*(?:likes|followers|people follow this)/i);
        if (numMatch && numMatch[1]) {
          count = numMatch[1];
        }
      }
    }

    // ==========================================
    // FINAL OUTPUT
    // ==========================================
    if (count !== null) {
      return res.status(200).json({ success: true, platform: plat, handle: cleanHandle, followers: count });
    } else {
      return res.status(404).json({ success: false, error: `Pattern not found for ${platform}.` });
    }

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
