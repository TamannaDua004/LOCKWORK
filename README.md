<div align="center">
  
# 🏢 LOCKWORK Workforce System
  
### <a href="https://ggggg.vercel.app">🚀 LIVE PROJECT DEMO: ggggg.vercel.app 🚀</a>

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5"/>
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

*A real-time, Neo-Brutalist HR and Employee Management System featuring Dual-Portal Access, Geofenced QR Tracking, and Live Firebase Synchronization.*

</div>

---

> [!NOTE]  
> **About The UI/UX**  
> Lockwork utilizes a distinct **Neo-Brutalist design language**. Expect heavy black outlines, sharp shadow offsets, flat vibrant candy colors, and smooth micro-interactions (spring-physics active states, expanding modals, and scan-line animations) built entirely in vanilla CSS3.

---

## ✨ System Features

Lockwork operates as a dual-sided ecosystem. The application automatically routes users to their respective portals based on their login credentials.

### 👨‍💼 HR Portal (Desktop Optimized)
> [!IMPORTANT]  
> The command center for administrators and HR managers.
* **🔴 Live Dashboard Metrics:** Real-time counters for active workforce, present employees, employees on leave, and pending leave requests.
* **🟢 Employee Lifecycle Management:** Full CRUD capabilities. Automatically generates formatted Employee IDs (e.g., `<kbd>EMP-26-01-2026-00001</kbd>`).
* **🟡 30-Day Recovery Bin:** Accidental deletions aren't permanent. Restores employees alongside their historical attendance and leave data.
* **🔵 Dynamic Geofencing QR:** Generates secure attendance QR codes embedded with precise Office GPS coordinates (Latitude/Longitude) and allowed radius margins.
* **🟣 Attendance Grid & Analytics:** Full calendar visualization. Tracks Present, Half-Day, Late, and Absent statuses. Analyzes GPS distance deltas. 
* **🟢 One-Click Excel Export:** Generates robust `.xlsx` timesheets for payroll via SheetJS.

### 👩‍💻 Employee Portal (PWA / Mobile-First)
> [!TIP]  
> A mobile-optimized web app for daily staff operations. Includes a seamless Dark/Light mode toggle.
* **📱 Secure QR Scanner (`html5-qrcode`):** Employees scan the HR's daily QR code. The app cross-references the employee's live browser GPS location with the QR's embedded coordinates to prevent remote check-ins.
* **🗓️ Automated Log Calendar:** Visual calendar dynamically rendering Rest Days (Weekends), Approved Leaves, Half-Days, and Future/Pre-joining dates.
* **🏖️ Self-Service Leave:** Apply for leaves with automated day calculations. Real-time status updates (Pending, Approved, Rejected).
* **👤 Live Profile Management:** Upload and auto-compress avatar images, update contact details, and change passwords.

---

## 🗄️ Database Architecture (ER Diagram)

Lockwork uses Firebase Firestore (NoSQL). The data is flattened for maximum read efficiency and real-time snapshot listener performance.

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
