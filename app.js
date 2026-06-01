/* ---------- PLAN DATA ---------- */
// Le plan (plan.json) et le catalogue d'exercices (exercises.json) sont chargés
// au démarrage (voir init()). plan.json référence les exercices par identifiant ;
// exercises.json fournit le nom affiché et le type pour chaque identifiant.
// Rotation 5 séances (J1..J5) sur 7 jours. 48h+ de repos par groupe musculaire.
// Bloc A = semaines 1-2 ; Bloc B = semaines 3-4.
const REST = {rest:true, focus:"Repos / course", note:"Récup active : marche, mobilité, ou footing léger 20-25 min en fractionné. Pas de tirage juste avant une séance de tirage."};

function ex(nm,dt,timer,type,id){return {nm,dt,timer:timer||0,type:type||"",id:id||""};}

// Parse une ligne d'exercice en plan de séries pour le mode guidé.
// Renvoie {sets, reps, isHold, holdSec, rest, perLeg, label, mobility}
function parseEx(e){
  const dt=e.dt;
  // mobilité / souplesse "5 min" → bloc unique chronométré
  const minMatch=dt.match(/(\d+)\s*min/);
  if(minMatch){
    return {mobility:true, sets:1, reps:0, isHold:true, holdSec:(e.timer||+minMatch[1]*60), rest:0};
  }
  const m=dt.match(/(\d+)\s*×\s*(\d+)/);
  const sets=m?+m[1]:3;
  const reps=m?+m[2]:0;
  const isHold=e.timer>0 || /s\b/.test(dt.replace(/repos\s*\d+s/,'')); // exo en secondes
  const holdSec=e.timer||reps;
  // repos explicite ?
  const restM=dt.match(/repos\s*(\d+)s/);
  let rest;
  if(restM) rest=+restM[1];
  else if(isHold) rest=Math.max(30, Math.round(holdSec*1.5)); // holds : repos ~1.5× le temps
  else rest=60; // par défaut 60s entre séries de force
  const perLeg=/jambe/.test(dt);
  return {mobility:false, sets, reps, isHold, holdSec, rest, perLeg};
}

// CATALOG = contenu de exercises.json : { id: {nom, type, cues} }.
// PLAN = plan.json transformé vers la forme interne {focus, ex:[{nm,dt,timer,type,id}]}.
let CATALOG=null, PLAN=null;
// Résout les identifiants du plan vers les noms/types du catalogue.
// Lève une erreur listant les identifiants manquants (gérée dans init()).
function buildPlan(raw){
  const out={}, missing=new Set();
  for(const block of ["A","B"]){
    out[block]={};
    for(const day in raw[block]){
      const s=raw[block][day];
      out[block][day]={focus:s.focus, ex:s.exercices.map(x=>{
        const cat=CATALOG[x.id];
        if(!cat){ missing.add(x.id); return ex("⚠ "+x.id, x.series, x.secondes); }
        return ex(cat.nom, x.series, x.secondes, cat.type, x.id);
      })};
    }
  }
  if(missing.size) throw new Error("Identifiant(s) absent(s) de exercises.json : "+[...missing].join(", "));
  return out;
}
// buildBlock(b) → b=0 (A) ou 1 (B).
function buildBlock(b){ return PLAN[b===0?"A":"B"]; }

// Schéma de semaine à partir de demain (Dim) : Dim=J1, Lun=J2, Mar=repos, Mer=J3, Jeu=J4, Ven=J5, Sam=repos
// JS getDay(): 0=Dim..6=Sam
const WEEKMAP = {0:"J1",1:"J2",2:"REST",3:"J3",4:"J4",5:"J5",6:"REST"};

/* ---------- STATE / STORAGE ---------- */
const LS_DONE="ascent_done", LS_START="ascent_start", LS_LOG="ascent_log", LS_SHIFT="ascent_shift";
function load(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
let doneMap = load(LS_DONE,{});      // {"2026-05-31":[true,false,...]}
let logMap  = load(LS_LOG,{});       // {"2026-05-31":{date,type,focus,ex:[{nm,r}]}} — r: "done"|"hard"|"skip"
// Reports de séance : liste des dates où un report a été appliqué. Un report à la
// date R décale d'un jour le planning de R et de tous les jours suivants. Les dates
// antérieures (séances passées / journal) ne bougent pas. Cumulable, annulable (pop).
let shiftList = load(LS_SHIFT,[]);   // ex: ["2026-06-07","2026-06-10"]
// Début du cycle = dimanche 31 mai 2026 (premier J1).
const CYCLE_START = "2026-05-31";
if(!localStorage.getItem(LS_START)) save(LS_START, CYCLE_START);
const START = new Date(load(LS_START, CYCLE_START)+"T00:00:00");

function fmt(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function parse(s){return new Date(s+"T00:00:00");}

// Nombre de reports applicables à une date (ceux posés à cette date ou avant).
function shiftCount(ds){let n=0;for(const r of shiftList){if(r<=ds)n++;}return n;}
// eff(date) → date "planning" : recule la date réelle d'autant de jours que de reports
// applicables. C'est cette date décalée qui détermine la séance (J1..J5/repos) et le bloc.
function eff(date){
  const n=shiftCount(fmt(date));
  if(!n) return date;
  const d=new Date(date); d.setDate(d.getDate()-n); return d;
}

// blockFor/weekNum reçoivent une date "planning" (déjà passée par eff()).
// bloc d'entraînement selon les semaines écoulées depuis START : 0-1 = A (fondation), 2-3 = B (montée)
function blockFor(sched){
  const days = Math.floor((sched - START)/86400000);
  const week = Math.floor(days/7);
  const inCycle = ((week%4)+4)%4;
  return buildBlock(inCycle<2 ? 0 : 1);
}
function sessionFor(date){
  const sched = eff(date);
  const key = WEEKMAP[sched.getDay()];
  if(key==="REST") return REST;
  return blockFor(sched)[key];
}
function weekNum(sched){
  const days=Math.floor((sched-START)/86400000);
  return ((Math.floor(days/7)%4)+4)%4 + 1;
}

/* ---------- JOURNAL (historique des séances) ---------- */
// Enregistre/maj une entrée datée. outcomes : tableau par exo de "done"|"hard"|"skip".
function recordSession(ds, sess, outcomes){
  logMap[ds]={
    date: ds,
    type: WEEKMAP[eff(parse(ds)).getDay()],
    focus: sess.focus,
    ex: sess.ex.map((e,i)=>({nm:e.nm, r:outcomes[i]||"skip"}))
  };
  save(LS_LOG, logMap);
}
// Depuis la vue jour : n'enregistre que si tous les exos sont cochés.
// Préserve un "hard" déjà connu (séance d'abord faite en mode guidé).
function recordFromDay(ds){
  const sess=sessionFor(parse(ds));
  if(sess.rest) return;
  const done=doneMap[ds];
  if(!done || done.filter(Boolean).length < sess.ex.length) return;
  const prev=logMap[ds];
  const outcomes=sess.ex.map((e,i)=>{
    if(prev && prev.ex[i] && prev.ex[i].r==="hard") return "hard";
    return done[i] ? "done" : "skip";
  });
  recordSession(ds, sess, outcomes);
}

/* ---------- TABS ---------- */
const views={cal:document.getElementById("v-cal"),day:document.getElementById("v-day"),log:document.getElementById("v-log")};
document.querySelectorAll("nav.tabs button").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll("nav.tabs button").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");
    Object.values(views).forEach(v=>v.classList.remove("on"));
    const v=b.dataset.v; views[v].classList.add("on");
    if(v==="day") renderDay();
    if(v==="log") renderLog();
  };
});

/* ---------- CALENDAR ---------- */
let viewMonth = new Date();
let selected = fmt(new Date());
const MN=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function dayStatus(ds){
  const sess=sessionFor(parse(ds));
  if(sess.rest) return "rest";
  const d=doneMap[ds];
  if(!d) return "none";
  const tot=sess.ex.length, n=d.filter(Boolean).length;
  if(n===0) return "none";
  if(n>=tot) return "done";
  return "partial";
}

function renderCal(){
  document.getElementById("monthName").textContent=MN[viewMonth.getMonth()];
  document.getElementById("yearLbl").textContent=viewMonth.getFullYear();
  const grid=document.getElementById("grid"); grid.innerHTML="";
  const y=viewMonth.getFullYear(), m=viewMonth.getMonth();
  const first=new Date(y,m,1);
  let lead=(first.getDay()+6)%7; // Monday-first
  const dim=new Date(y,m+1,0).getDate();
  for(let i=0;i<lead;i++){const c=document.createElement("div");c.className="cell empty";grid.appendChild(c);}
  const todayS=fmt(new Date());
  for(let dnum=1;dnum<=dim;dnum++){
    const dt=new Date(y,m,dnum), ds=fmt(dt);
    const sess=sessionFor(dt);
    const st=dayStatus(ds);
    const c=document.createElement("div");
    c.className="cell"+(sess.rest?" rest":"");
    if(st==="done")c.classList.add("done");
    if(st==="partial")c.classList.add("partial");
    if(ds===todayS)c.classList.add("today");
    if(ds===selected)c.classList.add("sel");
    const key=WEEKMAP[eff(dt).getDay()];
    c.innerHTML=`<span class="d">${dnum}</span><span class="tag">${sess.rest?"REPOS":key}</span>`+
      ((st==="done"||st==="partial")?`<span class="dot"></span>`:"");
    c.onclick=()=>{selected=ds;goDay();};
    grid.appendChild(c);
  }
}
document.getElementById("prevM").onclick=()=>{viewMonth.setMonth(viewMonth.getMonth()-1);renderCal();};
document.getElementById("nextM").onclick=()=>{viewMonth.setMonth(viewMonth.getMonth()+1);renderCal();};

function goDay(){
  document.querySelectorAll("nav.tabs button").forEach(x=>x.classList.remove("on"));
  document.querySelector('[data-v="day"]').classList.add("on");
  Object.values(views).forEach(v=>v.classList.remove("on"));
  views.day.classList.add("on");
  renderDay();
}

/* ---------- DAY VIEW ---------- */
const DOWFULL=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
// Barre de report : décale tout le cycle d'un jour à partir de la séance affichée.
function reportBar(isRest){
  const n=shiftList.length;
  const info=n?`<div class="report-info">Décalage actuel : ${n} jour${n>1?"s":""}</div>`:"";
  const undo=n?`<button class="report-undo" onclick="undoReport()">Annuler le dernier report</button>`:"";
  const rep=isRest?"":`<button class="report-btn" onclick="reportSession()">
    <svg viewBox="0 0 24 24"><path d="M5 4l9 8-9 8V4z"/><path d="M19 5v14"/></svg>Reporter cette séance</button>`;
  if(!rep&&!undo) return "";
  return `<div class="report-bar">${rep}${undo}${info}</div>`;
}
function renderDay(){
  const dt=parse(selected), sched=eff(dt), sess=sessionFor(dt);
  const host=views.day;
  const dateLbl=`${DOWFULL[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]}`;
  if(sess.rest){
    host.innerHTML=`<div class="day-hero"><span class="dk">${dateLbl}</span><h2>Jour de repos</h2><span class="focus">Semaine ${weekNum(sched)} du cycle</span></div>
      <div class="panel rest-card"><div class="ic">🌿</div><h3>${sess.focus}</h3><p>${sess.note}</p></div>`+reportBar(true);
    return;
  }
  if(!doneMap[selected]) doneMap[selected]=new Array(sess.ex.length).fill(false);
  const done=doneMap[selected];
  let html=`<div class="day-hero"><span class="dk">${dateLbl} · Semaine ${weekNum(sched)}</span>
    <h2>${WEEKMAP[sched.getDay()]} — ${sess.focus}</h2>
    <span class="sub">${done.filter(Boolean).length}/${sess.ex.length} exercices validés</span>
    <span class="focus">⏱ ~30 min · haute densité</span></div>
    <div class="start-bar"><button class="start-btn" onclick="startSession()">
      <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>Démarrer la séance guidée</button></div>`;
  sess.ex.forEach((e,i)=>{
    html+=`<div class="ex${done[i]?' done':''}" data-i="${i}">
      <div class="check" onclick="toggleEx(${i})"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <div class="body"><div class="nm">${e.nm}</div><div class="dt">${e.dt}</div></div>
      ${e.timer?`<button class="timer-btn" onclick="openTimer('${e.nm.replace(/'/g,"")}',${e.timer})">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>${e.timer}s</button>`:""}
    </div>`;
  });
  host.innerHTML=html+reportBar(false);
}
// Reporter la séance affichée : pousse son planning (et les suivants) d'un jour.
window.reportSession=function(){
  const d=parse(selected);
  const lbl=`${DOWFULL[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
  askConfirm({
    icon:`<svg viewBox="0 0 24 24"><path d="M5 4l9 8-9 8V4z"/><path d="M19 5v14"/></svg>`,
    title:"Reporter la séance",
    message:`La séance du ${lbl} glisse au lendemain. Toutes les séances suivantes se décalent aussi d'un jour. Les séances déjà faites ne changent pas.`,
    okLabel:"Reporter"
  },()=>{
    shiftList.push(selected); save(LS_SHIFT,shiftList);
    renderDay(); renderCal(); updateStreak();
    toast("Séance reportée d'un jour");
  });
};
// Annuler le dernier report appliqué.
window.undoReport=function(){
  if(!shiftList.length) return;
  shiftList.pop(); save(LS_SHIFT,shiftList);
  renderDay(); renderCal(); updateStreak();
  toast("Dernier report annulé");
};
window.toggleEx=function(i){
  const dt=parse(selected), sess=sessionFor(dt);
  if(!doneMap[selected]) doneMap[selected]=new Array(sess.ex.length).fill(false);
  doneMap[selected][i]=!doneMap[selected][i];
  save(LS_DONE,doneMap);
  recordFromDay(selected);
  renderDay(); updateStreak();
};

/* ---------- SWIPE JOUR ---------- */
// En vue jour : swipe horizontal → jour suivant (gauche) / précédent (droite).
let swipeX=null, swipeY=null;
views.day.addEventListener("pointerdown",e=>{swipeX=e.clientX;swipeY=e.clientY;});
views.day.addEventListener("pointerup",e=>{
  if(swipeX===null) return;
  const dx=e.clientX-swipeX, dy=e.clientY-swipeY; swipeX=null;
  if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5) shiftDay(dx<0?1:-1);
});
function shiftDay(n){
  const d=parse(selected); d.setDate(d.getDate()+n);
  selected=fmt(d); viewMonth=new Date(d.getFullYear(),d.getMonth(),1);
  renderDay(); renderCal();
}

/* ---------- JOURNAL VIEW ---------- */
const BACKUP_HTML=`<div class="panel backup">
  <div class="sec-k">Sauvegarde</div>
  <p class="backup-note">Exporte un fichier JSON de toutes tes données, ou restaure une sauvegarde.</p>
  <div class="backup-btns">
    <button class="bk-export" onclick="exportData()">⬇ Exporter mes données</button>
    <button class="bk-import" onclick="triggerImport()">⬆ Importer mes données</button>
  </div></div>`;
function renderLog(){
  const host=views.log;
  const keys=Object.keys(logMap).sort().reverse(); // plus récent → plus ancien
  if(!keys.length){
    host.innerHTML=`<div class="panel log-empty"><div class="ic">📓</div>
      <h2>Aucune séance enregistrée</h2>
      <p>Termine une séance (mode guidé ou en cochant tous les exercices) pour la voir apparaître ici.</p></div>`+BACKUP_HTML;
    return;
  }
  const RLBL={done:"réussis",hard:"trop dur",skip:"passés"};
  let html=`<div class="log-head"><h2>Journal</h2><span>${keys.length} séance${keys.length>1?"s":""}</span></div>`;
  keys.forEach(ds=>{
    const en=logMap[ds], dt=parse(ds);
    const dateLbl=`${DOWFULL[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]}`;
    const nb=r=>en.ex.filter(x=>x.r===r).length;
    const stat=r=>nb(r)?`<span class="ls ${r}">${nb(r)} ${RLBL[r]}</span>`:"";
    html+=`<div class="log-card">
      <div class="log-top"><span class="log-tag">${en.type}</span>
        <div class="log-info"><div class="log-date">${dateLbl}</div><div class="log-focus">${en.focus}</div></div></div>
      <div class="log-stats">${stat("done")}${stat("hard")}${stat("skip")}</div>
      <div class="log-ex">${en.ex.map(x=>`<div class="lex ${x.r}"><i></i>${x.nm}</div>`).join("")}</div>
    </div>`;
  });
  host.innerHTML=html+BACKUP_HTML;
}

/* ---------- STREAK ---------- */
function updateStreak(){
  let s=0; let d=new Date();
  // count back consecutive training days fully done (skip rest days)
  for(let i=0;i<120;i++){
    const ds=fmt(d), sess=sessionFor(d);
    if(!sess.rest){
      if(dayStatus(ds)==="done") s++;
      else if(ds!==fmt(new Date())) break; // aujourd'hui peut être incomplet, on continue
    }
    d.setDate(d.getDate()-1);
  }
  document.getElementById("streak").textContent=s;
}

/* ---------- GUIDED SESSION ---------- */
// Construit la file d'étapes : pour chaque exo → séries (work) entrecoupées de repos.
let gsQueue=[], gsIdx=0, gsSessDate=null, gsExCount=0, gsOutcome=[];
let gsTimer=null, gsLeft=0, gsTotal=0;
const GS_CIRC=2*Math.PI*100; // r=100

// Résultat par exo pour le journal. Priorité : hard > done > skip (hard reste collant).
function setOutcome(ei,r){
  const cur=gsOutcome[ei];
  if(r==="hard"){gsOutcome[ei]="hard";return;}
  if(cur==="hard")return;
  if(r==="done"){gsOutcome[ei]="done";return;}
  if(!cur)gsOutcome[ei]="skip";
}

function buildQueue(sess){
  const q=[];
  sess.ex.forEach((e,ei)=>{
    const p=parseEx(e);
    for(let s=1;s<=p.sets;s++){
      q.push({type:"work", ei, exName:e.nm, set:s, sets:p.sets,
        isHold:p.isHold, holdSec:p.holdSec, reps:p.reps, perLeg:p.perLeg,
        mobility:p.mobility});
      if(s<p.sets && p.rest>0) q.push({type:"rest", ei, exName:e.nm, dur:p.rest, nextSet:s+1, sets:p.sets});
    }
    // repos de transition entre exos (sauf après le dernier)
    if(ei<sess.ex.length-1) q.push({type:"trans", ei, dur:60, nextEx:sess.ex[ei+1].nm});
  });
  return q;
}

window.startSession=function(){
  const dt=parse(selected), sess=sessionFor(dt);
  if(sess.rest) return;
  gsSessDate=selected; gsExCount=sess.ex.length;
  gsQueue=buildQueue(sess); gsIdx=0; gsOutcome=new Array(sess.ex.length);
  if(!doneMap[selected]) doneMap[selected]=new Array(sess.ex.length).fill(false);
  document.getElementById("gs").classList.add("on");
  try{document.body.style.overflow="hidden";}catch(e){}
  acquireWakeLock();
  renderStep();
};
function closeSession(){
  stopGsTimer();
  releaseWakeLock();
  document.getElementById("gs").classList.remove("on");
  try{document.body.style.overflow="";}catch(e){}
  renderDay(); updateStreak();
}

/* Wake Lock : empêche le verrouillage de l'écran pendant la séance */
let wakeLock=null;
async function acquireWakeLock(){
  try{
    if("wakeLock" in navigator){
      wakeLock=await navigator.wakeLock.request("screen");
      wakeLock.addEventListener&&wakeLock.addEventListener("release",()=>{});
    }
  }catch(e){/* refus ou non supporté : on continue sans */}
}
function releaseWakeLock(){
  try{ if(wakeLock){wakeLock.release();wakeLock=null;} }catch(e){}
}
// si l'app repasse au premier plan pendant une séance, on ré-acquiert le verrou
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible" && document.getElementById("gs").classList.contains("on")){
    acquireWakeLock();
  }
});
document.getElementById("gsClose").onclick=()=>{
  if(confirm("Quitter la séance ? Ta progression cochée est gardée.")) closeSession();
};

// nom du prochain exercice différent dans la file (pour l'afficher sur la dernière série)
function nextExName(fromEi){
  for(let i=gsIdx+1;i<gsQueue.length;i++){
    const s=gsQueue[i];
    if(s.type==="work" && s.ei!==fromEi) return s.exName;
  }
  return null;
}
function exProgress(){
  // nombre d'exos entièrement validés
  let done=0;
  if(doneMap[gsSessDate]) done=doneMap[gsSessDate].filter(Boolean).length;
  return done;
}

function renderStep(){
  if(gsIdx>=gsQueue.length){return renderFinish();}
  const st=gsQueue[gsIdx];
  const body=document.getElementById("gsBody"), foot=document.getElementById("gsFoot");
  document.getElementById("gsProg").textContent=`Exo ${(st.ei??0)+1} / ${gsExCount}`;
  document.getElementById("gsBar").style.width=Math.round((gsIdx/gsQueue.length)*100)+"%";

  if(st.type==="rest" || st.type==="trans"){
    const isTrans=st.type==="trans";
    body.innerHTML=`<div class="gs-phase gs-rest">${isTrans?"Repos · exo suivant":"Repos"}</div>
      <div class="gs-ring">
        <svg width="240" height="240"><circle cx="120" cy="120" r="100" stroke="#2c251c" stroke-width="14" fill="none"/>
        <circle id="gsRing" cx="120" cy="120" r="100" stroke="#5e9bb8" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="${GS_CIRC}" stroke-dashoffset="0"/></svg>
        <div class="lab"><b id="gsNum">${st.dur}</b><small>SECONDES</small></div>
      </div>
      <div class="gs-meta">${isTrans?("Prochain : "+st.nextEx):("Série "+st.nextSet+" / "+st.sets)}</div>`;
    foot.innerHTML=`<button class="gs-main skip" id="gsSkip">Passer le repos</button>
      <div class="gs-add"><button data-d="-15">−15s</button><button data-d="15">+15s</button><button data-d="30">+30s</button></div>`;
    document.getElementById("gsSkip").onclick=()=>{stopGsTimer();next();};
    foot.querySelectorAll(".gs-add button").forEach(b=>b.onclick=()=>{
      gsLeft=Math.max(1,gsLeft+ +b.dataset.d); gsTotal=Math.max(gsTotal,gsLeft); updGsRing();
    });
    startGsTimer(st.dur, ()=>{ try{navigator.vibrate&&navigator.vibrate(150);}catch(e){}; beep(); next(); });
    return;
  }

  // WORK
  const setLbl = st.mobility ? "" : `Série ${st.set} / ${st.sets}`;
  const phase = st.mobility ? "Mobilité" : (st.isHold?"Hold":"Série");
  // sur la dernière série, annonce le prochain exo
  const isLastSet = st.mobility || st.set>=st.sets;
  const upcoming = isLastSet ? nextExName(st.ei) : null;
  const upcomingHtml = upcoming ? `<div class="gs-hint">Dernière série · ensuite : ${upcoming}</div>` : "";
  if(st.isHold){
    body.innerHTML=`<div class="gs-phase" id="gsPhase">${phase}</div>
      <div class="gs-name">${st.exName}</div>
      <div class="gs-set">${setLbl}</div>
      <div class="gs-ring">
        <svg width="240" height="240"><circle cx="120" cy="120" r="100" stroke="#2c251c" stroke-width="14" fill="none"/>
        <circle id="gsRing" cx="120" cy="120" r="100" stroke="#d9682f" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="${GS_CIRC}" stroke-dashoffset="0"/></svg>
        <div class="lab"><b id="gsNum">${st.holdSec}</b><small id="gsUnit">PRÉPARATION</small></div>
      </div>
      <div class="gs-hint" id="gsHoldHint">Mets-toi en position…</div>
      ${upcomingHtml}`;
    foot.innerHTML=`<button class="gs-main skip" id="gsRestart">↺ Recommencer la série</button>
      <div class="gs-row"><button id="gsStop">Stop / valider</button><button id="gsDone">Valider sans chrono</button></div>`;
    const runHold=()=>{
      // phase de préparation : 4s, anneau bleu, puis lancement auto du hold
      const phaseEl=document.getElementById("gsPhase");
      const unitEl=document.getElementById("gsUnit");
      const ringEl=document.getElementById("gsRing");
      const hintEl=document.getElementById("gsHoldHint");
      if(phaseEl)phaseEl.textContent="Préparez-vous";
      if(ringEl)ringEl.setAttribute("stroke","#5e9bb8");
      startGsTimer(4,()=>{
        // bascule sur le hold réel
        if(ringEl)ringEl.setAttribute("stroke","#d9682f");
        if(unitEl)unitEl.textContent="SECONDES";
        if(phaseEl)phaseEl.textContent=phase.toUpperCase();
        if(hintEl)hintEl.textContent="Tiens la position";
        try{navigator.vibrate&&navigator.vibrate(80);}catch(e){};
        startGsTimer(st.holdSec,()=>{try{navigator.vibrate&&navigator.vibrate([150,60,150]);}catch(e){};beep();setOutcome(st.ei,"done");markWork(st);next();});
      });
    };
    document.getElementById("gsRestart").onclick=()=>{ runHold(); };
    document.getElementById("gsStop").onclick=()=>{stopGsTimer();setOutcome(st.ei,"done");markWork(st);next();};
    document.getElementById("gsDone").onclick=()=>{stopGsTimer();setOutcome(st.ei,"done");markWork(st);next();};
    runHold(); // démarre tout seul à l'affichage de l'exo
    return;
  }
  // reps
  body.innerHTML=`<div class="gs-phase">${phase}</div>
    <div class="gs-name">${st.exName}</div>
    <div class="gs-set">${setLbl}</div>
    <div class="gs-big reps">${st.reps||"—"}</div>
    <div class="gs-meta">${st.perLeg?"répétitions / jambe":"répétitions"}</div>
    ${upcomingHtml}`;
  foot.innerHTML=`<button class="gs-main done" id="gsOk">Série réussie ✓</button>
    <div class="gs-row"><button id="gsHard">Trop dur</button><button id="gsSkipW">Passer</button></div>`;
  document.getElementById("gsOk").onclick=()=>{setOutcome(st.ei,"done");markWork(st);next();};
  document.getElementById("gsHard").onclick=()=>{setOutcome(st.ei,"hard");markWork(st);toast("Noté. Reste propre, baisse si besoin.");next();};
  document.getElementById("gsSkipW").onclick=()=>{setOutcome(st.ei,"skip");next();};
}

function markWork(st){
  // marque l'exo comme fait dès qu'au moins une série est validée ; complet si dernière série
  if(!doneMap[gsSessDate]) doneMap[gsSessDate]=new Array(gsExCount).fill(false);
  if(st.set>=st.sets || st.mobility){ doneMap[gsSessDate][st.ei]=true; save(LS_DONE,doneMap); }
}

function next(){ stopGsTimer(); gsIdx++; renderStep(); }

function renderFinish(){
  document.getElementById("gsBar").style.width="100%";
  document.getElementById("gsProg").textContent="Terminé";
  // journal : enregistre la séance. Exos jamais atteints → done si coché, sinon skip.
  if(gsSessDate){
    const sess=sessionFor(parse(gsSessDate));
    const dm=doneMap[gsSessDate]||[];
    const outcomes=sess.ex.map((e,i)=>gsOutcome[i]||(dm[i]?"done":"skip"));
    recordSession(gsSessDate, sess, outcomes);
  }
  const done=exProgress();
  document.getElementById("gsBody").innerHTML=`<div class="gs-finish">
    <div class="ic">🏔️</div><h2>Séance bouclée</h2>
    <p>Bien joué. Récupère, hydrate-toi.</p>
    <div class="stat2"><div><div class="v">${done}/${gsExCount}</div><div class="l">Exos validés</div></div>
    <div><div class="v">${gsQueue.filter(s=>s.type==="work").length}</div><div class="l">Séries faites</div></div></div>
  </div>`;
  document.getElementById("gsFoot").innerHTML=`<button class="gs-main done" id="gsFin">Retour au calendrier</button>`;
  document.getElementById("gsFin").onclick=()=>{closeSession();
    document.querySelector('[data-v="cal"]').click();};
}

/* timer du mode guidé */
function startGsTimer(sec,onEnd){
  stopGsTimer(); gsTotal=sec; gsLeft=sec; updGsRing();
  gsTimer=setInterval(()=>{
    gsLeft--; updGsRing();
    if(gsLeft<=0){stopGsTimer(); if(onEnd)onEnd();}
  },1000);
}
function stopGsTimer(){clearInterval(gsTimer);gsTimer=null;}
function updGsRing(){
  const n=document.getElementById("gsNum"), r=document.getElementById("gsRing");
  if(n)n.textContent=Math.max(0,gsLeft);
  if(r)r.style.strokeDashoffset=GS_CIRC*(1-Math.max(0,gsLeft)/(gsTotal||1));
}

/* ---------- TIMER ---------- */
let tTotal=30,tLeft=30,tInt=null,tRunning=false;
const CIRC=552.9;
const tModal=document.getElementById("timerModal"),tDisp=document.getElementById("tDisp"),tRing=document.getElementById("tRing"),tName=document.getElementById("tName"),tGo=document.getElementById("tGo");
window.openTimer=function(nm,secs){
  stopTimer();tName.textContent=nm;tTotal=secs;tLeft=secs;updTimer();tModal.classList.add("on");
};
function updTimer(){tDisp.textContent=tLeft;tRing.style.strokeDashoffset=CIRC*(1-tLeft/tTotal);}
function startTimer(){
  if(tRunning){stopTimer();return;}
  tRunning=true;tGo.textContent="Pause";tGo.style.background="var(--gold)";
  tInt=setInterval(()=>{
    tLeft--;updTimer();
    if(tLeft<=0){stopTimer();tDisp.textContent="✓";try{navigator.vibrate&&navigator.vibrate([200,80,200]);}catch(e){}; beep();}
  },1000);
}
function stopTimer(){clearInterval(tInt);tRunning=false;tGo.textContent="Démarrer";tGo.style.background="var(--moss)";}
function beep(){try{const a=new(window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator();const g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;o.start();g.gain.setValueAtTime(.25,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.5);o.stop(a.currentTime+.5);}catch(e){}}
tGo.onclick=startTimer;
document.getElementById("tReset").onclick=()=>{stopTimer();tLeft=tTotal;updTimer();};
document.getElementById("tClose").onclick=()=>{stopTimer();tModal.classList.remove("on");};
document.querySelectorAll(".tset button").forEach(b=>{b.onclick=()=>{stopTimer();tTotal=+b.dataset.s;tLeft=tTotal;updTimer();};});

/* ---------- TOAST ---------- */
let toastT=null;
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("on");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("on"),1900);}

/* ---------- CONFIRMATION THÉMÉE ---------- */
// Modale de confirmation intégrée (remplace confirm() natif, non stylable).
function askConfirm(opts,onYes){
  const m=document.getElementById("confirmModal");
  document.getElementById("cmIc").innerHTML=opts.icon||"";
  document.getElementById("cmTitle").textContent=opts.title||"Confirmer";
  document.getElementById("cmMsg").textContent=opts.message||"";
  const ok=document.getElementById("cmOk"), cancel=document.getElementById("cmCancel");
  ok.textContent=opts.okLabel||"Confirmer";
  const close=()=>{m.classList.remove("on");ok.onclick=null;cancel.onclick=null;};
  m.classList.add("on");
  ok.onclick=()=>{close();onYes&&onYes();};
  cancel.onclick=close;
  m.onclick=e=>{if(e.target===m)close();};
}

/* ---------- SAUVEGARDE / RESTAURATION ---------- */
// Exporte toutes les clés localStorage de l'appli (préfixe "ascent_") en JSON lisible.
window.exportData=function(){
  const data={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k||!k.startsWith("ascent_")) continue;
    const raw=localStorage.getItem(k);
    try{data[k]=JSON.parse(raw);}catch(e){data[k]=raw;}
  }
  const payload={app:"ASCENT",version:1,exportedAt:new Date().toISOString(),data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="ascent-sauvegarde-"+fmt(new Date())+".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("Données exportées");
};
window.triggerImport=function(){ document.getElementById("importFile").click(); };
function importData(file){
  const reader=new FileReader();
  reader.onload=()=>{
    let payload;
    try{payload=JSON.parse(reader.result);}catch(e){toast("Fichier JSON illisible");return;}
    const data=(payload&&payload.data&&typeof payload.data==="object")?payload.data:payload;
    if(!data||typeof data!=="object"){toast("Format non reconnu");return;}
    const keys=Object.keys(data).filter(k=>k.startsWith("ascent_"));
    if(!keys.length){toast("Aucune donnée ASCENT dans ce fichier");return;}
    if(!confirm(`Restaurer ${keys.length} clé(s) ? Tes données actuelles seront remplacées.`)) return;
    keys.forEach(k=>localStorage.setItem(k, JSON.stringify(data[k])));
    location.reload();
  };
  reader.onerror=()=>toast("Erreur de lecture du fichier");
  reader.readAsText(file);
}
document.getElementById("importFile").onchange=function(e){
  const f=e.target.files&&e.target.files[0];
  if(f) importData(f);
  e.target.value=""; // permet de réimporter le même fichier ensuite
};

/* ---------- INIT ---------- */
// au lancement, si le cycle commence dans le futur, sélectionne son premier jour
if(START>=new Date()){selected=fmt(START);viewMonth=new Date(START);}
localStorage.removeItem("ascent_max"); // nettoyage : ancienne clé des maxs, plus utilisée

function showLoadError(err){
  const msg=(err&&err.message)?err.message:"Erreur inconnue";
  views.cal.innerHTML=`<div class="panel"><h2 style="font-size:18px;margin-bottom:8px">Données indisponibles</h2>
    <p style="color:var(--mut);font-size:14px;line-height:1.6">Impossible de charger le plan. Vérifie que <b>plan.json</b> et <b>exercises.json</b> sont bien présents à côté de l'app, puis recharge la page.</p>
    <p style="color:var(--dim);font-family:'Spline Sans Mono';font-size:12px;margin-top:10px;word-break:break-word">${msg}</p></div>`;
}
async function loadJSON(path){
  const res=await fetch(path);
  if(!res.ok) throw new Error(path+" : HTTP "+res.status);
  return res.json();
}
async function init(){
  try{
    const [rawCatalog, rawPlan]=await Promise.all([loadJSON("exercises.json"), loadJSON("plan.json")]);
    CATALOG=rawCatalog;
    PLAN=buildPlan(rawPlan); // résout les identifiants ; lève si un id est absent du catalogue
  }catch(err){
    console.error("Échec du chargement des données :",err);
    showLoadError(err);
    return;
  }
  renderCal();updateStreak();
}
init();
