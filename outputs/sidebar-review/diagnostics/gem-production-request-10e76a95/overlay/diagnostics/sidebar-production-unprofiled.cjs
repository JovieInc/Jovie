const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve('apps/web/package.json'));
const {chromium,expect}=req('@playwright/test');
const fs=require('node:fs');const cp=require('node:child_process');const path=require('node:path');
const snapshots=false; const sample=process.argv[2];if(!/^[0-4]$/.test(sample||''))throw new Error('Sample must be0..4');
const runtime='production';
const dir=require('node:path').resolve('diagnostics/sidebar-production-unprofiled-'+sample);fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const head='10e76a95b87efd5c25abe6b757081c2265ee63d7'; const compilerOverlay='16a2bda8acf14bc77b6922f47b080d76fefb1bee';
 const browser=await chromium.launch();let context;
 try{
 context=await browser.newContext({viewport:{width:1024,height:450}});await context.addInitScript(()=>{window.sidebarReactRuntimeProof=[];if(!window.__REACT_DEVTOOLS_GLOBAL_HOOK__){let next=0;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){const id=++next;this.renderers.set(id,renderer);window.sidebarReactRuntimeProof.push({bundleType:renderer.bundleType,version:renderer.version,rendererPackageName:renderer.rendererPackageName});return id;},onCommitFiberRoot(){},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};}});
 const page=await context.newPage();
 if(snapshots)await context.tracing.start({screenshots:false,snapshots:true,sources:false});
 await page.goto('http://127.0.0.1:6027/iframe.html?id=organisms-unifiedsidebar--large-more-shell&viewMode=story',{waitUntil:'domcontentloaded'});
 const trigger=page.getByRole('button',{name:'More Pages',exact:true});await expect(trigger).toBeVisible();
 const runtimeProof=await page.evaluate(()=>window.sidebarReactRuntimeProof);expect(runtimeProof.some(x=>x.bundleType===0)).toBe(true);expect(runtimeProof.every(x=>x.bundleType===0)).toBe(true);
 await page.evaluate(()=>{
  window.sidebarScaleRenderSamples=[];window.sidebarPaletteRenderSamples=[];
  window.sidebarClockFlow={marks:[],frames:[],tasks:[],sampling:true,timeOrigin:performance.timeOrigin};
  const s=window.sidebarClockFlow;s.mark=phase=>{const name='sidebar-clock-'+phase;performance.mark(name);const time=performance.getEntriesByName(name).at(-1).startTime;s.marks.push({phase,time});};
  s.mark('idle-start');const step=time=>{if(!s.sampling)return;s.frames.push(time);performance.mark('sidebar-clock-frame-'+s.frames.length,{startTime:time});s.raf=requestAnimationFrame(step);};s.raf=requestAnimationFrame(step);
  s.observer=new PerformanceObserver(list=>{s.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));});s.observer.observe({type:'longtask',buffered:false});
 });
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,120)));
 await page.evaluate(()=>window.sidebarClockFlow.mark('more'));
 const started=await page.evaluate(()=>performance.now());await trigger.focus();await trigger.press('Enter');
 const menu=page.locator('[data-sidebar-flyout="more"]');await menu.waitFor({state:'visible'});
 const opened=await page.evaluate(()=>performance.now());await page.keyboard.press('End');
 await page.waitForFunction(()=>{const el=document.querySelector('[data-sidebar-flyout="more"]');return el?.querySelectorAll('[role="menuitem"]')?.length===13&&[...el.querySelectorAll('[role="menuitem"]')].at(-1)===document.activeElement;});
 const firstFacts=await menu.evaluate(el=>{const rows=[...el.querySelectorAll('[role="menuitem"]')];const last=rows.at(-1);const box=el.getBoundingClientRect();const lb=last.getBoundingClientRect();return{rows:rows.length,lastFocused:last===document.activeElement,lastHref:last.getAttribute('href'),menu:{y:box.y,height:box.height},last:{top:lb.top,bottom:lb.bottom},noHorizontalOverflow:el.scrollWidth<=el.clientWidth,renders:window.sidebarScaleRenderSamples.slice()};});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-sidebar-flyout')==='more-trigger');const escapeFocused=await trigger.evaluate(el=>el===document.activeElement);await trigger.press('Enter');
 await page.evaluate(()=>window.sidebarClockFlow.mark('search-open'));
 await menu.getByRole('menuitem',{name:'Find a page…',exact:true}).click();
 const search=page.getByRole('combobox',{name:'Command Palette Search'});await search.waitFor({state:'visible'});
 await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='combobox');
 const searchFacts=await search.evaluate(el=>({focused:el===document.activeElement,pages:window.sidebarFixturePages.length}));
 await page.evaluate(()=>window.sidebarClockFlow.mark('search-query'));await search.fill('Calendar page fixture 120');
 const option=page.getByRole('option').filter({hasText:'Calendar page fixture 120:'}).first();await option.waitFor({state:'visible'});
 const optionVisible=await option.isVisible();await page.evaluate(()=>window.sidebarClockFlow.mark('selection'));await search.press('Enter');
 const selected=await page.evaluate(()=>window.sidebarFixtureNavigation().at(-1)?.[0]);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const flow=await page.evaluate(()=>{const s=window.sidebarClockFlow;s.mark('flow-end');s.sampling=false;cancelAnimationFrame(s.raf);s.observer.disconnect();return{marks:s.marks,frames:s.frames,tasks:s.tasks,timeOrigin:s.timeOrigin,paletteRenders:window.sidebarPaletteRenderSamples,moreRenders:window.sidebarScaleRenderSamples};});
 fs.writeFileSync(path.join(dir,'flow.json'),JSON.stringify(flow,null,2));
 fs.writeFileSync(path.join(dir,'checkpoint-facts.json'),JSON.stringify({firstFacts,escapeFocused,searchFacts,optionVisible,selected},null,2));
 if(snapshots)await context.tracing.stop({path:path.join(dir,'playwright-snapshot-control.zip')});
 // All assertions and capture below are outside the sampled window. Scalar
 // facts above preserve the original test's states without DOM snapshots.
 expect(firstFacts.rows).toBe(13);expect(firstFacts.lastFocused).toBe(true);expect(firstFacts.lastHref).toBe('/app/calendar');
 expect(firstFacts.menu.y).toBeGreaterThanOrEqual(0);expect(firstFacts.menu.y+firstFacts.menu.height).toBeLessThanOrEqual(450);expect(firstFacts.last.top).toBeGreaterThanOrEqual(0);expect(firstFacts.last.bottom).toBeLessThanOrEqual(450);expect(firstFacts.noHorizontalOverflow).toBe(true);// Production React omits Profiler onRender callbacks. Preserve the CI
 // source assertion unchanged; record this diagnostic instrumentation boundary.
 expect(firstFacts.renders.length).toBe(0);
 expect(escapeFocused).toBe(true);expect(searchFacts.focused).toBe(true);expect(searchFacts.pages).toBe(120);expect(optionVisible).toBe(true);expect(selected).toBe('/app/calendar');
 await trigger.focus();await trigger.press('Enter');await page.keyboard.press('End');const rows=menu.getByRole('menuitem');await expect(rows.last()).toBeInViewport();await page.screenshot({path:path.join(dir,'large-more-end.png')});
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({head,compilerOverlay,diagnosticComposition:true,runtime,runtimeProof,profilerBoundary:'Production React onRender callbacks absent; RAF/LongTasks and preserved semantic geometry checks used;no CDP profiler/render trace. Original CI assertion unchanged.',viewport:{width:1024,height:450},capture:snapshots?'Control: Playwright DOM snapshots enabled, screenshots/video disabled; CDP trace/CPU and scalar state queries included':'CDP CPU/render tracing and Playwright snapshots/screenshots/video disabled during sampling;RAF/LongTasks and scalar state queries only',assertions:'original large fixture interaction/geometry checks retained and evaluated after sampling, using checkpoint scalar facts; final viewport assertion and screenshot after sampling',assertionsPassed:true,eventToAssertionCheckpointMs:opened-started,firstFacts,escapeFocused,searchFacts,optionVisible,selected},null,2));
 console.log(JSON.stringify({head,assertionsPassed:true,artifacts:dir}));
 }finally{if(context)await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
