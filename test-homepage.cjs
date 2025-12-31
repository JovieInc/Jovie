const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const puppeteer = require('puppeteer');

async function testHomepage() {
  console.log('🚀 Starting homepage test...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const failures = [];

    // Collect console messages
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    // Collect errors
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    console.log('📡 Navigating to http://localhost:3000...');
    const response = await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Check HTTP status
    const status = response.status();
    console.log(`✅ HTTP Status: ${status}`);

    // Get page title
    const title = await page.title();
    console.log(`📄 Page Title: "${title}"`);

    // Check for expected title
    const expectedTitle = 'Jovie — The AI Link-in-Bio Built for Artists';
    if (title.includes(expectedTitle)) {
      console.log('✅ Title matches expected value');
    } else {
      const error = `Title mismatch! Expected to include: "${expectedTitle}", got: "${title}"`;
      console.log(`❌ ${error}`);
      failures.push(error);
    }

    // Check for hero headline
    const heroHeadline = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h1, h2')).find(el =>
        el.textContent.includes('Turn fans into subscribers')
      );
      return heading ? heading.textContent.trim() : null;
    });

    if (heroHeadline) {
      console.log(`✅ Hero headline found: "${heroHeadline}"`);
    } else {
      const error = 'Hero headline "Turn fans into subscribers" not found';
      console.log(`❌ ${error}`);
      failures.push(error);
    }

    // Check for CTA button
    const ctaButton = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('a, button')).find(
        el => el.textContent.includes('Request early access')
      );
      return button ? button.textContent.trim() : null;
    });

    if (ctaButton) {
      console.log(`✅ CTA button found: "${ctaButton}"`);
    } else {
      const error = 'CTA button "Request early access" not found';
      console.log(`❌ ${error}`);
      failures.push(error);
    }

    // Check for main sections
    const sections = await page.evaluate(() => {
      return {
        main: !!document.querySelector('main'),
        heroSection:
          !!document.querySelector('[class*="Hero"]') ||
          document.querySelector('h1'),
        hasSections: document.querySelectorAll('section').length,
      };
    });

    console.log(`\n📦 Page Structure:`);
    console.log(`   - Main tag: ${sections.main ? '✅' : '❌'}`);
    console.log(`   - Hero section: ${sections.heroSection ? '✅' : '❌'}`);
    console.log(`   - Total sections: ${sections.hasSections}`);

    // Take screenshot
    // Use environment variable or default to ./artifacts directory
    const screenshotDir =
      process.env.SCREENSHOT_DIR || join(process.cwd(), 'artifacts');
    mkdirSync(screenshotDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = join(
      screenshotDir,
      `homepage-test-${timestamp}.png`
    );

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    console.log(`\n📸 Screenshot saved to: ${screenshotPath}`);

    // Report console errors
    const errorLogs = consoleMessages.filter(msg => msg.type === 'error');
    if (errorLogs.length > 0) {
      console.log(`\n⚠️  Console Errors (${errorLogs.length}):`);
      errorLogs.forEach(log => console.log(`   - ${log.text}`));
    } else {
      console.log('\n✅ No console errors');
    }

    // Report page errors
    if (errors.length > 0) {
      console.log(`\n❌ JavaScript Errors (${errors.length}):`);
      errors.forEach(err => console.log(`   - ${err}`));
    } else {
      console.log('✅ No JavaScript errors');
    }

    // Check for failures and exit with non-zero code if any
    if (failures.length > 0) {
      console.log(`\n❌ Test failed with ${failures.length} assertion(s):`);
      failures.forEach((failure, index) => {
        console.log(`   ${index + 1}. ${failure}`);
      });
      throw new Error(
        `Homepage test failed with ${failures.length} failed assertion(s)`
      );
    }

    console.log('\n✨ Homepage test complete!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
testHomepage().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
