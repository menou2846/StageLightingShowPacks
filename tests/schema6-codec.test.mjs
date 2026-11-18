// Offline regression tests: StageLightingShowData Schema 2-6 binary layout.
// Run with: node --test tests/schema6-codec.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readPack,exportEditedPack,fnv32} from "../show-pack-codec.mjs";
import {readCatalog} from "../show-library-catalog.mjs";

function packBytes(schema,{named=true,roles=12,angle=75}={}){
  const parts=[];
  const push=b=>parts.push(b);
  const i=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);push(b);};
  const f=n=>{const b=Buffer.alloc(4);b.writeFloatLE(n);push(b);};
  const byte=n=>push(Buffer.from([n]));
  const str=s=>{
    if(s===null){i(-1);return;}
    const utf16=Buffer.from(s,"utf16le");
    i(utf16.length/2);push(utf16);
  };
  str("show-001");
  for(let r=0;r<roles;r++){
    const uid=r===0?"ROLE_LEAD":r===1?"ROLE_SUPPORT_A":r===2?"ROLE_SUPPORT_B":"ROLE_"+String(r+1).padStart(2,"0");
    str(uid);str("役"+(r+1));str("Role "+(r+1));
  }
  for(let c=0;c<2;c++){
    str("q"+(c+1));i(1);f(c);f(2);i(1);byte(0);i(c===0?1:0);
  }
  str(schema>=6?"SPOT_L":"HOUSE");
  i(schema>=6?2048:1);i(0);f(.6);
  for(let k=0;k<4;k++)f(1);
  byte(1);f(0);f(0);byte(0);
  for(let k=0;k<8;k++)f(1);
  f(1);f(1);byte(0);str("");i(0);
  str("くるみ割り");str("Nutcracker");i(1);
  str("act_1");str("第一幕");str("Act One");
  str("開演");str("Opening");str("act_1");
  str("夜");str("Night");str("");
  if(schema>=3){byte(0);byte(0);i(0);}
  if(schema>=6)byte(named?1:0);
  if(schema===5||(schema>=6&&named)){
    for(let c=0;c<2;c++){str("");str("");str("");i(0);i(0);}
    i(0);
  }
  if(schema>=6)f(angle);
  const body=Buffer.concat(parts);
  const pack={
    format:"stage-lighting-show-pack",packVersion:1,dataSchema:schema,
    showId:"show-001",displayName:"リハ版",releaseRevision:5,
    saveRevision:1,workingRevision:10,cueCount:2,changeCount:1,
    roleCount:roles,fixtureCount:1,bodyLength:body.length,
    bodyHashFNV1a32:fnv32(body,schema,2,1,roles),
    payloadEncoding:"base64",payloadBase64:body.toString("base64")
  };
  return pack;
}

function tamper(pack,mutate){
  const body=Buffer.from(pack.payloadBase64,"base64");
  const changed=mutate(body);
  return {...pack,bodyLength:changed.length,
    payloadBase64:changed.toString("base64"),
    bodyHashFNV1a32:fnv32(changed,pack.dataSchema,pack.cueCount,pack.changeCount,pack.roleCount)};
}

test("Schema 2-6 name-only roundtrip preserves all nonmetadata bytes",()=>{
  for(const schema of [2,3,4,5,6]){
    for(const named of schema===6?[false,true]:[true]){
      const pack=packBytes(schema,{named});
      const before=readPack(JSON.stringify(pack));
      assert.equal(before.cues.length,2);
      const acts=before.acts.map(a=>({...a}));
      const cues=before.cues.map(c=>({...c}));
      cues[0].jp="新しい幕";
      const raw=exportEditedPack(before,{
        displayName:"編集後",showJp:"くるみ割り 新版",showEn:"New Nutcracker",
        acts,cues,revision:6
      });
      const after=readPack(raw);
      assert.equal(after.pack.dataSchema,schema);
      assert.equal(after.pack.roleCount,12);
      assert.equal(after.cues[0].jp,"新しい幕");
      assert.equal(after.pack.releaseRevision,6);
      assert.equal(after.pack.workingRevision,11);
      assert.deepEqual(Buffer.from(after.body.subarray(0,after.prefixEnd)),
        Buffer.from(before.body.subarray(0,before.prefixEnd)));
      assert.deepEqual(Buffer.from(after.body.subarray(after.suffixStart)),
        Buffer.from(before.body.subarray(before.suffixStart)));
      if(schema===6)assert.equal(Buffer.from(after.body).readFloatLE(after.body.length-4),75);
    }
  }
});

test("Schema 6 rejects invalid IRIS, invalid LOOK section flag, truncated tail",()=>{
  const pack=packBytes(6,{named:false});
  assert.throws(()=>readPack(JSON.stringify(tamper(pack,b=>{
    b.writeFloatLE(121,b.length-4);return b;
  }))),/IRIS/);
  assert.throws(()=>readPack(JSON.stringify(tamper(pack,b=>{
    b[b.length-5]=2;return b;
  }))),/LOOK section/);
  assert.throws(()=>readPack(JSON.stringify(tamper(pack,b=>b.subarray(0,b.length-1)))),/途中/);
});

test("Schema 6 catalog entry is accepted without changing live publication",()=>{
  const catalog={format:"stage-lighting-show-catalog",version:1,shows:[{
    slug:"nutcracker",showId:"show-001",title:"くるみ割り",archived:false,
    publishedRevision:null,releases:[{
      revision:5,label:"テスト",stage:"rehearsal",cueCount:2,dataSchema:6,
      path:"shows/nutcracker/releases/r0005.json"
    }]
  }]};
  assert.equal(readCatalog(JSON.stringify(catalog)).shows[0].releases[0].dataSchema,6);
});
