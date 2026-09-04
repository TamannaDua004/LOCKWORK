const FIREBASE_CONFIG={apiKey:"AIzaSyAYDphHYxHw07hq-jBfXAiWRhJpJcqcDj8",authDomain:"lockwork-4e494.firebaseapp.com",projectId:"lockwork-4e494",storageBucket:"lockwork-4e494.firebasestorage.app",messagingSenderId:"250655916297",appId:"1:250655916297:web:ab282192517adf24bb93d8"};
const [appMod,authMod,fsMod]=await Promise.all([
  import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js"),
  import("https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js")
]);
const app=appMod.initializeApp(FIREBASE_CONFIG);
const auth=authMod.getAuth(app);
const db=fsMod.getFirestore(app);
const {setPersistence,browserLocalPersistence,onAuthStateChanged,signInWithEmailAndPassword,signOut}=authMod;
const {doc,getDoc}=fsMod;
await setPersistence(auth,browserLocalPersistence).catch(()=>{});

const SESSION_KEY="LOCKWORK_SESSION";
let mode="employee";
const $=id=>document.getElementById(id);
const normalize=v=>String(v??"").trim().toUpperCase();

function setSession(data){sessionStorage.setItem(SESSION_KEY,JSON.stringify(data))}
function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
function getSession(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null")}catch{return null}}

function setMode(next){
  mode=next;
  $("employeeMode").classList.toggle("active",mode==="employee");
  $("hrMode").classList.toggle("active",mode==="hr");
  $("identityLabel").textContent=mode==="employee"?"Employee ID":"HR Email";
  $("identity").placeholder=mode==="employee"?"EMP-26-01-2026-00001":"hr@company.com";
  $("identityIcon").className=mode==="employee"?"fa-regular fa-id-card":"fa-regular fa-envelope";
  $("identity").value="";
  $("password").value="";
  $("error").textContent="";
  $("identity").focus();
}

function togglePassword(){
  const p=$("password"),i=$("eye");
  p.type=p.type==="password"?"text":"password";
  i.className=p.type==="password"?"fa-regular fa-eye":"fa-regular fa-eye-slash";
}

function showError(message){$("error").textContent=message}

function firebaseError(e){
  const c=e?.code||"";
  if(c==="auth/invalid-credential"||c==="auth/invalid-login-credentials"||c==="auth/wrong-password")return "Invalid HR email or password.";
  if(c==="auth/user-not-found")return "HR account not found.";
  if(c==="auth/too-many-requests")return "Too many attempts. Please try again later.";
  if(c==="auth/network-request-failed")return "Network error. Check your connection.";
  if(c==="permission-denied")return "Firebase permissions denied for this login.";
  return e?.message||"Sign-in failed.";
}

async function findEmployee(employeeId){
  try {
    const snap = await getDoc(doc(db, "employees", normalize(employeeId)));
    if(snap.exists()) {
        return snap.data();
    }
  } catch(e) {
    console.error(e);
  }
  return null;
}

function go(path){window.location.replace(path)}

function routeExisting(){
  const session=getSession();
  if(!session)return;
  if(session.role==="hr"&&auth.currentUser){go("hr.html");return}
  if(session.role==="employee"&&session.employeeId&&session.employeeIdCode){go("employee.html");return}
  clearSession();
}

$("employeeMode").onclick=()=>setMode("employee");
$("hrMode").onclick=()=>setMode("hr");
$("togglePassword").onclick=togglePassword;

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const identity=$("identity").value.trim();
  const password=$("password").value;
  const btn=$("submitBtn");
  
  showError("");
  if(!identity||!password){showError("Enter your identifier and password.");return}
  
  btn.disabled=true;
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';
  
  try{
    await signOut(auth).catch(()=>{});
    clearSession();
    
    if(mode==="hr"){
      const cred=await signInWithEmailAndPassword(auth,identity,password);
      setSession({role:"hr",uid:cred.user.uid,email:cred.user.email||identity,loginAt:Date.now()});
      go("hr.html");
      return;
    }
    
    const employee=await findEmployee(identity);
    if(!employee){showError("Employee ID not found.");return}
    if(String(employee.status||"").toLowerCase()==="inactive"){showError("This employee account is inactive.");return}
    if(String(employee.password??"")!==String(password)){showError("Invalid employee ID or password.");return}
    
    setSession({
      role:"employee",
      employeeId:employee.employeeId,
      employeeIdCode:employee.employeeId,
      name:employee.name||"",
      email:employee.email||"",
      loginAt:Date.now()
    });
    
    go("employee.html");
  }catch(err){
    console.error(err);
    showError(mode==="hr"?firebaseError(err):"Unable to load employee records. Check your connection and Firebase rules.");
    await signOut(auth).catch(()=>{});
    clearSession();
  }finally{
    btn.disabled=false;
    btn.innerHTML='<i class="fa-solid fa-arrow-right-to-bracket"></i> Continue';
  }
});

onAuthStateChanged(auth,user=>{
  const session=getSession();
  if(user&&session?.role==="hr"){go("hr.html");return}
  if(!user&&session?.role==="hr")clearSession();
});

routeExisting();
