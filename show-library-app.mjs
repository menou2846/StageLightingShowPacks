import {readPack,exportEditedPack,MAX_JSON_BYTES} from "./show-pack-codec.mjs";
import {readCatalog,releaseURL} from "./show-library-catalog.mjs";
const el=id=>document.getElementById(id);
const home=new URL("./",document.baseURI);
let catalog=null,selectedShow=null,selectedRelease=null,source=null;
let sourceURL=null,sourceJSON=null,dirty=false,sourceLabel="";
const e={status:el("status"),show:el("show-select"),rev:el("revision-select")};
const setStatus=(text,error=false)=>{e.status.textContent=text;e.status.className="status"+(error?" error":" ok");};
const reset=(id,value)=>{el(id).textContent=value;};
const int=v=>Number.isSafeInteger(v)?String(v):"—";
function confirmChange(){
  if(!dirty)return true;
  return window.confirm("未保存の名称編集があります。編集内容を破棄して切り替えますか？");
}
window.addEventListener("beforeunload",ev=>{if(dirty){ev.preventDefault();ev.returnValue="";}});
function markDirty(){if(!source||source.pack.dataSchema<2)return;dirty=true;reset("selected-description","名称が未保存の状態です。公開データは変更されていません。");}
function contentBlob(text,file){
  const object=URL.createObjectURL(new Blob([text],{type:"application/json;charset=utf-8"}));
  const a=document.createElement("a");
  a.href=object;a.download=file;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(object),60_000);
}
function safeFileID(s){return s.replace(/[^a-zA-Z0-9_-]+/g,"_").slice(0,48)||"show";}
function fileName(doc,edited=false,revision=null){
  return "stage-lighting-"+safeFileID(doc.pack.showId)+"-r"+String(revision??doc.pack.releaseRevision).padStart(4,"0")+(edited?"-edited":"")+".json";
}
function clearOptions(select,label){
  select.replaceChildren(new Option(label,""));select.disabled=true;
}
function updateReleaseSelect(){
  const item=catalog?.shows.find(s=>s.slug===e.show.value);
  selectedShow=item||null;selectedRelease=null;
  clearOptions(e.rev,"バージョンを選択");
  if(!item){el("publication-status").textContent="公開公演はまだありません";el("load-public").disabled=true;return;}
  const releases=[...item.releases].sort((a,b)=>b.revision-a.revision);
  if(!releases.length){el("publication-status").textContent="この公演は公開Releaseがありません";el("load-public").disabled=true;return;}
  e.rev.replaceChildren(...releases.map(r=>new Option(
    "R"+String(r.revision).padStart(4,"0")+" · "+r.label+
    (r.revision===item.publishedRevision?" · 本番指定":""),
    String(r.revision))));
  e.rev.disabled=false;
  const preferred=item.publishedRevision??releases[0].revision;
  e.rev.value=String(preferred);
  updateSelection();
}
function updateSelection(){
  selectedRelease=selectedShow?.releases.find(r=>r.revision===Number(e.rev.value))??null;
  el("load-public").disabled=!selectedRelease;
  el("publication-status").textContent=selectedRelease?
    (selectedShow.archived?"アーカイブ済・":"")+"選択版 R"+String(selectedRelease.revision)+"："+
    selectedRelease.stage+" ／ "+selectedRelease.cueCount+" Cues":"公開版なし";
}
function legacyURL(){return new URL("show-pack.json",home).href;}
async function discoverLegacy() {
  try{
    const response=await fetch(legacyURL(),{cache:"no-store"});
    if(!response.ok)return null;
    const raw=await response.text();const parsed=readPack(raw);
    return {catalog:{format:"stage-lighting-show-catalog",version:1,shows:[{
      slug:"legacy",showId:parsed.pack.showId,title:parsed.pack.displayName,
      archived:false,publishedRevision:parsed.pack.releaseRevision,releases:[{
        revision:parsed.pack.releaseRevision,label:"従来の固定配信URL",stage:"final",
        cueCount:parsed.pack.cueCount,dataSchema:parsed.pack.dataSchema,path:"show-pack.json"
      }]
    }]}, legacy:true};
  }catch{return null;}
}
async function refreshCatalog(){
  try {
    const response=await fetch(new URL("catalog.json",home),{cache:"no-store"});
    if(response.ok){
      const data=readCatalog(await response.text());
      if(data.shows.length){catalog=data;}
      else{
        const fallback=await discoverLegacy();
        catalog=fallback?.catalog||data;
      }
    }else if(response.status===404)catalog=(await discoverLegacy())?.catalog||
      {format:"stage-lighting-show-catalog",version:1,shows:[]};
    else throw new Error("catalog.json HTTP "+response.status);
    const shows=[...catalog.shows].sort((a,b)=>a.title.localeCompare(b.title,"ja"));
    if(!shows.length){clearOptions(e.show,"まだ公開データはありません");clearOptions(e.rev,"バージョンなし");updateSelection();setStatus("公開済み公演はまだありません。手元のJSONを読み込んで編集できます。");return;}
    const previous=e.show.value;
    e.show.replaceChildren(...shows.map(s=>new Option(s.title+(s.archived?"（アーカイブ）":""),s.slug)));
    e.show.disabled=false;
    if(shows.some(s=>s.slug===previous))e.show.value=previous;
    updateReleaseSelect();
    setStatus("公開ライブラリを読み込みました。公演とバージョンを選択できます。");
  }catch(error){
    catalog=null;clearOptions(e.show,"カタログを取得できません");clearOptions(e.rev,"バージョンなし");
    setStatus("公開ライブラリを取得できませんでした："+error.message,true);
  }
}
function openData(raw,{url=null,label="ローカルJSON"}={}){
  const result=readPack(raw);
  source=result;sourceJSON=raw;sourceURL=url;sourceLabel=label;dirty=false;
  reset("current-title",result.pack.displayName||result.showJp||"公演");
  reset("current-source",label+" / Show ID: "+result.pack.showId);
  reset("cue-count",int(result.pack.cueCount));reset("release-count",int(result.pack.releaseRevision));
  reset("schema-count",int(result.pack.dataSchema));
  reset("public-url",url||"ローカルJSONは公開されていません。VRChat用URLはありません。");
  reset("selected-description","選択中のJSONは読込時にハッシュと構造を検証しました。実際のFixture互換性はVRChat取込時に最終検証してください。");
  el("download-original").disabled=false;
  el("copy-url").disabled=!url;
  initializeEditor();
  selectTab("view");
  setStatus("JSON読込完了： "+result.pack.cueCount+" Cue、Release "+result.pack.releaseRevision+"。");
}
async function loadPublic(){
  if(!selectedRelease||!selectedShow)return;
  if(!confirmChange())return;
  try{
    const item=selectedRelease;
    const url=item.path==="show-pack.json" ? legacyURL() : releaseURL(item,home);
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const raw=await response.text(),doc=readPack(raw);
    if(doc.pack.showId!==selectedShow.showId || doc.pack.releaseRevision!==item.revision ||
      doc.pack.cueCount!==item.cueCount || doc.pack.dataSchema!==item.dataSchema)
      throw new Error("カタログのShow ID/Release/Schema/Cue件数とJSONが一致しません");
    openData(raw,{url,label:selectedShow.title+" / R"+item.revision+"（GitHub公開版）"});
  }catch(error){setStatus("公開版を開けません："+error.message,true);}
}
async function fileOpen(file){
  if(!file)return;
  if(!confirmChange()){el("file-input").value="";return;}
  try{
    if(file.size>MAX_JSON_BYTES)throw new Error("ファイルが容量上限を超えています");
    const raw=await file.text();
    openData(raw,{label:file.name+"（PCローカルのみ）"});
  }catch(error){setStatus("ローカルJSONを開けません："+error.message,true);}
  el("file-input").value="";
}
function selectTab(which){
  const edit=which==="edit";
  el("view").classList.toggle("hidden",edit);
  el("edit").classList.toggle("hidden",!edit);
  el("tab-view").setAttribute("aria-selected",String(!edit));
  el("tab-edit").setAttribute("aria-selected",String(edit));
}
function formInput(parent,label,value,setID){
  const wrapper=document.createElement("div"),caption=document.createElement("label"),input=document.createElement("input");
  caption.textContent=label; input.type="text";input.maxLength=256;input.value=value??"";
  input.dataset.field=setID;caption.appendChild(input);wrapper.appendChild(caption);parent.appendChild(wrapper);
  input.addEventListener("input",markDirty);
  return input;
}
function initializeEditor(){
  const doc=source;
  el("edit-fields").disabled=!doc||doc.pack.dataSchema<2;
  for(const [name,value] of Object.entries({
    "display-name":doc?.displayName??"","show-jp":doc?.showJp??"","show-en":doc?.showEn??"",
    "release-number":doc?String(doc.pack.releaseRevision+1):""
  }))el(name).value=value;
  const acts=el("act-list"),cues=el("cue-list");acts.replaceChildren();cues.replaceChildren();
  if(!doc||doc.pack.dataSchema<2){
    acts.textContent="Schema 1は名称を保存できないため編集対象外です。";
    cues.textContent="Schema 2以上の公演を読み込んでください。";return;
  }
  doc.acts.forEach((act,i)=>{
    const row=document.createElement("div");row.className="editor-row";
    const num=document.createElement("div");num.className="num";num.textContent="Act "+(i+1)+" / "+act.uid;
    const fields=document.createElement("div");fields.className="grid2";
    formInput(fields,"日本語",act.jp,"act-"+i+"-jp");
    formInput(fields,"English",act.en,"act-"+i+"-en");
    row.append(num,fields);acts.appendChild(row);
  });
  doc.cues.forEach((cue,i)=>{
    const row=document.createElement("div");row.className="editor-row";
    const num=document.createElement("div");num.className="num";
    num.textContent="Q"+String(i+1).padStart(3,"0")+" / "+cue.uid+(cue.actUid?" / Act "+cue.actUid:"");
    const fields=document.createElement("div");fields.className="grid2";
    formInput(fields,"日本語",cue.jp,"cue-"+i+"-jp");
    formInput(fields,"English",cue.en,"cue-"+i+"-en");
    row.append(num,fields);cues.appendChild(row);
  });
}
function exportNames(){
  if(!source)return;
  try{
    const revision=Number(el("release-number").value);
    const lookup=k=>document.querySelector('[data-field="'+k+'"]').value;
    const acts=source.acts.map((act,i)=>({...act,jp:lookup("act-"+i+"-jp"),en:lookup("act-"+i+"-en")}));
    const cues=source.cues.map((cue,i)=>({...cue,jp:lookup("cue-"+i+"-jp"),en:lookup("cue-"+i+"-en")}));
    const raw=exportEditedPack(source,{displayName:el("display-name").value,
      showJp:el("show-jp").value,showEn:el("show-en").value,acts,cues,revision});
    const namesChanged=source.showJp!==el("show-jp").value||
      source.showEn!==el("show-en").value||source.displayName!==el("display-name").value||
      acts.some((a,i)=>a.jp!==source.acts[i].jp||a.en!==source.acts[i].en)||
      cues.some((c,i)=>c.jp!==source.cues[i].jp||c.en!==source.cues[i].en);
    if(!window.confirm("編集版をPCに別名ダウンロードします。\n\n公演: "+source.pack.showId+
      "\n元Release: "+source.pack.releaseRevision+" → 新Release: "+revision+
      "\n名称の変更: "+(namesChanged?"あり":"なし")+
      "\nFixture・Timing・LOOK・UIDは元のバイト列を保持。\n\nGitHubやVRChatにはまだ公開・適用しません。"))return;
    contentBlob(raw,fileName(source,true,revision));
    dirty=false;setStatus("編集版をPCへダウンロードしました。元データと公開版は変更していません。");
  }catch(error){setStatus("編集版を書き出せません："+error.message,true);}
}
function downloadOriginal(){
  if(!source)return;
  contentBlob(sourceJSON,fileName(source));
  setStatus("選択版のJSONをPCへダウンロードしました（元データは未変更）。");
}
async function copyURL(){
  if(!sourceURL)return;
  try{await navigator.clipboard.writeText(sourceURL);setStatus("VRChat REMOTE用の固定Release URLをコピーしました。");}
  catch{setStatus("URLをコピーできません。表示されたURLを手動でコピーしてください。",true);}
}
e.show.addEventListener("change",()=>{if(dirty&&!confirmChange()){e.show.value=selectedShow?.slug??"";return;}updateReleaseSelect();});
e.rev.addEventListener("change",updateSelection);
el("load-public").addEventListener("click",loadPublic);
el("refresh-catalog").addEventListener("click",refreshCatalog);
el("file-input").addEventListener("change",ev=>fileOpen(ev.target.files?.[0]));
el("tab-view").addEventListener("click",()=>selectTab("view"));
el("tab-edit").addEventListener("click",()=>selectTab("edit"));
el("download-original").addEventListener("click",downloadOriginal);
el("copy-url").addEventListener("click",copyURL);
el("download-edit").addEventListener("click",exportNames);
el("discard").addEventListener("click",()=>{if(dirty&&!window.confirm("名称の変更を破棄しますか？"))return;initializeEditor();dirty=false;setStatus("編集内容を読み込み時の状態へ戻しました。");});
for(const id of ["display-name","show-jp","show-en","release-number"])el(id).addEventListener("input",markDirty);
refreshCatalog();
