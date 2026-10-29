import test from "node:test";
import assert from "node:assert/strict";
import {readPack,exportEditedPack,fnv32,nameCheck} from "../show-pack-codec.mjs";
import {readCatalog,releaseURL,selectedRelease} from "../show-library-catalog.mjs";

const str=v => {
  const s=String(v),buffer=Buffer.alloc(4+s.length*2);
  buffer.writeInt32LE(s.length,0);
  for(let i=0;i<s.length;i++)buffer.writeUInt16LE(s.charCodeAt(i),4+i*2);
  return buffer;
};
const int=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
const f=n=>{const b=Buffer.alloc(4);b.writeFloatLE(n);return b;};
const color=(r=1,g=1,b=1,a=1)=>Buffer.concat([f(r),f(g),f(b),f(a)]);
const byte=v=>Buffer.from([v]);
const rawBody = schema => {
  const parts=[
    str("show-001"),
    str("lead"),str("主演"),str("Lead"),
    str("q1"),int(1),f(0),f(3),int(1),byte(0),int(1),
    str("q2"),int(1),f(1),f(2),int(2),byte(0),int(0),
    str("HOUSE"),int(1),int(0),f(.6),color(),byte(1),
    f(0),f(0),byte(0),color(),color(),f(1),f(1),byte(0),str(""),int(0),
    str("くるみ割り"),str("Nutcracker"),int(1),
    str("act_1"),str("第一幕"),str("Act One"),
    str("開演"),str("Opening"),str("act_1"),
    str("夜"),str("Night"),str("")
  ];
  if(schema>=3)parts.push(byte(0),byte(0),int(0));
  if(schema>=5) {
    for(let i=0;i<2;i++)parts.push(str(""),str(""),str(""),int(0),int(0));
    parts.push(int(0));
  }
  return Buffer.concat(parts);
};
function packData(schema=2,body=rawBody(schema)){
  return {
    format:"stage-lighting-show-pack",packVersion:1,dataSchema:schema,showId:"show-001",
    displayName:"リハーサル",releaseRevision:5,saveRevision:1,workingRevision:10,
    cueCount:2,changeCount:1,roleCount:1,fixtureCount:1,bodyLength:body.length,
    bodyHashFNV1a32:fnv32(body,schema,2,1,1),payloadEncoding:"base64",payloadBase64:body.toString("base64")
  };
}
const packJSON=schema=>JSON.stringify(packData(schema));
const array=b=>Buffer.from(b);
test("read the canonical VRC snapshot across schemas 2–5",()=>{
  for(const schema of [2,3,4,5]){
    const result=readPack(packJSON(schema));
    assert.equal(result.pack.dataSchema,schema);
    assert.deepEqual(result.cues.map(c=>c.uid),["q1","q2"]);
    assert.equal(result.cues[0].actUid,"act_1");
    assert.equal(result.acts[0].jp,"第一幕");
    assert.equal(result.showJp,"くるみ割り");
  }
});
test("lossless name editing, exact prefix and tail bytes",()=>{
  for(const schema of [2,3,4,5]){
    const before=readPack(packJSON(schema));
    const acts=before.acts.map(a=>({...a,jp:"第二幕 🎭"}));
    const cues=before.cues.map(c=>({...c,jp:"新しいCue ✨"}));
    const raw=exportEditedPack(before,{
      displayName:"本番版",showJp:"本番用くるみ割り",showEn:before.showEn,
      acts,cues,revision:9
    });
    const after=readPack(raw);
    assert.equal(after.displayName,"本番版");
    assert.equal(after.pack.releaseRevision,9);
    assert.equal(after.pack.workingRevision,11);
    assert.equal(after.pack.saveRevision,1);
    assert.equal(after.cues[0].jp,"新しいCue ✨");
    assert.equal(after.acts[0].jp,"第二幕 🎭");
    assert.equal(after.cues[0].actUid,"act_1");
    assert.deepEqual(array(after.body.subarray(0,after.prefixEnd)),array(before.body.subarray(0,before.prefixEnd)));
    assert.deepEqual(array(after.body.subarray(after.suffixStart)),array(before.body.subarray(before.suffixStart)));
    assert.equal(before.pack.releaseRevision,5);
  }
});
test("no name change preserves binary payload exactly",()=>{
  const before=readPack(packJSON(5));
  const after=readPack(exportEditedPack(before,{
    displayName:before.displayName,showJp:before.showJp,showEn:before.showEn,
    acts:before.acts,cues:before.cues,revision:6
  }));
  assert.deepEqual(array(after.body),array(before.body));
});
test("revisions and stable identities are protected",()=>{
  const base=readPack(packJSON(2));
  const edit={displayName:base.displayName,showJp:base.showJp,showEn:base.showEn,acts:base.acts,cues:base.cues,revision:5};
  assert.throws(()=>exportEditedPack(base,edit),/Release/);
  edit.revision=6;edit.cues=[...base.cues];edit.cues[0]={...edit.cues[0],uid:"changed"};
  assert.throws(()=>exportEditedPack(base,edit),/UID/);
  assert.throws(()=>nameCheck("hello\nworld"),/制御/);
  assert.throws(()=>nameCheck("a".repeat(257)),/上限/);
});
test("tampering and truncation are rejected",()=>{
  const data=packData(5);
  data.bodyHashFNV1a32="00000000";
  assert.throws(()=>readPack(JSON.stringify(data)),/ハッシュ/);
  const s=packData(5);
  const body=rawBody(5).subarray(0,-1);
  s.bodyLength=body.length;s.payloadBase64=body.toString("base64");s.bodyHashFNV1a32=fnv32(body,5,2,1,1);
  assert.throws(()=>readPack(JSON.stringify(s)),/途中/);
});
test("catalog validates releases and blocks path traversal",()=>{
  const catalog={format:"stage-lighting-show-catalog",version:1,shows:[
    {slug:"nutcracker",showId:"show-001",title:"くるみ割り人形",archived:false,publishedRevision:3,releases:[
      {revision:1,label:"リハ",stage:"rehearsal",cueCount:2,dataSchema:5,path:"shows/nutcracker/releases/r0001.json"},
      {revision:3,label:"本番",stage:"final",cueCount:2,dataSchema:5,path:"shows/nutcracker/releases/r0003.json"}]},
    {slug:"opera",showId:"show-002",title:"別公演",archived:true,publishedRevision:null,releases:[]}
  ]};
  assert.equal(readCatalog(JSON.stringify(catalog)).shows.length,2);
  assert.equal(selectedRelease(catalog.shows[0],3).revision,3);
  const u=releaseURL(catalog.shows[0].releases[1],new URL("https://owner.github.io/ShowPacks/"));
  assert.equal(u,"https://owner.github.io/ShowPacks/shows/nutcracker/releases/r0003.json");
  catalog.shows[0].releases[0].path="../private.json";
  assert.throws(()=>readCatalog(catalog),/不正/);
});
