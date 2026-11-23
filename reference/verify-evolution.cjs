/**
 * Browser audit for the EA visual evolution exhibit. Requires playwright.
 * Runs against the actual repository HTML, serves the source manifest alongside it,
 * and records both source attribution and live remote image load outcomes.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert').strict;
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'evidence');
fs.mkdirSync(out, {recursive:true});
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css'};
const server = http.createServer((req,res)=>{
 const p=decodeURIComponent(req.url.split('?')[0]);
 const file=path.resolve(root,'.'+p);
 if(!(file===root||file.startsWith(root+path.sep))){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain; charset=utf-8'});res.end(buf)});
});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+port+'/reference/evolution.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForSelector('.game-card');
 assert.equal(await page.locator('.game-card:visible').count(),33,'all 33 annual games render');
 assert.equal(await page.locator('#sport-sections .game-card img').count(),33,'all gameplay captures are in raw HTML');
 assert.equal(await page.locator('section.exhibit').count(),3,'three sports');
 assert.equal(await page.locator('#compare-grid .compare-unit').count(),2,'two comparison slots');
 await page.locator('[data-filter-value="nhl"]').first().click();
 assert.equal(await page.locator('.game-card:visible').count(),11,'NHL 11 editions');
 await page.locator('[data-filter-value="nba"]').first().click();
 assert.equal(await page.locator('.game-card:visible').count(),11,'NBA Live 11 editions');
 await page.locator('[data-filter-value="madden"]').first().click();
 assert.equal(await page.locator('.game-card:visible').count(),11,'Madden 11 editions');
 await page.locator('[data-filter-value="all"]').first().click();
 await page.locator('[data-filter-value="16-bit"]').first().click();
 assert((await page.locator('.game-card:visible').count())<33,'era filter works');
 await page.locator('[data-filter-group="era"] [data-filter-value="all"]').click();
 await page.locator('#platform-filter').selectOption('Genesis');
 assert((await page.locator('.game-card:visible').count())>0,'platform filter works');
 await page.locator('#platform-filter').selectOption('all');
 await page.locator('#image-filter').selectOption('missing');
 const manifestMissing=await page.evaluate(()=>JSON.parse(document.getElementById('manifest').textContent).games.filter(g=>g.screenshots.length===0).length);
 assert.equal(await page.locator('.game-card:visible').count(),manifestMissing,'missing-image filter exposes actual unresolved entries');
 await page.locator('#image-filter').selectOption('all');
 await page.locator('#compare-left').selectOption('nba-96');await page.locator('#compare-right').selectOption('nba-2005');
 assert.equal(await page.locator('#compare-grid .compare-unit').count(),2,'comparison selection works');
 await page.locator('#compare-swap').click();
 assert.equal(await page.locator('#compare-left').inputValue(),'nba-2005','comparison swap works');

 // Inspect every screenshot record, including platform variants, through real browser <img> elements.
 const gameRecords=await page.evaluate(()=>JSON.parse(document.getElementById('manifest').textContent).games);
 const variantResults=[];
 const inspect=async(g,index)=>{
   const img=page.locator('#game-'+g.id+' .shot-frame img');
   await img.scrollIntoViewIfNeeded();
   await img.evaluate(el=>new Promise(resolve=>{
     if(el.complete) return resolve();
     const finish=()=>{clearTimeout(timer);resolve()};
     const timer=setTimeout(finish,10000);
     el.addEventListener('load',finish,{once:true});
     el.addEventListener('error',finish,{once:true});
   }));
   const result=await img.evaluate(el=>({loaded:el.complete&&el.naturalWidth>0,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight}));
   variantResults.push({id:g.id,title:g.title,variant_index:index,platform:g.screenshots[index].platform,image_url:g.screenshots[index].image_url,...result});
 };
 for(const g of gameRecords){
   assert(g.screenshots.length>0,'each annual edition must have at least one screenshot: '+g.id);
   await inspect(g,0);
   for(let i=1;i<g.screenshots.length;i++){
     await page.locator('#game-'+g.id+' [data-variant="'+g.id+'"][data-index="'+i+'"]').click();
     await inspect(g,i);
   }
   if(g.screenshots.length>1){
     await page.locator('#game-'+g.id+' [data-variant="'+g.id+'"][data-index="0"]').click();
     await page.locator('#game-'+g.id+' .shot-frame img').scrollIntoViewIfNeeded();
   }
 }
 const capture=await page.evaluate(()=>{
   const manifest=JSON.parse(document.getElementById('manifest').textContent);
   return manifest.games.map(g=>{
     const frame=document.querySelector('#game-'+g.id+' .shot-frame');
     const img=frame?.querySelector('img');
     return {id:g.id,title:g.title,platform:g.screenshots[0]?.platform||g.display_platform,
       source:g.screenshots[0]?.source_page||g.source_gallery,
       image_url:g.screenshots[0]?.image_url||null,
       loaded:!!img&&!!img.naturalWidth&&img.complete,
       blocked:!!img&&(!img.naturalWidth||frame.dataset.load==='failed'),
       has_source:g.screenshots.length>0};
   });
 });
 const report={created:new Date().toISOString(),browser:'Chromium / Playwright',desktop:{width:1440,height:900},
   total_games:capture.length,source_traced:capture.filter(x=>x.has_source).length,
   browser_loaded:capture.filter(x=>x.loaded).length,
   browser_failed_or_blocked:capture.filter(x=>x.has_source&&!x.loaded).length,
   unresolved:capture.filter(x=>!x.has_source).length,
   all_capture_count:variantResults.length,all_capture_loaded:variantResults.filter(x=>x.loaded).length,
   all_capture_failed:variantResults.filter(x=>!x.loaded).length,
   page_errors:errors,entries:capture,variants:variantResults};
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 await page.screenshot({path:path.join(out,'gallery-desktop.png'),fullPage:true});
 await page.locator('#compare').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'comparison-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#sport-sections').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,'gallery-mobile.png'),fullPage:true});
 assert.equal(await page.locator('.game-card:visible').count(),33,'mobile retains all 33');
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 assert.equal(mobileOverflow,false,'no horizontal overflow on mobile');
 assert.equal(errors.length,0,'no JavaScript page errors');
 console.log(JSON.stringify({total:report.total_games,source_traced:report.source_traced,browser_loaded:report.browser_loaded,blocked:report.browser_failed_or_blocked,all_capture_count:report.all_capture_count,all_capture_loaded:report.all_capture_loaded,all_capture_failed:report.all_capture_failed,unresolved:report.unresolved,errors},null,2));

 // Simulate iOS Safari's rendering engine. Verify that neither scripts nor
 // third-party dynamic markup is required to see NHL/Madden screenshots.
 const webkitBrowser=await webkit.launch({headless:true});
 const browserBase='http://127.0.0.1:'+port+'/reference/evolution.html';
 const iosContext=await webkitBrowser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
 const ios=await iosContext.newPage(),iosErrors=[];
 ios.on('pageerror',e=>iosErrors.push(e.message));
 await ios.goto(browserBase,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(await ios.locator('section#nhl .game-card img').count(),11,'iOS WebKit NHL has real in-page screenshots');
 assert.equal(await ios.locator('section#madden .game-card img').count(),11,'iOS WebKit Madden has real in-page screenshots');
 for(const element of await ios.locator('section#nhl .game-card img, section#madden .game-card img').all()){
   await element.scrollIntoViewIfNeeded();
 }
 await wait(4000);
 const iosImages=await ios.locator('section#nhl .game-card img, section#madden .game-card img').evaluateAll(xs=>xs.map(x=>({game:x.closest('.game-card')?.id,src:x.currentSrc,loaded:x.complete&&x.naturalWidth>0,width:x.naturalWidth,visible:x.getBoundingClientRect().width>0})));
 await ios.locator('section#nhl').scrollIntoViewIfNeeded();
 await ios.screenshot({path:path.join(out,'nhl-webkit-mobile.png'),fullPage:false});
 await ios.locator('section#madden').scrollIntoViewIfNeeded();
 await ios.screenshot({path:path.join(out,'madden-webkit-mobile.png'),fullPage:false});
 const noJS=await webkitBrowser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
 const withoutScript=await noJS.newPage();
 await withoutScript.goto(browserBase,{waitUntil:'domcontentloaded',timeout:30000});
 const staticCardCount=await withoutScript.locator('#sport-sections .game-card').count();
 const staticNhl=await withoutScript.locator('#nhl .game-card img').count();
 const staticMadden=await withoutScript.locator('#madden .game-card img').count();
 assert.equal(staticCardCount,33,'gameplay catalog renders without JavaScript');
 assert.equal(staticNhl,11,'all NHL screenshots are in HTML, not merely external links');
 assert.equal(staticMadden,11,'all Madden screenshots are in HTML, not merely external links');
 const safariReport={engine:'Playwright WebKit',viewport:'390x844',sourced_images:iosImages.length,loaded_images:iosImages.filter(x=>x.loaded).length,unloaded:iosImages.filter(x=>!x.loaded),js_errors:iosErrors,static_without_javascript:{cards:staticCardCount,nhl:staticNhl,madden:staticMadden}};
 fs.writeFileSync(path.join(out,'webkit-report.json'),JSON.stringify(safariReport,null,2)+'\n');
 console.log('WEBKIT '+JSON.stringify({loaded:safariReport.loaded_images,total:iosImages.length,static_cards:staticCardCount,errors:iosErrors}));
 await noJS.close();await iosContext.close();await webkitBrowser.close();
 assert.equal(iosErrors.length,0,'WebKit JavaScript runs cleanly');
 assert.equal(iosImages.filter(x=>x.loaded).length,22,'all NHL and Madden images render in WebKit');
 await browser.close();
 // Missing sources are documented research gaps, not automatically a test failure.
 if(report.browser_failed_or_blocked || report.all_capture_failed) { console.error('Browser failed to render some traced images. See reference/evidence/browser-report.json');process.exitCode=1; }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
