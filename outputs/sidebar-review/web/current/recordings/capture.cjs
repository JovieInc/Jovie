const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
(async () => {
 const dir = '/private/tmp/sidebar-success-recordings'; fs.mkdirSync(dir, {recursive:true});
 const head = cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const browser = await chromium.launch(); const receipts=[];
 try {
  for (const compact of [false,true]) {
   const viewport = compact ? {width:390,height:844} : {width:1440,height:900};
   const context = await browser.newContext({viewport,recordVideo:{dir,size:viewport}});
   const page = await context.newPage(); const video = page.video();
   const story = compact ? 'operator-shared-shell' : 'shared-shell';
   await page.goto(`http://localhost:6017/iframe.html?id=organisms-unifiedsidebar--${story}&viewMode=story`,{waitUntil:'domcontentloaded'});
   const rail=page.locator('#shell-left-rail');
   if (compact) {
    await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
    await expect(page.getByRole('button',{name:'Collapse sidebar',exact:true})).toBeVisible({timeout:25000});
    await page.waitForTimeout(750);
    await page.getByRole('button',{name:'More Pages',exact:true}).click();
    await expect(page.locator('[data-sidebar-flyout="more"]')).toBeVisible({timeout:25000});
    await page.waitForTimeout(1100);
    await page.getByRole('menuitem',{name:'Back',exact:true}).click();
    await expect(page.locator('[data-sidebar-flyout="more"]')).toBeHidden({timeout:25000});
    await page.waitForTimeout(750);
    await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
   } else {
    await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
    await expect(rail).toHaveAttribute('data-rail-phase','closed',{timeout:25000});
    await page.waitForTimeout(750);
    await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
    await expect(rail).toHaveAttribute('data-rail-preview','true',{timeout:25000});
    await page.waitForTimeout(1000);
    await page.getByRole('button',{name:'Pin Sidebar',exact:true}).click();
    await expect(rail).toHaveAttribute('data-rail-pinned','true',{timeout:25000});
    await page.waitForTimeout(750);
    await page.getByRole('button',{name:'Recent Chats',exact:true}).click();
    await expect(page.locator('[data-sidebar-flyout="recent"]')).toBeVisible({timeout:25000});
    await page.waitForTimeout(1100); await page.keyboard.press('Escape');
   }
   await page.waitForTimeout(750); await context.close();
   const file=path.join(dir,compact?'ovie-compact-success.webm':'jovie-desktop-success.webm');
   await video.saveAs(file);
   receipts.push({head,file,viewport,story,scope:'Successful headless Storybook fixture interaction recording; deliberate viewing dwell and video capture occur outside all performance sample windows. No physical-device or authenticated/deployed runtime claim.'});
  }
 } finally {await browser.close();}
 fs.writeFileSync(path.join(dir,'provenance.json'),JSON.stringify(receipts,null,2)); console.log(JSON.stringify(receipts));
})().catch(e=>{console.error(e);process.exit(1)});
