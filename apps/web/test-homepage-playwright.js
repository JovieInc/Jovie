const { mkdir } = require('node:fs/promises');
const { dirname, resolve } = require('node:path');
const { chromium } = require('@playwright/test');

async function testHomepage() {
  console.log('🚀 Starting homepage test with Playwright...\n');

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

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
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for React to hydrate and render content
    await page.waitForTimeout(3000);

    // Debug: Check what HTML is actually loaded
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    const hasContent = bodyHTML.length > 100;
    console.log(`📝 Body HTML length: ${bodyHTML.length} chars`);
    console.log(`📝 Has substantial content: ${hasContent ? '✅' : '❌'}`);

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
      console.log(`❌ Title mismatch! Expected to include: "${expectedTitle}"`);
    }

    // Check for hero headline
    const heroHeadline = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h1, h2')).find(el =>
        el.textContent.includes('Turn fans into subscribers')
      );
      return heading ? heading.textContent.trim() : null;
    });

    // Debug: Find all h1 and h2 elements
    const allHeadings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2'))
        .map(el => el.textContent.trim())
        .slice(0, 5);
    });

    if (heroHeadline) {
      console.log(`✅ Hero headline found: "${heroHeadline}"`);
    } else {
      console.log('❌ Hero headline not found');
      console.log(`📝 First 5 headings found: ${JSON.stringify(allHeadings)}`);
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
      console.log('❌ CTA button "Request early access" not found');
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
    const screenshotPath = resolve(
      'test-results/homepage/homepage-test-screenshot.png'
    );
    await mkdir(dirname(screenshotPath), { recursive: true });
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
