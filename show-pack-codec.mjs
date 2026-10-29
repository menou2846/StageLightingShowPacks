// Stage Lighting Console Remote Pack v1 — browser-safe lossless NAME editor.
// Source compatibility: StageLightingShowData.BuildSnapshot / ComputeHash.
// This module never calls GitHub APIs or changes working LIVE/VRChat state.
export const MAX_JSON_BYTES = 1_400_000;
export const MAX_BODY_BYTES = 1_048_576;
const utf8 = new TextEncoder();
const MAX_INT = 2147483647;
const MAX_STR = 256;
const fail = message => { throw new Error(message); };
const isInt = (v,min,max) => Number.isSafeInteger(v) && v >= min && v <= max;
const u32 = value => value >>> 0;

export function nameCheck(value, max=MAX_STR) {
  if (typeof value !== "string" || value.length > max) fail("文字数が上限を超えているか、名称が文字列ではありません");
  if (/[\u0000-\u001f\u007f]/u.test(value)) fail("改行・制御文字は名称に使用できません");
  for (let i=0; i<value.length; i++) {
    const x=value.charCodeAt(i);
    if (x>=0xd800 && x<=0xdbff) {
      const n=value.charCodeAt(++i);
      if (!(n>=0xdc00 && n<=0xdfff)) fail("文字列に不正なUnicodeがあります");
    } else if (x>=0xdc00 && x<=0xdfff) fail("文字列に不正なUnicodeがあります");
  }
  return value;
}

function intBytes(value) {
  const out=new Uint8Array(4), v=new DataView(out.buffer);
  v.setInt32(0,value,true); return out;
}
function strBytes(value) {
  if (value===null) return intBytes(-1);
  nameCheck(value);
  const out=new Uint8Array(4+value.length*2), dv=new DataView(out.buffer);
  dv.setInt32(0,value.length,true);
  for(let i=0;i<value.length;i++) dv.setUint16(4+2*i,value.charCodeAt(i),true);
  return out;
}
function join(parts) {
  const length=parts.reduce((s,b)=>s+b.length,0), out=new Uint8Array(length);
  let p=0; for(const b of parts) {out.set(b,p);p+=b.length;}
  return out;
}
function sameBytes(a,b) {
  if(a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
}
function fromB64(encoded) {
  if (typeof encoded!=="string" || encoded.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail("Base64が不正です");
  const b=atob(encoded);
  const out=Uint8Array.from(b,c=>c.charCodeAt(0));
  if(toB64(out)!==encoded)fail("Base64が正規形式ではありません");
  return out;
}
function toB64(bytes) {
  const parts=[];
  for(let i=0;i<bytes.length;i+=8192) {
    const slice=bytes.subarray(i,i+8192);
    let s="";for(let j=0;j<slice.length;j++)s+=String.fromCharCode(slice[j]);
    parts.push(s);
  }
  return btoa(parts.join(""));
}
export function fnv32(body,schema,cues,changes,roles) {
  let h=2166136261>>>0;
  const header=join([intBytes(schema),intBytes(cues),intBytes(changes),intBytes(roles),intBytes(body.length)]);
  for(const b of header){h=Math.imul((h^b)>>>0,16777619)>>>0;}
  for(const b of body){h=Math.imul((h^b)>>>0,16777619)>>>0;}
  return h.toString(16).padStart(8,"0");
}
class Reader {
  constructor(data){this.data=data;this.pos=0;this.dv=new DataView(data.buffer,data.byteOffset,data.byteLength);}
  take(n){if(!isInt(n,0,this.data.length-this.pos))fail("Snapshotが途中で切れています");const o=this.data.subarray(this.pos,this.pos+n);this.pos+=n;return o;}
  i(){this.take(4);return this.dv.getInt32(this.pos-4,true);}
  b(){return this.take(1)[0];}
  str(){
    const n=this.i();
    if(n===-1)return null;
    if(!isInt(n,0,MAX_STR))fail("Snapshot文字列の長さが不正です");
    const at=this.pos;this.take(n*2);
    let result="";for(let i=0;i<n;i++)result+=String.fromCharCode(this.dv.getUint16(at+i*2,true));
    return result;
  }
}
function integerFields(pack) {
  const limits={packVersion:[1,1],dataSchema:[1,5],cueCount:[0,256],changeCount:[0,4096],roleCount:[1,16],fixtureCount:[0,4096],bodyLength:[1,MAX_BODY_BYTES],releaseRevision:[0,MAX_INT],saveRevision:[0,MAX_INT-1],workingRevision:[0,MAX_INT-1]};
  for(const [field,[min,max]] of Object.entries(limits)){
    if(!isInt(pack[field],min,max))fail("Remote Packメタデータが不正です: "+field);
  }
}
export function readPack(raw) {
  // Accept UTF-8 encoded bytes or JSON text; never execute imported content.
  if (typeof raw!=="string" && !(raw instanceof Uint8Array)) fail("JSONの形式が不正です");
  const json=typeof raw==="string"?raw:new TextDecoder("utf-8",{fatal:true}).decode(raw);
  if(utf8.encode(json).length>MAX_JSON_BYTES)fail("JSONが上限を超えています");
  let pack;
  try{pack=JSON.parse(json);}catch{fail("JSONを解析できません");}
  if(!pack||typeof pack!=="object"||Array.isArray(pack)||pack.format!=="stage-lighting-show-pack")fail("Stage Lighting Show Packではありません");
  integerFields(pack);
  if (pack.payloadEncoding!=="base64" || typeof pack.payloadBase64!=="string")fail("非対応のSnapshot形式です");
  nameCheck(pack.showId,64);
  if(!pack.showId)fail("Show IDが空です");
  nameCheck(pack.displayName,64);
  if(typeof pack.bodyHashFNV1a32!=="string" || !/^[0-9a-fA-F]{8}$/.test(pack.bodyHashFNV1a32))fail("ハッシュの形式が不正です");
  if(pack.payloadBase64.length!==Math.ceil(pack.bodyLength/3)*4)fail("Base64サイズが一致しません");
  const body=fromB64(pack.payloadBase64);
  if(body.length!==pack.bodyLength)fail("Snapshot長が一致しません");
  const checksum=fnv32(body,pack.dataSchema,pack.cueCount,pack.changeCount,pack.roleCount);
  if(checksum!==pack.bodyHashFNV1a32.toLowerCase())fail("Snapshotハッシュが一致しません");
  const reader=new Reader(body);
  if(reader.str()!==pack.showId)fail("Show IDがSnapshotと一致しません");
  for(let i=0;i<pack.roleCount;i++){reader.str();reader.str();reader.str();}
  const cues=[];let changes=0;
  for(let c=0;c<pack.cueCount;c++){
    const uid=reader.str();const groups=reader.i();
    if(!uid || !isInt(groups,1,4))fail("Cue UID/Timingが不正です");
    reader.take(groups*12);
    const look=reader.b();if(look!==0&&look!==1)fail("LOOK flagが不正です");
    if(look)reader.take(4+7*4);
    const count=reader.i();if(!isInt(count,0,pack.changeCount-changes))fail("Change件数が不正です");
    changes+=count;
    cues.push({uid,jp:"",en:"",actUid:""});
  }
  if(changes!==pack.changeCount)fail("Change件数が一致しません");
  for(let i=0;i<pack.changeCount;i++){
    reader.str();reader.take(4+4+4+16+1+4+4+1+16+16+4+4+1);
    reader.str();reader.take(4);
  }
  const prefixEnd=reader.pos;let suffixStart=prefixEnd;
  const acts=[];let showJp="",showEn="";
  if(pack.dataSchema>=2){
    showJp=reader.str();showEn=reader.str();
    if(showJp===null||showEn===null)fail("公演名が不正です");
    const count=reader.i();if(!isInt(count,0,256))fail("Act数が不正です");
    for(let i=0;i<count;i++){
      const uid=reader.str(),jp=reader.str(),en=reader.str();
      if(!uid||jp===null||en===null)fail("Act情報が不正です");
      acts.push({uid,jp,en});
    }
    for(const cue of cues){
      cue.jp=reader.str();cue.en=reader.str();cue.actUid=reader.str();
      if(cue.jp===null||cue.en===null||cue.actUid===null)fail("Cue名称が不正です");
    }
    suffixStart=reader.pos;
  }
  if(pack.dataSchema>=3){
    for(let c=0;c<cues.length;c++)if(reader.b()>1)fail("V3 Cue flagが不正です");
    for(let i=0;i<pack.changeCount;i++){
      const mask=reader.i();if(!isInt(mask,0,63))fail("START maskが不正です");
      if(mask)reader.take(4+16+1+4+4+1);
    }
  }
  if(pack.dataSchema>=5){
    for(let c=0;c<cues.length;c++){reader.str();reader.str();reader.str();reader.take(8);}
    const count=reader.i();if(!isInt(count,0,8))fail("LOOK preset数が不正です");
    for(let i=0;i<count;i++){reader.str();reader.str();reader.str();reader.take(28);}
  }
  if(reader.pos!==body.length)fail("Snapshotに余分なデータがあります");
  const actUIDs=new Set(acts.map(a=>a.uid));
  if(actUIDs.size!==acts.length || new Set(cues.map(c=>c.uid)).size!==cues.length)fail("重複UIDがあります");
  if(cues.some(c=>c.actUid && !actUIDs.has(c.actUid)))fail("CueのAct参照が不正です");
  return {pack,body,checksum,prefixEnd,suffixStart,acts,cues,showJp,showEn,displayName:pack.displayName};
}
export function exportEditedPack(source,{displayName,showJp,showEn,acts,cues,revision}) {
  const {pack,body,prefixEnd,suffixStart}=source;
  if(pack.dataSchema<2)fail("Schema 1は名称編集できません");
  if(!isInt(revision,pack.releaseRevision+1,MAX_INT))fail("Releaseは元データより大きい番号を指定してください");
  if(!isInt(pack.workingRevision+1,0,MAX_INT-1))fail("Working Revision上限です");
  nameCheck(displayName,64);nameCheck(showJp);nameCheck(showEn);
  if(!Array.isArray(acts)||acts.length!==source.acts.length||!Array.isArray(cues)||cues.length!==source.cues.length)fail("Act/Cue件数の変更は禁止です");
  const pieces=[body.subarray(0,prefixEnd),strBytes(showJp),strBytes(showEn),intBytes(acts.length)];
  for(let i=0;i<acts.length;i++){
    if(acts[i].uid!==source.acts[i].uid)fail("Act UIDを変更できません");
    pieces.push(strBytes(acts[i].uid),strBytes(nameCheck(acts[i].jp)),strBytes(nameCheck(acts[i].en)));
  }
  for(let i=0;i<cues.length;i++){
    if(cues[i].uid!==source.cues[i].uid||cues[i].actUid!==source.cues[i].actUid)fail("Cue UID/Act割当を変更できません");
    pieces.push(strBytes(nameCheck(cues[i].jp)),strBytes(nameCheck(cues[i].en)),strBytes(cues[i].actUid));
  }
  pieces.push(body.subarray(suffixStart));
  const result=join(pieces);
  if(result.length>MAX_BODY_BYTES)fail("編集結果がサイズ上限を超えました");
  const packOut={...pack,displayName,releaseRevision:revision,workingRevision:pack.workingRevision+1,
    bodyLength:result.length,bodyHashFNV1a32:fnv32(result,pack.dataSchema,pack.cueCount,pack.changeCount,pack.roleCount),
    payloadBase64:toB64(result)};
  const json=JSON.stringify(packOut);
  if(utf8.encode(json).length>MAX_JSON_BYTES)fail("編集結果のJSONがサイズ上限を超えました");
  const check=readPack(json);
  if(!sameBytes(result.subarray(0,prefixEnd),body.subarray(0,prefixEnd)) ||
     !sameBytes(result.subarray(result.length-(body.length-suffixStart)),body.subarray(suffixStart)) ||
     check.cues.some((c,i)=>c.uid!==source.cues[i].uid||c.actUid!==source.cues[i].actUid)) fail("照明・UID・後続データの維持検証に失敗しました");
  return json;
}
