/**
 * Neutral wording for the internal status vocabulary.
 *
 * The status master still stores "Actionable" / "Non Actionable" because that is
 * what the legacy ASP.NET application and the reports queries use. Those two
 * words are internal classification labels only and are never shown to users,
 * so every screen renders them through `statusText()` instead, which maps them
 * onto the neutral vocabulary the Directorate already uses for the clubbing
 * flow: "Proceeding" and "Closure".
 */

const CLOSURE_LABEL = 'Closure';
const PROCEED_LABEL = 'Proceeding';

const NON_ACTIONABLE = /\bnon[\s-]?actionable\b/gi;
const ACTIONABLE = /\bactionable\b/gi;

export function statusText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(NON_ACTIONABLE, CLOSURE_LABEL).replace(ACTIONABLE, PROCEED_LABEL);
}

export const SUB_STAGE_LABELS = {
  'Under Scrutiny': 'Under Scrutiny',
  'Non Actionable': CLOSURE_LABEL,
  Actionable: PROCEED_LABEL,
};

/**
 * The <option> values stay untouched (they are sent to the API), only the
 * visible text is neutralised.
 */
export const SUB_STAGE_OPTIONS = [
  { value: 'Under Scrutiny', label: 'Under Scrutiny' },
  { value: 'Non Actionable', label: CLOSURE_LABEL },
  { value: 'Actionable', label: PROCEED_LABEL },
];