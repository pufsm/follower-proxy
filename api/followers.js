const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  const { platform, handle } = req.query;

  if (!platform || !handle) {
    return res.status(400).json({ success: false, error: 'Missing platform or handle parameter.' });
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    let count = null;
    const cleanHandle = handle.replace('@', '').replace('https://www.tiktok.com/@', '').replace('https://www.instagram.com/', '').trim();

    if (platform.toLowerCase() === 'tiktok') {
      await page.goto(`https://www.tiktok.com/@${cleanHandle}`, { waitUntil: 'domcontentloaded' });
      const content = await page.content();
      const match = content.match(/"followerCount":(\d+)/);
      if (match) count = parseInt(match[1], 10);

    } else if (platform.toLowerCase() === 'instagram') {
      await page.goto(`https://www.instagram.com/${cleanHandle}/`, { waitUntil: 'domcontentloaded' });
      const content = await page.content();
      const match = content.match(/meta property="og:description" content="([^"]+)"/);
      if (match) {
        const followerMatch = match[1].match(/([0-9.,KMB]+)\s*Followers/i);
        if (followerMatch) count = followerMatch[1];
      }

    } else if (platform.toLowerCase() === 'facebook') {
      await page.goto(`https://www.facebook.com/${cleanHandle}`, { waitUntil: 'domcontentloaded' });
      const content = await page.content();
      const match = content.match(/([0-9.,KMB]+)\s*followers/i);
      if (match) count = match[1];
    }

    await browser.close();

    if (count !== null) {
      return res.status(200).json({ success: true, platform, handle: cleanHandle, followers: count });
    } else {
      return res.status(404).json({ success: false, error: 'Follower pattern not found on page.' });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ success: false, error: error.message });
  }
};
