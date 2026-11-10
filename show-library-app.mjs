import {readPack,exportEditedPack,MAX_JSON_BYTES,nameCheck} from "./show-pack-codec.mjs";
import {readCatalog,releaseURL} from "./show-library-catalog.mjs";

const el=id=>document.getElementById(id);
const home=new URL("./",document.baseURI);
const GITHUB_COMMITS="https://api.github.com/repos/menou2846/StageLightingShowPacks/commits?path=show-pack.json&per_page=1";
let source=null,sourceJSON=null,sourceName="",dirty=false;
let draftActs=[],draftCues=[];
let catalog=null,selectedShow=null,selectedRelease=null,currentFixed=null;
const releaseText=n=>"R"+String(n).padStart(4,"0");
// Pages JSON requests also have a bounded wait. A failed request leaves
// the local JSON editor available and shows an explanatory error.
async function fetchWithTimeout(url,options={},ms=8000){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timeout);}
}

function setStatus(message,error=false){
  el("status").textContent=message;
  el("status").className="status "+(error?"error":"ok");
}
function syncDraftText(){
  if(!source)return;
  draftActs.forEach((act,i)=>{
    act.jp=field("act-"+i+"-jp");act.en=field("act-"+i+"-en");
  });
  draftCues.forEach((cue,i)=>{
    cue.jp=field("cue-"+i+"-jp");cue.en=field("cue-"+i+"-en");
  });
}
function changed(){
  if(!source)return;
  syncDraftText();
  dirty=true;
  renderPreview();
  setStatus("名前・Act構成を編集中です。保存するとPCに新しいJSONを作成します。");
}
function switchPage(which){
  const edit=which==="edit"&&Boolean(source)&&source.pack.dataSchema>=2;
  el("preview-panel").classList.toggle("hidden",edit);
  el("edit-panel").classList.toggle("hidden",!edit);
  el("tab-preview").setAttribute("aria-selected",String(!edit));
  el("tab-edit").setAttribute("aria-selected",String(edit));
  if(!edit)renderPreview();
}
function appendPreviewEntry(root,heading,jp,en){
  const row=document.createElement("div");row.className="preview-entry";
  const subtitle=document.createElement("div");subtitle.className="uid";subtitle.textContent=heading;
  const main=document.createElement("strong");main.textContent=jp||"（未設定）";
  const english=document.createElement("small");english.textContent=en||"";
  row.append(subtitle,main,english);
  root.append(row);
}
function renderPreview(){
  if(!source)return;
  const displayName=dirty?el("display-name").value:source.pack.displayName;
  const showJp=dirty?el("show-jp").value:source.showJp;
  const showEn=dirty?el("show-en").value:source.showEn;
  const currentActs=dirty?draftActs:source.acts;
  const currentCues=dirty?draftCues:source.cues;
  const show=el("preview-show");show.replaceChildren();
  appendPreviewEntry(show,displayName||"公演名",showJp,showEn);
  const acts=el("preview-acts");acts.replaceChildren();
  const cues=el("preview-cues");cues.replaceChildren();
  currentActs.forEach((act,i)=>appendPreviewEntry(acts,"Act "+(i+1),act.jp,act.en));
  for(const [i,act] of currentActs.entries()){
    const group=document.createElement("div");group.className="preview-act";
    const title=document.createElement("div");title.className="preview-act-title";
    title.textContent="Act "+(i+1)+"  "+(act.jp||act.en||"（無題）");
    group.append(title);
    currentCues.forEach((cue,n)=>{
      if(cue.actUid===act.uid)
        appendPreviewEntry(group,"Cue "+String(n+1).padStart(3,"0"),cue.jp,cue.en);
    });
    if(!currentCues.some(c=>c.actUid===act.uid)){
      const empty=document.createElement("p");empty.className="tiny";
      empty.textContent="Cueなし";group.append(empty);
    }
    cues.append(group);
  }
  const unassigned=currentCues.filter(c=>!c.actUid);
  if(unassigned.length){
    const group=document.createElement("div");group.className="preview-act";
    const title=document.createElement("div");title.className="preview-act-title";
    title.textContent="Act未割り当て";group.append(title);
    currentCues.forEach((cue,n)=>{
      if(!cue.actUid)appendPreviewEntry(group,"Cue "+String(n+1).padStart(3,"0"),cue.jp,cue.en);
    });
    cues.append(group);
  }
  if(!currentActs.length)acts.textContent="Actはありません。";
  if(!currentCues.length)cues.textContent="Cueはありません。";
  el("preview-notice").textContent=dirty?
    "未保存の編集内容をプレビューしています。PCへ保存するには編集画面へ戻って保存してください。":
    "JSON内のActとCueの所属関係を表示しています。照明・Cueの動作は再生しません。";
}
function confirmSwitch(){
  return !dirty||window.confirm("未保存の名称編集があります。変更を破棄して別のJSONを開きますか？");
}
window.addEventListener("beforeunload",event=>{
  if(dirty){event.preventDefault();event.returnValue="";}
});
function filename(doc){
  const id=String(doc.pack.showId).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,48)||"show";
  return "stage-lighting-"+id+"-r"+String(doc.pack.releaseRevision).padStart(4,"0")+"-edited.json";
}
function downloadText(raw,name){
  const url=URL.createObjectURL(new Blob([raw],{type:"application/json;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
function textField(parent,label,value,key){
  const holder=document.createElement("div"),caption=document.createElement("label");
  caption.textContent=label;
  const input=document.createElement("input");
  input.type="text";input.maxLength=256;input.value=value??"";input.dataset.field=key;
  input.addEventListener("input",changed);
  holder.append(caption,input);parent.append(holder);
}
function renderRows(target,items,prefix){
  const root=el(target);root.replaceChildren();
  if(!items.length){
    const message=document.createElement("p");
    message.className="tiny";message.textContent="項目はありません。";root.append(message);
    return;
  }
  for(const [i,item] of items.entries()){
    const row=document.createElement("div");row.className="edit-row";
    const heading=document.createElement("div");heading.className="uid";
    heading.textContent=prefix==="act"?"Act "+(i+1):"Cue "+String(i+1).padStart(3,"0");
    const fields=document.createElement("div");fields.className="grid";
    textField(fields,"日本語",item.jp,prefix+"-"+i+"-jp");
    textField(fields,"English",item.en,prefix+"-"+i+"-en");
    row.append(heading,fields);
    if(prefix==="cue"){
      const label=document.createElement("label");label.textContent="所属Act";
      const select=document.createElement("select");
      select.dataset.cueAct=String(i);
      select.add(new Option("（Act未割り当て）",""));
      draftActs.forEach((act,j)=>select.add(new Option(
        "Act "+(j+1)+"： "+(act.jp||act.en||"（無題）"),act.uid
      )));
      select.value=item.actUid;
      select.addEventListener("change",()=>{
        syncDraftText();
        draftCues[i].actUid=select.value;
        changed();
        // Refresh Act deletion guards after moving the Cue.
        renderRows("act-list",draftActs,"act");
      });
      row.append(label,select);
    }else{
      const button=document.createElement("button");
      button.type="button";button.className="ghost remove-act";
      button.textContent="このActを削除";
      const used=draftCues.some(c=>c.actUid===item.uid);
      button.disabled=used;
      if(used)button.title="所属Cueを別のActへ移動すると削除できます";
      button.addEventListener("click",()=>removeAct(i));
      row.append(button);
    }
    root.append(row);
  }
}
function addAct(){
  if(!source)return;
  syncDraftText();
  const proposal=window.prompt("追加するAct名を入力してください。","Act "+(draftActs.length+1));
  if(proposal===null)return;
  let title;
  try{title=nameCheck(proposal.trim());}
  catch(error){setStatus(error.message,true);return;}
  if(!title){setStatus("Act名を入力してください。",true);return;}
  if(draftActs.length>=256){setStatus("Actは最大256件です。",true);return;}
  let uid;
  do{
    uid="act_"+crypto.randomUUID().replace(/-/g,"").slice(0,20);
  }while(draftActs.some(act=>act.uid===uid)||source.acts.some(act=>act.uid===uid));
  draftActs.push({uid,jp:title,en:""});
  renderRows("act-list",draftActs,"act");
  renderRows("cue-list",draftCues,"cue");
  changed();
}
function removeAct(index){
  if(!source)return;
  syncDraftText();
  const act=draftActs[index];
  if(!act)return;
  if(draftCues.some(c=>c.actUid===act.uid)){
    setStatus("Cueが所属するActは削除できません。別のActへ移動してください。",true);
    return;
  }
  if(!window.confirm("空のAct「"+(act.jp||act.en)+"」を削除しますか？"))return;
  draftActs.splice(index,1);
  renderRows("act-list",draftActs,"act");
  renderRows("cue-list",draftCues,"cue");
  changed();
}
function latestRelease(showId,from){
  const releases=catalog?.shows.find(s=>s.showId===showId)?.releases??[];
  const fixed=currentFixed?.pack.showId===showId?currentFixed.pack.releaseRevision:0;
  return Math.max(from,fixed,...releases.map(r=>r.revision));
}
function formSource(doc,label){
  source=doc;sourceName=label;dirty=false;
  draftActs=doc.acts.map(a=>({...a}));
  draftCues=doc.cues.map(c=>({...c}));
  el("editor-fields").disabled=doc.pack.dataSchema<2;
  el("editor-title").textContent=doc.pack.displayName||doc.showJp||"名前のない公演";
  el("source-info").textContent=label;
  const info=el("info");info.replaceChildren();
  for(const value of [releaseText(doc.pack.releaseRevision),doc.pack.cueCount+" Cue",doc.acts.length+" Act"]){
    const chip=document.createElement("span");chip.textContent=value;info.append(chip);
  }
  el("display-name").value=doc.pack.displayName||"";
  el("show-jp").value=doc.showJp||"";
  el("show-en").value=doc.showEn||"";
  renderRows("act-list",draftActs,"act");
  renderRows("cue-list",draftCues,"cue");
  el("tab-edit").disabled=doc.pack.dataSchema<2;
  el("start-edit").disabled=doc.pack.dataSchema<2;
  renderPreview();
  switchPage("preview");
  const next=latestRelease(doc.pack.showId,doc.pack.releaseRevision)+1;
  el("release-number").value=next<=2147483647?String(next):"";
  el("release-hint").textContent="元："+releaseText(doc.pack.releaseRevision)+
    (next<=2147483647?" → 保存時："+releaseText(next):"（Release番号の上限です）");
  if(doc.pack.dataSchema<2)setStatus("このJSONは古いSchema 1です。名称編集にはSchema 2以上が必要です。",true);
  else setStatus("JSONを開きました。ActとCueの所属をプレビューできます。");
}
function openData(raw,label){
  const doc=readPack(raw);
  sourceJSON=raw;
  formSource(doc,label);
}
function field(key){return document.querySelector('[data-field="'+key+'"]')?.value??"";}
function save(){
  if(!source||source.pack.dataSchema<2)return;
  try{
    const revision=Number(el("release-number").value);
    syncDraftText();
    const acts=draftActs.map(a=>({...a}));
    const cues=draftCues.map(c=>({...c}));
    const displayName=el("display-name").value,showJp=el("show-jp").value,showEn=el("show-en").value;
    const changedData=displayName!==source.displayName||showJp!==source.showJp||showEn!==source.showEn||
      acts.length!==source.acts.length||
      acts.some((act,i)=>act.uid!==source.acts[i]?.uid||act.jp!==source.acts[i]?.jp||act.en!==source.acts[i]?.en)||
      cues.some((cue,i)=>cue.jp!==source.cues[i].jp||cue.en!==source.cues[i].en||cue.actUid!==source.cues[i].actUid);
    if(!changedData){setStatus("名前やAct構成の変更がありません。編集してから保存してください。",true);return;}
    const raw=exportEditedPack(source,{displayName,showJp,showEn,acts,cues,revision});
    const updated=readPack(raw);
    if(!window.confirm("変更したJSONをPCに保存しますか？\n元のJSONやGitHubの公開データは変更されません。"))return;
    downloadText(raw,filename(updated));
    sourceJSON=raw;
    formSource(updated,"編集済みJSON（PCに別名保存）");
    setStatus("JSONをPCに保存しました。編集したデータは、管理者（神無月瑪瑙）に渡してください。");
  }catch(error){setStatus("JSONを保存できません："+error.message,true);}
}
function resetEdits(){
  if(!sourceJSON)return;
  if(dirty&&!window.confirm("編集した名前とAct構成を元に戻しますか？"))return;
  try{formSource(readPack(sourceJSON),sourceName);}catch(error){setStatus(error.message,true);}
}
function selectRelease(){
  const show=catalog?.shows.find(s=>s.slug===el("show-select").value);
  selectedShow=show||null;selectedRelease=null;
  const select=el("revision-select");select.replaceChildren();
  if(!show||!show.releases.length){
    select.add(new Option("データなし",""));select.disabled=true;
    el("load-public").disabled=true;return;
  }
  const versions=[...show.releases].sort((a,b)=>b.revision-a.revision);
  for(const release of versions){
    select.add(new Option(releaseText(release.revision)+" ・ "+release.cueCount+" Cue",String(release.revision)));
  }
  select.disabled=false;
  const preferred=show.publishedRevision??versions[0].revision;
  select.value=String(preferred);
  updateSelected();
}
function updateSelected(){
  selectedRelease=selectedShow?.releases.find(r=>r.revision===Number(el("revision-select").value))??null;
  el("load-public").disabled=!selectedRelease;
}
function fixedURL(){return new URL("show-pack.json",home).href;}
async function loadSelected(){
  if(!selectedRelease||!selectedShow||!confirmSwitch())return;
  const release=selectedRelease,show=selectedShow;
  try{
    const url=release.path==="show-pack.json"?fixedURL():releaseURL(release,home);
    const response=await fetchWithTimeout(url,{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const raw=await response.text(),doc=readPack(raw);
    if(doc.pack.showId!==show.showId||doc.pack.releaseRevision!==release.revision||
       doc.pack.dataSchema!==release.dataSchema||doc.pack.cueCount!==release.cueCount)
      throw new Error("選択した版とJSONが一致しません");
    openData(raw,"公開済み："+show.title+" / "+releaseText(release.revision));
  }catch(error){setStatus("公開済みJSONを開けません："+error.message,true);}
}
async function fetchPublishedDate(){
  // The update-date lookup is optional metadata. It MUST NOT block the
  // SHOW editor or public catalog if api.github.com is slow/unavailable.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6000);
  try{
    // This timestamp comes from the latest commit changing show-pack.json;
    // it is not an inference from browser time or Pages deployment time.
    const response=await fetch(GITHUB_COMMITS,{
      cache:"no-store",signal:controller.signal,
      headers:{Accept:"application/vnd.github+json"}
    });
    if(!response.ok)throw new Error("HTTP "+response.status);
    const commits=await response.json();
    const iso=commits?.[0]?.commit?.committer?.date;
    if(typeof iso!=="string")throw new Error("missing date");
    const stamp=new Date(iso);
    if(!Number.isFinite(stamp.getTime()))throw new Error("invalid date");
    const format=new Intl.DateTimeFormat("ja-JP",{
      timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hour12:false
    });
    el("fixed-updated").textContent="最終更新："+format.format(stamp)+"（日本時間）";
  }catch{
    el("fixed-updated").textContent="最終更新日を確認できません";
  }finally{
    clearTimeout(timeout);
  }
}
async function refresh(){
  let fixedError=null;
  try{
    const response=await fetchWithTimeout(fixedURL(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    currentFixed=readPack(await response.text());
    el("fixed-name").textContent=currentFixed.pack.displayName||currentFixed.showJp||"名前のない公演";
    // Do not silently invent a published date from the browser's clock.
    void fetchPublishedDate();
  }catch(error){
    currentFixed=null;fixedError=error;
    el("fixed-name").textContent="配信データを確認できません";
    el("fixed-updated").textContent="更新日を確認できません";
  }
  let shows=[];
  try{
    const response=await fetchWithTimeout(new URL("catalog.json",home),{cache:"no-store"});
    if(response.ok)shows=readCatalog(await response.text()).shows.map(show=>({
      ...show,releases:[...show.releases]
    }));
    else if(response.status!==404)throw new Error("catalog HTTP "+response.status);
  }catch(error){
    setStatus("公開済みの公演一覧を読み込めません："+error.message,true);
  }
  if(currentFixed){
    const pack=currentFixed.pack;
    let match=shows.find(s=>s.showId===pack.showId);
    if(!match){
      match={showId:pack.showId,slug:"fixed-current",title:pack.displayName,
        archived:false,publishedRevision:pack.releaseRevision,releases:[]};
      shows.unshift(match);
    }
    if(!match.releases.some(r=>r.revision===pack.releaseRevision)){
      match.releases.push({revision:pack.releaseRevision,label:"固定配信",
        stage:"final",cueCount:pack.cueCount,dataSchema:pack.dataSchema,path:"show-pack.json"});
    }
  }
  catalog={shows};
  const choice=el("show-select"),previous=choice.value;
  choice.replaceChildren();
  if(shows.length){
    for(const show of shows){
      choice.add(new Option(show.title,show.slug));
    }
    choice.disabled=false;
    if(shows.some(s=>s.slug===previous))choice.value=previous;
    selectRelease();
    if(!source)setStatus("JSONを選んで「選択して開く」を押してください。");
  }else{
    choice.add(new Option("公開済みの公演なし",""));choice.disabled=true;
    el("revision-select").replaceChildren(new Option("データなし",""));
    el("revision-select").disabled=true;
    el("load-public").disabled=true;
    if(!source)setStatus(fixedError?"公開データを取得できません。PCのJSONは読み込めます。":"PCに保存したJSONを開いて編集できます。",Boolean(fixedError));
  }
}
async function openLocal(file){
  if(!file)return;
  if(!confirmSwitch()){el("file-input").value="";return;}
  try{
    if(file.size>MAX_JSON_BYTES)throw new Error("ファイルの容量が上限を超えています");
    openData(await file.text(),file.name+"（PCのJSON）");
  }catch(error){setStatus("JSONを開けません："+error.message,true);}
  el("file-input").value="";
}
el("tab-preview").addEventListener("click",()=>switchPage("preview"));
el("tab-edit").addEventListener("click",()=>switchPage("edit"));
el("start-edit").addEventListener("click",()=>switchPage("edit"));
el("file-input").addEventListener("change",event=>openLocal(event.target.files?.[0]));
el("show-select").addEventListener("change",selectRelease);
el("revision-select").addEventListener("change",updateSelected);
el("load-public").addEventListener("click",loadSelected);
el("refresh-public").addEventListener("click",refresh);
el("download-edit").addEventListener("click",save);
el("discard").addEventListener("click",resetEdits);
el("add-act").addEventListener("click",addAct);
for(const id of ["display-name","show-jp","show-en"])el(id).addEventListener("input",changed);
refresh();
