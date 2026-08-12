module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Clean username extractor
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
  // Feature phone User-Agent triggers Facebook's ultra-lightweight mobile view
  const featurePhoneUA = 'NokiaC3-00/5.1 (08.63) Profile/MIDP-2.1 Configuration/CLDC-1.1 Mozilla/5.0 UCBrowser/8.9.0.251 U2/1.0.0 Mobile';

  try {
    let count = null;

    // ==========================================
    // 1. TIKTOK (Native Vercel Fetch)
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
    // 2. INSTAGRAM (Free Public Mirrors)
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

      // Mirror 1: Pixwox
      try {
        const res = await fetch(`https://www.pixwox.com/profile/${cleanHandle}/`, {
          headers: { 'User-Agent': browserUA }
        });
        if (res.ok) {
          const html = await res.text();
          count = parseFollowers(html);
        }
      } catch (e) {}

      // Mirror 2: Gramhir (Fallback)
      if (!count) {
        try {
          const res = await fetch(`https://gramhir.com/profile/${cleanHandle}`, {
            headers: { 'User-Agent': browserUA }
          });
          if (res.ok) {
            const html = await res.text();
            count = parseFollowers(html);
          }
        } catch (e) {}
      }

    // ==========================================
    // 3. FACEBOOK (mbasic Backdoor)
    // ==========================================
    } else if (plat.includes('facebook')) {
      
      let targetUrl = handle.trim();
      if (!targetUrl.startsWith('http')) {
        targetUrl = `https://mbasic.facebook.com/${cleanHandle}`;
      } else {
        targetUrl = targetUrl.replace('www.facebook.com', 'mbasic.facebook.com')
                             .replace('web.facebook.com', 'mbasic.facebook.com')
                             .replace('m.facebook.com', 'mbasic.facebook.com');
      }

      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': featurePhoneUA, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      // mbasic Facebook layout regex
      const match = 
        html.match(/([0-9.,KMBkmb]+)\s*(?:people follow this|followers|people like this|likes)/i) ||
        html.match(/followed by\s*([0-9.,KMBkmb]+)/i) ||
        html.match(/meta property="og:description" content="([^"]+)"/i);

      if (match) {
        if (match[1] && match[1].match(/[0-9]/)) {
          // Isolate just the numerical value
          const numOnly = match[1].match(/([0-9.,KMBkmb]+)/);
          if (numOnly) count = numOnly[1];
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
