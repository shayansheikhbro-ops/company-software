
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const todayStr=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const t12=t=>{if(!t)return"";const[h,m]=t.split(":").map(Number);return (h%12||12)+":"+pad(m)+" "+(h<12?"AM":"PM")};
const money=n=>"Rs "+Math.round(n).toLocaleString("en-US");
const DEF={company:"",passHash:"",start:"09:00",end:"18:00",teaLimit:2,teaFine:50,leaveAllowed:3,lateAllowed:3,lateFrac:1,monthDays:30};
let anim=true,db=null,S={...DEF},EMP=[],ATT={},tab="hazri",date=todayStr(),month=todayStr().slice(0,7),unlocked=false,ready=false,err="",editing=null,msg="";
try{unlocked=sessionStorage.getItem("cm_ok")==="1"}catch(e){}

async function sha(t){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("cm|"+t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}

(async()=>{
  render();
  try{
    const c=await claude.use("db");
    if(!c){err="Could not connect to the server. Open this page while signed in to claude.ai.";ready=true;render();return}
    db=c;
    db.doc("settings/main").onSnapshot(s=>{S={...DEF,...(s.exists?s.data():{})};ready=true;render()},e=>{err="Could not load settings";render()});
    db.collection("employees").onSnapshot(s=>{EMP=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||"").localeCompare(b.name||""));render()},e=>{});
    db.collection("attendance").onSnapshot(s=>{ATT={};s.docs.forEach(d=>ATT[d.id]=d.data());render()},e=>{});
  }catch(e){err="Server error: "+(e.message||e);ready=true;render()}
})();

const attOf=(e,d)=>ATT[e+"_"+d]||{emp:e,date:d,status:"",in:"",out:"",tea:0};
async function saveAtt(e,d,patch){
  if(!db)return;const a={...attOf(e,d),...patch,emp:e,date:d};
  ATT[e+"_"+d]=a;render();
  try{await db.doc("attendance/"+e+"_"+d).set(a)}catch(x){err="Save failed: "+(x.message||x);render()}
}
const isLate=a=>a.status==="present"&&a.in&&a.in>S.start;
const lateMin=a=>{if(!isLate(a))return 0;const[h,m]=a.in.split(":").map(Number),[sh,sm]=S.start.split(":").map(Number);return(h*60+m)-(sh*60+sm)};

function calc(e,m){
  let leave=0,late=0,present=0,extraTea=0;
  Object.values(ATT).forEach(a=>{
    if(a.emp!==e.id||!a.date.startsWith(m))return;
    if(a.status==="leave")leave++;
    if(a.status==="present")present++;
    if(isLate(a))late++;
    if((a.tea||0)>S.teaLimit)extraTea+=a.tea-S.teaLimit;
  });
  const sal=Number(e.salary)||0,perDay=sal/S.monthDays;
  const exLeave=Math.max(0,leave-S.leaveAllowed),exLate=Math.max(0,late-S.lateAllowed);
  const dLeave=exLeave*perDay,dLate=exLate*perDay*S.lateFrac,dTea=extraTea*S.teaFine;
  return{leave,late,present,extraTea,exLeave,exLate,dLeave,dLate,dTea,total:dLeave+dLate+dTea,net:Math.max(0,sal-dLeave-dLate-dTea),sal};
}

function render(){
  const app=$("#app");
  if(!ready){app.innerHTML='<div class="lock"><p>Loading…</p></div>';return}
  if(S.passHash&&!unlocked){
    app.innerHTML=`<div class="lock card"><h2>${esc(S.company||"Company Manager")}</h2><p class="note">Enter owner password</p>
    <input type="password" id="pw" placeholder="Password" autocomplete="current-password"><br><br>
    <button class="btn" style="width:100%" id="go">Unlock</button><p id="lerr" class="note" style="color:var(--bad)"></p></div>`;
    const go=async()=>{if(await sha($("#pw").value)===S.passHash){unlocked=true;anim=true;try{sessionStorage.setItem("cm_ok","1")}catch(e){}render()}else $("#lerr").textContent="Incorrect password"};
    $("#go").onclick=go;$("#pw").onkeydown=e=>{if(e.key==="Enter")go()};return;
  }
  const tabs=[["hazri","Attendance"],["emp","Workers"],["rep","Monthly Report"],["set","Settings"]];
  app.innerHTML=`<header><div><h1>${esc(S.company||"Company Manager")}</h1><small>Timing: ${t12(S.start)} – ${t12(S.end)}</small></div>
  ${S.passHash?'<button class="btn sec sm" id="lo">Lock</button>':""}</header>
  <nav>${tabs.map(t=>`<button class="${tab===t[0]?"on":""}" data-t="${t[0]}">${t[1]}</button>`).join("")}</nav>
  <main>${err?`<div class="msg" style="background:var(--badbg);color:var(--bad)">${esc(err)}</div>`:""}${msg?`<div class="msg" style="background:var(--okbg);color:var(--ok)">${esc(msg)}</div>`:""}<div id="v" class="${anim?"a":""}"></div></main>`;
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{tab=b.dataset.t;anim=true;editing=null;msg="";err="";render()});
  const lo=$("#lo");if(lo)lo.onclick=()=>{unlocked=false;try{sessionStorage.removeItem("cm_ok")}catch(e){}render()};
  ({hazri:vHazri,emp:vEmp,rep:vRep,set:vSet})[tab]();anim=false;
}

function vHazri(){
  const rows=EMP.map(e=>({e,a:attOf(e.id,date)}));
  const P=rows.filter(r=>r.a.status==="present").length,L=rows.filter(r=>r.a.status==="leave").length,LT=rows.filter(r=>isLate(r.a)).length;
  $("#v").innerHTML=`<div class="stats"><div class="stat"><b>${EMP.length}</b><span>Total workers</span></div><div class="stat"><b>${P}</b><span>Present</span></div><div class="stat"><b>${L}</b><span>On leave</span></div><div class="stat"><b>${LT}</b><span>Late (after ${t12(S.start)})</span></div></div>
  <div class="card row"><div class="grow"><label>Date</label><input type="date" id="dt" value="${date}"></div></div>
  ${EMP.length?"":'<div class="card note">Add workers first in the "Workers" tab.</div>'}
  ${rows.map(({e,a})=>{
    const lm=lateMin(a),ex=(a.tea||0)>S.teaLimit;
    return `<div class="emp"><div class="row"><h3 class="grow">${esc(e.name)} <span class="note">${esc(e.designation||"")}</span></h3>
      ${a.status==="present"?'<span class="tag ok">Present</span>':a.status==="leave"?'<span class="tag warn">On leave</span>':'<span class="tag" style="background:var(--bg);color:var(--mut)">Not marked</span>'}
      ${lm?`<span class="tag bad">Late ${lm} min</span>`:""}${ex?`<span class="tag bad">Extra tea fine</span>`:""}</div>
      <div class="grid"><div><label>Status</label><select data-k="status" data-e="${e.id}"><option value="">—</option><option value="present" ${a.status==="present"?"selected":""}>Present</option><option value="leave" ${a.status==="leave"?"selected":""}>Leave / Absent</option></select></div>
      <div><label>Check-in time</label><input type="time" data-k="in" data-e="${e.id}" value="${a.in||""}"></div>
      <div><label>Check-out time</label><input type="time" data-k="out" data-e="${e.id}" value="${a.out||""}"></div>
      <div><label>Tea (${S.teaLimit}/day allowed)</label><div class="tea"><button data-tea="-1" data-e="${e.id}">−</button><b>${a.tea||0}</b><button data-tea="1" data-e="${e.id}">+</button></div></div></div></div>`}).join("")}`;
  $("#dt").onchange=e=>{date=e.target.value||todayStr();render()};
  document.querySelectorAll("[data-k]").forEach(el=>el.onchange=()=>{
    const p={[el.dataset.k]:el.value};
    if(el.dataset.k==="status"&&el.value==="present"&&!attOf(el.dataset.e,date).in&&date===todayStr()){const n=new Date();p.in=pad(n.getHours())+":"+pad(n.getMinutes())}
    saveAtt(el.dataset.e,date,p)});
  document.querySelectorAll("[data-tea]").forEach(b=>b.onclick=()=>{const a=attOf(b.dataset.e,date);saveAtt(b.dataset.e,date,{tea:Math.max(0,(a.tea||0)+Number(b.dataset.tea))})});
}

const FIELDS=[["name","Name *"],["father","Father's name"],["phone","Phone"],["cnic","CNIC"],["designation","Job title"],["salary","Monthly salary (Rs) *","number"],["joined","Join date","date"],["address","Address"]];
function vEmp(){
  const e=editing&&editing!=="new"?EMP.find(x=>x.id===editing)||{}:{};
  const form=editing?`<div class="card"><h3 style="margin-top:0">${editing==="new"?"New worker":"Edit worker"}</h3><div class="grid">
  ${FIELDS.map(f=>`<div><label>${f[1]}</label><input id="f_${f[0]}" type="${f[2]||"text"}" value="${esc(e[f[0]]??"")}"></div>`).join("")}</div><br>
  <div class="row"><button class="btn" id="sv">Save</button><button class="btn sec" id="cn">Cancel</button></div></div>`:"";
  $("#v").innerHTML=`<div class="row" style="margin-bottom:12px"><button class="btn" id="add">+ New worker</button><span class="note">Total: ${EMP.length}</span></div>${form}
  ${EMP.map(w=>`<div class="emp"><div class="row"><h3 class="grow">${esc(w.name)}</h3><button class="btn sec sm" data-ed="${w.id}">Edit</button><button class="btn del sm" data-dl="${w.id}">Delete</button></div>
  <div class="note">${esc(w.designation||"")} ${w.phone?"· "+esc(w.phone):""} ${w.cnic?"· CNIC "+esc(w.cnic):""}</div>
  <div class="note">Salary: <b>${money(w.salary||0)}</b> ${w.joined?"· Join: "+esc(w.joined):""} ${w.father?"· Father: "+esc(w.father):""} ${w.address?"· "+esc(w.address):""}</div></div>`).join("")}`;
  $("#add").onclick=()=>{editing="new";render()};
  document.querySelectorAll("[data-ed]").forEach(b=>b.onclick=()=>{editing=b.dataset.ed;render();scrollTo(0,0)});
  document.querySelectorAll("[data-dl]").forEach(b=>b.onclick=async()=>{const w=EMP.find(x=>x.id===b.dataset.dl);if(confirm("Delete "+w.name+"?"))try{await db.doc("employees/"+w.id).delete()}catch(x){err=x.message;render()}});
  if(editing){$("#cn").onclick=()=>{editing=null;render()};
    $("#sv").onclick=async()=>{const d={};FIELDS.forEach(f=>d[f[0]]=$("#f_"+f[0]).value.trim());
      if(!d.name){alert("Enter a name");return}d.salary=Number(d.salary)||0;
      try{if(editing==="new")await db.collection("employees").add(d);else await db.doc("employees/"+editing).set(d);editing=null;msg="Saved";err=""}catch(x){err="Save failed: "+(x.message||x)}render()}}
}

function vRep(){
  const R=EMP.map(e=>({e,c:calc(e,month)}));
  const tot=R.reduce((s,r)=>s+r.c.net,0),ded=R.reduce((s,r)=>s+r.c.total,0);
  $("#v").innerHTML=`<div class="card row noprint"><div class="grow"><label>Month</label><input type="month" id="mo" value="${month}"></div><button class="btn" id="pr">Print</button></div>
  <div class="stats"><div class="stat"><b>${money(tot)}</b><span>Total net salary</span></div><div class="stat"><b>${money(ded)}</b><span>Total deductions</span></div></div>
  <div class="card tw"><table><tr><th>Name</th><th>Salary</th><th>Present</th><th>Leave</th><th>Late</th><th>Extra tea</th><th>Deduction</th><th>Net salary</th></tr>
  ${R.map(({e,c})=>`<tr><td><b>${esc(e.name)}</b></td><td>${money(c.sal)}</td><td>${c.present}</td>
  <td>${c.leave}${c.exLeave?` <span class="tag bad">+${c.exLeave} extra</span>`:""}</td>
  <td>${c.late}${c.exLate?` <span class="tag bad">+${c.exLate} extra</span>`:""}</td>
  <td>${c.extraTea}</td><td>${c.total?`<span class="tag bad">−${money(c.total)}</span>`:"—"}</td><td><b>${money(c.net)}</b></td></tr>`).join("")||'<tr><td colspan="8" class="note">No workers</td></tr>'}</table></div>
  <p class="note">Rules: ${S.leaveAllowed} leaves are allowed per month; each leave beyond that deducts one day's salary (salary ÷ ${S.monthDays}). Up to ${S.lateAllowed} late days are excused; each late day beyond that deducts ${S.lateFrac} day's salary. Every extra tea costs ${money(S.teaFine)}.</p>`;
  $("#mo").onchange=e=>{month=e.target.value||month;render()};$("#pr").onclick=()=>print();
}

function vSet(){
  const named=!!S.company;
  $("#v").innerHTML=`<div class="card"><h3 style="margin-top:0">Company name</h3><label>Enter your company name</label><input id="s_co" value="${esc(S.company)}" placeholder="Your company name">
  <br><br><button class="btn" id="s_sv">Save name</button></div>
  ${named?`<div class="card"><h3 style="margin-top:0">Password (owner only)</h3>
  ${S.passHash?'<p class="note">A password is set.</p>':'<p class="note">No password set yet. You can set one below if you want.</p>'}
  <label>${S.passHash?"New password":"Enter password"}</label><input type="password" id="s_pw" autocomplete="new-password">
  <br><br><div class="row"><button class="btn" id="s_pwsv">${S.passHash?"Change password":"Set password"}</button>${S.passHash?'<button class="btn del" id="s_pwrm">Remove password</button>':""}</div>
  <p class="note">Tip: if you forget the password, only you (the page owner) can still reach the data through your claude.ai account. Don't share the page link with anyone.</p></div>`:'<div class="card note">Save the company name first; the password option will then appear here.</div>'}
  <div class="card"><h3 style="margin-top:0">Rules</h3><div class="grid">
  <div><label>Office start</label><input type="time" id="r_start" value="${S.start}"></div>
  <div><label>Office end</label><input type="time" id="r_end" value="${S.end}"></div>
  <div><label>Tea per day (allowed)</label><input type="number" id="r_tea" value="${S.teaLimit}"></div>
  <div><label>Extra tea fine (Rs)</label><input type="number" id="r_fine" value="${S.teaFine}"></div>
  <div><label>Leaves per month (allowed)</label><input type="number" id="r_lv" value="${S.leaveAllowed}"></div>
  <div><label>Late days (allowed)</label><input type="number" id="r_lt" value="${S.lateAllowed}"></div>
  <div><label>Deduction per extra late day (fraction of a day's salary)</label><input type="number" step="0.25" id="r_lf" value="${S.lateFrac}"></div>
  <div><label>Days in month (for salary calculation)</label><input type="number" id="r_md" value="${S.monthDays}"></div></div><br>
  <button class="btn" id="r_sv">Save rules</button></div>`;
  const put=async(p,m)=>{try{await db.doc("settings/main").set({...S,...p});msg=m;err=""}catch(x){err="Save failed: "+(x.message||x)}render()};
  $("#s_sv").onclick=()=>{const v=$("#s_co").value.trim();if(!v){alert("Enter a name");return}put({company:v},"Company name saved. The password option is now available below.")};
  if(named){
    $("#s_pwsv").onclick=async()=>{const p=$("#s_pw").value;if(p.length<4){alert("Enter at least 4 characters");return}unlocked=true;try{sessionStorage.setItem("cm_ok","1")}catch(e){}put({passHash:await sha(p)},"Password set")};
    const rm=$("#s_pwrm");if(rm)rm.onclick=()=>{if(confirm("Remove password?"))put({passHash:""},"Password removed")};
  }
  $("#r_sv").onclick=()=>put({start:$("#r_start").value||"09:00",end:$("#r_end").value||"18:00",teaLimit:+$("#r_tea").value||0,teaFine:+$("#r_fine").value||0,leaveAllowed:+$("#r_lv").value||0,lateAllowed:+$("#r_lt").value||0,lateFrac:+$("#r_lf").value||0,monthDays:+$("#r_md").value||30},"Rules saved");
}