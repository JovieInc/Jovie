import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRequire = createRequire(join(desktopRoot, '../../package.json'));
const desktopRequire = createRequire(join(desktopRoot, 'package.json'));

test('real Electron page views retain independent drafts/history and surviving chrome', {
  skip: process.platform !== 'darwin',
  timeout: 60000,
}, async t => {
  const { _electron } = repoRequire('playwright');
  const fixture = await mkdtemp(join(tmpdir(), 'jovie-page-tabs-'));
  let application;
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Fixture page</title><textarea id="draft"></textarea><script>
      electronAPI.onNavigate(path => { history.pushState({}, '', path); });
      electronAPI.setWorkState({hasDraft:false,isStreaming:false,isUploading:false,hasPendingAction:false,isAuthenticating:false});
      electronAPI.setPageTabsBounds({x:252,y:8,width:940,height:32,dark:true,ov:false});
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (application) {
      // This isolated fixture deliberately contains an unsent draft. Exit the
      // fixture directly rather than invoking the product's quit confirmation.
      application.process().kill('SIGKILL');
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(fixture, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const entry = join(fixture, 'fixture.cjs');
  await writeFile(
    entry,
    `const {app,dialog}=require('electron');
    app.setPath('appData', ${JSON.stringify(fixture)});
    app.setAppPath(${JSON.stringify(desktopRoot)});
    // Fixture only: never replace the user's jovie:// protocol registration.
    app.setAsDefaultProtocolClient=()=>false;
    globalThis.fixtureCloseResponse=0;
    globalThis.fixtureDialogs=[];
    dialog.showMessageBox=async (_window,options)=>{globalThis.fixtureDialogs.push(options);return {response:globalThis.fixtureCloseResponse};};
    const envPath=${JSON.stringify(join(desktopRoot, 'dist-electron/env.generated.js'))};
    require.cache[envPath]={id:envPath,filename:envPath,loaded:true,exports:{APP_ENV:'local',APP_URL:${JSON.stringify(origin)}}};
    require(${JSON.stringify(join(desktopRoot, 'dist-electron/main.js'))});`
  );
  application = await _electron.launch({
    executablePath: desktopRequire('electron'),
    args: [entry],
    env: { ...process.env, JOVIE_DEV: '1' },
    timeout: 30000,
  });
  console.log('Fixture launched');
  const inspect = script =>
    application.evaluate(
      async ({ webContents }, { origin, script }) => {
        const page = webContents
          .getAllWebContents()
          .find(contents => contents.getURL().startsWith(origin));
        if (!page) return null;
        return page.executeJavaScript(script, true);
      },
      { origin, script }
    );
  await waitFor(
    async () => (await inspect('electronAPI.getPageTabs()'))?.tabs.length === 1
  );
  console.log('First page ready');
  const firstId = await application.evaluate(
    ({ webContents }, origin) =>
      webContents
        .getAllWebContents()
        .find(contents => contents.getURL().startsWith(origin)).id,
    origin
  );
  await inspect(
    `const draft=document.querySelector('#draft');draft.value='First unsent draft';draft.focus();draft.setSelectionRange(2,7);history.pushState({},'','/app/library');electronAPI.setWorkState({hasDraft:true,isStreaming:false,isUploading:false,hasPendingAction:false,isAuthenticating:false});`
  );
  assert.equal(
    await inspect(`electronAPI.pageTabsCommand({type:'create'})`),
    true
  );
  console.log('Second page created');
  await waitFor(
    async () =>
      await application.evaluate(
        ({ webContents }, origin) =>
          webContents
            .getAllWebContents()
            .filter(contents => contents.getURL().startsWith(origin)).length ===
          2,
        origin
      )
  );
  const ids = await application.evaluate(
    ({ webContents }, origin) =>
      webContents
        .getAllWebContents()
        .filter(contents => contents.getURL().startsWith(origin))
        .map(contents => contents.id),
    origin
  );
  const secondId = ids.find(id => id !== firstId);
  const pageEval = (id, script) =>
    application.evaluate(
      async ({ webContents }, { id, script }) =>
        webContents.fromId(id).executeJavaScript(script, true),
      { id, script }
    );
  await pageEval(
    secondId,
    `document.querySelector('#draft').value='Second draft';history.pushState({},'','/app/settings');electronAPI.setWorkState({hasDraft:true,isStreaming:false,isUploading:false,hasPendingAction:false,isAuthenticating:false});`
  );
  await pageEval(secondId, `electronAPI.pageTabsCommand({type:'select',id:1})`);
  console.log('Independent pages selected');
  assert.equal(
    await pageEval(firstId, `document.querySelector('#draft').value`),
    'First unsent draft'
  );
  assert.equal(await pageEval(firstId, `location.pathname`), '/app/library');
  assert.deepEqual(
    await pageEval(
      firstId,
      `({focused:document.activeElement.id,start:document.querySelector('#draft').selectionStart,end:document.querySelector('#draft').selectionEnd})`
    ),
    { focused: 'draft', start: 2, end: 7 }
  );
  assert.equal(
    await pageEval(secondId, `document.querySelector('#draft').value`),
    'Second draft'
  );
  assert.equal(await pageEval(secondId, `location.pathname`), '/app/settings');
  assert.equal(
    await pageEval(secondId, `electronAPI.getVisualActivity()`),
    false
  );
  assert.equal(
    await pageEval(firstId, `electronAPI.pageTabsCommand({type:'close',id:1})`),
    false
  );
  assert.equal(
    await application.evaluate(
      () => globalThis.fixtureDialogs.at(-1).defaultId
    ),
    0
  );
  assert.equal(
    await pageEval(firstId, `document.querySelector('#draft').value`),
    'First unsent draft'
  );
  await pageEval(firstId, `electronAPI.goBack()`);
  console.log('History navigation requested');
  await waitFor(
    async () =>
      (await application.evaluate(
        ({ webContents }, id) =>
          new URL(webContents.fromId(id).getURL()).pathname,
        firstId
      )) === '/app/chat'
  ).catch(async error => {
    console.log(
      await application.evaluate(
        ({ webContents }, id) => ({
          url: webContents.fromId(id).getURL().slice(0, 120),
          entries: webContents
            .fromId(id)
            .navigationHistory.getAllEntries()
            .map(entry => entry.url.slice(0, 120)),
        }),
        firstId
      )
    );
    throw error;
  });
  // Page failure cannot remove the independently bundled window tab controls.
  await application.evaluate(
    ({ webContents }, id) =>
      webContents.fromId(id).loadURL('data:text/html,Fixture%20recovery'),
    firstId
  );
  console.log('Recovery document loaded');
  const chromeId = await application.evaluate(
    ({ webContents }) =>
      webContents
        .getAllWebContents()
        .find(contents => contents.getURL().includes('/page-tabs/index.html'))
        .id
  );
  await waitFor(
    async () =>
      (await pageEval(
        chromeId,
        `document.querySelectorAll('[role="tab"]').length`
      )) === 2
  );
  const widths = await pageEval(
    chromeId,
    `Array.from(document.querySelectorAll('[data-active]')).map(tab=>tab.getBoundingClientRect().width)`
  );
  assert.ok(widths[0] > 0);
  assert.ok(Math.abs(widths[0] - widths[1]) <= 1);
  assert.equal(
    await pageEval(
      chromeId,
      `electronAPI.pageTabsCommand({type:'select',id:2})`
    ),
    true
  );
  assert.equal(
    await pageEval(secondId, `document.querySelector('#draft').value`),
    'Second draft'
  );
  await application.evaluate(
    ({ BrowserWindow, webContents, Menu }, { secondId, chromeId }) => {
      BrowserWindow.getAllWindows()[0].focus();
      webContents.fromId(chromeId).focus();
      const before = webContents.fromId(secondId).getZoomLevel();
      const item = Menu.getApplicationMenu()
        .items.find(item => item.label === 'View')
        .submenu.items.find(item => item.label === 'Zoom In');
      item.click();
      if (webContents.fromId(secondId).getZoomLevel() <= before)
        throw new Error('Native zoom did not target selected page');
      const reset = Menu.getApplicationMenu()
        .items.find(item => item.label === 'View')
        .submenu.items.find(item => item.label === 'Actual Size');
      reset.click();
    },
    { secondId, chromeId }
  );
  assert.equal(
    await pageEval(chromeId, `electronAPI.pageTabsCommand({type:'create'})`),
    true
  );
  await waitFor(
    async () =>
      (await pageEval(
        chromeId,
        `document.querySelectorAll('[role="tab"]').length`
      )) === 3
  );
  const thirds = await pageEval(
    chromeId,
    `Array.from(document.querySelectorAll('[data-active]')).map(tab=>tab.getBoundingClientRect().width)`
  );
  assert.ok(Math.max(...thirds) - Math.min(...thirds) <= 1);
  await application.evaluate(() => {
    globalThis.fixtureCloseResponse = 1;
  });
  assert.equal(
    await pageEval(
      chromeId,
      `electronAPI.pageTabsCommand({type:'close',id:2})`
    ),
    true
  );
  await waitFor(
    async () =>
      (await pageEval(
        chromeId,
        `document.querySelectorAll('[role="tab"]').length`
      )) === 2
  );
  assert.equal(
    await application.evaluate(
      ({ webContents }, id) => webContents.fromId(id) === undefined,
      secondId
    ),
    true
  );
  // Native window close and app quit must preserve every page on cancellation.
  await application.evaluate(() => {
    globalThis.fixtureCloseResponse = 0;
  });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close()
  );
  await waitFor(
    async () =>
      await application.evaluate(
        () => globalThis.fixtureDialogs.at(-1)?.message === 'Close this window?'
      )
  );
  assert.equal(
    await application.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    ),
    1
  );
  assert.equal(
    await pageEval(
      chromeId,
      `document.querySelectorAll('[role="tab"]').length`
    ),
    2
  );
  await application.evaluate(({ app }) => app.quit());
  await waitFor(
    async () =>
      await application.evaluate(() =>
        globalThis.fixtureDialogs.at(-1)?.message.startsWith('Quit ')
      )
  );
  assert.equal(
    await application.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    ),
    1
  );
  await application.evaluate(() => {
    globalThis.fixtureCloseResponse = 1;
  });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close()
  );
  await waitFor(
    async () =>
      await application.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 0
      )
  );
  assert.equal(
    await application.evaluate(
      ({ webContents }, ids) =>
        ids.every(id => webContents.fromId(id) === undefined),
      [firstId, secondId, chromeId]
    ),
    true
  );
});

async function waitFor(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Native page state did not settle within 15 seconds');
}
