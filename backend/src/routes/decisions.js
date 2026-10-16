const express = require('express');
const { query, executeNonQuery } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/decisions
 * List decision history (mirrors CourtDecision.aspx GridView over tbl_Decision).
 */
router.get('/', async (req, res) => {
  try {
    const rows = await query(`
      SELECT d.DecisionID, d.CauseListID, d.Presence, d.PresenceDetails, d.Direction,
             d.Decision, d.Attachment, d.MeetingNo,
             cl.CompNo, cl.HearingType
      FROM tbl_Decision d
      LEFT JOIN vw_CauseList cl ON d.CauseListID = cl.CLID
      ORDER BY d.DecisionID DESC`);
    res.json(rows);
  } catch (e) {
    console.error('list decisions error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/decisions/hearing-type/:clid
 * Return the HearingType of a cause list item so the correct decision master
 * (Dtype 1 = Hearing, 2 = otherwise) can be loaded.
 */
router.get('/hearing-type/:clid', async (req, res) => {
  try {
    const rows = await query(
      'SELECT HearingType FROM tbl_CauseList WHERE CauseListID=@id',
      { id: req.params.clid }
    );
    res.json({ HearingType: rows.length ? rows[0].HearingType : null });
  } catch (e) {
    console.error('hearing type error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/decisions
 * Insert a court decision (mirrors CourtDecision.aspx btnMarkDecision_Click).
 * Body: { causeListId, meetingNo, presence, presenceDetails, direction, decision, attachment }
 */
router.post('/', async (req, res) => {
  try {
    const { causeListId, meetingNo, presence, presenceDetails, direction, decision, attachment } = req.body;
    if (!causeListId) return res.status(400).json({ error: 'Please Select Case No' });
    if (!presenceDetails) return res.status(400).json({ error: 'Please enter Presence Details' });
    if (!direction) return res.status(400).json({ error: 'Please enter Direction' });
    if (!decision) return res.status(400).json({ error: 'Please Select Decision' });

    await executeNonQuery(
      `INSERT INTO tbl_Decision (Presence, Direction, Decision, Attachment, CauseListID, PresenceDetails, MeetingNo)
       VALUES (@presence, @direction, @decision, @attachment, @causeListId, @presenceDetails, @meetingNo)`,
      {
        presence: presence || 0,
        direction,
        decision,
        attachment: attachment || null,
        causeListId,
        presenceDetails,
        meetingNo: meetingNo || null,
      }
    );
    res.status(201).json({ message: 'Decision marked successfully' });
  } catch (e) {
    console.error('mark decision error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;