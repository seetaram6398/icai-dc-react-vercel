# Implementation Plan for All Requested Changes

## 1. DD End - Show clubbing relationships
- Show which complaint is clubbed with which (complaint numbers). Already have ClubbedWithCompID but need clearer display.
- If complaint is already clubbed/closure, cannot club another with it (already handled in logic).
- In mark similar window also clubbing/closure cases should not appear (already added filters).
- DD label should show which complaint clubbed/closure with which.
- Should be able to click and view details of all complaints clubbed with one complaint.

Backend: Add endpoint to get all complaints where ClubbedWithCompID = :id (done partially - added /:id/clubbed-list).
Frontend: In ComplaintDetail for DD view, fetch and display clubbed complaints list with clickable links.

## 2. SO Label - Final communication for clubbing case
- After clubbing, when final communication option comes, SO should communicate only that complaint in clubbing case.
- For final communication, open an editor prefilled with 'From' auto-filled, allow changing only middle.
- Currently uses RichEditor for remarks - need to customize.

## 3. Complainant end withdrawal form
- Add as submenu under 'View Complaint' in sidebar for complainant (ut===3)
- When opening, enter complaint number field, after entering and processing show complaint details and then attach withdrawal form
- In clubbing/closure cases withdrawal should not open
- First complaint should show numbers of new clubbed complaints (those clubbed/closure with it), other info not visible

Need to create a new page/component for withdrawal by complaint number lookup for complainant.

## 4. First complaint showing clubbed complaints
- Original/first complaint should show numbers of new clubbed complaints
- Other info not visible in that specific context

Let us look up how the flow works more precisely.
