const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAYDphHYxHw07hq-jBfXAiWRhJpJcqcDj8",
  authDomain: "lockwork-4e494.firebaseapp.com",
  projectId: "lockwork-4e494",
  storageBucket: "lockwork-4e494.firebasestorage.app",
  messagingSenderId: "250655916297",
  appId: "1:250655916297:web:ab282192517adf24bb93d8"
};
let app, db, auth, stateUnsubscribe = null;
let firebaseReady = null;
let DB = {
  settings: { location: { name: "Head Office", lat: 22.5726, lng: 88.3639, radius: 150, map: "https://www.google.com/maps?q=22.5726,88.3639" } },
  employees: [], attendance: [], leaves: [], recovery: []
};
let attMonth=new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0"),attSearch="",attPage=1,advanced={role:"",minLeave:null},leaveRange={from:"",to:"",status:"All"};
let chartFilter = "week"; let hoverPoint = null; let appReady = false;
let activeNotifications = [];

firebaseReady = (async()=>{
  const [appMod,authMod,fsMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js")
  ]);
  app = appMod.initializeApp(FIREBASE_CONFIG);
  db = fsMod.getFirestore(app);
  auth = authMod.getAuth(app);
  window.__firebaseModules = {...authMod,...fsMod};
  return window.__firebaseModules;
})();

function E(id){return document.getElementById(id)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function employee(id){return DB.employees.find(x=>String(x.employeeId)===String(id))}
function openModal(id){E(id).style.display="flex"}
function closeModal(id){E(id).style.display="none"}
function toast(t){let x=E("toast");if(!x)return;x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),2200)}
function normalize(v){return String(v??"").trim().toLowerCase()}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function statusTag(s){const status=String(s||"Absent");let c=status==="Present"?"tag-present":status==="Late"?"tag-late":status==="On Leave"||status==="Leave"?"tag-leave":status==="Half Day"?"tag-half":"tag-absent";return `<span class="tag ${c}">${escapeHtml(status)}</span>`}
function toggleNotify(){const p=E("notifyPanel"),o=E("notifyOverlay");const open=p.classList.toggle("open");o.classList.toggle("show",open);if(open)renderNotifications()}
function getAvatar(img){return String(img).startsWith("data:")?img:`https://i.pravatar.cc/80?img=${img||1}`}
function currentEmployeeStatus(e){const approved=DB.leaves.some(l=>String(l.empId)===String(e.employeeId)&&l.status==="Approved"&&today()>=l.from&&today()<=l.to);if(approved)return "On Leave";const a=DB.attendance.find(x=>String(x.empId)===String(e.employeeId)&&x.date===today());if(a?.status)return a.status;return e.status||"Absent"}
function multiSearch(obj,q){const t=normalize(q);if(!t)return true;const fields=[obj.name,obj.employeeId,obj.email,obj.phone,obj.address,obj.dept,obj.role,obj.status,currentEmployeeStatus(obj)];return fields.some(v=>normalize(v).includes(t))}
function sanitizeForFirestore(value){if(value===undefined)return null;if(value===null||typeof value!=="object")return value;if(Array.isArray(value))return value.map(sanitizeForFirestore);const out={};Object.keys(value).forEach(k=>{if(value[k]!==undefined)out[k]=sanitizeForFirestore(value[k])});return out}

function notificationItems(){
  const items=[];
  DB.leaves.filter(l=>l.status==="Pending").slice().reverse().forEach(l=>{
    const e=employee(l.empId); if(!e)return;
    items.push({title:"Leave Request Pending",text:`${e.name} requested ${Number(l.days||0)} day${Number(l.days||0)===1?"":"s"} of ${l.type||"Leave"}.`,time:l.createdAt?formatRelative(l.createdAt):"Pending",target:"leaves",empId:e.employeeId, tone:"pending"});
  });
  const todayStr=today();
  DB.attendance.filter(a=>a.date===todayStr&&(a.status==="Late"||a.status==="Half Day"||!a.out||a.out==="—")).slice().reverse().forEach(a=>{
    const e=employee(a.empId);if(!e)return;
    const label=a.status||(!a.out||a.out==="—"?"Open Attendance":"Attendance");
    items.push({title:`${label} Alert`,text:`${e.name} · ${e.employeeId} · ${a.in||"No check-in"}${a.out&&a.out!=="—"?` → ${a.out}`:" · Check-out pending"}.`,time:a.recordedAt?formatRelative(a.recordedAt):"Today",target:"attendance",empId:String(e.employeeId),date:a.date,tone:"alert"});
  });
  const loc=DB.settings?.location;
  if(loc)items.push({title:"Attendance Location Active",text:`${loc.name||"Office"} · ${loc.radius||0}m GPS radius.`,time:"Live",target:"dashboard",tone:"system"});
  return items.slice(0,12);
}
function formatRelative(value){const t=Date.parse(value);if(!Number.isFinite(t))return "Recent";const m=Math.max(0,Math.floor((Date.now()-t)/60000));if(m<1)return "Just now";if(m<60)return `${m} min ago`;const h=Math.floor(m/60);if(h<24)return `${h} hr${h===1?"":"s"} ago`;const d=Math.floor(h/24);return `${d} day${d===1?"":"s"} ago`}
function renderNotifications(){
  const body=E("notifyBody"),count=E("notifyCount");
  activeNotifications = notificationItems();
  const items=activeNotifications;
  if(count){count.textContent=items.length;count.style.display=items.length?"grid":"none"}
  if(!body)return;
  body.innerHTML=items.length?items.map((n,i)=>`<button class="notify-item ${n.tone}" data-notify-target="${n.target}" onclick="handleNotificationClick(${i})"><span class="time">${escapeHtml(n.time)}</span><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.text)}</p><span class="notify-go">Open <i class="fa-solid fa-arrow-right"></i></span></button>`).join(""):`<div class="notify-empty"><i class="fa-regular fa-bell-slash"></i><b>All clear</b><span>No live HR notifications right now.</span></div>`;
}
function handleNotificationClick(index){
  const item=activeNotifications[index];
  if(!item)return;
  navigate(item.target);
  closeNotify();
  if(item.target==="attendance"&&item.date){
      attSearch=item.empId||""; attPage=1; 
      renderAttendance();
      setTimeout(()=>openAttendanceDetail(item.empId,item.date),100);
  } else if (item.target==="leaves") {
      if(E("leaveSearch")) E("leaveSearch").value = item.empId || "";
      renderLeaves();
  }
}
function closeNotify(){E("notifyPanel")?.classList.remove("open");E("notifyOverlay")?.classList.remove("show")}

function startRealtime(){
  if(stateUnsubscribe) return; 
  const {collection, doc, onSnapshot} = window.__firebaseModules;

  onSnapshot(collection(db, "employees"), snap => {
    DB.employees = snap.docs.map(d => d.data());
    refreshVisibleViews(); renderNotifications();
  });

  onSnapshot(collection(db, "attendance"), snap => {
    DB.attendance = snap.docs.map(d => d.data());
    refreshVisibleViews(); renderNotifications();
  });

  onSnapshot(collection(db, "leaves"), snap => {
    DB.leaves = snap.docs.map(d => d.data());
    refreshVisibleViews(); renderNotifications();
  });

  onSnapshot(collection(db, "recovery"), snap => {
    DB.recovery = snap.docs.map(d => d.data());
    renderRecovery();
  });

  onSnapshot(doc(db, "settings", "location"), snap => {
    if(snap.exists()) DB.settings.location = snap.data();
    refreshVisibleViews();
  });
  stateUnsubscribe = true;
}

function navigate(page,btn){
  const pages=["dashboard","employees","attendance","leaves"];
  if(!pages.includes(page)) return;
  document.querySelectorAll(".page").forEach(el=>{ el.classList.remove("active"); el.style.display="none"; });
  const target=E(page);
  if(!target) return;
  target.style.display="block"; target.classList.add("active");
  document.querySelectorAll(".topnav button").forEach(el=>el.classList.remove("active"));
  if(btn) btn.classList.add("active");
  if(page==="dashboard") renderDashboard();
  if(page==="employees") renderEmployees();
  if(page==="attendance") renderAttendance();
  if(page==="leaves"){renderLeaves();renderLeaveBoard();}
  const content=E("mainContent")||document.querySelector(".content");
  if(content) content.scrollTop=0;
}
function refreshVisibleViews(){if(E("dashboard")?.style.display!=="none")renderDashboard();if(E("employees")?.style.display!=="none")renderEmployees();if(E("attendance")?.style.display!=="none")renderAttendance();if(E("leaves")?.style.display!=="none"){renderLeaves();renderLeaveBoard()}}
async function ensureHrAccess(){
  await firebaseReady;
  const user=auth.currentUser;
  if(!user){window.location.replace("index.html");return false;}
  if(E("hrUserEmail"))E("hrUserEmail").textContent=user.email||"HR";
  return true;
}

function renderDashboard(){
  const total=DB.employees.length,p=DB.employees.filter(x=>currentEmployeeStatus(x)==="Present").length,l=DB.employees.filter(x=>currentEmployeeStatus(x)==="On Leave").length,pend=DB.leaves.filter(x=>x.status==="Pending").length;
  E("mEmployees").textContent=total;E("mPresent").textContent=p;E("mLeave").textContent=l;E("mPending").textContent=pend;
  const avgLeave=DB.employees.reduce((s,x)=>s+(x.leaveAssigned?x.leaveRemaining/x.leaveAssigned:0),0)/(total||1)*100;
  E("leaveHealth").textContent=Math.round(avgLeave)+"%";E("leaveBar").style.width=Math.round(avgLeave)+"%";
  const hrs=DB.attendance.reduce((s,x)=>s+(Number(x.hours)||0),0);E("hoursHealth").textContent=hrs.toFixed(1)+"h";E("hoursBar").style.width=Math.min(100,Math.round(hrs/(total*8||1)*100))+"%";
  E("locName").textContent=DB.settings.location.name;E("locMeta").textContent=`${DB.settings.location.radius}m radius · GPS active`;
  const top=DB.employees.slice().sort((a,b)=>(b.leaveRemaining/(b.leaveAssigned||1))-(a.leaveRemaining/(a.leaveAssigned||1))).slice(0,5);
  E("topBoard").innerHTML=top.map((x,i)=>`<div class="person"><div class="person-main"><img src="${getAvatar(x.img)}"><div><b>${i+1}. ${x.name}</b><span>${x.role}</span></div></div><div style="text-align:right"><div class="rank">${x.leaveRemaining}/${x.leaveAssigned}</div><span class="muted">left</span></div></div>`).join("");
  drawOverviewChart();
}

function setChartFilter(type) {
  chartFilter = type;
  E("btnFilterWeek").classList.toggle("active", type === "week");
  E("btnFilterMonth").classList.toggle("active", type === "month");
  E("chartFilterMeta").textContent = type === "week" ? "7-Day Real-Time Index" : "12-Month Annual Trend";
  if(type === "week") { E("tickerPct").textContent = "+4.8%"; E("tickerLabel").textContent = "High Weekly Momentum"; E("tickerPct").parentElement.style.background = "var(--green)"; } 
  else { E("tickerPct").textContent = "+12.3%"; E("tickerLabel").textContent = "Annual Attendance Bull"; E("tickerPct").parentElement.style.background = "var(--yellow)"; }
  hoverPoint = null; drawOverviewChart();
}

function getChartData() {
  if (chartFilter === "week") {
    const total = DB.employees.length || 1;
    const pToday = Math.round((DB.employees.filter(x=>currentEmployeeStatus(x)==="Present").length / total) * 100);
    return { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [78, 86, 82, 94, pToday || 89, 64, 71] };
  } else {
    return { labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], values: [74, 79, 83, 80, 88, 92, 86, 94, 91, 85, 89, 93] };
  }
}

let activeChartPoints = [];
function drawOverviewChart() {
  const c = E("overviewChart"); if (!c) return;
  const ctx = c.getContext("2d"); const rect = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  c.width = Math.max(1, rect.width * dpr); c.height = Math.max(1, rect.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h);
  const padLeft = 46, padRight = 24, padTop = 26, padBottom = 34; const chartW = w - padLeft - padRight, chartH = h - padTop - padBottom;
  
  ctx.strokeStyle = "#e5e5ea"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
  ctx.fillStyle = "#111111"; ctx.font = "900 11px Inter, sans-serif"; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = 100 - (i * 25), y = padTop + (chartH * i / 4);
    ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
    ctx.fillText(`${val}%`, padLeft - 8, y + 4);
  }
  ctx.setLineDash([]);
  const data = getChartData(); const step = chartW / (data.values.length - 1);
  const points = data.values.map((v, i) => ({ x: padLeft + (i * step), y: padTop + chartH - (chartH * (v / 100)), val: v, label: data.labels[i] }));
  activeChartPoints = points;

  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
  grad.addColorStop(0, "rgba(162, 155, 254, 0.45)"); grad.addColorStop(0.7, "rgba(162, 155, 254, 0.15)"); grad.addColorStop(1, "rgba(162, 155, 254, 0.0)");
  ctx.beginPath(); ctx.moveTo(points[0].x, padTop + chartH); ctx.lineTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) { const cp1x = points[i].x + (points[i + 1].x - points[i].x) / 2, cp2x = cp1x; ctx.bezierCurveTo(cp1x, points[i].y, cp2x, points[i + 1].y, points[i + 1].x, points[i + 1].y); }
  ctx.lineTo(points[points.length - 1].x, padTop + chartH); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) { const cp1x = points[i].x + (points[i + 1].x - points[i].x) / 2, cp2x = cp1x; ctx.bezierCurveTo(cp1x, points[i].y, cp2x, points[i + 1].y, points[i + 1].x, points[i + 1].y); }
  ctx.strokeStyle = "#111111"; ctx.lineWidth = 4; ctx.stroke();

  ctx.fillStyle = "#111111"; ctx.font = "900 11px 'Plus Jakarta Sans', sans-serif"; ctx.textAlign = "center";
  points.forEach(p => { ctx.fillText(p.label, p.x, h - 10); });
  points.forEach((p, idx) => {
    const isHovered = hoverPoint === idx; ctx.beginPath(); ctx.arc(p.x, p.y, isHovered ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? "#fdcb6e" : "#ffffff"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#000000"; ctx.stroke();
  });

  if (hoverPoint !== null && points[hoverPoint]) {
    const hp = points[hoverPoint];
    ctx.setLineDash([3, 3]); ctx.strokeStyle = "#000000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hp.x, padTop); ctx.lineTo(hp.x, padTop + chartH); ctx.stroke(); ctx.setLineDash([]);
    const tooltipText = `${hp.label}: ${hp.val}% Present`; ctx.font = "900 12px Inter, sans-serif";
    const textW = ctx.measureText(tooltipText).width, bubbleW = textW + 18, bubbleH = 26;
    let bx = hp.x - bubbleW / 2, by = hp.y - 36;
    if (bx < 10) bx = 10; if (bx + bubbleW > w - 10) bx = w - bubbleW - 10; if (by < 5) by = hp.y + 12;
    ctx.fillStyle = "#000000"; ctx.fillRect(bx + 3, by + 3, bubbleW, bubbleH);
    ctx.fillStyle = "#a29bfe"; ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.lineWidth = 2; ctx.strokeStyle = "#000000"; ctx.strokeRect(bx, by, bubbleW, bubbleH);
    ctx.fillStyle = "#000000"; ctx.textAlign = "left"; ctx.fillText(tooltipText, bx + 9, by + 18);
  }
}
const chartCanvas = E("overviewChart");
if (chartCanvas) {
  chartCanvas.addEventListener("mousemove", e => {
    const rect = chartCanvas.getBoundingClientRect(), mx = e.clientX - rect.left;
    let closestIdx = null, minDiff = 30;
    activeChartPoints.forEach((p, idx) => { const diff = Math.abs(p.x - mx); if (diff < minDiff) { minDiff = diff; closestIdx = idx; } });
    if (hoverPoint !== closestIdx) { hoverPoint = closestIdx; drawOverviewChart(); }
  });
  chartCanvas.addEventListener("mouseleave", () => { if (hoverPoint !== null) { hoverPoint = null; drawOverviewChart(); } });
}

function filteredEmployees(){
  const q=E("employeeSearch")?.value||"";
  const dep=E("directoryDept")?.value||"All Departments";
  const status=E("directoryStatus")?.value||"All Status";
  return DB.employees.filter(x=>{
    const matchesSearch=multiSearch(x,q);
    const matchesDept=dep==="All Departments"||normalize(x.dept)===normalize(dep);
    const liveStatus=currentEmployeeStatus(x);
    const matchesStatus=status==="All Status"||normalize(liveStatus)===normalize(status)|| (status==="On Leave" && liveStatus==="Leave");
    const matchesAdvanced=!advanced.role||normalize(x.role).includes(advanced.role);
    const matchesLeave=advanced.minLeave==null||Number(x.leaveRemaining||0)>=advanced.minLeave;
    return matchesSearch&&matchesDept&&matchesStatus&&matchesAdvanced&&matchesLeave;
  });
}

function renderEmployees(){
  const rows=filteredEmployees().map(x=>`<tr><td><div class="mini"><img src="${getAvatar(x.img)}"><div><b>${escapeHtml(x.name)}</b><span>${escapeHtml(x.email)}</span></div></div></td><td>${escapeHtml(x.employeeId)}</td><td>${escapeHtml(x.phone)}</td><td>${escapeHtml(x.dept)}</td><td>${escapeHtml(x.role)}</td><td>${statusTag(currentEmployeeStatus(x))}</td><td>${Number(x.leaveRemaining||0)}/${Number(x.leaveAssigned||0)}</td><td><div class="actions"><button class="tiny" title="Edit" onclick="openEmployee('${x.employeeId}')"><i class="fa-solid fa-pen"></i></button><button class="tiny" title="Reset leave" onclick="openResetLeave('${x.employeeId}')"><i class="fa-solid fa-calendar-plus"></i></button><button class="tiny" title="Delete" style="color:var(--red);border-color:var(--red);" onclick="openDeleteEmployee('${x.employeeId}')"><i class="fa-solid fa-trash"></i></button></div></td></tr>`).join("");
  E("employeeBody").innerHTML=rows||`<tr><td colspan="8" class="no-data">No matching employees found.</td></tr>`;
  renderRecovery();
}

function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function dateKey(y,m,d){return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function normalizeDateValue(v){return v?String(v).slice(0,10):""}
function employeeJoinDate(e){const explicit=normalizeDateValue(e?.join);if(explicit)return explicit;const m=String(e?.employeeId||"").match(/^EMP-(\d{2})-(\d{2})-(\d{4})-/);return m?`${m[3]}-${m[2]}-${m[1]}`:""}
function attendanceFor(empId,date){return DB.attendance.find(a=>String(a.empId)===String(empId)&&normalizeDateValue(a.date)===String(date))||null}
function approvedLeave(empId,date){return DB.leaves.some(l=>String(l.empId)===String(empId)&&l.status==="Approved"&&String(date)>=normalizeDateValue(l.from)&&String(date)<=normalizeDateValue(l.to))}

function calendarDateState(e,date){
  const join=employeeJoinDate(e);
  if(join&&date<join)return "not-joined";
  if(date>today())return "future";
  const day=new Date(`${date}T00:00:00`),dow=day.getDay();
  if(dow===0||dow===6)return "weekend";
  const a=attendanceFor(e.employeeId,date);
  if(a){
    const st=String(a.status||"").toLowerCase();
    if(st==="half day")return "half";
    if(st==="late"||st==="present"||a.in||a.out)return "present";
    if(st==="leave")return "leave";
    if(st==="absent")return "absent";
  }
  if(approvedLeave(e.employeeId,date))return "leave";
  return "empty";
}
function stateFor(e,y,m,d){return calendarDateState(e,dateKey(y,m,d))}
function formatDisplayDate(date){
  const d=new Date(`${date}T00:00:00`);
  if(Number.isNaN(d.getTime())) return date;
  const day=String(d.getDate()).padStart(2,"0");
  const month=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sept","Oct","Nov","Dec"][d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
}
function attendanceDuration(a){
  if(a&&a.hours!==undefined&&a.hours!==null&&a.hours!==""&&Number.isFinite(Number(a.hours))) return Number(a.hours);
  return calculateHours(a?.in,a?.out);
}
function showAttendanceState(type,title,text){
  const box=E("detailMessage");
  const colors={future:"var(--yellow)","not-joined":"var(--purple-soft)",weekend:"var(--green)",empty:"var(--yellow)",leave:"var(--red)"};
  box.style.display="block";
  box.style.background=colors[type]||"#fff";
  box.innerHTML=`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>`;
}
function clearAttendanceState(){
  const box=E("detailMessage");
  box.style.display="none";
  box.innerHTML="";
}
function setAttendanceDetailMode(showDetails){
  const profile=document.querySelector("#attendanceDetailModal .detail-profile");
  const kpis=document.querySelector("#attendanceDetailModal .detail-kpis");
  const table=document.querySelector("#attendanceDetailModal .detail-table");
  const map=E("detailMap");
  [profile,kpis,table].forEach(el=>{if(el)el.style.display=showDetails?"":"none"});
  if(map)map.style.display=showDetails?"inline-block":"none";
}
function renderAttendance(){
  const [y,m]=attMonth.split("-").map(Number),totalDays=daysInMonth(y,m),q=attSearch;
  const employees=DB.employees.filter(x=>multiSearch(x,q));
  const perPage=6,totalPages=Math.max(1,Math.ceil(employees.length/perPage));
  attPage=Math.min(Math.max(attPage,1),totalPages);
  const pageEmployees=employees.slice((attPage-1)*perPage,attPage*perPage);
  const weekday=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  E("monthLabelText").textContent=new Date(y,m-1,1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  E("attendanceGrid").innerHTML=pageEmployees.map(e=>{
    let p=0,l=0,h=0;
    for(let d=1;d<=totalDays;d++){
      const s=stateFor(e,y,m,d);
      if(s==="present")p++;
      if(s==="leave")l++;
      if(s==="half")h++;
    }
    const validDays=[...Array(totalDays)].reduce((n,_,i)=>{
      const s=stateFor(e,y,m,i+1);
      return n+(s==="weekend"||s==="future"||s==="not-joined"?0:1);
    },0);
    const pct=validDays?Math.round((p+h*.5)/validDays*100):0;
    const first=(new Date(y,m-1,1).getDay()+6)%7;
    let cells=Array(first).fill('<div class="day empty-visible"></div>');
    for(let d=1;d<=totalDays;d++){
      const s=stateFor(e,y,m,d),dt=dateKey(y,m,d),content=s==="weekend"?"😊":d;
      cells.push(`<div class="day ${s} ${dt===today()?"today":""}" title="Click for ${s.replace("-"," ")}" data-emp="${escapeHtml(String(e.employeeId))}" data-date="${dt}" onclick="openAttendanceDetail(this.dataset.emp,this.dataset.date)">${content}</div>`);
    }
    while(cells.length<42)cells.push('<div class="day empty-visible"></div>');
    return `<div class="att-tile pop"><div class="att-head"><div class="att-emp"><img src="${getAvatar(e.img)}"><div><div class="att-emp-name">${escapeHtml(e.name)}</div><div class="att-emp-meta"><span class="att-emp-id">${escapeHtml(e.employeeId)}</span><span class="att-emp-role">${escapeHtml(e.role)}</span></div></div></div><div class="att-score"><b>${pct}%</b><div class="att-stats-badges"><span class="badge-present">${p} Present</span><span class="badge-leave">${l} Leave</span><span class="badge-half">${h} Half</span></div></div></div><div class="weekdays">${weekday.map(w=>`<span>${w}</span>`).join("")}</div><div class="days">${cells.join("")}</div><div class="legend"><span><i class="lgp"></i>Present</span><span><i class="lgl"></i>Leave</span><span><i class="lgh"></i>Half Day</span><span><i class="lgw"></i>Weekend</span></div></div>`;
  }).join("")||`<div class="no-data" style="grid-column:1/-1">No employees match your search.</div>`;
  E("attPage").textContent=`Page ${attPage} of ${totalPages}`;
  E("prevPage").disabled=attPage<=1;
  E("nextPage").disabled=attPage>=totalPages;
  E("prevPage").style.opacity=attPage<=1?.45:1;
  E("nextPage").style.opacity=attPage>=totalPages?.45:1;
}
function changeAttendancePage(delta){attPage+=delta;renderAttendance()}
function parseTime(t){if(!t||t==="—"||t==="Not recorded")return null;const m=String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return null;let h=Number(m[1]),min=Number(m[2]),ap=m[3].toUpperCase();if(ap==="AM"&&h===12)h=0;if(ap==="PM"&&h!==12)h+=12;return h*60+min}
function calculateHours(inTime,outTime){const a=parseTime(inTime),b=parseTime(outTime);if(a==null||b==null)return 0;let diff=b-a;if(diff<0)diff+=1440;return +(diff/60).toFixed(2)}
function openAttendanceDetail(empId,date){
  const e=employee(empId);
  if(!e){toast("Employee record not found");return;}
  const a=attendanceFor(empId,date);
  const leave=approvedLeave(empId,date);
  const state=calendarDateState(e,date);
  const join=employeeJoinDate(e);
  clearAttendanceState();
  setAttendanceDetailMode(false);
  E("detailKicker").textContent="DATE STATUS";
  E("detailTitle").textContent=formatDisplayDate(date);
  E("detailSubtitle").textContent=e.name;
  E("detailImg").src=getAvatar(e.img);
  E("detailName").textContent=e.name;
  E("detailRole").textContent=`${e.role} · ${e.dept}`;
  E("detailEmployeeId").textContent=e.employeeId;

  if(state==="not-joined"){
    showAttendanceState("not-joined","Not Joined Yet",`${e.name} joined on ${formatDisplayDate(join)}. This date is before the employee joining date, so attendance is not applicable.`);
  }else if(state==="future"){
    showAttendanceState("future","Future Date","This date is in the future. No attendance record can exist yet.");
  }else if(state==="weekend"){
    showAttendanceState("weekend","Weekend / Rest Day","This is a weekend/rest day. Attendance is not required.");
  }else if(state==="empty"){
    showAttendanceState("empty","No Attendance Data","No attendance record exists for this working day.");
  }else if(state==="leave" && !a){
    showAttendanceState("leave","Approved Leave",`${e.name} has approved leave for ${formatDisplayDate(date)}.`);
  }else{
    setAttendanceDetailMode(true);
    const hours=attendanceDuration(a);
    E("detailKicker").textContent=state==="half"?"HALF DAY DETAIL":"ATTENDANCE DETAIL";
    E("detailTitle").textContent=`${e.name} · ${formatDisplayDate(date)}`;
    E("detailSubtitle").textContent=`${e.role} · ${e.employeeId}`;
    E("detailDate").textContent=formatDisplayDate(date);
    E("detailIn").textContent=a?.in||"Not recorded";
    E("detailOut").textContent=a?.out||"Not recorded";
    E("detailHours").textContent=hours?`${hours.toFixed(2)}h`:"0h";
    
    const hasDistance = a?.distance != null;
    E("detailDistance").textContent=hasDistance?`${a.distance} m`:"—";
    E("detailStatus").textContent=a?.status||"Present";
    
    const verified=!!a?.verified;
    E("detailVerified").textContent=verified?"QR VERIFIED":"GPS / MANUAL RECORD";
    E("detailVerified").style.background=verified?"var(--green)":"var(--yellow)";
    
    const location=a?.lat!=null&&a?.lng!=null?`${a.lat}, ${a.lng}`:null;
    const accuracy=a?.accuracy!=null?`${a.accuracy} m`:a?.gpsAccuracy!=null?`${a.gpsAccuracy} m`:a?.positionAccuracy!=null?`${a.positionAccuracy} m`:null;
    const radius=DB.settings.location?.radius!=null?`${DB.settings.location.radius} m`:null;

    const rows=[
      ["Attendance Status", a?.status||"Present"],
      ["Check In", a?.in],
      ["Check Out", a?.out],
      ["Duration", hours ? `${hours.toFixed(2)} hours` : null],
      ["Attendance Method", a?.method],
      ["QR Verification", verified ? "Location matched" : null],
      ["GPS Accuracy", accuracy],
      ["GPS Distance", hasDistance ? `${a.distance} m` : null],
      ["Employee GPS Location", location],
      ["Allowed Radius", radius],
      ["Joining Date", join ? formatDisplayDate(join) : null],
      ["Recorded At", a?.createdAt ? new Date(a.createdAt).toLocaleString("en-IN") : null]
    ];

    E("detailRows").innerHTML=rows
      .filter(r => r[1] != null && r[1] !== "" && r[1] !== "Not recorded" && r[1] !== "—")
      .map(r=>`<tr><td>${escapeHtml(String(r[0]))}</td><td>${escapeHtml(String(r[1]))}</td></tr>`).join("");

    const mapEl = E("detailMap");
    if(location) {
        mapEl.style.display = "inline-block";
        mapEl.href=DB.settings.location?.map||`https://www.google.com/maps?q=${DB.settings.location?.lat||0},${DB.settings.location?.lng||0}`;
    } else {
        mapEl.style.display = "none";
    }
  }
  openModal("attendanceDetailModal");
}

function renderLeaves(){
  const q=E("leaveSearch")?.value||"";
  const arr=DB.leaves.filter(x=>{
    const e=employee(x.empId);
    if(!e)return false;
    const hay=[e.name,e.employeeId,e.email,e.phone,e.dept,e.role,x.type,x.from,x.to,x.days,x.purpose,x.status].map(normalize).join(" ");
    const matchesSearch=!q||hay.includes(normalize(q));
    const matchesDate=(!leaveRange.from||String(x.to)>=String(leaveRange.from))&&(!leaveRange.to||String(x.from)<=String(leaveRange.to));
    const matchesStatus=leaveRange.status==="All"||x.status===leaveRange.status;
    return matchesSearch&&matchesDate&&matchesStatus;
  });
  let fText=leaveRange.from||leaveRange.to?`${leaveRange.from||"Any"} → ${leaveRange.to||"Any"}`:"All dates";
  if(leaveRange.status!=="All")fText+=` (${leaveRange.status})`;
  E("leaveFilterText").textContent=fText;
  E("leaveBody").innerHTML=arr.slice().reverse().map(x=>{
    const e=employee(x.empId);
    const actions=x.status==="Pending"?`<button class="btn-action btn-green" onclick="leaveAction('${x.id}', 'Approved')">Approve</button> <button class="btn-action btn-red" onclick="leaveAction('${x.id}', 'Rejected')">Reject</button>`:`<span class="muted">—</span>`;
    return `<tr><td><div class="mini"><img src="${getAvatar(e.img)}"><div><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.employeeId)}</span></div></div></td><td>${escapeHtml(x.type)}</td><td>${escapeHtml(x.from)}</td><td>${escapeHtml(x.to)}</td><td>${Number(x.days||0)}</td><td>${escapeHtml(x.purpose)}</td><td>${Number(e.leaveRemaining||0)}/${Number(e.leaveAssigned||0)}</td><td>${statusTag(x.status)}</td><td><div class="actions" style="flex-direction:row;flex-wrap:nowrap;">${actions}</div></td></tr>`;
  }).join("")||`<tr><td colspan="9" class="no-data">No leave requests match criteria.</td></tr>`;
}

function renderLeaveBoard(){
  E("leaveBoard").innerHTML=DB.employees.slice().sort((a,b)=>(b.leaveRemaining/(b.leaveAssigned||1))-(a.leaveRemaining/(a.leaveAssigned||1))).map((x, i)=>`
    <div class="leave-item">
      <div class="leave-avatar-wrapper">
        <img src="${getAvatar(x.img)}">
        <div class="leave-text-wrap">
          <span class="leave-text-name">${x.name}</span>
          <span class="leave-text-id">${x.employeeId}</span>
        </div>
      </div>
      <div class="leave-badge">#${i+1}</div>
    </div>`).join("");
}

E("fImage").addEventListener("change", function(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 200; 
      let w = img.width, h = img.height;
      if(w > h) { if(w > MAX_SIZE) { h *= MAX_SIZE/w; w = MAX_SIZE; } } 
      else { if(h > MAX_SIZE) { w *= MAX_SIZE/h; h = MAX_SIZE; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7); 
      E("fImagePreview").src = dataUrl;
      E("fImageBase64").value = dataUrl;
    }
    img.src = event.target.result;
  }
  reader.readAsDataURL(file);
});

function newEmployeeId(){
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  let max = 0;
  DB.employees.forEach(x => {
      let m = String(x.employeeId||"").match(/-(\d{5})$/);
      if(m) max = Math.max(max, Number(m[1]));
  });
  return `EMP-${dd}-${mm}-${yyyy}-${String(max+1).padStart(5, "0")}`;
}

function openEmployee(id=null){
  let x=id?employee(id):null;
  E("editId").value=id||"";E("employeeModalTitle").textContent=id?"Edit Employee Account":"Create Employee Account";
  E("fName").value=x?.name||"";E("fEmail").value=x?.email||"";E("fPhone").value=x?.phone||"";E("fAddress").value=x?.address||"";E("fDob").value=x?.dob||"";E("fAttendance").value=x?.attendance||"enabled";E("fDepartment").value=x?.dept||"Development";E("fRole").value=x?.role||"";E("fAssigned").value=x?.leaveAssigned??30;E("fRemaining").value=x?.leaveRemaining??30;E("fSalary").value=x?.salary??50000;E("fStatus").value=x?.status||"Present";
  E("fPassword").value="";E("fConfirm").value="";E("fPassword").required=!x;E("fConfirm").required=!x;E("fPassword").disabled=false;E("fConfirm").disabled=false;
  E("fImagePreview").src=x?getAvatar(x.img):getAvatar(1);E("fImageBase64").value=x?.img||"";E("fImage").value="";E("generatedId").textContent=x?.employeeId||newEmployeeId();
  openModal("employeeModal");
}
function togglePass(input,icon){let x=E(input),i=E(icon);x.type=x.type==="password"?"text":"password";i.className=x.type==="password"?"fa-regular fa-eye":"fa-regular fa-eye-slash"}

E("employeeForm").onsubmit=async e=>{
  e.preventDefault();
  if(!appReady)return toast("Cloud connection is still starting…");
  const id=E("editId").value.trim();
  const existing=id?employee(id):null;
  const p=E("fPassword").value.trim();
  const c=E("fConfirm").value.trim();
  if(!existing && (!p||p.length<6))return toast("Password must be at least 6 characters");
  if(p && p!==c)return toast("Passwords do not match");
  const assigned=Number(E("fAssigned").value),remaining=Number(E("fRemaining").value);
  if(!Number.isFinite(assigned)||assigned<0||!Number.isFinite(remaining)||remaining<0)return toast("Enter valid leave values");
  if(remaining>assigned)return toast("Remaining leave cannot exceed assigned leave");
  const email=E("fEmail").value.trim().toLowerCase();
  if(!email)return toast("Email is required");
  const employeeId=existing?.employeeId||newEmployeeId();
  const finalImg=existing?(E("fImageBase64").value||existing.img):(E("fImageBase64").value||Math.floor(Math.random()*60)+1);
  const data={
    employeeId, name:E("fName").value.trim(), email, phone:E("fPhone").value.trim(), address:E("fAddress").value.trim(), dob:E("fDob").value,
    attendance:E("fAttendance").value, dept:E("fDepartment").value, role:E("fRole").value.trim(), leaveAssigned:assigned, leaveRemaining:remaining,
    salary:Number(E("fSalary").value), status:E("fStatus").value, img:finalImg, join:existing?.join||today(), hours:existing?.hours||0, password:existing?.password||""
  };
  if(p) data.password = p;
  if(!data.name||!data.role)return toast("Name and role are required");
  
  try{
    const {doc, setDoc} = window.__firebaseModules;
    await setDoc(doc(db, "employees", employeeId), sanitizeForFirestore(data));
    closeModal("employeeModal");
    toast(existing?"Employee updated":"Employee registered · "+employeeId);
  }catch(err){console.error(err);toast(err.message||"Employee save failed")}
}

function openResetLeave(id) {
  let x = employee(id); E("rlId").value = id; E("rlDays").value = x.leaveAssigned;
  E("rlSub").textContent = `${x.name} · ${x.employeeId}`; openModal("resetLeaveModal");
}
async function saveLeaveReset() {
  let id = E("rlId").value, n = Number(E("rlDays").value);
  if(!Number.isFinite(n)||n<0) return toast("Enter a valid leave value");
  let x = employee(id);
  
  try {
      const {doc, updateDoc} = window.__firebaseModules;
      await updateDoc(doc(db, "employees", id), { leaveAssigned: n, leaveRemaining: n });
      closeModal("resetLeaveModal");
      toast(`Leave limit updated to ${n} days`);
  } catch(e) { console.error(e); toast("Update failed."); }
}

function openDeleteEmployee(id) {
  let x = employee(id); E("delEmpDbId").value = id; E("delEmpName").textContent = x.name;
  E("delEmpIdTarget").textContent = x.employeeId; E("delConfirmInput").value = ""; openModal("deleteModal");
}
async function confirmDelete() {
  let id = E("delEmpDbId").value, x = employee(id), typed = E("delConfirmInput").value.trim();
  if(typed !== x.employeeId) return toast("ID does not match! Deletion cancelled.");
  
  try {
      const {doc, setDoc, deleteDoc} = window.__firebaseModules;
      const recItem = { deletedAt: Date.now(), employee: x, id: x.employeeId };
      await setDoc(doc(db, "recovery", x.employeeId), sanitizeForFirestore(recItem));
      await deleteDoc(doc(db, "employees", x.employeeId));
      
      closeModal("deleteModal");
      toast("Moved to Recovery Bin.");
  } catch (e) { console.error(e); toast("Delete failed."); }
}

function renderRecovery() {
  E("recoveryBody").innerHTML = DB.recovery.slice().reverse().map(r => `<tr><td><div class="mini"><img src="${getAvatar(r.employee.img)}"><div><b>${r.employee.name}</b></div></div></td><td>${r.employee.employeeId}</td><td>${new Date(r.deletedAt).toLocaleDateString()}</td><td><button class="primary btn-green" style="font-size:10px;padding:6px 12px;" onclick="recoverEmployee('${String(r.employee.employeeId)}')">Recover</button></td></tr>`).join("") || `<tr><td colspan="4" class="no-data">Recovery Bin is empty.</td></tr>`;
}
async function recoverEmployee(id) {
  let r = DB.recovery.find(r => String(r.id) === String(id)); 
  if(!r) return;
  try {
      const {doc, setDoc, deleteDoc} = window.__firebaseModules;
      await setDoc(doc(db, "employees", id), sanitizeForFirestore(r.employee));
      await deleteDoc(doc(db, "recovery", id));
      toast(`${r.employee.name} has been recovered.`);
  } catch(e) { console.error(e); toast("Recovery failed."); }
}

async function leaveAction(id,action){
  const l=DB.leaves.find(x=>String(x.id)===String(id));
  if(!l)return toast("Leave request not found");
  const e=employee(l.empId);
  if(!e)return toast("Employee not found for this leave request");
  
  const days=Math.max(0,Number(l.days||0));
  const oldStatus=String(l.status||"Pending");
  let newRemaining = Number(e.leaveRemaining||0);
  
  if(action==="Approved"){
    if(oldStatus!=="Approved"){
      if(newRemaining<days) return toast(`Insufficient leave balance: ${newRemaining}/${e.leaveAssigned||0}`);
      newRemaining = Math.max(0, newRemaining-days);
    }
  }else if(action==="Rejected"){
    if(oldStatus==="Approved") newRemaining = Math.min(Number(e.leaveAssigned||0), newRemaining+days);
  }else return;

  try {
      const {doc, updateDoc} = window.__firebaseModules;
      await updateDoc(doc(db, "employees", e.employeeId), { leaveRemaining: newRemaining });
      await updateDoc(doc(db, "leaves", String(id)), { status: action });
      toast(action==="Approved"?`Approved · ${days} day${days===1?"":"s"} deducted`:"Leave rejected");
  } catch(err) { console.error(err); toast(err.message||"Leave update failed"); }
}

function openQR(){let l=DB.settings.location;E("qName").value=l.name;E("qRadius").value=l.radius;E("qLat").value=l.lat;E("qLng").value=l.lng;E("qMap").value=l.map;openModal("qrModal");setTimeout(generateQR,60)}
function useCurrentLocation(){if(!navigator.geolocation)return toast("Browser geolocation unavailable");navigator.geolocation.getCurrentPosition(pos=>{E("qLat").value=pos.coords.latitude.toFixed(7);E("qLng").value=pos.coords.longitude.toFixed(7);E("qMap").value=`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;generateQR();toast("Current location loaded")},()=>toast("Location permission denied"))}

function generateQR(){
  let lat = Number(E("qLat").value) || DB.settings.location.lat || 0;
  let lng = Number(E("qLng").value) || DB.settings.location.lng || 0;
  let radius = Number(E("qRadius").value) || DB.settings.location.radius || 150;
  let name = E("qName").value || DB.settings.location.name || "Head Office";

  let text=JSON.stringify({
    type:"LOCKWORK_ATTENDANCE",
    version:1,
    location:{ name: name, lat: lat, lng: lng, radius: radius },
    destination: E("qMap").value || DB.settings.location.map
  });
  
  E("qCoord").textContent=`${name} · ${radius}m · ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  if(typeof QRCode==="undefined")return;
  E("qrCode").innerHTML="";
  new QRCode(E("qrCode"),{text,width:180,height:180,colorDark:"#000",colorLight:"#fff",correctLevel:QRCode.CorrectLevel.M});
}

async function saveQR(){
  let lat=Number(E("qLat").value),lng=Number(E("qLng").value),radius=Number(E("qRadius").value);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(radius)||radius<10)return toast("Enter valid location details");
  
  const locData = {name:E("qName").value.trim()||"Head Office",lat,lng,radius,map:E("qMap").value.trim()||`https://www.google.com/maps?q=${lat},${lng}`};
  
  try {
      const {doc, setDoc} = window.__firebaseModules;
      await setDoc(doc(db, "settings", "location"), locData);
      closeModal("qrModal"); toast("QR attendance location saved");
  } catch(e) { console.error(e); toast("Failed to save location."); }
}

function downloadQR() {
    const qrImg = document.querySelector("#qrCode img");
    const qrCanvas = document.querySelector("#qrCode canvas");
    let dataUrl = "";
    if(qrImg && qrImg.src) dataUrl = qrImg.src;
    else if (qrCanvas) dataUrl = qrCanvas.toDataURL("image/png");
    
    if(dataUrl) {
        const link = document.createElement("a"); link.href = dataUrl; link.download = "Attendance-QR.png";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else { toast("Generate QR code first"); }
}

function applyLeaveFilter(){
  leaveRange.status = E("lfStatus").value; leaveRange.from = E("lfFrom").value; leaveRange.to = E("lfTo").value;
  if(leaveRange.from && leaveRange.to && leaveRange.from>leaveRange.to) return toast("From date cannot be after To date");
  closeModal("leaveFilterModal"); renderLeaves();
}
function applyAdvancedFilter(){advanced={role:E("advRole").value.trim().toLowerCase(),minLeave:E("advLeave").value===""?null:Number(E("advLeave").value)};closeModal("advancedFilterModal");renderEmployees()}
async function logOut(){try{await firebaseReady;await window.__firebaseModules.signOut(auth)}catch(e){console.error(e)}finally{window.location.href="index.html"}}

function bindSearch(id,handler){
  const el=E(id);
  if(!el)return;
  el.addEventListener("input",handler);
  el.addEventListener("search",handler);
}

function downloadCurrentMonthExcel(){
  if(typeof XLSX==="undefined")return toast("Excel export library is unavailable");
  const [y,m]=attMonth.split("-").map(Number);
  const totalDays=daysInMonth(y,m);
  const weekdayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const monthLabel=new Date(y,m-1,1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  const rows=[];
  DB.employees.forEach(e=>{
    const row={Employee:e.name||"",Employee_ID:e.employeeId||"",Department:e.dept||"",Role:e.role||""};
    let present=0,leave=0,half=0,absent=0,totalHours=0;
    for(let d=1;d<=totalDays;d++){
      const dt=dateKey(y,m,d);
      const dow=new Date(y,m-1,d).getDay();
      const a=findAttendance(e.employeeId,dt);
      const lv=approvedLeave(e.employeeId,dt);
      let value="";
      if(lv){value="Leave";leave++;}
      else if(a){value=a.status||"Present";if(value==="Half Day")half++;else if(value==="Absent")absent++;else present++;totalHours+=Number(a.hours||0);}
      else if(dow===0||dow===6){value="Weekend";}
      else{value="Absent";absent++;}
      row[`Day_${String(d).padStart(2,"0")}`]=value;
    }
    row.Present=present;row.Leave=leave;row.Half_Day=half;row.Absent=absent;row.Total_Hours=+totalHours.toFixed(2);
    rows.push(row);
  });
  const detailRows=DB.employees.flatMap(e=>DB.attendance.filter(a=>String(a.empId)===String(e.employeeId)&&String(a.date).startsWith(attMonth)).map(a=>({Employee:e.name,Employee_ID:e.employeeId,Date:a.date,Status:a.status||"",Check_In:a.in||"",Check_Out:a.out||"",Working_Hours:Number(a.hours||0),Method:a.method||"",QR_Verified:a.verified?"Yes":"No",Latitude:a.lat??"",Longitude:a.lng??"",GPS_Distance:a.distance??""})));
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(rows);
  const ws2=XLSX.utils.json_to_sheet(detailRows);
  ws["!freeze"]={xSplit:4,ySplit:1};
  ws2["!freeze"]={xSplit:2,ySplit:1};
  ws["!cols"]=[{wch:22},{wch:24},{wch:16},{wch:22},...Array(totalDays).fill({wch:10}),{wch:10},{wch:10},{wch:10},{wch:10},{wch:12}];
  ws2["!cols"]=Array(12).fill({wch:16});
  XLSX.utils.book_append_sheet(wb,ws,"Calendar");
  XLSX.utils.book_append_sheet(wb,ws2,"Attendance Details");
  XLSX.writeFile(wb,`LOCKWORK_Attendance_${String(m).padStart(2,"0")}_${y}.xlsx`);
  toast(`Excel downloaded · ${monthLabel}`);
}

bindSearch("employeeSearch",renderEmployees);
if(E("directoryDept"))E("directoryDept").addEventListener("change",renderEmployees);
if(E("directoryStatus"))E("directoryStatus").addEventListener("change",renderEmployees);
bindSearch("attendanceSearch",e=>{attSearch=e.target.value;attPage=1;renderAttendance()});renderEmployees();
bindSearch("leaveSearch",renderLeaves);
window.addEventListener("resize",()=>{if(E("dashboard")?.style.display!=="none")drawOverviewChart()});

async function bootstrapHR(){
  try{
    await firebaseReady;
    const {onAuthStateChanged}=window.__firebaseModules;
    onAuthStateChanged(auth, async user=>{
      if(!user){window.location.replace("index.html");return;}
      if(E("hrUserEmail"))E("hrUserEmail").textContent=user.email||"HR";
      appReady=true;
      startRealtime();
      ensureCollections();
      renderDashboard();
      renderAttendance();
      const badge=E("dashboardDateBadge");if(badge)badge.textContent=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    });
  }catch(e){console.error(e);toast("Firebase initialization failed")}
}
bootstrapHR();
