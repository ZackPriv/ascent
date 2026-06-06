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
  if(e.plan) return e.plan; // séances perso : plan de séries déjà calculé
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

// CATALOG = contenu de exercises.json : { id: {nom, type, cues, categorie, muscles} }.
// PLAN = plan.json transformé vers la forme interne {focus, ex:[{nm,dt,timer,type,id}]}.
let CATALOG=null, PLAN=null;

// Tables de correspondance pour l'affichage (les données brutes sont sans accent/espace).
// categorie : liste fermée de 7 valeurs ; muscles : liste fermée de 12 valeurs.
const CATEGORY_LABELS={tirage:"Tirage", poussee:"Poussée", jambes:"Jambes", gainage:"Gainage", skill:"Skill", mobilite:"Mobilité", souplesse:"Souplesse"};
const CATEGORY_ORDER=["tirage","poussee","jambes","gainage","skill","mobilite","souplesse"];
const MUSCLE_LABELS={dos:"Dos", biceps:"Biceps", pectoraux:"Pectoraux", triceps:"Triceps", epaules:"Épaules", "avant-bras":"Avant-bras", abdos:"Abdos", lombaires:"Lombaires", fessiers:"Fessiers", quadriceps:"Quadriceps", ischios:"Ischios", mollets:"Mollets"};
function muscleLabel(m){ return MUSCLE_LABELS[m] || (m? String(m).charAt(0).toUpperCase()+String(m).slice(1) : ""); }
function categoryLabel(c){ return CATEGORY_LABELS[c] || (c? String(c).charAt(0).toUpperCase()+String(c).slice(1) : ""); }
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

/* ---------- SÉANCES PERSO (surcouche utilisateur) ---------- */
// Stockées dans LS_CUSTOM, jamais dans plan.json/exercises.json. Une séance perso
// se compose UNIQUEMENT d'exercices du catalogue (exId). Forme stockée d'un item :
//   { exId, mode:"reps"|"hold"|"libre", sets, reps, holdSec, rest, text }
// buildCustomEx transforme un item en exo interne {nm,dt,timer,type,id,plan} :
//   - "plan" est le plan de séries prêt pour le mode guidé (voir parseEx) → 100%
//     compatible guidé/journal sans dépendre du format texte de "dt".
function buildCustomEx(item){
  const cat=CATALOG[item.exId]||{nom:"⚠ "+item.exId, type:item.mode||"reps"};
  const nm=cat.nom, id=item.exId, type=cat.type;
  const mode=item.mode||type||"reps";
  if(mode==="hold"){
    const hs=Math.max(0,+item.holdSec||0);
    const sets=Math.max(1,+item.sets||1);
    const rest=(item.rest!=null&&item.rest!=="")?Math.max(0,+item.rest):Math.max(30,Math.round(hs*1.5));
    const dt=`${sets} × ${hs}s`+(rest?` · repos ${rest}s`:"");
    return {nm,dt,timer:hs,type,id,plan:{mobility:false,sets,reps:hs,isHold:true,holdSec:hs,rest,perLeg:false}};
  }
  if(mode==="libre"){
    const text=(item.text||"Libre").trim()||"Libre";
    const mm=text.match(/(\d+)\s*min/);
    if(mm){const sec=+mm[1]*60;return {nm,dt:text,timer:sec,type,id,plan:{mobility:true,sets:1,reps:0,isHold:true,holdSec:sec,rest:0}};}
    const ss=text.match(/(\d+)\s*s\b/);
    if(ss){const sec=+ss[1];return {nm,dt:text,timer:sec,type,id,plan:{mobility:true,sets:1,reps:0,isHold:true,holdSec:sec,rest:0}};}
    return {nm,dt:text,timer:0,type,id,plan:{mobility:true,sets:1,reps:0,isHold:false,holdSec:0,rest:0}};
  }
  // reps
  const sets=Math.max(1,+item.sets||1), reps=Math.max(0,+item.reps||0);
  const rest=(item.rest!=null&&item.rest!=="")?Math.max(0,+item.rest):60;
  const dt=`${sets} × ${reps}`+(rest?` · repos ${rest}s`:"");
  return {nm,dt,timer:0,type,id,plan:{mobility:false,sets,reps,isHold:false,holdSec:0,rest,perLeg:false}};
}
// Transforme une séance perso stockée en session interne {custom,focus,ex:[...]}.
function buildCustomSession(cs){
  if(!cs||!Array.isArray(cs.ex)) return null;
  return {custom:true, csId:cs.id, focus:cs.name||"Séance perso", ex:cs.ex.map(buildCustomEx)};
}
// Session perso placée sur une date réelle (ds), ou null. La placement prime sur le
// programme : il remplace la séance prévue ce jour-là sans modifier le programme.
function customPlacedSession(ds){
  const sid=customData.placements&&customData.placements[ds];
  if(!sid) return null;
  const cs=customData.sessions&&customData.sessions[sid];
  if(!cs) return null;
  return buildCustomSession(cs);
}

// Schéma de semaine à partir de demain (Dim) : Dim=J1, Lun=J2, Mar=repos, Mer=J3, Jeu=J4, Ven=J5, Sam=repos
// JS getDay(): 0=Dim..6=Sam
const WEEKMAP = {0:"J1",1:"J2",2:"REST",3:"J3",4:"J4",5:"J5",6:"REST"};

/* ---------- STATE / STORAGE ---------- */
const LS_DONE="ascent_done", LS_START="ascent_start", LS_LOG="ascent_log", LS_SHIFT="ascent_shift", LS_CUSTOM="ascent_custom", LS_ACT="ascent_activities";
function load(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
// Échappe le texte saisi par l'utilisateur (noms de séances) avant injection HTML.
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
let doneMap = load(LS_DONE,{});      // {"2026-05-31":[true,false,...]}
let logMap  = load(LS_LOG,{});       // {"2026-05-31":{date,type,focus,ex:[{nm,r}]}} — r: "done"|"hard"|"skip"
// Reports de séance : liste des dates où un report a été appliqué. Un report à la
// date R décale d'un jour le planning de R et de tous les jours suivants. Les dates
// antérieures (séances passées / journal) ne bougent pas. Cumulable, annulable (pop).
let shiftList = load(LS_SHIFT,[]);   // ex: ["2026-06-07","2026-06-10"]
// Séances perso créées par l'utilisateur + leurs placements sur le calendrier.
// { sessions:{ "<id>":{id,name,ex:[{exId,mode,...}]} }, placements:{ "2026-06-15":"<id>" } }
let customData = load(LS_CUSTOM, {sessions:{}, placements:{}});
if(!customData.sessions) customData.sessions={};
if(!customData.placements) customData.placements={};
function saveCustom(){ save(LS_CUSTOM, customData); }
// Activités libres déclarées hors séances, indexées par date :
//   { "2026-06-03":[ {id,type,date,...champs selon type} ] }
let activitiesMap = load(LS_ACT, {});
if(!activitiesMap || typeof activitiesMap!=="object" || Array.isArray(activitiesMap)) activitiesMap={};
function saveActivities(){ save(LS_ACT, activitiesMap); }
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
  const cs = customPlacedSession(fmt(date)); // séance perso placée → prime sur le programme
  if(cs) return cs;
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
    type: sess.custom ? "PERSO" : WEEKMAP[eff(parse(ds)).getDay()],
    focus: sess.focus,
    // dt/id/exType : le prévu de la séance, conservé pour les stats (volume, catégories).
    // Champs ajoutés ; les anciennes entrées sans ces champs sont gérées en repli.
    ex: sess.ex.map((e,i)=>({nm:e.nm, r:outcomes[i]||"skip", dt:e.dt, id:e.id||"", exType:e.type||""}))
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

/* ---------- ACTIVITÉS LIBRES (déclarées hors séances) ---------- */
// Stockées dans LS_ACT, indexées par date. Une activité = { id, type, date, ...champs }.
// Le jeu de champs dépend du type : "course" est détaillé (distance/duree/denivele,
// allure CALCULÉE non stockée) ; les autres types ont durée + note optionnelles.
// Structure pensée pour être étendue : pour rendre un autre type détaillé plus tard,
// ajouter sa config (detail), son formulaire (renderActFields) et son résumé
// (activitySummary) — sans toucher au stockage ni au reste.
const ACTIVITY_TYPES={
  course:{label:"Course",icon:"🏃",detail:true},
  velo:{label:"Vélo",icon:"🚴"},
  natation:{label:"Natation",icon:"🏊"},
  volley:{label:"Volley",icon:"🏐"},
  rando:{label:"Rando",icon:"🥾"},
  escalade:{label:"Escalade",icon:"🧗"},
  football:{label:"Football",icon:"⚽"},
  autre:{label:"Autre",icon:"✨",free:true}
};
const ACTIVITY_ORDER=["course","velo","natation","volley","rando","escalade","football","autre"];
function actId(){return "act"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function activitiesFor(ds){const a=activitiesMap[ds];return Array.isArray(a)?a:[];}
function activityLabel(type){const c=ACTIVITY_TYPES[type];return c?c.label:(type||"Activité");}
function activityIcon(type){const c=ACTIVITY_TYPES[type];return c?c.icon:"✨";}
// Titre affiché : nom libre pour "autre", sinon libellé du type.
function activityTitle(act){
  if(act.type==="autre") return (act.name&&act.name.trim())?act.name.trim():"Activité";
  return activityLabel(act.type);
}
// Nombre joli (entier sans décimale, virgule française sinon).
function fmtNum(n){n=+n;return Number.isInteger(n)?String(n):String(n).replace(".",",");}
// Allure min/km à partir de distance (km) et durée (min). null si données manquantes.
function paceStr(distance,duree){
  const d=+distance,t=+duree;
  if(!(d>0)||!(t>0)) return null;
  const pace=t/d; let mn=Math.floor(pace), sc=Math.round((pace-mn)*60);
  if(sc===60){mn++;sc=0;}
  return mn+":"+String(sc).padStart(2,"0");
}
// Résumé lisible. Course : distance · durée · allure · D+. Autres : durée + note.
function activitySummary(act){
  const parts=[];
  if(act.type==="course"){
    if(act.distance>0) parts.push(fmtNum(act.distance)+" km");
    if(act.duree>0) parts.push(act.duree+" min");
    const p=paceStr(act.distance,act.duree); if(p) parts.push(p+" /km");
    if(act.denivele>0) parts.push("D+ "+act.denivele+" m");
    return parts.join(" · ")||"—";
  }
  if(act.duree>0) parts.push(act.duree+" min");
  if(act.note&&act.note.trim()) parts.push(act.note.trim());
  return parts.join(" · ")||"—";
}
function addActivity(act){
  const ds=act.date;
  if(!Array.isArray(activitiesMap[ds])) activitiesMap[ds]=[];
  activitiesMap[ds].push(act);
  saveActivities();
}
// Suppression d'une activité ajoutée par erreur (confirmation thémée).
window.removeActivity=function(ds,id){
  askConfirm({icon:ICON_TRASH,title:"Supprimer l'activité",message:"Cette activité libre sera retirée du journal.",okLabel:"Supprimer"},()=>{
    const arr=activitiesMap[ds]; if(!arr) return;
    activitiesMap[ds]=arr.filter(a=>a.id!==id);
    if(!activitiesMap[ds].length) delete activitiesMap[ds];
    saveActivities(); renderLog(); renderDay(); toast("Activité supprimée");
  });
};

/* ---------- AJOUT D'UNE ACTIVITÉ (modale) ---------- */
// Ouvre la modale, date par défaut = jour fourni (ou jour sélectionné).
window.openActivity=function(ds){
  const date=ds||selected;
  const sel=document.getElementById("actType");
  sel.innerHTML=ACTIVITY_ORDER.map(t=>`<option value="${t}">${esc(ACTIVITY_TYPES[t].label)}</option>`).join("");
  sel.value="course";
  document.getElementById("actDate").value=date;
  renderActFields("course");
  document.getElementById("actModal").classList.add("on");
};
window.closeActivity=function(){document.getElementById("actModal").classList.remove("on");};
window.onActType=function(){renderActFields(document.getElementById("actType").value);};
// Champs du formulaire selon le type. Course = détaillé ; "autre" = nom + simple ;
// reste = durée + note optionnelles.
function renderActFields(type){
  const host=document.getElementById("actFields");
  if(type==="course"){
    host.innerHTML=
      `<label class="act-l">Distance (km)<input id="actDist" type="number" min="0" step="0.1" inputmode="decimal" oninput="updateActPace()"></label>`+
      `<label class="act-l">Durée (min)<input id="actDur" type="number" min="0" inputmode="numeric" oninput="updateActPace()"></label>`+
      `<label class="act-l">Dénivelé + (m)<input id="actDplus" type="number" min="0" inputmode="numeric"></label>`+
      `<div class="act-pace" id="actPaceWrap" style="display:none">Allure <b id="actPace">—</b> <span class="act-pace-u">min/km</span></div>`;
    return;
  }
  let html="";
  if(ACTIVITY_TYPES[type]&&ACTIVITY_TYPES[type].free){
    html+=`<label class="act-l">Nom<input id="actName" type="text" maxlength="40" placeholder="Nom de l'activité"></label>`;
  }
  html+=`<label class="act-l">Durée (min) <span class="act-opt">optionnel</span><input id="actDur" type="number" min="0" inputmode="numeric"></label>`;
  html+=`<label class="act-l">Note <span class="act-opt">optionnel</span><input id="actNote" type="text" maxlength="80" placeholder="Quelques mots"></label>`;
  host.innerHTML=html;
}
// Met à jour l'allure (lecture seule) en direct ; masquée si distance/durée manque.
window.updateActPace=function(){
  const d=document.getElementById("actDist"), t=document.getElementById("actDur");
  const wrap=document.getElementById("actPaceWrap"), out=document.getElementById("actPace");
  if(!d||!t||!wrap||!out) return;
  const p=paceStr(d.value,t.value);
  if(p){out.textContent=p;wrap.style.display="";}else{wrap.style.display="none";}
};
window.saveActivity=function(){
  const type=document.getElementById("actType").value;
  const date=document.getElementById("actDate").value||selected;
  const num=id=>{const el=document.getElementById(id);if(!el)return 0;const v=parseFloat(el.value);return isNaN(v)?0:Math.max(0,v);};
  const txt=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
  const act={id:actId(),type,date};
  if(type==="course"){
    act.distance=num("actDist"); act.duree=num("actDur"); act.denivele=num("actDplus");
  }else{
    if(ACTIVITY_TYPES[type]&&ACTIVITY_TYPES[type].free) act.name=txt("actName")||"Activité";
    act.duree=num("actDur");
    const note=txt("actNote"); if(note) act.note=note;
  }
  addActivity(act);
  closeActivity();
  renderLog(); renderDay();
  toast("Activité ajoutée");
};

/* ---------- TABS ---------- */
const views={cal:document.getElementById("v-cal"),day:document.getElementById("v-day"),log:document.getElementById("v-log"),stats:document.getElementById("v-stats"),cust:document.getElementById("v-cust")};
document.querySelectorAll("nav.tabs button").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll("nav.tabs button").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");
    Object.values(views).forEach(v=>v.classList.remove("on"));
    const v=b.dataset.v; views[v].classList.add("on");
    if(v==="day") renderDay();
    if(v==="log") renderLog();
    if(v==="stats") renderStats();
    if(v==="cust") renderCust();
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
  if(!d || d.length!==sess.ex.length) return "none";
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
    c.className="cell"+(sess.rest?" rest":"")+(sess.custom?" custom":"");
    if(st==="done")c.classList.add("done");
    if(st==="partial")c.classList.add("partial");
    if(ds===todayS)c.classList.add("today");
    if(ds===selected)c.classList.add("sel");
    const tag=sess.rest?"REPOS":(sess.custom?"PERSO":WEEKMAP[eff(dt).getDay()]);
    c.innerHTML=`<span class="d">${dnum}</span><span class="tag">${tag}</span>`+
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
// Barre séance perso : sur un jour avec séance perso → badge + retirer/remplacer ;
// sinon → bouton pour en placer une.
function customBar(sess){
  if(sess.custom){
    return `<div class="cust-bar">
      <div class="cust-binfo"><span class="cust-badge">★ Séance perso</span><span class="cust-bnm">${esc(sess.focus)}</span></div>
      <div class="cust-bacts">
        <button class="cust-swap" onclick="openPicker()">Remplacer</button>
        <button class="cust-remove" onclick="removeCustomDay()">Retirer</button>
      </div></div>`;
  }
  return `<button class="cust-place" onclick="openPicker()">
    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Placer une séance perso</button>`;
}
// Bloc « activités libres » de la vue jour : bouton d'ajout + liste des activités
// déclarées ce jour-là (chacune supprimable). N'interfère pas avec la séance.
function activityBar(ds){
  const acts=activitiesFor(ds);
  let list="";
  if(acts.length){
    list=`<div class="act-day-list">`+acts.map(a=>`
      <div class="act-day-item">
        <span class="act-day-ic">${activityIcon(a.type)}</span>
        <div class="act-day-body"><div class="act-day-nm">${esc(activityTitle(a))}</div><div class="act-day-sum">${esc(activitySummary(a))}</div></div>
        <button class="act-day-del" onclick="removeActivity('${ds}','${a.id}')" aria-label="Supprimer l'activité">✕</button>
      </div>`).join("")+`</div>`;
  }
  return `<button class="act-add" onclick="openActivity('${ds}')">
    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Ajouter une activité</button>`+list;
}
// Garantit que le tableau de progression du jour a la bonne longueur (la séance du
// jour a pu changer : report, placement/retrait perso, édition). Réinitialise sinon.
function ensureDone(ds,len){
  let a=doneMap[ds];
  if(!a||a.length!==len){a=new Array(len).fill(false);doneMap[ds]=a;}
  return a;
}
function renderDay(){
  const dt=parse(selected), sched=eff(dt), sess=sessionFor(dt);
  const host=views.day;
  const dateLbl=`${DOWFULL[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]}`;
  if(sess.rest){
    host.innerHTML=`<div class="day-hero"><span class="dk">${dateLbl}</span><h2>Jour de repos</h2><span class="focus">Semaine ${weekNum(sched)} du cycle</span></div>
      <div class="panel rest-card"><div class="ic">🌿</div><h3>${sess.focus}</h3><p>${sess.note}</p></div>`+customBar(sess)+reportBar(true)+activityBar(selected);
    return;
  }
  const done=ensureDone(selected,sess.ex.length);
  const tag=sess.custom?"Perso":WEEKMAP[sched.getDay()];
  let html=`<div class="day-hero"><span class="dk">${dateLbl} · Semaine ${weekNum(sched)}</span>
    <h2>${tag} — ${esc(sess.focus)}</h2>
    <span class="sub">${done.filter(Boolean).length}/${sess.ex.length} exercices validés</span>
    <span class="focus">⏱ ~30 min · haute densité</span></div>
    <div class="start-bar"><button class="start-btn" onclick="startSession()">
      <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>Démarrer la séance guidée</button></div>`;
  sess.ex.forEach((e,i)=>{
    html+=`<div class="ex${done[i]?' done':''}" data-i="${i}">
      <div class="check" onclick="toggleEx(${i})"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <div class="body"><div class="nm">${esc(e.nm)}</div><div class="dt">${esc(e.dt)}</div></div>
      ${(e.id&&CATALOG[e.id])?`<button class="info-btn" onclick="openExDetail('${esc(e.id)}')" aria-label="Détail de l'exercice">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg></button>`:""}
      ${e.timer?`<button class="timer-btn" onclick="openTimer('${esc(e.nm).replace(/'/g,"")}',${e.timer})">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>${e.timer}s</button>`:""}
    </div>`;
  });
  host.innerHTML=html+customBar(sess)+reportBar(false)+activityBar(selected);
}
/* ---------- DÉTAIL D'UN EXERCICE (lecture seule du catalogue) ---------- */
// Affiche catégorie, muscles (étiquettes lisibles via table de correspondance)
// et cues. Tolère le vieux format (champs absents) sans planter.
window.openExDetail=function(id){
  const cat=CATALOG[id]; if(!cat) return;
  let html=`<button class="tclose" onclick="closeExDetail()" aria-label="Fermer">×</button>
    <h3 class="ex-d-title">${esc(cat.nom)}</h3>`;
  if(cat.categorie && CATEGORY_LABELS[cat.categorie]){
    html+=`<div class="ex-d-cat">${esc(categoryLabel(cat.categorie))}</div>`;
  }
  html+=`<div class="ex-d-sec"><span class="ex-d-lbl">Muscles</span>`;
  const muscles=Array.isArray(cat.muscles)?cat.muscles:[];
  if(muscles.length){
    html+=`<div class="ex-d-tags">`+muscles.map(m=>`<span class="muscle-tag">${esc(muscleLabel(m))}</span>`).join("")+`</div>`;
  }else{
    html+=`<p class="ex-d-empty">Muscles non renseignés</p>`;
  }
  html+=`</div>`;
  const cues=Array.isArray(cat.cues)?cat.cues:[];
  if(cues.length){
    html+=`<div class="ex-d-sec"><span class="ex-d-lbl">Points clés</span>
      <ul class="ex-d-cues">`+cues.map(c=>`<li>${esc(c)}</li>`).join("")+`</ul></div>`;
  }
  document.getElementById("exDetailBody").innerHTML=html;
  document.getElementById("exModal").classList.add("on");
};
window.closeExDetail=function(){document.getElementById("exModal").classList.remove("on");};

/* ---------- PLACEMENT D'UNE SÉANCE PERSO ---------- */
const ICON_STAR=`<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 17l-5.4 2.6 1.2-6-4.5-4.2 6.1-.8z"/></svg>`;
const ICON_TRASH=`<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>`;
// Ouvre le sélecteur de séances perso à placer sur le jour affiché.
window.openPicker=function(){
  const list=document.getElementById("pickList");
  const ids=Object.keys(customData.sessions||{});
  const dt=parse(selected);
  const lbl=`${DOWFULL[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]}`;
  if(!ids.length){
    list.innerHTML=`<p class="pick-empty">Aucune séance perso enregistrée.</p>
      <button class="pick-create" onclick="closePicker();openBuilder(null)">+ Créer une séance</button>`;
  }else{
    list.innerHTML=`<p class="pick-sub">Sur ${lbl}</p>`+ids.map(id=>{
      const s=customData.sessions[id]; const n=(s.ex||[]).length;
      return `<button class="pick-item" onclick="placeCustomDay('${id}')">
        <span class="pick-nm">${esc(s.name||"Séance")}</span>
        <span class="pick-meta">${n} exercice${n>1?"s":""}</span></button>`;
    }).join("");
  }
  document.getElementById("pickModal").classList.add("on");
};
window.closePicker=function(){document.getElementById("pickModal").classList.remove("on");};
// Place une séance perso sur le jour affiché (remplace la séance prévue).
window.placeCustomDay=function(sid){
  customData.placements[selected]=sid; delete doneMap[selected];
  saveCustom(); save(LS_DONE,doneMap);
  closePicker(); renderDay(); renderCal(); updateStreak(); toast("Séance perso placée");
};
// Retire la séance perso du jour affiché : le programme d'origine réapparaît.
window.removeCustomDay=function(){
  if(!customData.placements[selected]) return;
  askConfirm({icon:ICON_STAR,title:"Retirer la séance perso",message:"La séance prévue par le programme réapparaîtra sur ce jour.",okLabel:"Retirer"},()=>{
    delete customData.placements[selected]; delete doneMap[selected];
    saveCustom(); save(LS_DONE,doneMap);
    renderDay(); renderCal(); updateStreak(); toast("Séance perso retirée");
  });
};
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
  ensureDone(selected,sess.ex.length);
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
// Bouton d'ajout d'activité (réutilisé dans l'en-tête et l'état vide du journal).
const ACT_ADD_BTN=`<button class="act-add log-act-add" onclick="openActivity(selected)">
  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Ajouter une activité</button>`;
function renderLog(){
  const host=views.log;
  const sessionDates=Object.keys(logMap);
  const actDates=Object.keys(activitiesMap).filter(ds=>activitiesFor(ds).length);
  // chronologie fusionnée : dates de séances ET d'activités, plus récent → plus ancien
  const allDates=[...new Set([...sessionDates,...actDates])].sort().reverse();
  const nSess=sessionDates.length;
  const nAct=actDates.reduce((s,ds)=>s+activitiesFor(ds).length,0);
  if(!allDates.length){
    host.innerHTML=`<div class="panel log-empty"><div class="ic">📓</div>
      <h2>Aucune séance enregistrée</h2>
      <p>Termine une séance (mode guidé ou en cochant tous les exercices), ou déclare une activité libre, pour la voir apparaître ici.</p></div>`+ACT_ADD_BTN+BACKUP_HTML;
    return;
  }
  const RLBL={done:"réussis",hard:"trop dur",skip:"passés"};
  const count=`${nSess} séance${nSess>1?"s":""}`+(nAct?` · ${nAct} activité${nAct>1?"s":""}`:"");
  let html=`<div class="log-head"><h2>Journal</h2><span>${count}</span></div>`+ACT_ADD_BTN;
  allDates.forEach(ds=>{
    const dt=parse(ds);
    const dateLbl=`${DOWFULL[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]}`;
    // carte séance (si une séance a été enregistrée ce jour-là)
    const en=logMap[ds];
    if(en){
      const nb=r=>en.ex.filter(x=>x.r===r).length;
      const stat=r=>nb(r)?`<span class="ls ${r}">${nb(r)} ${RLBL[r]}</span>`:"";
      html+=`<div class="log-card">
        <div class="log-top"><span class="log-tag${en.type==="PERSO"?" perso":""}">${en.type}</span>
          <div class="log-info"><div class="log-date">${dateLbl}</div><div class="log-focus">${esc(en.focus)}</div></div></div>
        <div class="log-stats">${stat("done")}${stat("hard")}${stat("skip")}</div>
        <div class="log-ex">${en.ex.map(x=>`<div class="lex ${x.r}"><i></i>${esc(x.nm)}</div>`).join("")}</div>
      </div>`;
    }
    // cartes activités libres du même jour (style distinct, supprimables)
    activitiesFor(ds).forEach(a=>{
      html+=`<div class="log-card act-card">
        <div class="log-top"><span class="log-tag activity">${activityIcon(a.type)}</span>
          <div class="log-info"><div class="log-date">${dateLbl}</div><div class="log-focus">${esc(activityTitle(a))}</div></div>
          <button class="act-del" onclick="removeActivity('${ds}','${a.id}')" aria-label="Supprimer l'activité">✕</button></div>
        <div class="act-summary">${esc(activitySummary(a))}</div>
      </div>`;
    });
  });
  host.innerHTML=html+BACKUP_HTML;
}

/* ---------- ONGLET STATS (lecture seule : journal + activités + catalogue) ---------- */
// Cet onglet ne fait que LIRE logMap / activitiesMap / CATALOG. Il n'écrit rien.
let statsPeriod="week"; // "week" | "month" | "all"
const CATEGORY_COLORS={tirage:"#d9682f",poussee:"#5e9bb8",jambes:"#d8a23a",gainage:"#8ba05a",skill:"#b07bc4",mobilite:"#5bb0a0",souplesse:"#c98f6a"};
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
// Entier avec séparateur de milliers (espace fine).
function fmtInt(n){return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g," ");}
// Durée lisible à partir de secondes : "30 s" / "4 min 30 s" / "1 h 5 min".
function fmtDur(sec){
  sec=Math.round(sec);
  if(sec<60) return sec+" s";
  const m=Math.floor(sec/60), s=sec%60;
  if(m<60) return m+" min"+(s?` ${s} s`:"");
  const h=Math.floor(m/60), mm=m%60;
  return h+" h"+(mm?` ${mm} min`:"");
}
// Parse une ligne "series" en volume. Renvoie {reps,holdSec} ou null si non parsable.
// "4 × 14" → 56 reps ; "6 × 5s" → 30 s ; "5 × 3 · repos 75s" → 15 reps (ignore repos).
// Le 's' juste après le 2e nombre (ou exType "hold") indique des secondes.
function parseVolume(dt,exType){
  if(!dt) return null;
  const s=String(dt);
  const m=s.match(/(\d+)\s*×\s*(\d+)/);
  if(!m) return null;
  const a=+m[1], b=+m[2];
  const after=s.slice(m.index+m[0].length);
  const isSec = /^\s*s/.test(after) || exType==="hold";
  return isSec ? {reps:0, holdSec:a*b} : {reps:a*b, holdSec:0};
}
// Récupère le prévu (dt/id/exType) de chaque exo d'une entrée de journal. Utilise les
// champs stockés ; pour les anciennes entrées sans ces champs, replie sur la séance
// re-résolue pour cette date (appariement par index si les longueurs concordent).
function performedExes(ds,en){
  let fb=null; // séance de repli (résolue une seule fois si besoin)
  return (en.ex||[]).map((x,i)=>{
    let dt=x.dt, id=x.id, type=x.exType;
    if(dt==null||type==null||type===""){
      if(fb===null){ try{fb=sessionFor(parse(ds));}catch(e){fb=false;} }
      if(fb&&fb.ex&&fb.ex.length===en.ex.length&&fb.ex[i]){
        if(dt==null) dt=fb.ex[i].dt;
        if(!id) id=fb.ex[i].id;
        if(!type) type=fb.ex[i].type;
      }
    }
    return {nm:x.nm, r:x.r, dt:dt||"", id:id||"", type:type||""};
  });
}
// Bornes de la période sélectionnée + plage de la heatmap de régularité.
function statsRange(period){
  const today=new Date(); today.setHours(0,0,0,0);
  if(period==="week"){
    const dow=(today.getDay()+6)%7, mon=addDays(today,-dow);
    return {start:fmt(mon), end:fmt(addDays(mon,6)), heatStart:fmt(mon), heatEnd:fmt(addDays(mon,6)), heatLabel:"Cette semaine"};
  }
  if(period==="month"){
    const first=new Date(today.getFullYear(),today.getMonth(),1);
    const last=new Date(today.getFullYear(),today.getMonth()+1,0);
    return {start:fmt(first), end:fmt(last), heatStart:fmt(first), heatEnd:fmt(last), heatLabel:"Ce mois"};
  }
  // all : totaux non bornés ; heatmap = 12 dernières semaines
  const dow=(today.getDay()+6)%7, sun=addDays(today,6-dow), mon=addDays(sun,-7*11-6);
  return {start:null, end:null, heatStart:fmt(mon), heatEnd:fmt(sun), heatLabel:"12 dernières semaines"};
}
function inR(ds,r){ if(r.start==null) return true; return ds>=r.start && ds<=r.end; }
// Agrège toutes les statistiques de la période (lecture seule).
function computeStats(period){
  const r=statsRange(period);
  let sessions=0, reps=0, holdSec=0, totalActs=0;
  const cat={}; const keyEx={pull:0, push:0};
  for(const ds in logMap){
    if(!inR(ds,r)) continue;
    sessions++;
    performedExes(ds,logMap[ds]).forEach(x=>{
      if(x.r!=="done") return;
      const v=parseVolume(x.dt,x.type);
      if(v){ reps+=v.reps; holdSec+=v.holdSec; }
      const c=(CATALOG[x.id]||{}).categorie;
      if(c) cat[c]=(cat[c]||0)+1;
      if(v&&v.reps>0){
        if(/pullup/.test(x.id)) keyEx.pull+=v.reps;
        else if(/pushup/.test(x.id)) keyEx.push+=v.reps;
      }
    });
  }
  let dist=0, deniv=0, dur=0, runs=0;
  for(const ds in activitiesMap){
    if(!inR(ds,r)) continue;
    activitiesFor(ds).forEach(a=>{
      totalActs++;
      if(a.type==="course"){ dist+=+a.distance||0; deniv+=+a.denivele||0; dur+=+a.duree||0; runs++; }
    });
  }
  return {range:r, sessions, reps, holdSec, cat, keyEx, course:{dist,deniv,dur,runs}, totalActs, kmCourus:dist};
}
window.setStatsPeriod=function(p){ statsPeriod=p; renderStats(); };
function statsPeriodBar(){
  const opt=(p,l)=>`<button class="${statsPeriod===p?"on":""}" onclick="setStatsPeriod('${p}')">${l}</button>`;
  return `<div class="stats-period">${opt("week","Cette semaine")}${opt("month","Ce mois")}${opt("all","Tout")}</div>`;
}
// Grille de régularité (heatmap type Strava/GitHub) sur la plage donnée.
function regularityGrid(r){
  const start=parse(r.heatStart), end=parse(r.heatEnd);
  // recule au lundi de la semaine de début pour aligner les colonnes
  const sdow=(start.getDay()+6)%7, gridStart=addDays(start,-sdow);
  const active={}; // ds -> 1 (activité seule) | 2 (séance)
  for(const ds in logMap){ if(ds>=r.heatStart&&ds<=r.heatEnd) active[ds]=2; }
  for(const ds in activitiesMap){ if(ds>=r.heatStart&&ds<=r.heatEnd&&activitiesFor(ds).length){ if(active[ds]!==2) active[ds]=1; } }
  let activeCount=0; for(const k in active) activeCount++;
  const todayS=fmt(new Date());
  let cols="", d=new Date(gridStart);
  while(fmt(d)<=r.heatEnd){
    let cells="";
    for(let i=0;i<7;i++){
      const ds=fmt(d);
      const inRange=ds>=r.heatStart&&ds<=r.heatEnd;
      const lv=active[ds]||0;
      const cls=!inRange?"heat-cell off":("heat-cell"+(lv===2?" lv2":lv===1?" lv1":"")+(ds===todayS?" td":""));
      cells+=`<div class="${cls}"></div>`;
      d=addDays(d,1);
    }
    cols+=`<div class="heat-col">${cells}</div>`;
  }
  return {html:`<div class="heat">${cols}</div>`, activeCount};
}
function renderStats(){
  const host=views.stats;
  const s=computeStats(statsPeriod);
  let html=`<div class="stats-head"><h2>Statistiques</h2></div>`+statsPeriodBar();

  if(s.sessions===0 && s.totalActs===0){
    host.innerHTML=html+`<div class="panel stats-empty"><div class="ic">📊</div>
      <h3>Aucune donnée sur cette période</h3>
      <p>Termine une séance ou déclare une activité libre, puis reviens ici pour voir tes statistiques.</p></div>`;
    return;
  }

  // 1. Chiffres clés
  const card=(ic,val,lbl)=>`<div class="stat-card"><span class="stat-ic">${ic}</span><span class="stat-val">${val}</span><span class="stat-lbl">${lbl}</span></div>`;
  html+=`<div class="stat-cards">
    ${card("🏋️", fmtInt(s.sessions), "séance"+(s.sessions>1?"s":"")+" terminée"+(s.sessions>1?"s":""))}
    ${card("🔁", fmtInt(s.reps), "répétitions")}
    ${card("⏱️", fmtDur(s.holdSec), "temps en hold")}
    ${card("🏃", fmtNum(s.kmCourus), "km courus")}
  </div>`;

  // 2. Volume par exercice clé
  html+=`<div class="sec-k">Exercices clés</div>
    <div class="keyex-row">
      <div class="keyex"><span class="keyex-val">${fmtInt(s.keyEx.pull)}</span><span class="keyex-lbl">Tractions · reps</span></div>
      <div class="keyex"><span class="keyex-val">${fmtInt(s.keyEx.push)}</span><span class="keyex-lbl">Pompes · reps</span></div>
    </div>`;

  // 3. Répartition par catégorie
  const catTotal=CATEGORY_ORDER.reduce((t,c)=>t+(s.cat[c]||0),0);
  html+=`<div class="sec-k">Répartition par catégorie</div>`;
  if(!catTotal){
    html+=`<div class="stats-note">Pas encore de volume enregistré sur cette période.</div>`;
  }else{
    html+=`<div class="cat-bars">`+CATEGORY_ORDER.filter(c=>s.cat[c]).map(c=>{
      const n=s.cat[c], pct=Math.round(n/catTotal*100);
      return `<div class="cat-row">
        <span class="cat-name">${esc(CATEGORY_LABELS[c]||c)}</span>
        <span class="cat-track"><i style="width:${Math.max(pct,3)}%;background:${CATEGORY_COLORS[c]||"var(--gold)"}"></i></span>
        <span class="cat-pct">${pct}%</span></div>`;
    }).join("")+`</div>`;
  }

  // 4. Course
  html+=`<div class="sec-k">Course à pied</div>`;
  if(!s.course.runs){
    html+=`<div class="stats-note">Aucune sortie course sur cette période.</div>`;
  }else{
    const pace=paceStr(s.course.dist,s.course.dur);
    const cs=(val,lbl)=>`<div class="course-stat"><span class="cs-val">${val}</span><span class="cs-lbl">${lbl}</span></div>`;
    html+=`<div class="course-grid">
      ${cs(fmtNum(s.course.dist)+" km","Distance")}
      ${cs("D+ "+fmtInt(s.course.deniv)+" m","Dénivelé")}
      ${cs(pace?pace+" /km":"—","Allure moy.")}
      ${cs(fmtInt(s.course.runs),"Sortie"+(s.course.runs>1?"s":""))}
    </div>`;
  }

  // 5. Régularité
  const grid=regularityGrid(s.range);
  html+=`<div class="sec-k">Régularité <span class="sec-sub">${s.range.heatLabel}</span></div>
    <div class="panel reg-card">
      <div class="reg-count"><b>${grid.activeCount}</b> jour${grid.activeCount>1?"s":""} actif${grid.activeCount>1?"s":""}</div>
      ${grid.html}
      <div class="heat-legend"><span class="heat-cell lv1"></span>Activité<span class="heat-cell lv2"></span>Séance</div>
    </div>`;

  host.innerHTML=html;
}

/* ---------- ONGLET PERSO (mes séances) ---------- */
function sessId(){return "cs"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function renderCust(){
  const host=views.cust;
  const sessions=customData.sessions||{};
  const ids=Object.keys(sessions);
  let html=`<div class="cust-head"><h2>Mes séances</h2><span>${ids.length} séance${ids.length>1?"s":""}</span></div>
    <button class="cust-create" onclick="openBuilder(null)">
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Créer une séance</button>`;
  if(!ids.length){
    html+=`<div class="panel cust-empty"><div class="ic">🛠️</div><h3>Aucune séance perso</h3>
      <p>Compose une séance à partir des exercices du catalogue, puis place-la sur un jour du calendrier depuis la vue « Séance ».</p></div>`;
  }else{
    const pc={};
    for(const ds in customData.placements){const sid=customData.placements[ds];pc[sid]=(pc[sid]||0)+1;}
    html+=ids.map(id=>{
      const s=sessions[id]; const n=(s.ex||[]).length; const placed=pc[id]||0;
      const summary=(s.ex||[]).map(x=>esc((CATALOG[x.exId]||{}).nom||x.exId)).join(" · ");
      return `<div class="cust-card">
        <div class="cust-card-top"><span class="cust-card-nm">${esc(s.name||"Séance")}</span>
          <span class="cust-card-meta">${n} exo${n>1?"s":""}${placed?` · placée ${placed}×`:""}</span></div>
        <div class="cust-card-ex">${summary||"—"}</div>
        <div class="cust-card-acts">
          <button onclick="openBuilder('${id}')">Modifier</button>
          <button onclick="duplicateCust('${id}')">Dupliquer</button>
          <button class="danger" onclick="deleteCust('${id}')">Supprimer</button>
        </div></div>`;
    }).join("");
    html+=`<button class="cust-reset" onclick="resetCust()">Réinitialiser mes séances perso</button>`;
  }
  host.innerHTML=html;
}
window.duplicateCust=function(id){
  const s=customData.sessions[id]; if(!s) return;
  const nid=sessId();
  customData.sessions[nid]={id:nid, name:(s.name||"Séance")+" (copie)", ex:(s.ex||[]).map(x=>Object.assign({},x))};
  saveCustom(); renderCust(); toast("Séance dupliquée");
};
window.deleteCust=function(id){
  const s=customData.sessions[id]; if(!s) return;
  askConfirm({icon:ICON_TRASH,title:"Supprimer la séance",message:`« ${s.name||"Séance"} » sera supprimée et retirée des jours où elle est placée.`,okLabel:"Supprimer"},()=>{
    delete customData.sessions[id];
    for(const ds in customData.placements){if(customData.placements[ds]===id){delete customData.placements[ds];delete doneMap[ds];}}
    saveCustom(); save(LS_DONE,doneMap);
    renderCust(); renderCal(); updateStreak(); toast("Séance supprimée");
  });
};
window.resetCust=function(){
  askConfirm({icon:ICON_TRASH,title:"Réinitialiser les séances perso",message:"Toutes tes séances perso et leurs placements seront effacés. Le programme d'origine n'est pas touché.",okLabel:"Réinitialiser"},()=>{
    for(const ds in customData.placements){delete doneMap[ds];}
    customData={sessions:{},placements:{}}; saveCustom(); save(LS_DONE,doneMap);
    renderCust(); renderCal(); updateStreak(); toast("Séances perso réinitialisées");
  });
};

/* ---------- ÉDITEUR DE SÉANCE PERSO ---------- */
// builderState = brouillon en cours d'édition : {id, name, ex:[{exId,mode,sets,reps,holdSec,rest,text}]}.
let builderState=null;
function catalogOptions(){
  // Regroupe les exercices par catégorie via <optgroup>. Les exercices sans
  // catégorie (vieux format) tombent dans un groupe "Autres" en fin de liste.
  const groups={}; // categorie -> [ids]
  Object.keys(CATALOG).forEach(id=>{
    const c=CATALOG[id].categorie;
    const key=(c && CATEGORY_LABELS[c])? c : "_autres";
    (groups[key]||(groups[key]=[])).push(id);
  });
  const order=CATEGORY_ORDER.filter(c=>groups[c]);
  if(groups._autres) order.push("_autres");
  return order.map(key=>{
    const label=key==="_autres"?"Autres":CATEGORY_LABELS[key];
    const opts=groups[key]
      .sort((a,b)=>CATALOG[a].nom.localeCompare(CATALOG[b].nom,"fr"))
      .map(id=>`<option value="${id}">${esc(CATALOG[id].nom)}</option>`).join("");
    return `<optgroup label="${esc(label)}">${opts}</optgroup>`;
  }).join("");
}
window.openBuilder=function(sid){
  if(sid && customData.sessions[sid]){
    const s=customData.sessions[sid];
    builderState={id:sid, name:s.name||"", ex:(s.ex||[]).map(x=>Object.assign({},x))};
  }else{
    builderState={id:null, name:"", ex:[]};
  }
  document.getElementById("builder").classList.add("on");
  try{document.body.style.overflow="hidden";}catch(e){}
  renderBuilder();
};
function closeBuilder(){
  document.getElementById("builder").classList.remove("on");
  try{document.body.style.overflow="";}catch(e){}
}
function bfield(i,key,lbl,val){
  return `<label class="bld-f">${lbl}
    <input type="number" inputmode="numeric" min="0" value="${val==null?"":val}" onchange="setBuilderField(${i},'${key}',this.value)"></label>`;
}
function builderFields(it,i){
  if(it.mode==="hold") return bfield(i,"sets","Séries",it.sets)+bfield(i,"holdSec","Hold (s)",it.holdSec)+bfield(i,"rest","Repos (s)",it.rest);
  if(it.mode==="libre") return `<label class="bld-f bld-f-wide">Texte libre
    <input type="text" value="${esc(it.text||"")}" placeholder="Ex. 5 min" onchange="setBuilderField(${i},'text',this.value)"></label>`;
  return bfield(i,"sets","Séries",it.sets)+bfield(i,"reps","Reps",it.reps)+bfield(i,"rest","Repos (s)",it.rest);
}
function renderBuilder(){
  const b=builderState;
  document.getElementById("builderTitle").textContent=b.id?"Modifier la séance":"Nouvelle séance";
  let html=`<label class="bld-label">Nom de la séance</label>
    <input class="bld-name" id="bldName" type="text" placeholder="Ex. Tirage maison" value="${esc(b.name)}">
    <div class="bld-add">
      <select id="bldPick">${catalogOptions()}</select>
      <button class="bld-addbtn" onclick="addBuilderEx()">+ Ajouter</button>
    </div>
    <div class="bld-list">`;
  if(!b.ex.length){
    html+=`<p class="bld-empty">Aucun exercice. Choisis-en un dans la liste ci-dessus et ajoute-le.</p>`;
  }
  const MODES=[["reps","Reps"],["hold","Hold"],["libre","Libre"]];
  b.ex.forEach((it,i)=>{
    const cat=CATALOG[it.exId]||{nom:"⚠ "+it.exId};
    html+=`<div class="bld-ex">
      <div class="bld-ex-top">
        <span class="bld-ex-nm">${esc(cat.nom)}</span>
        <div class="bld-ex-move">
          <button onclick="moveBuilderEx(${i},-1)"${i===0?" disabled":""}>↑</button>
          <button onclick="moveBuilderEx(${i},1)"${i===b.ex.length-1?" disabled":""}>↓</button>
          <button class="bld-del" onclick="removeBuilderEx(${i})">×</button>
        </div>
      </div>
      <div class="bld-ex-mode">${MODES.map(([m,l])=>`<button class="${it.mode===m?'on':''}" onclick="setBuilderMode(${i},'${m}')">${l}</button>`).join("")}</div>
      <div class="bld-ex-fields">${builderFields(it,i)}</div>
    </div>`;
  });
  html+=`</div>`;
  document.getElementById("builderBody").innerHTML=html;
  const nm=document.getElementById("bldName");
  nm.oninput=e=>{builderState.name=e.target.value;};
}
window.addBuilderEx=function(){
  const sel=document.getElementById("bldPick"); const id=sel&&sel.value;
  if(!id||!CATALOG[id]) return;
  const type=CATALOG[id].type||"reps";
  const it={exId:id, mode:type};
  if(type==="hold"){it.sets=3;it.holdSec=20;it.rest="";}
  else if(type==="libre"){it.text="5 min";}
  else {it.sets=4;it.reps=10;it.rest=60;}
  builderState.ex.push(it); renderBuilder();
};
window.removeBuilderEx=function(i){builderState.ex.splice(i,1);renderBuilder();};
window.moveBuilderEx=function(i,d){const a=builderState.ex,j=i+d;if(j<0||j>=a.length)return;const t=a[i];a[i]=a[j];a[j]=t;renderBuilder();};
window.setBuilderField=function(i,k,v){if(builderState.ex[i])builderState.ex[i][k]=v;};
window.setBuilderMode=function(i,m){
  const it=builderState.ex[i]; if(!it) return; it.mode=m;
  if(m==="hold"){if(it.holdSec==null)it.holdSec=20;if(it.sets==null)it.sets=3;}
  else if(m==="libre"){if(it.text==null)it.text="5 min";}
  else {if(it.reps==null)it.reps=10;if(it.sets==null)it.sets=4;if(it.rest==null||it.rest==="")it.rest=60;}
  renderBuilder();
};
window.saveBuilder=function(){
  const b=builderState; if(!b) return;
  if(!b.ex.length){toast("Ajoute au moins un exercice");return;}
  const name=(b.name||"").trim()||"Séance perso";
  const id=b.id||sessId();
  customData.sessions[id]={id, name, ex:b.ex.map(x=>Object.assign({},x))};
  saveCustom(); closeBuilder(); renderCust(); renderCal(); renderDay(); updateStreak();
  toast(b.id?"Séance modifiée":"Séance créée");
};

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
let gsTimer=null, gsLeft=0, gsTotal=0, gsPaused=false, gsOnEnd=null;
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
      q.push({type:"work", ei, exName:e.nm, exId:e.id||"", set:s, sets:p.sets,
        isHold:p.isHold, holdSec:p.holdSec, reps:p.reps, perLeg:p.perLeg,
        mobility:p.mobility});
      if(s<p.sets && p.rest>0) q.push({type:"rest", ei, exName:e.nm, exId:e.id||"", dur:p.rest, nextSet:s+1, sets:p.sets});
    }
    // repos de transition entre exos (sauf après le dernier) — on rattache l'exo suivant pour le panneau de pause
    if(ei<sess.ex.length-1) q.push({type:"trans", ei, dur:60, nextEx:sess.ex[ei+1].nm, exName:sess.ex[ei+1].nm, exId:sess.ex[ei+1].id||""});
  });
  return q;
}

window.startSession=function(){
  const dt=parse(selected), sess=sessionFor(dt);
  if(sess.rest) return;
  gsSessDate=selected; gsExCount=sess.ex.length;
  gsQueue=buildQueue(sess); gsIdx=0; gsOutcome=new Array(sess.ex.length);
  ensureDone(selected,sess.ex.length);
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
  body.classList.remove("has-panel"); // repart d'un body propre (un panneau de pause a pu rester ouvert)
  document.getElementById("gsProg").textContent=`Exo ${(st.ei??0)+1} / ${gsExCount}`;
  document.getElementById("gsBar").style.width=Math.round((gsIdx/gsQueue.length)*100)+"%";
  // bouton repères (top bar) : visible sur les étapes "work" liées à un exo du catalogue.
  // Ouvre la fiche en lecture seule sans toucher au chrono/série en cours.
  const gsInfo=document.getElementById("gsInfo");
  if(gsInfo){
    if(st.type==="work" && st.exId && CATALOG[st.exId]){
      gsInfo.style.visibility="visible";
      gsInfo.onclick=()=>openExDetail(st.exId);
    }else{
      gsInfo.style.visibility="hidden";
      gsInfo.onclick=null;
    }
  }

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
      <div class="gs-row"><button id="gsPause">Pause</button></div>
      <div class="gs-add"><button data-d="-15">−15s</button><button data-d="15">+15s</button><button data-d="30">+30s</button></div>`;
    document.getElementById("gsSkip").onclick=()=>{stopGsTimer();next();};
    foot.querySelectorAll(".gs-add button").forEach(b=>b.onclick=()=>{
      gsLeft=Math.max(1,gsLeft+ +b.dataset.d); gsTotal=Math.max(gsTotal,gsLeft); updGsRing();
    });
    startGsTimer(st.dur, ()=>{ try{navigator.vibrate&&navigator.vibrate(150);}catch(e){}; beep(); next(); });
    bindGsPause(st);
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
      <div class="gs-row"><button id="gsPause">Pause</button><button id="gsDone">Valider</button></div>`;
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
    document.getElementById("gsRestart").onclick=()=>{ closeGsPanel(); runHold(); bindGsPause(st); };
    document.getElementById("gsDone").onclick=()=>{stopGsTimer();setOutcome(st.ei,"done");markWork(st);next();};
    runHold(); // démarre tout seul à l'affichage de l'exo
    bindGsPause(st);
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

/* timer du mode guidé — supporte pause/reprise (hold ET repos partagent ce timer) */
function startGsTimer(sec,onEnd){
  stopGsTimer(); gsTotal=sec; gsLeft=sec; gsOnEnd=onEnd||null; gsPaused=false; updGsRing();
  gsRunTick();
}
function gsRunTick(){
  gsTimer=setInterval(()=>{
    gsLeft--; updGsRing();
    if(gsLeft<=0){ const cb=gsOnEnd; stopGsTimer(); if(cb)cb(); }
  },1000);
}
// suspend le décompte en conservant gsLeft/gsTotal/gsOnEnd ; gardé pour la reprise.
function pauseGsTimer(){ if(gsTimer && !gsPaused){ clearInterval(gsTimer); gsTimer=null; gsPaused=true; } }
// reprend exactement là où on s'était arrêté, avec le même callback de fin.
function resumeGsTimer(){ if(gsPaused){ gsPaused=false; gsRunTick(); } }
function stopGsTimer(){ clearInterval(gsTimer); gsTimer=null; gsPaused=false; gsOnEnd=null; }
function updGsRing(){
  const n=document.getElementById("gsNum"), r=document.getElementById("gsRing");
  if(n)n.textContent=Math.max(0,gsLeft);
  if(r)r.style.strokeDashoffset=GS_CIRC*(1-Math.max(0,gsLeft)/(gsTotal||1));
}

/* Pause du mode guidé : bouton « Pause » ⇄ « Reprendre » + panneau d'infos de l'exo. */
function bindGsPause(st){
  const btn=document.getElementById("gsPause");
  if(!btn) return;
  btn.textContent = gsPaused ? "Reprendre" : "Pause";
  btn.onclick=()=>{
    if(gsPaused){ resumeGsTimer(); btn.textContent="Pause"; closeGsPanel(); }
    else { pauseGsTimer(); btn.textContent="Reprendre"; openGsPanel(st); }
  };
}
// Panneau lecture seule injecté dans #gsBody pendant la pause (nom + muscles + cues).
function gsPauseInfoHtml(st){
  const cat = st && st.exId ? CATALOG[st.exId] : null;
  const name = (st && st.exName) ? st.exName : (cat ? cat.nom : "");
  let h=`<div class="gs-pause-panel" id="gsPausePanel"><div class="gpp-name">${esc(name||"Exercice")}</div>`;
  const muscles = cat && Array.isArray(cat.muscles) ? cat.muscles : [];
  if(muscles.length){
    h+=`<div class="gpp-tags">`+muscles.map(m=>`<span class="muscle-tag">${esc(muscleLabel(m))}</span>`).join("")+`</div>`;
  }
  const cues = cat && Array.isArray(cat.cues) ? cat.cues : [];
  if(cues.length){
    h+=`<div class="gpp-lbl">Points clés</div><ul class="ex-d-cues">`+cues.map(c=>`<li>${esc(c)}</li>`).join("")+`</ul>`;
  }
  return h+`</div>`;
}
function openGsPanel(st){
  const body=document.getElementById("gsBody");
  if(!body || document.getElementById("gsPausePanel")) return;
  body.insertAdjacentHTML("beforeend", gsPauseInfoHtml(st));
  body.classList.add("has-panel");
}
function closeGsPanel(){
  const p=document.getElementById("gsPausePanel"); if(p)p.remove();
  const body=document.getElementById("gsBody"); if(body)body.classList.remove("has-panel");
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
