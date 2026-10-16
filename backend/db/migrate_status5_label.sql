-- Status 5 is the "recommendation to the Director Discipline" stage for every
-- recommendation type (Registration, Clubbing before Director/Committee,
-- Closure before Committee). Its old name "Clubbing Recommendation to DD" made
-- a Registration recommendation display as a clubbing status. Rename it to a
-- neutral label that covers all recommendation types.
UPDATE tbl_StatusMaster
SET StatusName = 'Recommendation to Director Discipline'
WHERE StatusID = 5;

-- Remove the Rule references from the workflow status names so they are not
-- shown to users as status labels.
UPDATE tbl_StatusMaster SET StatusName = 'Placed before Board of Discipline or Committee for clubbing decision' WHERE StatusID = 125;
UPDATE tbl_StatusMaster SET StatusName = 'Placed before Board of Discipline for closure' WHERE StatusID = 126;
UPDATE tbl_StatusMaster SET StatusName = 'Letter of withdrawal received' WHERE StatusID = 127;
UPDATE tbl_StatusMaster SET StatusName = 'Withdrawal placed before the Board of Discipline' WHERE StatusID = 128;
UPDATE tbl_StatusMaster SET StatusName = 'Withdrawal placed before the Committee' WHERE StatusID = 129;
UPDATE tbl_StatusMaster SET StatusName = 'Withdrawal permitted' WHERE StatusID = 130;
