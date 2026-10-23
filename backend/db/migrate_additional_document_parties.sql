-- Multi-party additional documents.
--
-- An additional document called for at the registration stage (status 51) can be
-- asked from the Complainant, the Respondent and/or the Third Party (the
-- answerable members) - any combination of them.  The case waits at status 51
-- until every one of them has furnished the document.
--
-- The submission is recorded on a status row of its own for the party that has
-- furnished it, so the history shows who has submitted what:
--   52 - Additional documents submitted by the Complainant   (already exists)
--   131 - Additional documents submitted by the Respondent
--   132 - Additional documents submitted by the Third Party / Answerable Member

INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, CumulativeDays, UserTypeSO)
SELECT 131, 'Additional documents submitted by the Respondent', 131, 'Under Scrutiny', 45, '5,7'
WHERE NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 131);

INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, CumulativeDays, UserTypeSO)
SELECT 132, 'Additional documents submitted by the Third Party', 132, 'Under Scrutiny', 45, '5,7'
WHERE NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 132);
