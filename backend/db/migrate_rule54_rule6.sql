-- Rule 5(4)(a)/(b)/(c) clubbing and Rule 6 withdrawal
-- 1. Link a new complaint to the previous complaint it is clubbed with / compared against.
IF COL_LENGTH('tbl_NewComplaint', 'ClubbedWithCompID') IS NULL
  ALTER TABLE tbl_NewComplaint ADD ClubbedWithCompID INT NULL;
IF COL_LENGTH('tbl_NewComplaint', 'ClubRule') IS NULL
  ALTER TABLE tbl_NewComplaint ADD ClubRule VARCHAR(1) NULL;

-- 2. New workflow statuses (existing master goes up to 124).
IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 125)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES
  (125, 'Placed before Board of Discipline or Committee for clubbing decision - Rule 5(4)(b)', 125);

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 126)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES
  (126, 'Placed before Board of Discipline for closure - Rule 5(4)(c)', 126);

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 127)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES
  (127, 'Letter of withdrawal received - Rule 6', 127);

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 128)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES
  (128, 'Withdrawal placed before the Board of Discipline - Rule 6', 128);

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 129)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES
  (129, 'Withdrawal placed before the Committee - Rule 6', 129);

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 130)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES
  (130, 'Withdrawal permitted - Rule 6', 130);
