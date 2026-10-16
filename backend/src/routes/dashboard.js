const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

// Shared FROM clause. Mirrors the complaint list (complaints.js buildListQuery):
// deduplicates by CompNo keeping the latest record, so dashboard counts always
// match the Complaint Register. Statuses with no complaints are still shown.
const DASHBOARD_FROM = `
  SELECT sm.StatusID, sm.StatusName, sm.DisplayOrder, sm.MaxDays, sm.CumulativeDays,
         sm.UserTypeDD, sm.UserTypeSO, sm.SubStatus, nc.EntryDate, nc.CompID,
         nc.CompType, nc.IsFirm
  FROM tbl_StatusMaster sm
  LEFT JOIN (
    SELECT nc.CompID, nc.CompNo, nc.StatusID, nc.EntryDate, nc.CompType, nc.IsFirm,
      ROW_NUMBER() OVER (
        PARTITION BY ISNULL(nc.CompNo, CONVERT(varchar(50), nc.CompID))
        ORDER BY (SELECT MAX(cs.StatusDate) FROM tbl_ComplaintStatus cs WHERE cs.CompaintID = nc.CompID) DESC, nc.CompID DESC
      ) AS __rn
    FROM tbl_NewComplaint nc
    WHERE nc.IsTemp IS NULL OR nc.IsTemp = 0
  ) nc ON nc.StatusID = sm.StatusID AND nc.__rn = 1`;

/**
 * GET /api/dashboard
 * Returns status-wise complaint counts with pending/about-to-expire/expired buckets.
 * Mirrors Dashboard.aspx btnSearch_Click filters:
 *   ?dateFrom=&dateTo=&subStatus=&compTypeId=&isFirm=&statusId=&stayOnly=1&suoMoto=1
 */
router.get('/', async (req, res) => {
  try {
    const userType = Number(req.user.UserType);
    const { dateFrom, dateTo, subStatus, compTypeId, isFirm, statusId, stayOnly, suoMoto } = req.query;
    const params = {};
    const conds = [];

    if (dateFrom) {
      conds.push('EntryDate >= @dateFrom');
      params.dateFrom = dateFrom;
    }
    if (dateTo) {
      conds.push('EntryDate < DATEADD(day, 1, CAST(@dateTo AS date))');
      params.dateTo = dateTo;
    }
    if (subStatus) {
      conds.push('SubStatus=@subStatus');
      params.subStatus = subStatus;
    }
    if (compTypeId) {
      conds.push('CompType=@compTypeId');
      params.compTypeId = Number(compTypeId);
    }
    if (isFirm !== undefined && isFirm !== '') {
      conds.push('IsFirm=@isFirm');
      params.isFirm = Number(isFirm);
    }
    if (statusId) {
      conds.push('StatusID=@statusId');
      params.statusId = Number(statusId);
    }
    if (stayOnly === '1' || stayOnly === 'true') {
      // Mirrors Dashboard.aspx: and IsStay=1 (drive from tbl_NewComplaint via CompID)
      conds.push('vw_DashBoard.CompID IN (SELECT CompID FROM tbl_NewComplaint WHERE IsStay=1)');
    }
    if (suoMoto === '1' || suoMoto === 'true') {
      // Mirrors Dashboard.aspx: and UserType=9 (suo moto = filed on behalf by a Type-9 officer)
      conds.push(
        'vw_DashBoard.CompID IN (SELECT nc.CompID FROM tbl_NewComplaint nc INNER JOIN tbl_Users u ON nc.UserID=u.UserID WHERE u.UserType=9)'
      );
    }
    if (userType === 3) {
      // Non-members see only complaints filed by themselves
      conds.push('vw_DashBoard.CompID IN (SELECT CompID FROM tbl_NewComplaint WHERE UserID=@userId)');
      params.userId = String(req.user.UserID);
    }

    let sqlStr = `
      SELECT StatusID, StatusName,
        SUM(CASE WHEN DATEDIFF(day, EntryDate, GETDATE()) <= ISNULL(CumulativeDays, 2) - 3 THEN 1 ELSE 0 END) AS Pending,
        SUM(CASE WHEN DATEDIFF(day, EntryDate, GETDATE()) BETWEEN ISNULL(CumulativeDays, 2) - 2 AND ISNULL(CumulativeDays, 2) THEN 1 ELSE 0 END) AS AboutToExpire,
        SUM(CASE WHEN DATEDIFF(day, EntryDate, GETDATE()) > ISNULL(CumulativeDays, 1) THEN 1 ELSE 0 END) AS Expired,
        MaxDays, CumulativeDays
      FROM (${DASHBOARD_FROM}) vw_DashBoard`;

    if ([5, 6, 7, 11].includes(userType)) {
      const where = ['S.Value=@userType', ...conds];
      params.userType = String(userType);
      sqlStr += ` CROSS APPLY dbo.SplitString(vw_DashBoard.UserTypeSO, ',') S
                  WHERE ${where.join(' AND ')}
                  GROUP BY StatusName, DisplayOrder, StatusID, MaxDays, CumulativeDays
                  ORDER BY DisplayOrder`;
    } else {
      if (conds.length) sqlStr += ` WHERE ${conds.join(' AND ')}`;
      sqlStr += `
        GROUP BY StatusName, DisplayOrder, StatusID, MaxDays, CumulativeDays ORDER BY DisplayOrder`;
    }

    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('dashboard error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/dashboard/bod
 * BOD-specific dashboard (statuses for agenda tracking).
 */
router.get('/bod', async (req, res) => {
  try {
    const rows = await query(
      `WITH s AS (
         SELECT StatusID, StatusNameForAgenda FROM tbl_StatusMaster
         WHERE StatusID IN (11,25,36,41,65,68,69,88,124)
       ),
       a AS (
         SELECT StatusID,
           COUNT(*) AS Total,
           SUM(CASE WHEN a.ADate IS NOT NULL THEN 1 ELSE 0 END) AS Scheduled,
           SUM(CASE WHEN a.ADate IS NULL THEN 1 ELSE 0 END) AS ToBeScheduled,
           SUM(CASE WHEN (a.SecretaryApprove IS NULL OR a.SecretaryApprove = 0)
                     AND (a.IsApproved IS NULL OR a.IsApproved = 0) THEN 1 ELSE 0 END) AS Pending
         FROM tbl_Ajenda a
         WHERE a.IsDeleted = 0
         GROUP BY a.StatusID
       )
       SELECT s.StatusID, s.StatusNameForAgenda AS StatusName,
              ISNULL(a.Pending, 0) AS Pending,
              ISNULL(a.Scheduled, 0) AS Scheduled,
              ISNULL(a.ToBeScheduled, 0) AS ToBeScheduled
       FROM s
       LEFT JOIN a ON s.StatusID = a.StatusID
       ORDER BY s.StatusID`
    );
    res.json(rows);
  } catch (e) {
    console.error('bod dashboard error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/dashboard/member
 * Member-specific dashboard: shows only complaints filed by the logged-in member.
 * For respondent accounts (UserType 2) it also includes complaints where the
 * logged-in user is the named respondent (ResEmailID) or an answerable member
 * (MemEmailID), so they can see the cases assigned for their written statement.
 */
router.get('/member', async (req, res) => {
  try {
    const userId = req.user.UserID;
    const email = String(req.user.Email || '').trim().toLowerCase();
    const userType = Number(req.user.UserType);

    let partyCond;
    if (userType === 2) {
      partyCond = `vw_DashBoard.CompID IN (
        SELECT CompID FROM tbl_NewComplaint WHERE UserID=@userId
        UNION
        SELECT CompID FROM tbl_NewComplaint WHERE LOWER(LTRIM(RTRIM(ResEmailID)))=@email AND (IsTemp IS NULL OR IsTemp=0)
        UNION
        SELECT CompID FROM tbl_AnswerableMember WHERE LOWER(LTRIM(RTRIM(MemEmailID)))=@email)`;
    } else {
      partyCond = `vw_DashBoard.CompID IN (SELECT CompID FROM tbl_NewComplaint WHERE UserID=@userId)`;
    }

    const sqlStr = `
      SELECT StatusID, StatusName,
        SUM(CASE WHEN DATEDIFF(day, EntryDate, GETDATE()) <= ISNULL(CumulativeDays, 2) - 3 THEN 1 ELSE 0 END) AS Pending,
        SUM(CASE WHEN DATEDIFF(day, EntryDate, GETDATE()) BETWEEN ISNULL(CumulativeDays, 2) - 2 AND ISNULL(CumulativeDays, 2) THEN 1 ELSE 0 END) AS AboutToExpire,
        SUM(CASE WHEN DATEDIFF(day, EntryDate, GETDATE()) > ISNULL(CumulativeDays, 1) THEN 1 ELSE 0 END) AS Expired,
        MaxDays, CumulativeDays
      FROM (${DASHBOARD_FROM}) vw_DashBoard
      WHERE ${partyCond}
      GROUP BY StatusName, DisplayOrder, StatusID, MaxDays, CumulativeDays
      ORDER BY DisplayOrder`;

    const rows = await query(sqlStr, { userId: String(userId), email });
    res.json(rows);
  } catch (e) {
    console.error('member dashboard error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
