const FIREBASE_CONFIG={
  apiKey:"AIzaSyAYDphHYxHw07hq-jBfXAiWRhJpJcqcDj8",
  authDomain:"lockwork-4e494.firebaseapp.com",
  projectId:"lockwork-4e494",
  storageBucket:"lockwork-4e494.firebasestorage.app",
  messagingSenderId:"250655916297",
  appId:"1:250655916297:web:ab282192517adf24bb93d8"
};

const [appMod,fsMod]=await Promise.all([
  import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js")
]);

const app=appMod.initializeApp(FIREBASE_CONFIG);
const db=fsMod.getFirestore(app);
const {collection,doc,getDocs,updateDoc,setDoc,onSnapshot,arrayUnion}=fsMod;

let DB={settings:{location:{name:"Head Office",lat:22.5726,lng:88.3639,radius:150,map:"https://www.google.com/maps?q=22.5726,88.3639"}},employees:[],attendance:[],leaves:[],recovery:[]};
let currentUser=null;
let activeInterval=null;
let currentCoords=null;
let stateUnsubscribe=null;
let html5QrCode=null;
let currentFacingMode="environment";
let isScanning=false;
let isProcessingScan=false;
let currentTabIndex=0;
let isDarkTheme=false;
let viewingYear=new Date().getFullYear();
let viewingMonth=new Date().getMonth()+1;
let appReady=false;

function E(id){return document.getElementById(id)}
function normalize(v){return String(v??"").trim().toLowerCase()}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function nowTime(){return new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
function employee(id){return DB.employees.find(x=>String(x.employeeId)===String(id))}
function getAvatar(img){return String(img||"").startsWith("data:")?img:`https://i.pravatar.cc/80?img=${img||1}`}
function ensureDBSafety(){
  if(!DB||typeof DB!=="object")DB={};
  if(!DB.settings||typeof DB.settings!=="object")DB.settings={};
  if(!DB.settings.location||typeof DB.settings.location!=="object")DB.settings.location={name:"Head Office",lat:22.5726,lng:88.3639,radius:150,map:"https://www.google.com/maps?q=22.5726,88.3639"};
  if(!Array.isArray(DB.employees))DB.employees=[];
  if(!Array.isArray(DB.attendance))DB.attendance=[];
  if(!Array.isArray(DB.leaves))DB.leaves=[];
  if(!Array.isArray(DB.recovery))DB.recovery=[];
}
function toast(msg){const t=E("toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800)}
function openModal(id){const m=E(id);if(m)m.style.display="flex"}
function closeModal(id){const m=E(id);if(!m)return;const box=m.querySelector(".modal-box");if(box){box.classList.add("closing");setTimeout(()=>{m.style.display="none";box.classList.remove("closing")},280)}else m.style.display="none"}

function startRealtime(){
  if(stateUnsubscribe) return; 

  onSnapshot(collection(db, "employees"), snap => {
    DB.employees = snap.docs.map(d => d.data());
    syncCurrentUser(); refreshAll();
  });

  onSnapshot(collection(db, "attendance"), snap => {
    DB.attendance = snap.docs.map(d => d.data());
    syncCurrentUser(); refreshAll();
  });

  onSnapshot(collection(db, "leaves"), snap => {
    DB.leaves = snap.docs.map(d => d.data());
    syncCurrentUser(); refreshAll();
  });

  onSnapshot(collection(db, "recovery"), snap => {
    DB.recovery = snap.docs.map(d => d.data());
  });

  onSnapshot(doc(db, "settings", "location"), snap => {
    if(snap.exists()) DB.settings.location = snap.data();
    syncCurrentUser(); refreshAll();
  });
  stateUnsubscribe = true;
}

function syncCurrentUser(){if(!currentUser)return;const fresh=employee(currentUser.employeeId);if(!fresh){logout();return}currentUser=fresh}
function sessionData(){try{return JSON.parse(sessionStorage.getItem("LOCKWORK_SESSION")||localStorage.getItem("LOCKWORK_SESSION")||"null")}catch{return null}}
function clearSession(){try{sessionStorage.removeItem("LOCKWORK_SESSION")}catch{}try{localStorage.removeItem("LOCKWORK_SESSION")}catch{}}

function toggleTheme(){isDarkTheme=!isDarkTheme;document.body.classList.toggle("dark-theme",isDarkTheme);const icon=document.querySelector("#themeToggleBtn i");if(icon)icon.className=isDarkTheme?"fa-solid fa-sun":"fa-solid fa-moon";E("metaThemeColor")?.setAttribute("content",isDarkTheme?"#090A10":"#F2F4F9")}
function switchTab(tabId,targetIndex){
  if(tabId!=="qr"&&isScanning&&html5QrCode){html5QrCode.stop().then(()=>{isScanning=false;isProcessingScan=false}).catch(()=>{})}
  document.querySelectorAll(".nav-item").forEach((b,i)=>b.classList.toggle("active",i===targetIndex));
  updateNavIndicator(targetIndex);
  document.querySelectorAll(".tab-view").forEach(t=>t.classList.remove("active"));
  E("tab-"+tabId)?.classList.add("active");
  currentTabIndex=targetIndex;
  if(tabId==="dash")refreshDashboard();
  if(tabId==="leave")refreshLeave();
  if(tabId==="calendar")renderCalendar();
  if(tabId==="profile")loadProfile();
  if(tabId==="qr")grantLocationAndScan();
}
function updateNavIndicator(index){const indicator=E("navIndicator"),target=document.querySelectorAll(".nav-item")[index];if(indicator&&target){indicator.style.left=target.offsetLeft+"px";indicator.style.width=target.offsetWidth+"px"}}
function refreshAll(){syncCurrentUser();if(!currentUser)return;refreshDashboard();refreshLeave();loadProfile();renderCalendar()}
function refreshDashboard(){
  const assigned=Number(currentUser.leaveAssigned||0),remaining=Number(currentUser.leaveRemaining||0);
  E("dashLeaveText").textContent=`${remaining}/${assigned}`;E("dashLeaveBar").style.width=(assigned?Math.min(100,Math.round(remaining/assigned*100)):0)+"%";
  const myAtt=DB.attendance.filter(a=>String(a.empId)===String(currentUser.employeeId)&&(a.status==="Present"||a.status==="Late"||a.status==="Half Day"));
  E("dashDaysText").textContent=myAtt.length;
  const hrs=myAtt.reduce((s,x)=>s+(Number(x.hours)||0),0);E("dashHours").innerHTML=`${Math.floor(hrs)}<span style="font-size:14px;color:var(--muted);">h</span>`;
  const sorted=DB.employees.slice().sort((a,b)=>(Number(b.leaveRemaining||0)/(Number(b.leaveAssigned||1)))-(Number(a.leaveRemaining||0)/(Number(a.leaveAssigned||1)))).slice(0,3);
  E("dashRankList").innerHTML=sorted.map((x,i)=>`<div class="rank-item"><div class="rank-profile"><img src="${getAvatar(x.img)}"><div><b>${escapeHtml(x.name||"Employee")}</b><span>${escapeHtml(x.role||"Staff")}</span></div></div><div class="rank-badge"><i class="fa-solid fa-crown"></i> ${Number(x.leaveRemaining||0)}</div></div>`).join("");
  updateStatusWidget();
}
function getTodayRecord(){return DB.attendance.find(a=>String(a.empId)===String(currentUser?.employeeId)&&a.date===today())||null}
function updateStatusWidget(){
  const rec=getTodayRecord(),banner=E("dashStatusBanner"),clock=E("dashClock"),badge=E("dashStatusBadge");if(!banner||!clock||!badge)return;
  if(!rec||!rec.in||rec.in==="—"){banner.className="status-widget";badge.textContent=currentUser.attendance==="disabled"?"ATTENDANCE DISABLED":"READY FOR WORK";clock.textContent=new Date().toLocaleTimeString("en-US",{hour12:false})}
  else if(!rec.out||rec.out==="—"){banner.className="status-widget checked-in";badge.textContent="SHIFT IN PROGRESS";const t=parseTimeStr(rec.in),now=new Date();let mins=(now.getHours()*60+now.getMinutes())-(t.h*60+t.m);if(mins<0)mins+=1440;clock.textContent=`${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`}
  else{banner.className="status-widget";badge.textContent="SHIFT COMPLETED";clock.textContent=`${Number(rec.hours||0).toFixed(2)} Hrs`}
}
function startClock(){clearInterval(activeInterval);updateStatusWidget();activeInterval=setInterval(updateStatusWidget,1000)}
function parseTimeStr(t){const m=String(t||"").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return{h:0,m:0};let h=Number(m[1]),min=Number(m[2]);const ap=m[3].toUpperCase();if(ap==="AM"&&h===12)h=0;if(ap==="PM"&&h!==12)h+=12;return{h,m:min}}

async function grantLocationAndScan(){
  if(currentUser?.attendance!=="enabled")return toast("Attendance access is disabled by HR.");
  if(!navigator.geolocation)return toast("Location services are unavailable.");
  toast("Acquiring secure GPS location...");
  navigator.geolocation.getCurrentPosition(async pos=>{currentCoords=pos.coords;await startCameraEngine()},()=>toast("Location permission denied. Cannot verify attendance."),{enableHighAccuracy:true,maximumAge:10000,timeout:15000})
}
async function startCameraEngine(){
  if(isScanning)return;if(!html5QrCode)html5QrCode=new Html5Qrcode("reader");
  try{
    const devices=await Html5Qrcode.getCameras();let config={fps:10,qrbox:{width:250,height:250},aspectRatio:1};
    if(devices&&devices.length){let camId=devices[0].id;if(currentFacingMode==="environment"){const back=devices.find(d=>/back|rear|environment/i.test(d.label));if(back)camId=back.id}else{const front=devices.find(d=>/front|user/i.test(d.label));if(front)camId=front.id}await html5QrCode.start(camId,config,onScanSuccess)}else await html5QrCode.start({facingMode:currentFacingMode},config,onScanSuccess);
    isScanning=true;isProcessingScan=false;toast("Camera ready. Align QR code inside frame.")
  }catch(e){console.error(e);toast("Camera access denied. Please allow camera permissions.")}
}
function onScanSuccess(decodedText){if(!isScanning||isProcessingScan)return;isProcessingScan=true;processAttendanceRecord(decodedText)}
async function flipCamera(){if(!isScanning||!html5QrCode)return;currentFacingMode=currentFacingMode==="environment"?"user":"environment";try{await html5QrCode.stop();isScanning=false;isProcessingScan=false;await startCameraEngine()}catch{}}
function getDistance(lat1,lon1,lat2,lon2){const R=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1),a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
async function processAttendanceRecord(qrDataStr){
  try{
    if(!currentUser)throw new Error("User session lost. Refresh the app.");
    if(currentUser.attendance!=="enabled")throw new Error("Attendance access is disabled by HR.");
    const qr=JSON.parse(String(qrDataStr).trim());
    if(!qr||qr.type!=="LOCKWORK_ATTENDANCE"||!qr.location||qr.location.lat===undefined||qr.location.lng===undefined||qr.location.radius===undefined)throw new Error("Invalid HR Attendance QR format.");
    if(currentCoords?.latitude===undefined||currentCoords?.longitude===undefined)throw new Error("GPS still locking... scan again in 2s.");
    const dist=Math.round(getDistance(currentCoords.latitude,currentCoords.longitude,Number(qr.location.lat),Number(qr.location.lng)));
    if(dist>Number(qr.location.radius))throw new Error(`Location Failed: You are ${dist}m away (Max: ${qr.location.radius}m).`);
    
    const rec=getTodayRecord(),time=nowTime(),date=today();let success="";
    if(rec&&rec.in&&rec.in!=="—"&&rec.out&&rec.out!=="—")throw new Error("Already checked out today. Try again tomorrow.");
    
    const attId = rec ? rec.id : crypto.randomUUID();

    if(!rec||!rec.in||rec.in==="—"){
        const newAtt = {id:attId,empId:currentUser.employeeId,date,in:time,out:"—",hours:0,status:"Present",method:"QR",verified:true,lat:currentCoords.latitude,lng:currentCoords.longitude,distance:dist,createdAt:new Date().toISOString()};
        await setDoc(doc(db, "attendance", attId), newAtt);
        success=`CHECK IN: ${time}`;
    }else{
      const a=parseTimeStr(rec.in),b=parseTimeStr(time);let diff=(b.h*60+b.m)-(a.h*60+a.m);if(diff<0)diff+=1440;
      const calcHours=+(diff/60).toFixed(2);
      await updateDoc(doc(db, "attendance", attId), { out: time, hours: calcHours });
      success=`CHECK OUT: ${time} (${calcHours}h)`;
    }

    const overlay=E("verifiedOverlay");E("verifiedMsg").textContent=success;overlay.classList.add("show");toast("Attendance verified successfully.");
    setTimeout(async()=>{overlay.classList.remove("show");if(html5QrCode&&isScanning){await html5QrCode.stop().catch(()=>{});isScanning=false}refreshAll();switchTab("calendar",3);openLogModal(date,"present");isProcessingScan=false},900)
  }catch(e){console.error(e);toast(e.message||"Attendance verification failed.");setTimeout(()=>isProcessingScan=false,2000)}
}

function refreshLeave(){
  E("leaveAvailBadge").textContent=`${Number(currentUser.leaveRemaining||0)} Left`;
  E("lFrom").value="";E("lTo").value="";E("lDuration").value="0 Days";E("lReason").value="";toggleLeaveButtons(0);
  const list=E("leaveHistoryList"),myLeaves=DB.leaves.filter(l=>String(l.empId)===String(currentUser.employeeId)).slice().reverse();
  list.innerHTML=myLeaves.map(l=>{const c=l.status==="Approved"?"st-approved":l.status==="Rejected"?"st-rejected":"st-pending";return `<div class="ticket"><div class="ticket-info"><b>${escapeHtml(l.from)} to ${escapeHtml(l.to)}</b><span>${Number(l.days||0)} Days · ${escapeHtml(l.type||"Leave")} · ${escapeHtml(l.purpose||"")}</span></div><div class="ticket-status ${c}">${escapeHtml(l.status||"Pending")}</div></div>`}).join("")||`<p style="font-size:10px;color:var(--muted);text-align:center;padding:20px 0;font-weight:700">No leave history found.</p>`
}
function calcLeaveDays(){const f=E("lFrom").value,t=E("lTo").value;if(!f||!t)return;if(t<f){E("lDuration").value="Invalid Date";toggleLeaveButtons(0);return}const diff=Math.floor((new Date(t)-new Date(f))/86400000)+1;E("lDuration").value=`${diff} Day(s)`;toggleLeaveButtons(diff)}
function toggleLeaveButtons(reqDays){const enough=reqDays<=Number(currentUser.leaveRemaining||0);E("btnSubmitLeave").style.display=enough?"flex":"none";E("btnOverrideLeave").style.display=enough?"none":"flex"}
async function submitLeave(isOverride=false){
  try{
    const f=E("lFrom").value,t=E("lTo").value,purpose=E("lReason").value.trim();const type="Casual Leave";
    if(!f||!t||t<f||!purpose)return toast("Complete the leave form first.");
    const days=Math.floor((new Date(t)-new Date(f))/86400000)+1;
    if(!isOverride&&days>Number(currentUser.leaveRemaining||0))return toast("Insufficient leave balance.");

    const leaveId = crypto.randomUUID();
    const newLeave = {id:leaveId,empId:currentUser.employeeId,type,from:f,to:t,days,purpose,status:"Pending",createdAt:new Date().toISOString(),overrideRequest:Boolean(isOverride)};
    await setDoc(doc(db, "leaves", leaveId), newLeave);
    
    toast("Leave request submitted.")
  }catch(e){console.error(e);toast(e.message||"Leave submission failed.")}
}

function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function updateCalBtnText(){const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];E("calPickerBtnText").textContent=`${months[viewingMonth-1]} ${viewingYear}`}
function openCalPicker(){E("calPickerYearDisp").textContent=viewingYear;renderMonthGrid();openModal("calPickerModal")}
function changeCalYear(delta){viewingYear+=delta;E("calPickerYearDisp").textContent=viewingYear;renderMonthGrid()}
function renderMonthGrid(){const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];E("monthGrid").innerHTML=months.map((m,i)=>`<button class="${viewingMonth===i+1?"active":""}" onclick="selectMonth(${i+1})">${m}</button>`).join("")}
function selectMonth(m){viewingMonth=m;closeModal("calPickerModal");updateCalBtnText();renderCalendar()}
function renderCalendar(){
  let m=viewingMonth,y=viewingYear,days=daysInMonth(y,m),first=(new Date(y,m-1,1).getDay()+6)%7,cells=Array(first).fill('<div class="day empty-visible"></div>'),localToday=today();
  const join=new Date(currentUser.join||"2020-01-01");join.setHours(0,0,0,0);const td=new Date();td.setHours(0,0,0,0);
  for(let d=1;d<=days;d++){
    const date=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,a=DB.attendance.find(x=>String(x.empId)===String(currentUser.employeeId)&&x.date===date),lv=DB.leaves.some(x=>String(x.empId)===String(currentUser.employeeId)&&x.status==="Approved"&&date>=x.from&&date<=x.to),day=new Date(y,m-1,d),weekend=day.getDay()===0||day.getDay()===6,future=day>td,pre=day<join;let state="empty",click="";
    
    if(pre){state="pre-join";click="toast('Not Joined Yet. This date is before the employee joining date, so attendance is not applicable.')"}
    else if(future){state="future";click="toast('Future Date. This date is in the future. No attendance record can exist yet.')"}
    else if(a){state=a.status==="Half Day"?"half":a.status==="Absent"?"empty":"present";click=`openLogModal('${date}','${state}')`}
    else if(lv){state="leave";click=`openLogModal('${date}','leave')`}
    else if(weekend){state="weekend";click=`openLogModal('${date}','weekend')`}
    else{state="empty-record";click="toast('No attendance record found.')"}
    cells.push(`<div class="day ${state} ${date===localToday?"today":""}" onclick="${click}">${weekend?"🌴":d}</div>`)
  }
  while(cells.length<42)cells.push('<div class="day empty-visible"></div>');E("calGrid").innerHTML=cells.join("")
}
function openLogModal(dateStr,state){
  const a=DB.attendance.find(x=>String(x.empId)===String(currentUser.employeeId)&&x.date===dateStr),lv=DB.leaves.find(x=>String(x.empId)===String(currentUser.employeeId)&&x.status==="Approved"&&dateStr>=x.from&&dateStr<=x.to);const p=dateStr.split("-"),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));E("modDateTitle").textContent=d.toLocaleDateString("en-IN",{weekday:"long",month:"short",day:"numeric"});let html="";
  if(a)html=`<div class="detail-row"><span>Status</span><b>${escapeHtml(a.status)}</b></div><div class="detail-row"><span>Check In</span><b>${escapeHtml(a.in||"—")}</b></div><div class="detail-row"><span>Check Out</span><b>${escapeHtml(a.out||"—")}</b></div><div class="detail-row"><span>Total Hours</span><b>${Number(a.hours||0).toFixed(2)} Hrs</b></div><div class="detail-row"><span>Method</span><b>${escapeHtml(a.method||"—")}</b></div><div class="detail-row"><span>GPS Distance</span><b>${a.distance!=null?`${a.distance} m`:"—"}</b></div>`;
  else if(lv)html=`<div class="detail-row"><span>Status</span><b style="color:var(--red)">On Leave</b></div><div class="detail-row"><span>Type</span><b>${escapeHtml(lv.type||"Leave")}</b></div><div class="detail-row"><span>Purpose</span><b>${escapeHtml(lv.purpose||"")}</b></div>`;
  else if(state==="weekend")html='<div class="detail-row" style="border:none;justify-content:center"><b style="font-size:15px;color:var(--accent)">🌴 Rest Day / Weekend</b></div>';
  else html='<div class="detail-row" style="border:none;justify-content:center"><b>No record found.</b></div>';
  E("modBodyContent").innerHTML=html;openModal("calDetailModal")
}

function loadProfile(){
  syncCurrentUser();if(!currentUser)return;E("pNameDisp").textContent=currentUser.name||"Employee";E("pIdDisp").textContent=currentUser.employeeId||"EMP-XXXXX";E("pEmail").value=currentUser.email||"";E("pPhone").value=currentUser.phone||"";E("pRole").value=currentUser.role||"Staff";E("pLeaveDisp").textContent=`${Number(currentUser.leaveRemaining||0)}/${Number(currentUser.leaveAssigned||0)}`;E("pHoursDisp").textContent=Math.floor(DB.attendance.filter(a=>String(a.empId)===String(currentUser.employeeId)).reduce((s,x)=>s+(Number(x.hours)||0),0));E("pImgPreview").src=getAvatar(currentUser.img);E("pPhone").readOnly=true;E("pPassword").readOnly=true;E("pPhone").classList.add("input-readonly");E("pPassword").classList.add("input-readonly");E("btnEditProfile").style.display="flex";E("btnSaveProfile").style.display="none"
}
function enableProfileEdit(){E("pPhone").readOnly=false;E("pPassword").readOnly=false;E("pPhone").classList.remove("input-readonly");E("pPassword").classList.remove("input-readonly");E("btnEditProfile").style.display="none";E("btnSaveProfile").style.display="flex";E("pPhone").focus()}
async function handleImageUpload(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=event=>{const img=new Image();img.onload=async()=>{const canvas=document.createElement("canvas"),MAX=240;let w=img.width,h=img.height;if(w>h&&w>MAX){h*=MAX/w;w=MAX}else if(h>MAX){w*=MAX/h;h=MAX}canvas.width=Math.round(w);canvas.height=Math.round(h);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL("image/jpeg",.72);try{await updateDoc(doc(db, "employees", currentUser.employeeId), { img: data }); E("pImgPreview").src=data;toast("Avatar updated successfully.")}catch(err){console.error(err);toast("Avatar update failed")}};img.src=event.target.result};reader.readAsDataURL(file)}
async function saveProfile(){
  try{
      const phone=E("pPhone").value.trim(),pass=E("pPassword").value.trim();
      const updates = { phone: phone };
      if(pass) updates.password = pass;
      await updateDoc(doc(db, "employees", currentUser.employeeId), updates);
      E("pPassword").value="";
      toast("Profile saved successfully");
  }catch(err){console.error(err);toast(err.message||"Profile save failed")}
}

function exportCurrentMonthExcel(){
  if(typeof XLSX==="undefined")return toast("Excel export library unavailable.");
  const y=viewingYear,m=viewingMonth,key=`${y}-${String(m).padStart(2,"0")}`,days=daysInMonth(y,m),rows=[];
  for(let d=1;d<=days;d++){const date=`${key}-${String(d).padStart(2,"0")}`,a=DB.attendance.find(x=>String(x.empId)===String(currentUser.employeeId)&&x.date===date),lv=DB.leaves.find(x=>String(x.empId)===String(currentUser.employeeId)&&x.status==="Approved"&&date>=x.from&&date<=x.to),dt=new Date(y,m-1,d),weekend=dt.getDay()===0||dt.getDay()===6;let status="No Record";if(lv)status="Leave";else if(a)status=a.status||"Present";else if(weekend)status="Weekend";rows.push({Date:date,Day:dt.toLocaleDateString("en-IN",{weekday:"long"}),Status:status,Check_In:a?.in||"",Check_Out:a?.out||"",Working_Hours:Number(a?.hours||0),Method:a?.method||"",QR_Verified:a?.verified?"Yes":"No",Latitude:a?.lat??"",Longitude:a?.lng??"",GPS_Distance_Meters:a?.distance??"",Leave_Type:lv?.type||"",Leave_Purpose:lv?.purpose||""})}
  const summary=[{Employee:currentUser.name,Employee_ID:currentUser.employeeId,Email:currentUser.email,Department:currentUser.dept,Role:currentUser.role,Month:key,Assigned_Leave:Number(currentUser.leaveAssigned||0),Remaining_Leave:Number(currentUser.leaveRemaining||0),Total_Recorded_Hours:rows.reduce((s,r)=>s+Number(r.Working_Hours||0),0)}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Employee Summary");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Monthly Calendar");XLSX.writeFile(wb,`LOCKWORK_${currentUser.employeeId}_${key}.xlsx`);toast("Current month Excel downloaded.")
}
async function logout(){try{if(stateUnsubscribe)stateUnsubscribe();if(html5QrCode&&isScanning)await html5QrCode.stop().catch(()=>{})}catch(e){console.error(e)}finally{clearSession();location.href="index.html"}}

async function bootstrap(){
  try{
    const session=sessionData();
    if(!session||session.role!=="employee"||!session.employeeId){clearSession();location.replace("index.html");return}
    
    const snap = await getDocs(collection(db, "employees"));
    DB.employees = snap.docs.map(d => d.data());
    
    const match=employee(session.employeeId);
    if(!match){clearSession();location.replace("index.html");return}
    currentUser=match;
    startRealtime();

    E("headerGreeting").textContent=new Date().getHours()<12?"Good Morning,":new Date().getHours()<17?"Good Afternoon,":"Good Evening,";
    E("headerName").textContent=(currentUser.name||"Employee").split(" ")[0];
    updateCalBtnText();refreshAll();startClock();updateNavIndicator(0);appReady=true;
  }catch(e){console.error(e);toast("Unable to connect to Lockwork cloud");setTimeout(()=>location.replace("index.html"),1400)}
}

window.addEventListener("resize",()=>updateNavIndicator(currentTabIndex));
window.addEventListener("beforeunload",()=>{if(html5QrCode&&isScanning)html5QrCode.stop().catch(()=>{});if(stateUnsubscribe)stateUnsubscribe()});
window.openCalPicker=openCalPicker;window.changeCalYear=changeCalYear;window.selectMonth=selectMonth;window.switchTab=switchTab;window.flipCamera=flipCamera;window.enableProfileEdit=enableProfileEdit;window.handleImageUpload=handleImageUpload;window.saveProfile=saveProfile;window.logout=logout;window.exportCurrentMonthExcel=exportCurrentMonthExcel;window.calcLeaveDays=calcLeaveDays;window.submitLeave=submitLeave;window.openLogModal=openLogModal;window.toggleTheme=toggleTheme;window.closeModal=closeModal;window.toast=toast;
bootstrap();
