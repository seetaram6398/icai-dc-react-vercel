# ICAI Disciplinary Directorate — User Guide

Practical handbook for using the **ICAI-DC-Automation** portal (React + Node.js). Covers starting the project and every screen/flow by role. For install/setup/API details see [README.md](README.md).

---

## 1. What This Is

A re-implementation of the ICAI Disciplinary Directorate (DC) automation portal on the existing **SQL Server** database (`ICAI_COMPLAINT`).

| Component | URL | Purpose |
|-----------|-----|---------|
| Frontend (Vite) | `http://localhost:5173` | Browser UI (proxies `/api` to backend) |
| Backend (Express) | `http://localhost:5000` | REST API + file uploads |
| Database | `DESKTOP-CRTSJHO\SQLEXPRESS` / `ICAI_COMPLAINT` | All data (unchanged schema) |

---

## 2. Starting the Project

Open **two terminals**:

### Terminal 1 — Backend
```bash
cd icai-dc-react/backend
npm start
```
You should see: `ICAI DC Backend listening on port 5000`

### Terminal 2 — Frontend
```bash
cd icai-dc-react/frontend
npm run dev
```

Then open **http://localhost:5173** in a browser.

**Health check** (any terminal):
```bash
curl http://localhost:5173/api/health
# → {"status":"ok","db":"connected"}
```

> Both servers must be running at the same time. If you see connection errors on the UI, check this first.

---

## 3. Logging In (OTP — no password)

1. Open http://localhost:5173 → **Sign in**.
2. Enter the **email** of an existing user (stored in the `Email` column of `tbl_Users`).
3. A 6-digit OTP is sent to that email. If email sending is not configured, read the OTP from the DB:
   ```sql
   SELECT Email, OTP FROM tbl_Users WHERE OTP IS NOT NULL;
   ```
4. Enter the OTP → you are logged in with a JWT (kept in `localStorage`).

**Registration** (new complainant): click **Register**, fill name/email/mobile, verify the OTP, and you get a complainant account (`UserType 3`).

### Roles (UserType → permissions)

| UserType | Role | Can do |
|----------|------|--------|
| 1–3 | Complainant / ICAI Member / Non-member | File complaints, view own complaints |
| 4 | DD | Dashboard, complaints, agenda, hearings, reports |
| 5 | SO (Section Officer) | Dashboard, complaints, agenda, hearings |
| 6 | BOD (Board member) | Everything + BOD dashboard + boards + master data |
| 7 / 8 / 11 | Officer / Regulator / CAE | Dashboard, complaints, hearings |

The sidebar shows only the menus allowed for your role.

---

## 4. Screen-by-Screen Guide

### 4.1 Dashboard (all roles except complainant-only)
- Shows a table of **every complaint status** with three numbers per status:
  - **Pending** — inside allowed SLA days.
  - **About to Expire** — close to the SLA limit.
  - **Expired** — SLA breached.
- Clicking a status row opens the complaint list filtered to that status.
- **BOD Dashboard** (BOD only): agenda-oriented summary — how many complaints are pending, scheduled, or to-be-scheduled for the board.

### 4.2 File a Complaint (complainants 1–3)
1. Open **File Complaint**.
2. Enter complainant details, select **Complaint Type** (e.g. *Central Government*, *State Government*, *Regulator*), state/city, and payment mode.
3. Fill the **respondent** details (name, mobile, address, state/city, whether known).
4. Attach documents (optional). Use type buttons that match the document role:
   - Aadhar, Photo, Signature, Brief, Misconduct, Investigating Report, Other.
5. Submit. The system **auto-generates the complaint number** and shows it, e.g. `PR/014/2026` (non-gov) or `PR/G/013/2026` (gov). The complaint is registered with status **COMPLAINT RECEIVED** and an audit-trail entry is written.

### 4.3 Complaint List & Detail (all roles)
- **List** shows complaint number, respondent, date, current status, complainant, and days since entry. Use the status / assigned-to filters to focus a worklist.
- **Detail** shows the full record plus:
  - Documents, fact persons, answerable members, audio/video attachments, schedules.
  - **Status history** (audit trail) — every status change with date, by whom, and remarks.
- Move a complaint to the next stage via **Change Status** (e.g. *Received → Scrutiny*). Enter remarks; the change is recorded in the audit trail.

### 4.4 Agenda (DD / SO / BOD)
- **Agenda List** — pending and processed agenda items (date, meeting number, complaint, approval flags).
- **Generate Agenda** — select complaints (e.g. those in status *Actionable*), pick a date/time/place, and generate a meeting agenda. A **meeting number** is assigned.
- **Approve** — secretary/BOD approves items; the approval status is stored on the agenda (`SecretaryApprove` / `IsApproved`).

### 4.5 Hearings (DD / SO / BOD)
- **Hearing List** — scheduled cause-list hearings with complaint, date/time, place, and whether each party accepted and chose online/offline.
- **Schedule Hearing** — pick a complaint and set date, time, place, URL, and details.
- **Party preference** — complainant/respondent accepts or declines and chooses **online** or **offline**.
- **Adjourn** — request an adjournment with a reason; the hearing is flagged `IsAdjour`.
- **Witnesses** — add witnesses to a hearing (complainant/respondent side).
- **Bench attendance** (BOD) — mark which board members are present.

### 4.6 Reports (DD / BOD)
- **Ageing** — how long complaints have waited in each status, in buckets: 0–6m, 6–12m, 1–2y, 2–3y, >3y. Switch base via the dropdown: *registration*, *actionable*, *non-actionable*, *referring*.
- **Stage Bifurcation** — pipeline count per status. Two views:
  - **Stages** — total complaints per stage.
  - **Form Type** — split into amount-type categories for each stage.
- **Complaint Status Monitor** — pick a status and a bucket (within SLA / near SLA / over SLA) to list matching complaints.

### 4.7 Board Management (BOD)
- **List** all board formations (year, name, region, type).
- **Create Board** — year, name, region, type. A contact **user is auto-created** and linked to the board. Creation is rejected if the same year+region+type already exists.
- **Add Member** — member name, email, mobile, designation, editor flag. The one member marked **Can Edit** is the designated editor; other members are set to editor-off.

### 4.8 Master Data (BOD)
- Browse dropdown/master reference data used by the forms: academic sessions, complaint types, states, cities, payment modes, documents, users by type, schedules, part numbers, complaint statuses, council years, boards, adjournment reasons, and decision masters.

---

## 5. Files & Uploads

- Uploads are saved under `icai-dc-react/Documents/<Type>/` and served at `/documents`.
- Folder mapping: `brief` → `Brief`, `photo` → `ComplaintantPhoto`, `aadhar` → `Aadhar`, `audiovideo` → `AudioVideo`, etc.

---

## 6. Common Troubleshooting

| Symptom | Fix |
|---------|-----|
| UI shows network/CORS errors | Both servers running? Check `curl http://localhost:5173/api/health` |
| "Login failed for user 'icai_dc'" | Not needed — uses Windows auth. Keep `.env` `DB_TRUSTED_CONNECTION=true` |
| No OTP email received | `EMAIL_PASS` empty in `backend/.env`. Read OTP from `tbl_Users.OTP`, or set a Gmail App Password |
| Health says `db: disconnected` | SQL Express service running (`net start MSSQL$SQLEXPRESS`)? ODBC Driver 17 installed? |
| Invalid complaint number format | Numbers auto-generate as `PR/<seq>/<year>` or `PR/G/<seq>/<year>`; don't type them |
| Status change not showing | Check the **Status History** tab on the detail page; every change is an audit-trail row |

---

## 7. Quick DB Reference

```bash
sqlcmd -S "DESKTOP-CRTSJHO\SQLEXPRESS" -E -d ICAI_COMPLAINT -Q "SELECT COUNT(*) FROM tbl_Users"
```

Key tables: `tbl_Users`, `tbl_NewComplaint`, `tbl_ComplaintStatus` (audit), `tbl_StatusMaster`, `tbl_CompType`, `tbl_Ajenda`, `tbl_CauseList`, `tbl_BoardFormation`, `tbl_BoardMembers`, `tbl_Witness`, `tbl_AdjournmentResponse`.