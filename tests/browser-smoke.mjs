// Playwright browser smoke test for public page, offline JSON upload and edit download.
import assert from "node:assert/strict";
import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,sep} from "node:path";
import {chromium} from "playwright";
import {fnv32,readPack} from "../show-pack-codec.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const str=s=>{const b=Buffer.alloc(4+s.length*2);b.writeInt32LE(s.length,0);for(let i=0;i<s.length;i++)b.writeUInt16LE(s.charCodeAt(i),4+2*i);return b;};
const i32=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
const f32=n=>{const b=Buffer.alloc(4);b.writeFloatLE(n);return b;};
const color=()=>Buffer.concat([f32(1),f32(1),f32(1),f32(1)]);
function mockPack(){
  const body=Buffer.concat([
    str("smoke-001"),str("lead"),str("主演"),str("Lead"),
    str("cue-1"),i32(1),f32(0),f32(3),i32(1),Buffer.from([0]),i32(1),
    str("HOUSE"),i32(1),i32(0),f32(.7),color(),Buffer.from([1]),
    f32(0),f32(0),Buffer.from([0]),color(),color(),f32(1),f32(1),
    Buffer.from([0]),str(""),i32(0),
    str("公演サンプル"),str("Show Sample"),i32(1),str("act_01"),str("第一幕"),str("Act One"),
    str("開幕"),str("Opening"),str("act_01")
  ]);
  const pack={
    format:"stage-lighting-show-pack",packVersion:1,dataSchema:2,showId:"smoke-001",
    displayName:"テスト用",releaseRevision:1,saveRevision:1,workingRevision:1,
    cueCount:1,changeCount:1,roleCount:1,fixtureCount:1,bodyLength:body.length,
    bodyHashFNV1a32:fnv32(body,2,1,1,1),payloadEncoding:"base64",
    payloadBase64:body.toString("base64")
  };
  return JSON.stringify(pack);
}
const mime={"html":"text/html","mjs":"text/javascript","json":"application/json"};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,"http://127.0.0.1");
    const relative=url.pathname==="/"?"/index.html":url.pathname;
    const full=resolve(root,"."+relative);
    if(!full.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const ext=full.split(".").pop();
    const data=await readFile(full);
    res.writeHead(200,{"Content-Type":mime[ext]||"text/plain","Cache-Control":"no-store"});
    res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser=null;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];
  page.on("pageerror",err=>errors.push(String(err)));
  await page.goto("http://127.0.0.1:"+port+"/");
  await page.waitForFunction(()=>document.querySelector("#status").textContent.includes("公開済み公演"));
  assert.equal(await page.isDisabled("#copy-url"),true);
  assert.equal(await page.isDisabled("#download-original"),true);
  // File is processed locally. No outbound HTTP calls, no GitHub authentication.
  const sample=mockPack();
  await page.setInputFiles("#file-input",[{name:"rehearsal.json",mimeType:"application/json",buffer:Buffer.from(sample,"utf8")}]);
  await page.waitForFunction(()=>document.querySelector("#current-title").textContent==="テスト用");
  assert.equal(await page.isDisabled("#copy-url"),true);
  assert.equal(await page.isDisabled("#download-original"),false);
  await page.click("#tab-edit");
  assert.equal(await page.inputValue("#show-jp"),"公演サンプル");
  await page.fill("#show-jp","本番用公演");
  await page.fill("#release-number","2");
  page.on("dialog",dialog=>dialog.accept());
  const downloadPromise=page.waitForEvent("download");
  await page.click("#download-edit");
  const download=await downloadPromise;
  const file=await download.path();
  const edited=readPack(await readFile(file));
  assert.equal(edited.showJp,"本番用公演");
  assert.equal(edited.pack.releaseRevision,2);
  assert.equal(edited.pack.cueCount,1);
  assert.equal(edited.cues[0].uid,"cue-1");
  assert.deepEqual(errors,[]);
  console.log("Browser smoke PASS: empty catalog, local upload, safe edit and JSON download");
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
