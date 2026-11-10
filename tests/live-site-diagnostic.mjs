import {chromium} from "playwright";
const url="https://menou2846.github.io/StageLightingShowPacks/";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[],failed=[],scripts=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",msg=>{if(msg.type()==="error")errors.push("console: "+msg.text());});
page.on("requestfailed",r=>failed.push({url:r.url(),failure:r.failure()?.errorText}));
page.on("response",r=>{if(/\.(?:mjs|json)(?:\?|$)/.test(r.url()))scripts.push({url:r.url(),status:r.status(),type:r.headers()["content-type"]});});
try{
  try{await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});}
  catch(e){errors.push("navigation: "+e.message);}
  try{await page.waitForFunction(()=>!document.querySelector("#fixed-name")?.textContent.includes("確認中"),{timeout:12000});}catch{}
  const snapshot=await page.evaluate(()=>({
    url:location.href, title:document.title,
    status:document.querySelector("#status")?.textContent,
    name:document.querySelector("#fixed-name")?.textContent,
    updated:document.querySelector("#fixed-updated")?.textContent,
    scriptTags:[...document.scripts].map(s=>({src:s.src,type:s.type})),
    resources:performance.getEntriesByType("resource").filter(r=>/mjs|json/.test(r.name)).map(r=>({name:r.name,duration:Math.round(r.duration),size:r.transferSize})),
  })).catch(e=>({error:String(e)}));
  console.log("LIVE_DIAGNOSTIC",JSON.stringify({snapshot,errors,failed,scripts},null,2));
}finally{await browser.close();}
