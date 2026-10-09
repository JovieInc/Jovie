const {chromium}=require('@playwright/test');
const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch();const summaries=[];
for(let n=0;n<5;n++){
 const context=await browser.newContext({viewport:{width:1024,height:450}});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 const page=await context.newPage();
 await page.goto('http://localhost:6017/iframe.html?id=organisms-unifiedsidebar--large-more-shell&viewMode=story',{waitUntil:'domcontentloaded'});
 const more=page.getByRole('button',{name:'More Pages',exact:true});await more.waitFor({state:'visible'});await more.focus();await more.press('Enter');
 await page.locator('[data-sidebar-flyout="more"]').getByRole('menuitem').last().waitFor({state:'visible'});
 const client=await context.newCDPSession(page);await client.send('Profiler.enable');await client.send('Profiler.start');
 await page.evaluate(()=>{window.profileTasks=[];window.profileStarted=performance.now();window.profileObserver=new PerformanceObserver(list=>window.profileTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));window.profileObserver.observe({type:'longtask'});});
 await page.locator('[data-sidebar-flyout="more"]').getByRole('menuitem',{name:'Find a page…',exact:true}).click();
 const search=page.getByRole('combobox',{name:'Command Palette Search'});await search.waitFor({state:'visible'});await search.fill('Calendar page fixture 120');await page.getByRole('option').filter({hasText:'Calendar page fixture 120:'}).first().waitFor({state:'visible'});await search.press('Enter');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const tasks=await page.evaluate(()=>{window.profileObserver.disconnect();return {tasks:window.profileTasks,started:window.profileStarted,finished:performance.now()};});
 const {profile}=await client.send('Profiler.stop');fs.writeFileSync(`/private/tmp/sidebar-search-${n}.cpuprofile`,JSON.stringify(profile));
 await context.tracing.stop({path:`/private/tmp/sidebar-search-${n}.trace.zip`});summaries.push({...tasks,index:n,profile:`/private/tmp/sidebar-search-${n}.cpuprofile`});console.log(JSON.stringify(summaries.at(-1)));await context.close();
}
fs.writeFileSync('/private/tmp/sidebar-search-profile-summary.json',JSON.stringify(summaries,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
