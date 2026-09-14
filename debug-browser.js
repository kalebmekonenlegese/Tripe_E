const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const consoleErrors = [];
  const pageErrors = [];
  const reqFails = [];
  const badResponses = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => reqFails.push(`${req.url()} :: ${req.failure()?.errorText || 'unknown'}`));
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/') || /\.(png|jpg|jpeg|svg|webp|css|js|mp4|avif|woff|woff2)/i.test(url)) {
      if (res.status() >= 400) {
        badResponses.push(`${res.status()} ${url}`);
      }
    }
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  console.log('TITLE=' + await page.title());
  console.log('CONSOLE_ERRORS=' + JSON.stringify(consoleErrors));
  console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors));
  console.log('REQ_FAILS=' + JSON.stringify(reqFails.slice(0, 20)));
  console.log('BAD_RESPONSES=' + JSON.stringify(badResponses.slice(0, 20)));

  await page.locator('[aria-label="Sign up"]').click();
  const email = `qa_${Date.now()}@example.com`;
  await page.locator('#auth-first-name').fill('QA');
  await page.locator('#auth-last-name').fill('User');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('Password123!');
  await page.locator('#auth-confirm-password').fill('Password123!');
  await page.locator('.auth-submit').click();
  await page.waitForTimeout(3000);
  const cookies = await page.context().cookies();
  console.log('COOKIES=' + JSON.stringify(cookies.filter((c) => ['auth_token', 'csrfToken'].includes(c.name)).map((c) => ({
    name: c.name,
    sameSite: c.sameSite,
    secure: c.secure,
    httpOnly: c.httpOnly,
    valueLength: c.value.length
  })), null, 2));
  const bodyText = await page.locator('body').innerText();
  console.log('BODY=' + JSON.stringify(bodyText.slice(0, 500)));

  await browser.close();
})();
