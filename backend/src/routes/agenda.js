const express = require('express');
const { query, executeScalar, executeNonQuery } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/agenda
 * List agenda items. ?statusId=... ?meetingId=... ?type=pending|scheduled|tobescheduled
 */
router.get('/', async (req, res) => {
  try {
    const { statusId, meetingNo } = req.query;
    let sqlStr = `
      SELECT a.AjendaID, a.CompID, a.StatusID, a.ADate, a.ATime, a.Place, a.MeetingNo,
             a.IsReviewed, a.SecretaryApprove, a.IsApproved, a.IsReschedulePre, a.IsRescheduleSec,
             nc.CompNo, nc.ResName, nc.FirmNo, nc.IsFirm,
             CAST(DATEDIFF(day, nc.EntryDate, GETDATE()) AS int) AS DaysRemaining
      FROM tbl_Ajenda a
      INNER JOIN tbl_NewComplaint nc ON a.CompID = nc.CompID
      WHERE a.IsDeleted=0`;
    const params = {};
    if (statusId) {
      sqlStr += ' AND a.StatusID=@statusId';
      params.statusId = Number(statusId);
    }
    if (meetingNo) {
      sqlStr += ' AND a.MeetingNo=@meetingNo';
      params.meetingNo = Number(meetingNo);
    }
    sqlStr += ' ORDER BY a.ADate DESC, a.ATime';
    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('agenda list error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/agenda
 * Generate agenda items for complaints. Mirrors ViewAgenda btnGenerateAgenda_Click.
 * Body: { items: [{ compId, statusId, date, time, place }] }
 */
router.post('/', async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user.UserID;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const created = [];
    for (const item of items) {
      const { compId, statusId, date, time, place } = item;

      // Conflict checks: find existing meeting for this user+date
      const existing = await query(
        `SELECT MeetingNo FROM tbl_Ajenda
         WHERE UserID=@userId AND ADate=@date AND IsDeleted=0
           AND (IsApproved IS NULL OR IsApproved=0 OR IsReviewed IS NULL OR SecretaryApprove IS NULL)
         ORDER BY MeetingNo DESC`,
        { userId, date }
      );

      let meetingNo;
      if (existing.length > 0) {
        meetingNo = existing[0].MeetingNo;
      } else {
        const max = await executeScalar(
          `SELECT ISNULL(MAX(CAST(MeetingNo AS float)), 0) + 1 FROM tbl_Ajenda WHERE UserID=@userId AND ADate=@date`,
          { userId, date }
        );
        meetingNo = Number(max);
      }

      // Insert or update
      const dup = await executeScalar(
        `SELECT COUNT(*) FROM tbl_Ajenda WHERE CompID=@compId AND StatusID=@statusId AND IsDeleted=0 AND SecretaryApprove IS NULL`,
        { compId, statusId }
      );

      if (Number(dup) > 0) {
        await executeNonQuery(
          `UPDATE tbl_Ajenda SET ADate=@date, ATime=@time, Place=@place, MeetingNo=@meetingNo
           WHERE CompID=@compId AND StatusID=@statusId AND IsDeleted=0`,
          { date, time, place, meetingNo, compId, statusId }
        );
      } else {
        await executeNonQuery(
          `INSERT INTO tbl_Ajenda (ADate, ATime, UserID, GenDate, CompID, Place, StatusID, MeetingNo, IsDeleted)
           VALUES (@date, @time, @userId, GETDATE(), @compId, @place, @statusId, @meetingNo, 0)`,
          { date, time, userId, compId, place, statusId, meetingNo }
        );
      }
      created.push({ compId, meetingNo });
    }
    res.status(201).json({ message: 'Agenda generated', created });
  } catch (e) {
    console.error('create agenda error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/agenda/:id/approve
 * Approve/reject agenda. Body: { role: 'secretary'|'po', approved: boolean, remarks }
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const id = req.params.id;
    const { role, approved, remarks } = req.body;
    let set = '';
    if (role === 'secretary') {
      set = `SecretaryApprove=${approved ? 1 : 0}, SRemarks=@remarks`;
    } else {
      set = `IsApproved=${approved ? 1 : 0}, Remarks=@remarks`;
    }
    await executeNonQuery(`UPDATE tbl_Ajenda SET ${set} WHERE AjendaID=@id`, { id, remarks: remarks || null });
    res.json({ message: 'Agenda updated' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
