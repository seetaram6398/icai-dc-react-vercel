const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/reports/ageing
 * Ageing analysis. Query: ?base=registration|actionable|nonactionable|referring
 */
router.get('/ageing', async (req, res) => {
  try {
    const base = req.query.base || 'registration';
    let dateExpr = 'nc.EntryDate';
    let statusFilter = '';
    let where = '';

    if (base === 'actionable') {
      dateExpr = 'cs.StatusDate';
      where = 'AND cs.StatusID=50';
      statusFilter = 'INNER JOIN tbl_ComplaintStatus cs ON nc.CompID = cs.CompaintID';
    } else if (base === 'nonactionable') {
      dateExpr = 'cs.StatusDate';
      where = 'AND cs.StatusID=11';
      statusFilter = 'INNER JOIN tbl_ComplaintStatus cs ON nc.CompID = cs.CompaintID';
    } else if (base === 'referring') {
      dateExpr = 'cs.StatusDate';
      where = 'AND cs.StatusID=40';
      statusFilter = 'INNER JOIN tbl_ComplaintStatus cs ON nc.CompID = cs.CompaintID';
    }

    const sqlStr = `
      SELECT sm.StatusName,
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) <= 6 THEN 1 ELSE 0 END) AS [0_6_months],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) BETWEEN 6 AND 12 THEN 1 ELSE 0 END) AS [6_12_months],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) BETWEEN 12 AND 24 THEN 1 ELSE 0 END) AS [1_2_years],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) BETWEEN 24 AND 36 THEN 1 ELSE 0 END) AS [2_3_years],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) > 36 THEN 1 ELSE 0 END) AS [over_3_years]
      FROM tbl_NewComplaint nc
      ${statusFilter}
      INNER JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
      WHERE 1=1 ${where}
      GROUP BY sm.StatusName
      ORDER BY sm.StatusName`;

    const rows = await query(sqlStr);
    res.json(rows);
  } catch (e) {
    console.error('ageing error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/reports/stage-bifurcation
 * Pipeline summary by status. ?view=formType|stages
 */
router.get('/stage-bifurcation', async (req, res) => {
  try {
    const view = req.query.view || 'stages';
    let sqlStr;
    if (view === 'formType') {
      sqlStr = `
        SELECT sm.StatusName,
          SUM(CASE WHEN ct.IsGov=1 AND nc.IsTemp=0 THEN 1 ELSE 0 END) AS A,
          SUM(CASE WHEN ct.IsGov=0 AND nc.IsTemp=0 THEN 1 ELSE 0 END) AS NonA,
          SUM(CASE WHEN nc.IsTemp=0 THEN 1 ELSE 0 END) AS Total
        FROM tbl_StatusMaster sm
        LEFT JOIN tbl_NewComplaint nc ON sm.StatusID = nc.StatusID AND nc.IsTemp=0
        LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
        GROUP BY sm.StatusName, sm.DisplayOrder
        ORDER BY sm.DisplayOrder`;
    } else {
      sqlStr = `
        SELECT sm.StatusName, COUNT(nc.CompID) AS TotalCount
        FROM tbl_StatusMaster sm
        LEFT JOIN tbl_NewComplaint nc ON sm.StatusID = nc.StatusID AND nc.IsTemp=0
        GROUP BY sm.StatusName, sm.DisplayOrder
        ORDER BY sm.DisplayOrder`;
    }
    const rows = await query(sqlStr);
    if (view === 'formType') {
      const grandTotal = rows.reduce((acc, r) => acc + (Number(r.Total) || 0), 0);
      rows.push({
        StatusName: 'Grand Total',
        A: rows.reduce((acc, r) => acc + (Number(r.A) || 0), 0),
        NonA: rows.reduce((acc, r) => acc + (Number(r.NonA) || 0), 0),
        Total: grandTotal,
      });
    } else {
      const grandTotal = rows.reduce((acc, r) => acc + (Number(r.TotalCount) || 0), 0);
      rows.push({ StatusName: 'Grand Total', TotalCount: grandTotal });
    }
    res.json(rows);
  } catch (e) {
    console.error('stage bifurcation error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/reports/complaint-status
 * Status monitoring by time buckets. Query: ?sid=...&type=1|2|3
 */
router.get('/complaint-status', async (req, res) => {
  try {
    const { sid, type } = req.query;
    if (!sid) return res.status(400).json({ error: 'sid required' });

    const status = await query('SELECT MaxDays, CumulativeDays FROM tbl_StatusMaster WHERE StatusID=@sid', { sid });
    if (status.length === 0) return res.status(404).json({ error: 'Status not found' });
    const { MaxDays, CumulativeDays } = status[0];
    const maxDays = Number(MaxDays || 2);
    const cumulative = Number(CumulativeDays || 0);

    let where;
    if (cumulative === 0) {
      const typeNum = Number(type);
      if (typeNum === 1) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) <= ${maxDays - 2}`;
      else if (typeNum === 2) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) BETWEEN ${maxDays - 2} AND ${maxDays}`;
      else where = `DATEDIFF(day, nc.EntryDate, GETDATE()) > ${maxDays}`;
    } else {
      const typeNum = Number(type);
      if (typeNum === 1) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) <= ${cumulative - 2}`;
      else if (typeNum === 2) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) BETWEEN ${cumulative - 2} AND ${cumulative}`;
      else where = `DATEDIFF(day, nc.EntryDate, GETDATE()) > ${cumulative}`;
    }

    const rows = await query(
      `SELECT nc.CompID, nc.CompNo, nc.ResName, nc.EntryDate, nc.StatusID,
              nc.NatureOfAllegation, nc.NatureDatails,
              CAST(DATEDIFF(day, nc.EntryDate, GETDATE()) AS int) AS PendingSince
       FROM tbl_NewComplaint nc
       WHERE nc.StatusID=@sid AND ${where}
       ORDER BY nc.EntryDate`,
      { sid: Number(sid) }
    );
    res.json(rows);
  } catch (e) {
    console.error('complaint-status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/reports/member-ageing
 * Ageing analysis filtered to logged-in member's complaints.
 * Query: ?base=registration|actionable|nonactionable|referring
 */
router.get('/member-ageing', async (req, res) => {
  try {
    const userId = req.user.UserID;
    const base = req.query.base || 'registration';
    let dateExpr = 'nc.EntryDate';
    let statusFilter = '';
    let where = '';

    if (base === 'actionable') {
      dateExpr = 'cs.StatusDate';
      where = 'AND cs.StatusID=50';
      statusFilter = 'INNER JOIN tbl_ComplaintStatus cs ON nc.CompID = cs.CompaintID';
    } else if (base === 'nonactionable') {
      dateExpr = 'cs.StatusDate';
      where = 'AND cs.StatusID=11';
      statusFilter = 'INNER JOIN tbl_ComplaintStatus cs ON nc.CompID = cs.CompaintID';
    } else if (base === 'referring') {
      dateExpr = 'cs.StatusDate';
      where = 'AND cs.StatusID=40';
      statusFilter = 'INNER JOIN tbl_ComplaintStatus cs ON nc.CompID = cs.CompaintID';
    }

    const sqlStr = `
      SELECT sm.StatusName,
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) <= 6 THEN 1 ELSE 0 END) AS [0_6_months],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) BETWEEN 6 AND 12 THEN 1 ELSE 0 END) AS [6_12_months],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) BETWEEN 12 AND 24 THEN 1 ELSE 0 END) AS [1_2_years],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) BETWEEN 24 AND 36 THEN 1 ELSE 0 END) AS [2_3_years],
        SUM(CASE WHEN DATEDIFF(MONTH, ${dateExpr}, GETDATE()) > 36 THEN 1 ELSE 0 END) AS [over_3_years]
      FROM tbl_NewComplaint nc
      ${statusFilter}
      INNER JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
      WHERE nc.UserID=@userId ${where}
      GROUP BY sm.StatusName
      ORDER BY sm.StatusName`;

    const rows = await query(sqlStr, { userId: String(userId) });
    res.json(rows);
  } catch (e) {
    console.error('member ageing error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/reports/member-complaint-status
 * Member-specific status monitoring by time buckets. Query: ?sid=...&type=1|2|3
 */
router.get('/member-complaint-status', async (req, res) => {
  try {
    const userId = req.user.UserID;
    const { sid, type } = req.query;
    if (!sid) return res.status(400).json({ error: 'sid required' });

    const status = await query('SELECT MaxDays, CumulativeDays FROM tbl_StatusMaster WHERE StatusID=@sid', { sid });
    if (status.length === 0) return res.status(404).json({ error: 'Status not found' });
    const { MaxDays, CumulativeDays } = status[0];
    const maxDays = Number(MaxDays || 2);
    const cumulative = Number(CumulativeDays || 0);

    let where;
    if (cumulative === 0) {
      const typeNum = Number(type);
      if (typeNum === 1) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) <= ${maxDays - 2}`;
      else if (typeNum === 2) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) BETWEEN ${maxDays - 2} AND ${maxDays}`;
      else where = `DATEDIFF(day, nc.EntryDate, GETDATE()) > ${maxDays}`;
    } else {
      const typeNum = Number(type);
      if (typeNum === 1) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) <= ${cumulative - 2}`;
      else if (typeNum === 2) where = `DATEDIFF(day, nc.EntryDate, GETDATE()) BETWEEN ${cumulative - 2} AND ${cumulative}`;
      else where = `DATEDIFF(day, nc.EntryDate, GETDATE()) > ${cumulative}`;
    }

    const rows = await query(
      `SELECT nc.CompID, nc.CompNo, nc.ResName, nc.EntryDate, nc.StatusID, sm.StatusName,
              nc.NatureOfAllegation, nc.NatureDatails,
              CAST(DATEDIFF(day, nc.EntryDate, GETDATE()) AS int) AS PendingSince
       FROM tbl_NewComplaint nc
       INNER JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       WHERE nc.StatusID=@sid AND nc.UserID=@userId AND ${where}
       ORDER BY nc.EntryDate`,
      { sid: Number(sid), userId: String(userId) }
    );
    res.json(rows);
  } catch (e) {
    console.error('member complaint-status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/reports/payment-details
 * Payment details (mirrors PaymentSearch.aspx). Filters optional:
 * ?compNo=, dateFrom/dateTo=YYYY-MM-DD, transRefNo=, compType=, formType=, instrumentNo=
 */
router.get('/payment-details', async (req, res) => {
  try {
    const { compNo, dateFrom, dateTo, transRefNo, compType, formType, instrumentNo } = req.query;
    let sqlStr = `
      SELECT nc.CompID, nc.CompNo, nc.Name AS ComplainantName, nc.FormType,
             sm.StateName, pm.PaymentModeName, nc.TransRefNo, nc.InstrumentNo,
             nc.InstrumentDate, nc.TaxableAmount, nc.TaxRate, nc.GSTINNo, nc.Address,
             nc.Region, sm1.StatusName
      FROM tbl_NewComplaint nc
      LEFT JOIN tbl_StateMaster sm ON nc.StateID = sm.StateID
      LEFT JOIN tbl_PaymentMode pm ON nc.PaymentMode = pm.PaymentModeID
      LEFT JOIN tbl_StatusMaster sm1 ON nc.StatusID = sm1.StatusID
      WHERE nc.TaxableAmount > 0`;
    const params = {};
    const like = (v) => `%${String(v).trim()}%`;
    if (compNo) { sqlStr += ' AND nc.CompNo LIKE @compNo'; params.compNo = like(compNo); }
    if (transRefNo) { sqlStr += ' AND nc.TransRefNo LIKE @transRefNo'; params.transRefNo = like(transRefNo); }
    if (instrumentNo) { sqlStr += ' AND nc.InstrumentNo LIKE @instrumentNo'; params.instrumentNo = like(instrumentNo); }
    if (compType) { sqlStr += ' AND nc.CompType = @compType'; params.compType = Number(compType); }
    if (formType) { sqlStr += ' AND nc.FormType = @formType'; params.formType = formType; }
    if (dateFrom) { sqlStr += ' AND nc.EntryDate >= @dateFrom'; params.dateFrom = `${dateFrom} 00:00:00`; }
    if (dateTo) { sqlStr += ' AND nc.EntryDate <= @dateTo'; params.dateTo = `${dateTo} 23:59:59`; }
    sqlStr += ' ORDER BY nc.EntryDate DESC';
    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('payment details error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
