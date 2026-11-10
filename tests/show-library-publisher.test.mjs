import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {readPack,exportEditedPack} from "../show-pack-codec.mjs";
import {readCatalog} from "../show-library-catalog.mjs";
import {publishFixedShow} from "../show-library-publisher.mjs";

const repo="/repos/menou2846/StageLightingShowPacks";
const original=await readFile(new URL("../show-pack.json",import.meta.url),"utf-8");
const originalDoc=readPack(original);
const next=exportEditedPack(originalDoc,{
  displayName:"本番候補",
  showJp:originalDoc.showJp,
  showEn:originalDoc.showEn,
  acts:originalDoc.acts,
  cues:originalDoc.cues,
  revision:originalDoc.pack.releaseRevision+1
});
const baseCatalog=JSON.stringify({format:"stage-lighting-show-catalog",version:1,shows:[]});
function response(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
}
function mockGitHub({conflictingRelease=false,failAtRef=false}={}){
  const calls=[],written=new Map();
  let counter=0,treeRequest=null;
  const slug=originalDoc.pack.showId.toLowerCase().replace(/[^a-z0-9_-]/g,"-").replace(/^-+/,"").slice(0,63);
  const oldPath="shows/"+slug+"/releases/r"+String(originalDoc.pack.releaseRevision).padStart(4,"0")+".json";
  const files=[
    {path:"catalog.json",sha:"catalogblob",type:"blob"},
    {path:"show-pack.json",sha:"oldblob",type:"blob"}
  ];
  if(conflictingRelease)files.push({path:oldPath,sha:"conflictblob",type:"blob"});
  globalThis.location={origin:"https://menou2846.github.io",pathname:"/StageLightingShowPacks/"};
  globalThis.fetch=async(url,opts)=>{
    const path=new URL(url).pathname+new URL(url).search;
    const data=opts.body?JSON.parse(opts.body):null;
    calls.push({path,method:opts.method,body:data,authorization:opts.headers.Authorization});
    if(path==="/user")return response({login:"menou2846"});
    if(path===repo+"/git/ref/heads/main")return response({object:{sha:"oldcommit"}});
    if(path===repo+"/git/commits/oldcommit")return response({tree:{sha:"oldtree"}});
    if(path===repo+"/git/trees/oldtree?recursive=1")return response({truncated:false,tree:files});
    if(path===repo+"/git/blobs/oldblob")return response({encoding:"base64",content:Buffer.from(original).toString("base64")});
    if(path===repo+"/git/blobs/catalogblob")return response({encoding:"base64",content:Buffer.from(baseCatalog).toString("base64")});
    if(path===repo+"/git/blobs/conflictblob")return response({encoding:"base64",content:Buffer.from("{}").toString("base64")});
    if(path===repo+"/git/blobs" && opts.method==="POST"){
      const sha="newblob"+(++counter);
      written.set(sha,data.content);
      return response({sha});
    }
    if(path===repo+"/git/trees" && opts.method==="POST"){
      treeRequest=data;
      return response({sha:"newtree"});
    }
    if(path===repo+"/git/commits" && opts.method==="POST")return response({sha:"newcommit"});
    if(path===repo+"/git/refs/heads/main" && opts.method==="PATCH"){
      assert.equal(data.force,false);
      return failAtRef?response({message:"non-fast-forward"},422):response({object:{sha:"newcommit"}});
    }
    throw new Error("Unexpected GitHub API call: "+path);
  };
  return {calls,written,oldPath,tree:()=>treeRequest};
}
test("reject non-canonical websites and missing token before API calls",async()=>{
  let invoked=0;
  globalThis.fetch=async()=>{invoked++;throw new Error("must not call API");};
  globalThis.location={origin:"https://evil.example",pathname:"/StageLightingShowPacks/"};
  await assert.rejects(publishFixedShow(next,"secret"),/正規GitHub Pages/);
  globalThis.location={origin:"https://menou2846.github.io",pathname:"/StageLightingShowPacks/"};
  await assert.rejects(publishFixedShow(next,""),/トークン/);
  assert.equal(invoked,0);
});
test("atomic publish archives old and new releases, never commits token",async()=>{
  const mock=mockGitHub();
  const result=await publishFixedShow(next,"secret",{stage:"candidate",label:"本番候補"});
  assert.equal(result.revision,originalDoc.pack.releaseRevision+1);
  assert.equal(result.commit,"newcommit");
  const tree=mock.tree();
  assert.equal(tree.base_tree,"oldtree");
  const contents=new Map(tree.tree.map(entry=>[entry.path,mock.written.get(entry.sha)]));
  assert.equal(contents.get("show-pack.json"),next);
  assert.equal(contents.get(mock.oldPath),original);
  const archivedNew="shows/"+originalDoc.pack.showId+"/releases/r"+
    String(originalDoc.pack.releaseRevision+1).padStart(4,"0")+".json";
  assert.equal(contents.get(archivedNew),next);
  const cat=readCatalog(contents.get("catalog.json"));
  assert.equal(cat.shows.length,1);
  assert.deepEqual(cat.shows[0].releases.map(r=>r.revision),[
    originalDoc.pack.releaseRevision,originalDoc.pack.releaseRevision+1]);
  assert.equal(cat.shows[0].publishedRevision,originalDoc.pack.releaseRevision+1);
  assert.equal(mock.calls.some(c=>c.method==="PATCH"),true);
  assert.equal(JSON.stringify([...contents.values()]).includes("secret"),false);
  assert.equal(mock.calls.every(c=>c.authorization==="Bearer secret"),true);
});
test("reject conflicting immutable release before any write",async()=>{
  const mock=mockGitHub({conflictingRelease:true});
  await assert.rejects(publishFixedShow(next,"secret"),/異なる内容/);
  assert.equal(mock.calls.some(c=>c.method==="POST"||c.method==="PATCH"),false);
});
test("reject racing GitHub updates without forcing refs",async()=>{
  const mock=mockGitHub({failAtRef:true});
  await assert.rejects(publishFixedShow(next,"secret"),/状態が変更/);
  assert.equal(mock.calls.some(c=>c.method==="PATCH"&&c.body.force===false),true);
});
