// Public manifest v1. Only metadata of explicitly PUBLISHED releases.
// Never put private drafts, unreleased titles or secrets in catalog.json.
export const CATALOG_FORMAT = "stage-lighting-show-catalog";
const isInt=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const text=(s,max=256)=>typeof s==="string"&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
const validSlug=s=>typeof s==="string"&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
const validPath=s=>typeof s==="string"&&/^shows\/[a-z0-9][a-z0-9_-]{0,63}\/releases\/r[0-9]{4,10}\.json$/.test(s);
const fail=why=>{throw new Error("公演カタログ: "+why);};

export function readCatalog(json) {
  let data;
  try{data=typeof json==="string"?JSON.parse(json):json;}catch{fail("JSONを解析できません");}
  if(!data||typeof data!=="object"||Array.isArray(data) || data.format!==CATALOG_FORMAT||data.version!==1||!Array.isArray(data.shows)||data.shows.length>200)fail("形式または公演数が不正です");
  const ids=new Set(),slugs=new Set(),paths=new Set();
  for(const show of data.shows) {
    if(!show||typeof show!=="object"||!validSlug(show.slug)||!text(show.showId,64)||!show.showId||!text(show.title)||typeof show.archived!=="boolean"||!Array.isArray(show.releases)||show.releases.length>500)fail("公演情報が不正です");
    if(ids.has(show.showId)||slugs.has(show.slug))fail("公演IDまたはslugが重複しています");
    ids.add(show.showId);slugs.add(show.slug);
    const revisions=new Set();
    for(const release of show.releases) {
      if(!release||typeof release!=="object"||!isInt(release.revision,0,2147483647)||!text(release.label,128)||!text(release.path,256)||
         !isInt(release.cueCount,0,256)||!isInt(release.dataSchema,1,5)||
         !["rehearsal","candidate","final"].includes(release.stage)||!validPath(release.path)||
         !release.path.startsWith("shows/"+show.slug+"/releases/")) fail("Release情報が不正です");
      if(revisions.has(release.revision)||paths.has(release.path))fail("Release番号かパスが重複しています");
      revisions.add(release.revision);paths.add(release.path);
    }
    if(show.publishedRevision!==null && !revisions.has(show.publishedRevision))fail("本番指定のRevisionが存在しません");
  }
  return data;
}
export function releaseURL(release,base) {
  if(!validPath(release?.path))fail("配信用パスが不正です");
  // Paths are catalog-controlled, never arbitrary external URLs.
  const baseURL=new URL(base);
  const url=new URL(release.path,baseURL);
  if(url.origin!==baseURL.origin || !url.pathname.startsWith(baseURL.pathname))fail("外部URLへ移動できません");
  return url.href;
}
export function selectedRelease(show, revision) {
  return show?.releases.find(item=>item.revision===Number(revision))||null;
}
