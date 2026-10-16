/**
 * Neutral wording for the internal status vocabulary (server side).
 *
 * `tbl_StatusMaster.StatusName` still contains "Actionable" / "Non Actionable"
 * because that is the wording the legacy ASP.NET application and the reports
 * queries depend on, and those two words are internal classification labels
 * only. Nothing user-facing may show them, so every server-rendered artefact
 * (CSV export, printable complaint sheet, status reports) runs its text through
 * `statusText()`, which maps them onto the neutral vocabulary the Directorate
 * already uses for the clubbing flow: "Proceeding" and "Closure".
 *
 * This mirrors frontend/src/utils/statusText.js - keep the two in step.
 */

const CLOSURE_LABEL = 'Closure';
const PROCEED_LABEL = 'Proceeding';

const NON_ACTIONABLE = /\bnon[\s-]?actionable\b/gi;
const ACTIONABLE = /\bactionable\b/gi;

function statusText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(NON_ACTIONABLE, CLOSURE_LABEL).replace(ACTIONABLE, PROCEED_LABEL);
}

/**
 * Same as statusText() but leaves non-string values alone, so it can be dropped
 * straight into a row mapping without stringifying dates/numbers to "".
 */
function statusTextOf(row, key) {
  return row && row[key] !== null && row[key] !== undefined && typeof row[key] !== 'object'
    ? statusText(row[key])
    : row && row[key] !== undefined
      ? row[key]
      : '';
}

module.exports = { statusText, statusTextOf, CLOSURE_LABEL, PROCEED_LABEL };