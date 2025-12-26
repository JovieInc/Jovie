import puppeteer from 'puppeteer';

async function checkConsoleErrors() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  const consoleMessages = [];
  const errors = [];
  const warnings = [];

  // Listen for console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });

    if (type === 'error') {
      errors.push(text);
    } else if (type === 'warning') {
      warnings.push(text);
    }
  });

  // Listen for page errors
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}`);
  });

  try {
    console.log('🔍 Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait a bit for any async console logs
    await page.waitForTimeout(3000);

    console.log('\n📊 Results:');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Warnings: ${warnings.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Console Errors:');
      errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`);
      });
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Console Warnings:');
      warnings.forEach((warn, i) => {
        console.log(`${i + 1}. ${warn}`);
      });
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log('\n✅ No console errors or warnings found!');
    }

    // Log all console messages for reference
    if (consoleMessages.length > 0) {
      console.log('\n📝 All console messages:');
      consoleMessages.forEach((msg, i) => {
        console.log(`${i + 1}. [${msg.type}] ${msg.text}`);
      });
    }
  } catch (error) {
    console.error('❌ Error during page check:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

checkConsoleErrors();
