# ICAI Disciplinary Directorate — Automation (React + Node.js)

Re-implementation of the ICAI DC Automation portal (originally ASP.NET WebForms) using **React (Vite) + Node.js (Express)** while reusing the existing **SQL Server** database, `ICAI_COMPLAINT`.

- **Frontend:** `http://localhost:5173` (Vite dev server, proxies `/api` to backend)
- **Backend  :** `http://localhost:5000` (Express REST API)

---

## 1. Architecture

```
icai-dc-react/
├── backend/                  # Node.js + Express REST API
│   ├── .env                  # Configuration (DB, email, port, JWT)
│   ├── package.json
│   └── src/
│       ├── server.js         # Express entry point (port 5000)
│       ├── config/db.js      # msnodesqlv8 SQL Server connection layer
│       ├── services/
│       │   ├── auth.js       # JWT sign/verify + middleware
│       │   └── mailer.js     # nodemailer SMTP (Gmail)
│       └── routes/
│           ├── auth.js       # OTP login, register, /me
│           ├── masters.js    # dropdown master data (cases 1–32)
│           ├── complaints.js # list/detail/create/status change
│           ├── dashboard.js  # status-wise complaint summary + BOD view
│           ├── agenda.js     # agenda list + generate
│           ├── hearings.js   # cause list CRUD + party preferences
│           ├── reports.js    # ageing, stage bifurcation, status monitor
│           ├── upload.js     # multer file upload (Documents/)
│           └── masterData.js # board formation CRUD
└── frontend/                 # React 18 + Vite 5
    ├── package.json
    ├── vite.config.js        # port 5173, proxy /api → 5000
    └── src/
        ├── App.jsx           # routes / auth guard
        ├── api/client.js     # axios instance (+ JWT header, 401 redirect)
        ├── context/AuthContext.jsx
        ├── layouts/Layout.jsx
        └── pages/            # Login, Register, Dashboard, BOD Dashboard,
                              # ComplaintList/Detail/File, AgendaList/Generate,
                              # HearingList/Form, ReportsAgeing/Stage/ComplaintStatus,
                              # BoardManagement, MasterData
```

---

## 2. Prerequisites

| Tool | Version used | Notes |
|------|-------------|-------|
| Node.js | v25.8.2 (any 18+ works) | Download from nodejs.org |
| npm | 11.x | Ships with Node |
| SQL Server 2019 Express | `DESKTOP-CRTSJHO\SQLEXPRESS` | Existing instance |
| ODBC Driver 17 for SQL Server | Installed | Needed by `msnodesqlv8` |
| Database | `ICAI_COMPLAINT` | Already exists; **do not modify structure** |

---

## 3. First-time Setup

### 3.1 Backend

```bash
cd icai-dc-react/backend
npm install
```

Create `backend/.env` (already present) and adjust as needed:

```env
PORT=5000
JWT_SECRET=ICAI_DC_JWT_SECRET_2026_CHANGE_ME

# SQL Server — matches original Web.config (Integrated Security)
DB_SERVER=DESKTOP-CRTSJHO\SQLEXPRESS
DB_DATABASE=ICAI_COMPLAINT
DB_USER=
DB_PASSWORD=
DB_TRUSTED_CONNECTION=true          # true = Windows (integrated) auth
FIXED_SO_EMAIL=                     # DC Flow: fixed SO for auto-assignment (empty = least-loaded SO)

# Gmail SMTP for OTP delivery — replace with real credentials
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tinfotechagra@gmail.com
EMAIL_PASS=
EMAIL_FROM=tinfotechagra@gmail.com

CLIENT_URL=http://localhost:5173
```

> **DB auth modes**
> - `DB_TRUSTED_CONNECTION=true` → connects as the logged-in Windows user (`DESKTOP-CRTSJHO\Transoft`). This mirrors the original app and needs **no credentials**.
> - `DB_TRUSTED_CONNECTION=false` → SQL login, e.g. `DB_USER=icai_dc` and `DB_PASSWORD=Icai@2026DC`. This requires SQL Server **mixed-mode** authentication to be enabled (server restart needed).

### 3.2 Frontend

```bash
cd icai-dc-react/frontend
npm install
```

---

## 4. Running the Project

Open **two terminals**.

### Terminal 1 — Backend

```bash
cd icai-dc-react/backend
npm start            # or: npm run dev  (auto-restart on change)
```

Expected output: `ICAI DC Backend listening on port 5000`

Verify health:

```bash
curl http://localhost:5000/api/health
# → {"status":"ok","db":"connected"}
```

### Terminal 2 — Frontend

```bash
cd icai-dc-react/frontend
npm run dev
```

Open **http://localhost:5173** in a browser.

---

## 5. Logging In / Test Accounts

Login uses **Email OTP** (real email + JWT). No password.

1. Open http://localhost:5173 → **Sign in**.

2. Enter the email of an existing user in `tbl_Users`.

3. A 6-digit OTP is sent to that email (stored in the `OTP` column of `tbl_Users`).

4. Enter the OTP → JWT issued and stored in `localStorage`.

Test users found in the database:

| Email | Name | UserType | Role |
|-------|------|----------|------|
| himanshu.chahar@idiary.in | Himanshu | 6 | BOD (Board member) |
| *query `tbl_Users` for more* | | 4/5/6/7/11 | DD / SO / Officer / CAE |
| (self-registered) | | 1 | Complainant |

Role → permission mapping (used by the sidebar):

| UserType | Role |
|----------|------|
| 1 | Complainant (file/view complaints) |
| 2 | ICAI Member |
| 3 | Non-member |
| 4 | DD (agenda, hearings, boards, reports) |
| 5 | SO (worklist, agenda, hearings) |
| 6 | BOD (everything + master data + BOD dashboard) |
| 7 | Officer |
| 8 | Regulator |
| 11 | CAE |

> If email sending is not configured, you can still log in by reading the OTP directly from the DB (see §7) and entering it manually.

---

## 6. API Endpoints

All endpoints except `/api/auth/*` and `/api/health` require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (`db: connected`) |
| POST | `/api/auth/request-otp` | Body `{email}` → sends OTP |
| POST | `/api/auth/verify-otp` | Body `{email, otp}` → returns `{token, user}` |
| POST | `/api/auth/register` | Create complainant account (body: name, email, mobile, …) |
| POST | `/api/auth/verify-registration` | Body `{email, otp}` → activate + token |
| GET | `/api/auth/me` | Current logged-in user |
| GET | `/api/masters/:type` | Dropdown data; `?option1=...` for dependent lists |
| GET | `/api/dashboard` | Status-wise counts (Pending / About-to-Expire / Expired) |
| GET | `/api/dashboard/bod` | BOD agenda-status summary |
| GET | `/api/complaints` | List complaints; `?statusIds=2,3,4`, `?assignedTo=id` |
| GET | `/api/complaints/:id` | Full complaint detail + documents + history |
| POST | `/api/complaints` | File a new complaint |
| POST | `/api/complaints/:id/status` | Change status (writes audit trail) |
| GET | `/api/agenda` | Agenda list; `?statusId=`, `?meetingNo=` |
| POST | `/api/agenda` | Generate agenda from selected complaints |
| GET | `/api/hearings` | Cause-list hearings; `?compId=`, `?type=punishment` |
| POST | `/api/hearings` | Schedule a hearing |
| POST | `/api/hearings/:id/preference` | Party accepts/chooses online-offline |
| GET | `/api/reports/ageing` | Ageing analysis; `?base=registration\|actionable\|nonactionable\|referring` |
| GET | `/api/reports/stage-bifurcation` | Pipeline by stage; `?view=stages\|formType` |
| GET | `/api/reports/complaint-status` | Status monitor; `?sid=&type=1\|2\|3` |
| POST | `/api/upload` | Multipart `file` + `type` (folder) → `Documents/` |
| GET | `/api/master-data/boards` | List board formations |
| POST | `/api/master-data/boards` | Create board + user |

**Master types** (for `/api/masters/:type`): `1` academic session, `2` complaint type, `3` states, `4` payment modes, `5` documents, `6` users by type, `7` cities, `8` schedules, `9` schedule items, `10` part numbers, `12` complaint statuses, `13` council years, `14` board formations, `20` adjournment reasons, etc.

---

## 7. Accessing the Database

### 7.1 Connection details (same as original app)

| Property | Value |
|----------|-------|
| Server | `DESKTOP-CRTSJHO\SQLEXPRESS` (SQL Server 2019 Express) |
| Database | `ICAI_COMPLAINT` |
| Auth (original) | Windows Integrated (`Integrated Security=True`) |
| Auth (SQL login, optional) | `icai_dc` / `Icai@2026DC` (needs mixed-mode) |

### 7.2 Connect using SSMS

1. Open **SQL Server Management Studio**.
2. **Server name:** `DESKTOP-CRTSJHO\SQLEXPRESS`
3. **Authentication:** *Windows Authentication* (uses your `Transoft` login).
4. **Connect** → expand **Databases → ICAI_COMPLAINT**.
5. Run queries, e.g.:

```sql
-- list all users
SELECT UserID, LoginID, NameOfTheUser, Email, UserType, IsVerify, IsDeactivated, OTP
FROM tbl_Users;

-- list complaints
SELECT CompID, CompNo, ResName, StatusID, EntryDate
FROM vw_NewComplaint;
```

### 7.3 Connect using `sqlcmd`

```bash
# Windows auth
sqlcmd -S "DESKTOP-CRTSJHO\SQLEXPRESS" -E -d ICAI_COMPLAINT -Q "SELECT COUNT(*) FROM tbl_Users"

# SQL login (only when mixed-mode is enabled)
sqlcmd -S "DESKTOP-CRTSJHO\SQLEXPRESS" -U icai_dc -P "Icai@2026DC" -d ICAI_COMPLAINT -Q "SELECT 1"
```

### 7.4 Find an OTP to log in without email

```sql
SELECT Email, OTP FROM tbl_Users WHERE OTP IS NOT NULL;
```

Use the displayed OTP on the login screen.

### 7.5 Key tables

| Table | Purpose |
|-------|---------|
| `tbl_Users` | Users, roles (`UserType`), OTP |
| `tbl_NewComplaint` | Complaints |
| `vw_NewComplaint` | Complaint view (with computed complaint no.) |
| `tbl_ComplaintStatus` | Status history / audit trail |
| `tbl_StatusMaster` | Status codes, `MaxDays`, `CumulativeDays`, `UserTypeSO` |
| `tbl_CompType` | Complaint types |
| `tbl_StateMaster` / `tbl_CityMaster` | Locations |
| `tbl_Ajenda` | Agenda items |
| `tbl_CauseList` | Hearings |
| `tbl_BoardFormation` | Boards |
| `tbl_ComplaintDocument`, `tbl_FactPersons`, `tbl_AnswerableMember`, `tbl_AudioVideoAttachment`, `tbl_ScheduleList` | Complaint attachments/details |

---

## 8. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `/api/health` returns `db: disconnected` | ODBC Driver 17 not installed; or `DB_SERVER`/`DB_DATABASE` wrong in `.env`; or service stopped (`net start MSSQL$SQLEXPRESS`) |
| `Login failed for user 'icai_dc'` | Server is in **Windows-only** auth mode. Either keep `DB_TRUSTED_CONNECTION=true`, or enable mixed-mode and restart the SQL service |
| OTP email not received | `EMAIL_PASS` empty. For Gmail use an **App Password**, or read OTP from `tbl_Users.OTP` |
| CORS errors on frontend | Backend not running, or `CLIENT_URL` in `.env` ≠ the port Vite uses |
| Port already in use | `PORT=5000` taken → change in `.env`; Vite port → change in `frontend/vite.config.js` |
| Upload path | Files go to `icai-dc-react/Documents/<Type>/` and are served at `/documents` |

**Report issues / docs repo:** https://github.com/anomalyco/opencode/issues