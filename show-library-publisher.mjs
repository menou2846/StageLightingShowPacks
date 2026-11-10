// GitHub Pages is static. Publishing requires an explicitly supplied, narrowly scoped
// fine-grained GitHub token. The token stays in the caller's memory for this operation;
// it is never persisted, logged, put in a URL, or committed to the repository.
import {readPack} from "./show-pack-codec.mjs";
import {readCatalog} from "./show-library-catalog.mjs";

const REPO = "menou2846/StageLightingShowPacks";
const BRANCH = "main";
const API = "https://api.github.com";
const EMPTY = {format:"stage-lighting-show-catalog",version:1,shows:[]};
const utf8 = new TextDecoder("utf-8",{fatal:true});

function reason(message) { throw new Error(message); }
function safeSlug(id) {
  const slug = id.toLowerCase().replace(/[^a-z0-9_-]/g,"-").replace(/^-+/,"").slice(0,63);
  if (!slug || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) reason("Show IDから安全な保存先を作れません");
  return slug;
}
function pathFor(slug,rev) {
  return "shows/"+slug+"/releases/r"+String(rev).padStart(4,"0")+".json";
}
function ensureShow(catalog,doc) {
  const id=doc.pack.showId;
  let show=catalog.shows.find(item=>item.showId===id);
  if (show) return show;
  if (catalog.shows.length>=200) reason("公演一覧の上限を超えています");
  const slug=safeSlug(id);
  if(catalog.shows.some(item=>item.slug===slug))reason("別公演と保存先名が衝突しました。公開を中止します");
  show={slug,showId:id,title:doc.pack.displayName||doc.showJp||"無題の公演",
    archived:false,publishedRevision:null,releases:[]};
  catalog.shows.push(show);
  return show;
}
function insertRelease(show,doc,path,label,stage) {
  const rev=doc.pack.releaseRevision;
  const existing=show.releases.find(item=>item.revision===rev);
  if(existing) {
    if(existing.path!==path || existing.cueCount!==doc.pack.cueCount || existing.dataSchema!==doc.pack.dataSchema)
      reason("同じRelease番号に別のデータが登録されています。上書きしません");
    return false;
  }
  if(show.releases.length>=500)reason("Release一覧の上限を超えています");
  show.releases.push({revision:rev,label,stage,cueCount:doc.pack.cueCount,
    dataSchema:doc.pack.dataSchema,path});
  return true;
}
async function request(token,path,method="GET",body=null) {
  const response=await fetch(API+path,{method,cache:"no-store",headers:{
    Accept:"application/vnd.github+json",
    Authorization:"Bearer "+token,
    "X-GitHub-Api-Version":"2022-11-28",
    ...(body===null?{}:{"Content-Type":"application/json"})
  },...(body===null?{}:{body:JSON.stringify(body)})});
  let data;
  try{data=await response.json();}catch{data={};}
  if(!response.ok) {
    if(response.status===401 || response.status===403)
      reason("GitHub認証または書き込み権限を確認してください（HTTP "+response.status+"）");
    if(response.status===409 || response.status===422)
      reason("GitHubの状態が変更されました。再読込してやり直してください（HTTP "+response.status+"）");
    reason("GitHub APIの操作に失敗しました（HTTP "+response.status+" / "+String(data.message||"unknown").slice(0,130)+"）");
  }
  return data;
}
async function blobText(token,sha) {
  const result=await request(token,"/repos/"+REPO+"/git/blobs/"+encodeURIComponent(sha));
  if(result.encoding!=="base64" || typeof result.content!=="string")reason("GitHubの保存ファイル形式が不明です");
  const decoded=atob(result.content.replace(/\s+/g,""));
  const bytes=Uint8Array.from(decoded,ch=>ch.charCodeAt(0));
  return utf8.decode(bytes);
}
async function newBlob(token,text) {
  const result=await request(token,"/repos/"+REPO+"/git/blobs","POST",
    {content:text,encoding:"utf-8"});
  if(!result.sha)reason("GitHub Blobの作成結果が不正です");
  return result.sha;
}

export async function publishFixedShow(json,token,{stage="final",label="固定URL公開版"}={}) {
  if(location.origin!=="https://menou2846.github.io" ||
     !location.pathname.startsWith("/StageLightingShowPacks/"))
    reason("公開済みの正規GitHub Pages上でのみ管理者保存できます");
  if(typeof token!=="string" || !token.trim())reason("GitHub管理者トークンを入力してください");
  if(!["rehearsal","candidate","final"].includes(stage))reason("公開ステージが不正です");
  if(typeof label!=="string" || label.length>128 || /[\u0000-\u001f\u007f]/.test(label))
    reason("版のラベルが不正です");
  const incoming=readPack(json), apiToken=token.trim();
  const owner=await request(apiToken,"/user");
  if(String(owner.login||"").toLowerCase()!=="menou2846")
    reason("この公開サイトの保存は所有者アカウント専用です");
  const root="/repos/"+REPO;
  const head=await request(apiToken,root+"/git/ref/heads/"+BRANCH);
  const oldCommit=head.object?.sha;
  if(!oldCommit)reason("mainのHEADが取得できません");
  const commit=await request(apiToken,root+"/git/commits/"+oldCommit);
  const treeSHA=commit.tree?.sha;
  if(!treeSHA)reason("mainのTreeが取得できません");
  const tree=await request(apiToken,root+"/git/trees/"+treeSHA+"?recursive=1");
  if(tree.truncated)reason("GitHubのファイル一覧が省略されました。安全のため中止します");
  const files=new Map((tree.tree||[]).filter(e=>e.type==="blob").map(e=>[e.path,e.sha]));
  const currentRaw=files.has("show-pack.json")?await blobText(apiToken,files.get("show-pack.json")):null;
  const current=currentRaw===null?null:readPack(currentRaw);
  const catalogRaw=files.has("catalog.json")?await blobText(apiToken,files.get("catalog.json")):null;
  const catalog=readCatalog(catalogRaw??JSON.stringify(EMPTY));
  if(currentRaw===json)reason("このSHOWは既に固定URLで配信中です。更新はありません");
  if(current && current.pack.showId===incoming.pack.showId &&
     incoming.pack.releaseRevision<=current.pack.releaseRevision)
    reason("同じ公演は現在の配信版より新しいRelease番号が必要です");
  if(!current && files.has("show-pack.json"))reason("固定URLの既存データを検証できません");

  const additions=new Map();
  async function immutableArchive(doc,raw,releaseLabel,releaseStage) {
    const show=ensureShow(catalog,doc);
    const path=pathFor(show.slug,doc.pack.releaseRevision);
    if(files.has(path)) {
      if(await blobText(apiToken,files.get(path))!==raw)
        reason("過去版の同じRelease番号に異なる内容があります。公開を中止します");
    } else if(additions.has(path)) {
      if(additions.get(path)!==raw)reason("同じRelease番号が重複しています");
    } else additions.set(path,raw);
    insertRelease(show,doc,path,releaseLabel,releaseStage);
    return show;
  }
  if(current)await immutableArchive(current,currentRaw,"固定URLの以前の配信版","final");
  const show=await immutableArchive(incoming,json,label,stage);
  show.title=incoming.pack.displayName||incoming.showJp||show.title;
  show.archived=false;
  show.publishedRevision=incoming.pack.releaseRevision;
  const outputCatalog=JSON.stringify(readCatalog(catalog),null,2)+"\n";
  additions.set("catalog.json",outputCatalog);
  additions.set("show-pack.json",json);
  // Build every immutable release and the fixed URL in ONE non-forced commit.
  // A concurrent editor moving HEAD causes the final ref update to fail.
  const entries=[];
  for(const [path,content] of additions) {
    entries.push({path,mode:"100644",type:"blob",sha:await newBlob(apiToken,content)});
  }
  const nextTree=await request(apiToken,root+"/git/trees","POST",{base_tree:treeSHA,tree:entries});
  const nextCommit=await request(apiToken,root+"/git/commits","POST",{
    message:"feat(show-library): publish verified show to stable URL with archived releases",
    tree:nextTree.sha,parents:[oldCommit]
  });
  await request(apiToken,root+"/git/refs/heads/"+BRANCH,"PATCH",
    {sha:nextCommit.sha,force:false});
  return {commit:nextCommit.sha,showId:incoming.pack.showId,
    revision:incoming.pack.releaseRevision,cues:incoming.pack.cueCount,
    archivedPaths:[...additions.keys()].filter(path=>path.startsWith("shows/")),
    fixedURL:"https://menou2846.github.io/StageLightingShowPacks/show-pack.json"};
}
