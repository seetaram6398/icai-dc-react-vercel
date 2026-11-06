-- Assign the examination stage to the Vetting Officer before the examining
-- officer is selected. Used by the registration flow after the rejoinder is
-- submitted (Status 23 -> 133 -> 53).
IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 133)
BEGIN
  INSERT INTO tbl_StatusMaster
    (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
  VALUES
    (133, 'Assigned to Vetting Officer for Examination', 133, NULL, NULL, NULL, NULL, '5,13', 'Assigned to Vetting Officer for Examination');
END
