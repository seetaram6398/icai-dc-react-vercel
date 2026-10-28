# Plan for Implementing All Requested Changes

## Problem statement summary
Multiple changes requested across different roles (DD, SO, Complainant end):
1. At DD end: show which complaint is clubbed with which complaint (show complaint numbers). Already if complaint is clubbed/closure, cannot club another complaint with it. In mark similar window also clubbing/closure cases should not appear for marking similar. At DD label show which complaint is clubbed/closure with which complaint. Should be able to click and view details of all complaints clubbed with one complaint.
2. At SO label: after clubbing, when final communication option comes, SO should communicate only that complaint in clubbing case. For final communication, open an editor prefilled with 'From' auto-filled, allow changing only middle. 
3. Complainant end withdrawal form: add as submenu under 'View Complaint' in sidebar - when opening, enter complaint number field, after entering and processing show complaint details and then attach withdrawal form. In clubbing/closure cases withdrawal should not open. 
4. First complaint (original) should show numbers of new clubbed complaints (those clubbed/closure with it), other info not visible.

## Files to modify

### Frontend

**ComplaintDetail.jsx (large file)**
- DD end display: need to show clubbing info clearly - show which complaint clubbed with which (already shows ClubbedWithCompID but need better display). Also need to show list of complaints clubbed TO this one? Or track reverse relationships. Need to understand schema - ClubbedWithCompID points to the "previous" complaint it was clubbed with. So from a complaint, if ClubbedWithCompID is set, it means this complaint was clubbed WITH ClubbedWithCompID (previous). Also need to see all complaints that have ClubbedWithCompID pointing to current complaint? 
- Mark similar candidates: already filter by status includes closure/clubbing related statuses (13,14,66,68,69,123) and if has ClubbedWithCompID. Also need to ensure clubbing/closure cases not shown. Done partially.
- SO communication (status 66): currently sends to all parties. Requirement says "only complaint ko wo communication krega clubbing k case main" - maybe in clubbing case, communicate differently? Or "only that complaint" - need to understand exact meaning.
- SO communication form: add editor with From prefilled, allow editing middle only. Currently uses RichEditor for remarks. Need custom editor or modify.
- DD label/view: show clubbing relationships more clearly. Add ability to click and view all clubbed complaints. Maybe show in DD panel.
- Withdrawal: prevent withdrawal if clubbing/closure case. Already logic exists but need to ensure.
- First complaint showing clubbed complaints numbers.

**Layout.jsx**
- Add withdrawal submenu under View Complaints for complainant (ut===3)?

**ComplaintList.jsx / routes**
- May need endpoints for clubbing relationships.

**New page/component?**
- Maybe add "Withdrawal Update" page/component for complainant to enter complaint number and update withdrawal.

### Backend
**complaints.js**
- Need endpoints to find all complaints clubbed with a given complaint (reverse lookup). Currently only stores ClubbedWithCompID on the clubbed complaint pointing to previous.
- Need to prevent clubbing if already clubbed/closure.
- Handle withdrawal restrictions.
- Handle similar candidates filtering better.

Let us look up schema more - how to find all complaints clubbed with complaint X? We need to query WHERE ClubbedWithCompID = X.
