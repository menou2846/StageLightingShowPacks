// Offline regression tests: StageLightingShowData Schema 7 (LOOK RGB) and Schema 8 (BEAM FX) tails.
// Layout matches StageLightingShowData.BuildSnapshot and the PC tools (StageLightingConsole PR #12 / #13).
// Run with: node --test tests/schema78-codec.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readPack,exportEditedPack,fnv32} from "../show-pack-codec.mjs";
import {readCatalog} from "../show-library-catalog.mjs";

const FX=[-1,.6,2,.4];
// looks: LOOK flag per Cue. presets: written only when named. rgb: Schema 7 floats (default neutral).
// beamFx: Schema 8 floats for the one Change (sets mask bit 8192). mask: override. tail: extra bytes.
function packBytes(schema,{named=true,looks=[false,false],presets=0,rgb=null,beamFx=null,mask=null,tail=null}={}){
  const parts=[];
  const push=b=>parts.push(b);
  const i=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);push(b);};
  const f=n=>{const b=Buffer.alloc(4);b.writeFloatLE(n);push(b);};
  const byte=n=>push(Buffer.from([n]));
  const str=s=>{if(s===null){i(-1);return;}const u=Buffer.from(s,"utf16le");i(u.length/2);push(u);};
  str("show-001");
  for(let r=0;r<12;r++){str("ROLE_"+String(r+1).padStart(2,"0"));str("役"+(r+1));str("Role "+(r+1));}
  for(let c=0;c<2;c++){
    str("q"+(c+1));i(1);f(c);f(2);i(1);
    if(looks[c]){byte(1);i(0);for(let k=0;k<7;k++)f(.1*(k+1));}else byte(0);
    i(c===0?1:0);
  }
  str("SPOT_L");
  i(mask??(2048|(beamFx?8192:0)));i(0);f(.6);
  for(let k=0;k<4;k++)f(1);
  byte(1);f(0);f(0);byte(0);
  for(let k=0;k<8;k++)f(1);
  f(1);f(1);byte(0);str("");i(0);
  str("くるみ割り");str("Nutcracker");i(1);
  str("act_1");str("第一幕");str("Act One");
  str("開演");str("Opening");str("act_1");
  str("夜");str("Night");str("");
  byte(0);byte(0);i(0);                       // Schema 3+: V3 flags, START mask 0
  byte(named?1:0);                            // Schema 6+: LOOK section flag
  if(named){
    for(let c=0;c<2;c++){str("");str("");str("");i(0);i(0);}
    i(presets);
    for(let p=0;p<presets;p++){str("preset_"+p);str("プリセット"+p);str("Preset "+p);for(let k=0;k<7;k++)f(.25);}
  }
  f(75);                                      // Schema 6 IRIS for the 2048 Change
  if(schema>=7)for(const v of rgb??Array(3*(looks.filter(Boolean).length+(named?presets:0))).fill(1))f(v);
  if(beamFx)for(const v of beamFx)f(v);
  if(tail)push(tail);
  const body=Buffer.concat(parts);
  return {format:"stage-lighting-show-pack",packVersion:1,dataSchema:schema,showId:"show-001",displayName:"リハ版",
    releaseRevision:5,saveRevision:1,workingRevision:10,cueCount:2,changeCount:1,roleCount:12,fixtureCount:1,
    bodyLength:body.length,bodyHashFNV1a32:fnv32(body,schema,2,1,12),payloadEncoding:"base64",payloadBase64:body.toString("base64")};
}
const load=pack=>readPack(JSON.stringify(pack));
const tailFloats=(doc,n)=>Array.from({length:n},(_,k)=>Buffer.from(doc.body).readFloatLE(doc.body.length-4*(n-k)));

function renameRoundtrip(pack){
  const before=load(pack);
  const cues=before.cues.map(c=>({...c}));cues[0].jp="新しい場面";
  const raw=exportEditedPack(before,{displayName:"編集後",showJp:"くるみ割り 新版",showEn:"New",
    acts:[...before.acts.map(a=>({...a})),{uid:"act_2",jp:"第二幕",en:"Act Two"}],cues:cues.map((c,i)=>i===1?{...c,actUid:"act_2"}:c),revision:6});
  const after=readPack(raw);
  assert.equal(after.pack.dataSchema,pack.dataSchema);
  assert.equal(after.cues[0].jp,"新しい場面");
  assert.equal(after.cues[1].actUid,"act_2");
  assert.deepEqual(Buffer.from(after.body.subarray(0,after.prefixEnd)),Buffer.from(before.body.subarray(0,before.prefixEnd)));
  assert.deepEqual(Buffer.from(after.body.subarray(after.suffixStart)),Buffer.from(before.body.subarray(before.suffixStart)));
}

test("Schema 7 LOOK RGB: Cue triples then preset triples, exact tail, lossless rename",()=>{
  const cases=[
    {named:false},
    {named:false,looks:[true,false],rgb:[.1,.2,.3]},
    {named:true,presets:2,rgb:[0,.5,1,.25,.75,0]},
    {named:true,looks:[true,true],presets:1,rgb:[.1,.2,.3,.4,.5,.6,.7,.8,.9]},
    {named:false,looks:[false,true],presets:0,rgb:[.3,.3,.3]},
  ];
  for(const kw of cases){
    const pack=packBytes(7,kw);const doc=load(pack);
    const rgb=kw.rgb??[];
    assert.deepEqual(tailFloats(doc,rgb.length).map(Math.fround),rgb.map(Math.fround));
    renameRoundtrip(pack);
  }
});

test("Schema 7 rejects bad RGB values, missing / extra floats, Schema 6 body relabelled",()=>{
  for(const bad of [-.001,1.001,NaN,Infinity])
    assert.throws(()=>load(packBytes(7,{named:true,looks:[true,false],presets:1,rgb:[.5,.5,.5,.5,.5,bad]})),/LOOK RGB/);
  assert.throws(()=>load(packBytes(7,{named:true,looks:[true,false],presets:1,rgb:[1,1,1,1,1]})),/途中/);
  assert.throws(()=>load(packBytes(7,{named:true,looks:[true,false],presets:1,rgb:[1,1,1,1,1,1,1,1,1]})),/余分/);
  assert.throws(()=>load({...packBytes(6,{looks:[true,false]}),dataSchema:7,
    bodyHashFNV1a32:fnv32(Buffer.from(packBytes(6,{looks:[true,false]}).payloadBase64,"base64"),7,2,1,12)}),/途中/);
});

test("Schema 8 BEAM FX: 4 floats per BEAM_FX Change after the RGB block, lossless rename",()=>{
  for(const kw of [{named:false},{named:true,looks:[true,false],presets:1,rgb:[.1,.2,.3,.4,.5,.6]}]){
    const pack=packBytes(8,{...kw,beamFx:FX});const doc=load(pack);
    assert.deepEqual(tailFloats(doc,4).map(Math.fround),FX.map(Math.fround));
    if(kw.rgb)assert.deepEqual(tailFloats(doc,4+kw.rgb.length).slice(0,kw.rgb.length).map(Math.fround),kw.rgb.map(Math.fround));
    renameRoundtrip(pack);
  }
  // Schema 8 without any BEAM_FX Change has no BEAM tail.
  assert.equal(load(packBytes(8,{named:false})).pack.dataSchema,8);
  // Inclusive Unity float32 bounds.
  for(const fx of [[1,.05,.5,.05],[-1,1,6,.99],[1,.5,1.72,.519]])load(packBytes(8,{beamFx:fx}));
});

test("Schema 8 rejects invalid BEAM FX values, truncation, trailing data and bad masks",()=>{
  const bad=[[0,.6,2,.4],[.5,.6,2,.4],[NaN,.6,2,.4],[1,.049,2,.4],[1,1.001,2,.4],[1,0,2,.4],[1,NaN,2,.4],[1,Infinity,2,.4],
    [1,.6,.49,.4],[1,.6,6.01,.4],[1,.6,-Infinity,.4],[1,.6,2,.049],[1,.6,2,.991],[1,.6,2,NaN]];
  for(const fx of bad)assert.throws(()=>load(packBytes(8,{beamFx:fx})),/BEAM FX/,String(fx));
  assert.throws(()=>load(packBytes(8,{beamFx:FX.slice(0,3)})),/途中/);
  assert.throws(()=>load(packBytes(8,{beamFx:FX,tail:Buffer.from([0])})),/余分/);
  assert.throws(()=>load(packBytes(8,{mask:2048|8192})),/途中/);            // bit set, values missing
  assert.throws(()=>load(packBytes(7,{mask:2048|8192,beamFx:FX})),/Change mask/); // 8192 unknown before Schema 8
  for(const mask of [4096|2048,16384,-1])assert.throws(()=>load(packBytes(8,{mask,beamFx:FX})),/Change mask/);
});

test("hash covers the schema; corrupted body rejected; Schema 9 rejected; older schemas unaffected",()=>{
  const pack=packBytes(8,{beamFx:FX});
  assert.throws(()=>load({...pack,dataSchema:7}),/ハッシュ/);
  const body=Buffer.from(pack.payloadBase64,"base64");body[body.length-1]^=1;
  assert.throws(()=>load({...pack,payloadBase64:body.toString("base64")}),/ハッシュ/);
  const nine=packBytes(8,{beamFx:FX});
  assert.throws(()=>load({...nine,dataSchema:9,bodyHashFNV1a32:fnv32(Buffer.from(nine.payloadBase64,"base64"),9,2,1,12)}),/dataSchema/);
});

test("catalog accepts dataSchema 7 and 8, rejects 9",()=>{
  const catalog=schema=>JSON.stringify({format:"stage-lighting-show-catalog",version:1,shows:[{
    slug:"nutcracker",showId:"show-001",title:"くるみ割り",archived:false,publishedRevision:null,releases:[{
      revision:5,label:"テスト",stage:"rehearsal",cueCount:2,dataSchema:schema,path:"shows/nutcracker/releases/r0005.json"}]}]});
  for(const s of [7,8])assert.equal(readCatalog(catalog(s)).shows[0].releases[0].dataSchema,s);
  assert.throws(()=>readCatalog(catalog(9)));
});
