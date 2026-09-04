<div align="center">

# ⬛ LOCKWORK ⬛
**WORKFORCE SYSTEM**

<br>

<a href="https://lockwork-pi.vercel.app/">
  <img src="https://img.shields.io/badge/▶_CLICK_ME_FOR_LIVE_PROJECT_◀-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="CLICK ME BUTTON" height="40"/>
</a>

<br><br>

<!-- LIVE BRUTALIST ANIMATION -->
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=900&size=20&pause=1500&color=000000&background=55EFC4&center=true&vCenter=true&width=500&lines=HR+COMMAND+CENTER;EMPLOYEE+APP+(PWA);GEO-FENCED+QR+ATTENDANCE;REAL-TIME+CLOUD+SYNC" alt="Live Animation" border="3" />

<br><br>

*Zero fluff. Maximum utility. A brutally minimalist ecosystem for attendance, people, and leave operations.*

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5"/>
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

</div>

---

## 🗂️ THE STACK

No frameworks. No build steps. No `npm install` bloat. Pure DOM manipulation and real-time NoSQL synchronization styled with harsh lines, high contrast, and raw geometry using native ES Modules via CDN.

---

## ⚙️ CORE MODULES

> [!IMPORTANT]  
> **🟪 HR COMMAND CENTER (DESKTOP)**  
> *The central nervous system for administrators.*  
> * **Live Telemetry:** Real-time counters for active staff, leaves, and pending approvals.  
> * **ID Generation:** Auto-sequenced employee IDs (e.g., `<kbd>EMP-26-01-2026-00001</kbd>`).  
> * **Recovery Bin:** 30-day retention for deleted staff records.  
> * **Data Export:** Single-click `.xlsx` payroll and calendar generation via SheetJS.

> [!TIP]  
> **🟩 EMPLOYEE TERMINAL (MOBILE PWA)**  
> *A mobile-optimized web app for daily staff operations.*  
> * **Dark/Light Mode:** Seamless toggle for user preference.  
> * **Automated Logs:** Visual calendar dynamically rendering Rest Days, Half-Days, and Leaves.  
> * **Self-Service:** Request leave, check balances, and update passwords/avatars instantly.  

> [!CAUTION]  
> **🟥 GPS-FENCED QR ATTENDANCE**  
> *Cryptographically secure physical verification.*  
> * HR sets the office target coordinates (Lat/Lng) and allowed radius (e.g., 50 meters).
> * The Employee App utilizes the native Geolocation API to verify physical distance *before* authorizing the `html5-qrcode` camera scan. Remote or spoofed check-ins are blocked at the client level.

---

## 📐 DATABASE TOPOLOGY

Flat NoSQL document architecture designed for zero-latency snapshot listeners in Firebase Firestore.

```mermaid
erDiagram
    EMPLOYEES {
        string id PK "UUID"
        string employeeId "e.g. EMP-26-01-2026-00001"
        string name
        string email
        string phone
        string role
        string dept
        string password
        int leaveAssigned
        int leaveRemaining
        int salary
        string status "Present, Late, On Leave, Absent"
        string img "Base64 Avatar"
    }

    ATTENDANCE {
        string id PK "UUID"
        string empId FK "References EMPLOYEES.employeeId"
        string date "YYYY-MM-DD"
        string in "Check-in time (e.g., 09:00 AM)"
        string out "Check-out time"
        float hours "Calculated duration"
        string status
        boolean verified "True if via QR"
        float lat "Scanned Latitude"
        float lng "Scanned Longitude"
        float distance "Delta from office"
    }

    LEAVES {
        string id PK "UUID"
        string empId FK "References EMPLOYEES.employeeId"
        string type "Casual Leave, Sick Leave, etc."
        string from "YYYY-MM-DD"
        string to "YYYY-MM-DD"
        int days
        string purpose
        string status "Pending, Approved, Rejected"
    }

    SETTINGS {
        string id PK "location"
        string name "Office Name"
        float lat "Target Latitude"
        float lng "Target Longitude"
        int radius "Allowed check-in radius (meters)"
    }

    RECOVERY {
        string id PK "References EMPLOYEES.employeeId"
        map employee "Full employee object backup"
        timestamp deletedAt
    }

    EMPLOYEES ||--o{ ATTENDANCE : "generates logs"
    EMPLOYEES ||--o{ LEAVES : "submits requests"
    EMPLOYEES |o--o| RECOVERY : "moves to on delete"
    SETTINGS ||--o{ ATTENDANCE : "validates GPS distance for"
