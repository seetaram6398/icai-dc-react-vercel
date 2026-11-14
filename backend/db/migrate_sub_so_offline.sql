-- Register the Sub SO role in the user-type master.
IF NOT EXISTS (SELECT 1 FROM tbl_UserTypes WHERE UserTypeID = 14)
BEGIN
  SET IDENTITY_INSERT tbl_UserTypes ON;
  INSERT INTO tbl_UserTypes (UserTypeID, UserTypeName, UserAbb)
  VALUES (14, 'Sub SO', '014');
  SET IDENTITY_INSERT tbl_UserTypes OFF;
END

-- Offline complaints filed by a Sub SO (UserType 14) on behalf of a complainant.
-- The complaint is immediately forwarded to the SO for scrutiny (status 2); this
-- history row lets the complainant see that the case was submitted offline.
IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 134)
BEGIN
  INSERT INTO tbl_StatusMaster
    (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
  VALUES
    (134, 'Offline Complaint Submitted by Sub SO', 134, 'Under Scrutiny', NULL, NULL, NULL, '5', 'Offline Complaint Submitted by Sub SO');
END
