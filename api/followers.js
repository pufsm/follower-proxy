module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  const cleanHandle = handle
    .replace('@', '')
    .replace('https://www.tiktok.com/@', '')
    .replace('https://www.instagram.com/', '')
    .replace('https://www.facebook.com/', '')
    .trim();

  // Use a modern browser user agent
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  try {
    let count = null;

    if (platform.toLowerCase() === 'tiktok') {
      const response = await fetch(`https://www.tiktok.com/@${cleanHandle}`, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();
      
      const match = html.match(/"followerCount":(\d+)/) || html.match(/"stats":\{[^}]*"followerCount":(\d+)/);
      if (match && match[1]) count = parseInt(match[1], 10);

    } else if (platform.toLowerCase() === 'instagram') {
      const response = await fetch(`https://www.instagram.com/${cleanHandle}/`, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const match = html.match(/meta property="og:description" content="([^"]+)"/) || html.match(/meta name="description" content="([^"]+)"/);
      if (match && match[1]) {
        const followerMatch = match[1].match(/([0-9.,KMBkmb]+)\s*Followers/i);
        if (followerMatch) count = followerMatch[1];
      }

    } else if (platform.toLowerCase() === 'facebook') {
      const response = await fetch(`https://www.facebook.com/${cleanHandle}`, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const html = await response.text();

      const match = html.match(/([0-9.,KMBkmb]+)\s*followers/i) || html.match(/"follower_count":\s*(\d+)/);
      if (match && match[1]) count = match[1];
    }

    if (count !== null) {
      return res.status(200).json({ success: true, platform, handle: cleanHandle, followers: count });
    } else {
      return res.status(404).json({ success: false, error: `Follower pattern not found for ${platform}.` });
    }

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
