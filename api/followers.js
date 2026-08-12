module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  // Smart URL parser: extracts clean handles from full links like 'https://www.tiktok.com/@dylenemay'
  function extractCleanHandle(input) {
    if (!input) return '';
    let str = input.trim();
    // Remove query params (e.g., ?igsh=...)
    str = str.split('?')[0].split('#')[0];
    // Remove trailing slashes
    str = str.replace(/\/+$/, '');
    // Extract last segment of the path
    const parts = str.split('/');
    let last = parts[parts.length - 1];
    // Strip leading @
    return last.replace(/^@/, '').trim();
  }

  const cleanHandle = extractCleanHandle(handle);
  const plat = platform.toLowerCase().trim();

  // Social bot User-Agent tricks Meta into serving OpenGraph metadata without login redirects
  const botUserAgent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  try {
    let count = null;

    if (plat.includes('tiktok')) {
      const url = `https://www.tiktok.com/@${cleanHandle}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': browserUserAgent,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = await response.text();

      // TikTok JSON schema matches
      const match = 
        html.match(/"followerCount":\s*(\d+)/) ||
        html.match(/"stats":\s*\{[^}]*"followerCount":\s*(\d+)/) ||
        html.match(/followerCount":(\d+)/) ||
        html.match(/([0-9.,KMBkmb]+)\s*Followers/i);

      if (match && match[1]) count = match[1];

    } else if (plat.includes('instagram')) {
      const url = `https://www.instagram.com/${cleanHandle}/`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': botUserAgent,
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = await response.text();

      const match = 
        html.match(/meta property="og:description" content="([^"]+)"/i) || 
        html.match(/meta name="description" content="([^"]+)"/i);

      if (match && match[1]) {
        const followerMatch = match[1].match(/([0-9.,KMBkmb]+)\s*Followers/i);
        if (followerMatch && followerMatch[1]) {
          count = followerMatch[1];
        }
      }

    } else if (plat.includes('facebook')) {
      let targetUrl = handle.startsWith('http') ? handle : `https://www.facebook.com/${cleanHandle}`;
      targetUrl = targetUrl.split('?')[0];

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': botUserAgent,
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = await response.text();

      const match = 
        html.match(/([0-9.,KMBkmb]+)\s*followers/i) || 
        html.match(/([0-9.,KMBkmb]+)\s*people follow this/i) ||
        html.match(/meta property="og:description" content="([^"]+)"/i);

      if (match) {
        if (match[1] && match[1].includes('followers')) {
          const subMatch = match[1].match(/([0-9.,KMBkmb]+)\s*followers/i);
          if (subMatch) count = subMatch[1];
        } else if (match[1]) {
          count = match[1];
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
