/**
 * Rule 5(5) defect rectification - Form I field mapping.
 *
 * When the Scrutiny Officer returns a complaint with defects, the complainant
 * answers each defect (a remark and/or a supporting document). That answer is
 * the corrected value for the Form I field(s) the defect refers to, so it is
 * written back onto the complaint (tbl_NewComplaint). The previous values stay
 * available in tbl_ComplaintAudit / tbl_ComplaintDefect as history.
 *
 * Keyed by the defect `code` in defectCatalog.js. Each entry lists the
 * tbl_NewComplaint column(s) to overwrite:
 *   texts       - columns that take the complainant's remark
 *   attachments - columns that take the complainant's uploaded document
 *   display     - a label for defects with no writable Form I field; shown to
 *                 the Scrutiny Officer so every option states its column, but
 *                 nothing is written back (the answer is still saved on
 *                 tbl_ComplaintDefect and the audit trail).
 *
 * This table is the single place to review/adjust the mapping.
 */
const DEFECT_TARGET_FIELDS = {
  // Authorization letter / Board Resolution (Rule 3(2)-(4))
  '1': { attachments: ['RegulatorAttachment'] },
  '56': { attachments: ['RegulatorAttachment'] },
  '58': { attachments: ['RegulatorAttachment'] },
  '60': { attachments: ['RegulatorAttachment'] },
  '62': { attachments: ['RegulatorAttachment'] },
  '64': { attachments: ['RegulatorAttachment'] },
  '66': { attachments: ['RegulatorAttachment'] },

  // Column 1 - name of the complainant / verification name
  '2': { texts: ['ResName'] },
  '3': { texts: ['Name'] },
  '4': { texts: ['Name'] },
  '19': { texts: ['Name'] },

  // Column 2 - respondent particulars
  '5': { texts: ['ResRegistrationNo'] },
  '6': { texts: ['ResName', 'ResRegistrationNo'] },
  '7': { texts: ['ResName'] },
  '8': { texts: ['ResName'] },
  '9': { texts: ['ResName', 'ResRegistrationNo'] },
  '10': { texts: ['ResName'] },

  // Column 3 / 4 - addresses
  '11': { texts: ['Address'] },
  '12': { texts: ['ResCommAddress', 'ResProfAddress'] },
  '13': { texts: ['ResProfAddress'] },

  // Column 5 - charges / statement of facts
  '14': { texts: ['ParticularMisconduct'] },

  // Column 6 - documentary evidence
  '15': { attachments: ['MisconductAttachment'] },
  '16': { attachments: ['MisconductAttachment'] },
  '17': { attachments: ['MisconductAttachment'] },
  '28': { attachments: ['MisconductAttachment'] },
  '29': { attachments: ['MisconductAttachment'] },
  '30': { attachments: ['MisconductAttachment'] },

  // Verification / signature portion
  '20': { texts: ['VerificationPlace'] },
  '21': { texts: ['VerificationPlace'] },
  '22': { attachments: ['ComplaintantSignature'] },
  '25': { attachments: ['ComplaintantSignature'] },

  // Column 7 - names of persons having knowledge of the facts of the case
  '18': { texts: ['PersonName'] },

  // Defects with no writable Form I field (display-only)
  '23': { display: 'Date & signatures in verification part' },
  '24': { display: 'Form I paper (plain paper, no letter head)' },
  '26': { display: 'Complaint fee (separate payment window)' },
  '27': { display: 'Form I prescribed format' },
};

// Human-readable names for the Form I fields, used in the UI and audit trail.
const FIELD_LABELS = {
  Name: 'Name of Complainant (Column 1)',
  ResName: 'Name of Respondent Member/Firm (Column 2)',
  ResRegistrationNo: 'Respondent Membership/Firm Registration No. (Column 2)',
  Address: 'Communication Address (Column 3)',
  ResCommAddress: 'Respondent Communication Address',
  ResProfAddress: 'Respondent Professional Address (Column 4)',
  ParticularMisconduct: 'Charges / Statement of Facts (Column 5)',
  VerificationPlace: 'Place in Verification Part',
  RegulatorAttachment: 'Authorization Letter / Board Resolution',
  MisconductAttachment: 'Documentary Evidence (Column 6)',
  ComplaintantSignature: 'Signature (Verification Part)',
  PersonName: 'Name of Person having Knowledge of Facts (Column 7)',
};

function getDefectTargets(code) {
  return DEFECT_TARGET_FIELDS[String(code)] || null;
}

/**
 * Labels describing which Form I field(s) a defect's answer updates, or the
 * column a defect refers to when it has no writable Form I field.
 * @param {string|number} code defect catalogue code
 * @returns {string[]} field labels (empty when the defect has no mapping)
 */
function getDefectFieldLabels(code) {
  const targets = getDefectTargets(code);
  if (!targets) return [];
  const cols = [...(targets.texts || []), ...(targets.attachments || [])];
  const labels = cols.map((col) => FIELD_LABELS[col] || col);
  if (targets.display) labels.push(targets.display);
  return labels;
}

module.exports = { DEFECT_TARGET_FIELDS, FIELD_LABELS, getDefectTargets, getDefectFieldLabels };
