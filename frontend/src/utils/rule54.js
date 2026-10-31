/**
 * Rule 5(4)(a)/(b)/(c) clubbing and Rule 6 withdrawal - the exact wording of
 * the Regulation, the status sets used to decide which clause applies to a
 * previous complaint, and the Rule 6 prima facie test.
 */

export const RULE_54_A =
  'Clubbed under Rule 5(4)(a) if such a previous complaint is still under the examination of the Director, then the new complaint may be clubbed with the previous complaint and in such case the fact may be conveyed to the first complainant, new complainant and respondent respectively.';

export const RULE_54_B =
  "Clubbed under Rule 5(4)(b) if prima facie opinion has been formed by the Director in such a previous complaint and the case is pending before the Board of Discipline or the Committee, then the Director shall bring the new complaint before the Board of Discipline or the Committee, as the case may be, and the latter shall either club the complaint with the previous complaint or close it or ask the Director to deal with it as a separate complaint, as it deems fit.";

export const RULE_54_C =
  'Closure under Rule 5(4)(c) if orders have already been passed by the Board of Discipline or the Committee on such a previous complaint, then the Director shall present the new complaint before the Board of Discipline for its closure:';

export const RULE_54_PROVISO =
  'Provided that even in case where the new complaint is clubbed with previous complaint under this sub-rule, only the first complainant would be the complainant for the purposes of investigation under these rules.';

// export const RULE_6_TEXT =
//   'Withdrawal under Rule 6 - The Director, on receipt of a letter of withdrawal of a complaint by the complainant, shall place the same before the Board of Discipline or the Committee, as the case may be, and the Board of Discipline or Committee, as the case may be, may, if it is of the view that the circumstances so warrant, permit the withdrawal, at any stage, including before or after registration of the complaint:';
export const RULE_6_TEXT = '';

// export const RULE_6_PROVISO =
//   'Provided that in case the Director has not yet formed his prima facie opinion on such a complaint, he shall place the same before the Board of Discipline, and the Board of Discipline may, if it is of the view that the circumstances so warrant, permit the withdrawal.';
export const RULE_6_PROVISO = '';

export const RULE_54 = { a: RULE_54_A, b: RULE_54_B, c: RULE_54_C, proviso: RULE_54_PROVISO };

/**
 * Which clause of Rule 5(4) a recommendation made by the SO falls under.
 * @param {string} recommendation 'Registration' | 'Clubbing before Director' |
 *   'Clubbing before Committee' | 'Closure before Committee'
 * @returns {'a'|'b'|'c'|null} null for a registration recommendation.
 */
export function rule54ClauseFor(recommendation) {
  const t = String(recommendation || '').trim().toLowerCase();
  if (!t || t === 'registration') return null;
  if (t.includes('clubbing before director')) return 'a';
  if (t.includes('clubbing before committee')) return 'b';
  if (t.includes('closure before committee')) return 'c';
  return null;
}

/**
 * The wording of the Rule 5(4) clause that applies to a recommendation.
 * @returns {string} '' when the recommendation is a registration.
 */
export function rule54TextFor(recommendation) {
  const clause = rule54ClauseFor(recommendation);
  return clause ? RULE_54[clause] : '';
}

// Previous complaint still pending before the Board of Discipline / Committee
// (Director's prima facie opinion already formed) -> Rule 5(4)(b).
const B_PENDING = [6, 11, 18, 25, 29, 36, 65, 68, 69];

// Orders already passed by the Board of Discipline / Committee (or the matter
// already clubbed and communicated) -> Rule 5(4)(c).
const C_ORDERS_PASSED = [
  7, 8, 9, 12, 13, 14, 19, 20, 21, 33, 43, 66, 123, 130,
  111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
];

/**
 * Which clause of Rule 5(4) applies to a new complaint against a previous
 * complaint that is currently at `prevStatusId`.
 * @returns {'a'|'b'|'c'}
 */
export function deriveRule54(prevStatusId) {
  const s = Number(prevStatusId);
  if (C_ORDERS_PASSED.includes(s)) return 'c';
  if (B_PENDING.includes(s)) return 'b';
  return 'a';
}

// Stages at which the Director has not yet formed a prima facie opinion
// (scrutiny / registration / examination before the Director's own decision).
const NO_PRIMA_FACIE = [
  1, 2, 3, 4, 5, 15, 16, 22, 23, 24, 26, 27, 28, 49, 50, 51, 52, 53, 54, 55,
  56, 57, 58, 59, 60, 61, 62, 63, 64, 70, 124, 125, 126, 127, 128, 129,
];

/**
 * Has the Director formed his prima facie opinion at `statusId`?
 * (Used by the Rule 6 proviso - before it the complaint must go to the BoD.)
 */
export function hasPrimaFacie(statusId) {
  return !NO_PRIMA_FACIE.includes(Number(statusId));
}

// Complaints at these statuses are already closed / decided - a fresh letter of
// withdrawal cannot be taken up.
export const CLOSED_STATUSES = [9, 12, 13, 14, 21, 33, 43, 130];

// Statuses already inside the Rule 6 flow (no second letter of withdrawal).
export const WITHDRAWAL_FLOW_STATUSES = [127, 128, 129];

// Initial filing / scrutiny stages that precede the Director's examination.
// Rule 6 - like Rule 5(4) in the legacy ASPX - is NOT offered here: the whole
// withdrawal card is hidden until the complaint reaches the Director (status 5+).
export const INITIAL_WITHDRAWAL_STATUSES = [1, 2, 3, 4];

// From "Rejoinder sought from the Complainant" (status 22) onwards the case has
// advanced too far for a fresh letter of withdrawal. Status 124 (recommendation
// to the Vetting Officer) is an early scrutiny status despite its numeric id.
export const WITHDRAWAL_BLOCKED_FROM_STATUS = 22;
export const WITHDRAWAL_EARLY_STATUSES = [124];

export function isLateWithdrawalStage(statusId) {
  const s = Number(statusId);
  return s >= WITHDRAWAL_BLOCKED_FROM_STATUS && !WITHDRAWAL_EARLY_STATUSES.includes(s);
}

export function canWithdraw(statusId, isClubbedOrClosure) {
  const s = Number(statusId);
  if (isClubbedOrClosure) return false;
  return (
    !INITIAL_WITHDRAWAL_STATUSES.includes(s) &&
    !CLOSED_STATUSES.includes(s) &&
    !WITHDRAWAL_FLOW_STATUSES.includes(s) &&
    !isLateWithdrawalStage(s)
  );
}

/** Pull `from=<id>` back out of the status-127 CommonField. */
export function rule6ReturnStatus(history) {
  const row = (history || []).find((h) => Number(h.StatusID) === 127 && h.CommonField);
  const m = /from=(\d+)/i.exec(String(row?.CommonField || ''));
  return m ? Number(m[1]) : 2;
}
