// Region mapping derived from Region_City_State_mapping.xlsx.
// State -> Region is consistent for every state in the sheet, so the region is
// filled automatically as soon as a state is selected (and also when an
// existing complaint / member is loaded into the form).

export const REGION_OPTIONS = ['Eastern', 'Western', 'Northern', 'Southern', 'Central'];

const REGION_LABELS = {
  EAST: 'Eastern',
  WEST: 'Western',
  NORTH: 'Northern',
  SOUTH: 'Southern',
  CENTRAL: 'Central',
};

export const REGION_BY_STATE = {
  'ANDAMAN AND NICOBAR': 'Eastern',
  'ANDHRA PRADESH': 'Southern',
  'ARUNACHAL PRADESH': 'Eastern',
  'ASSAM': 'Eastern',
  'BIHAR': 'Central',
  'CHANDIGARH': 'Northern',
  'CHHATTISGARH': 'Central',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': 'Western',
  'DELHI': 'Northern',
  'GOA': 'Western',
  'GUJARAT': 'Western',
  'HARYANA': 'Northern',
  'HIMACHAL PRADESH': 'Northern',
  'JAMMU AND KASHMIR': 'Northern',
  'JHARKHAND': 'Central',
  'KARNATAKA': 'Southern',
  'KERALA': 'Southern',
  'LADAKH': 'Northern',
  'LAKSHADWEEP': 'Southern',
  'MADHYA PRADESH': 'Central',
  'MAHARASHTRA': 'Western',
  'MANIPUR': 'Eastern',
  'MEGHALAYA': 'Eastern',
  'MIZORAM': 'Eastern',
  'NAGALAND': 'Eastern',
  'ODISHA': 'Eastern',
  'PUDUCHERRY': 'Southern',
  'PUNJAB': 'Northern',
  'RAJASTHAN': 'Central',
  'SIKKIM': 'Eastern',
  'TAMIL NADU': 'Southern',
  'TELANGANA': 'Southern',
  'TRIPURA': 'Eastern',
  'UTTAR PRADESH': 'Central',
  'UTTARAKHAND': 'Central',
  'WEST BENGAL': 'Eastern',
};

// Spelling variants used by the ICAI member master and older records.
const STATE_ALIASES = {
  'ORISSA': 'ODISHA',
  'PONDICHERRY': 'PUDUCHERRY',
  'UTTARANCHAL': 'UTTARAKHAND',
  'NCT OF DELHI': 'DELHI',
  'DELHI NCR': 'DELHI',
  'ANDAMAN AND NICOBAR ISLANDS': 'ANDAMAN AND NICOBAR',
  'ANDAMAN AND NICOBAR ISLAND': 'ANDAMAN AND NICOBAR',
  'DADRA AND NAGAR HAVELI': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  'DAMAN AND DIU': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  'JAMMU AND KASHMIR STATE': 'JAMMU AND KASHMIR',
};

function normalizeStateName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a region value ("WEST", "west", "Western") to its display label. */
export function normalizeRegion(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (REGION_LABELS[upper]) return REGION_LABELS[upper];
  const match = REGION_OPTIONS.find((r) => r.toLowerCase() === raw.toLowerCase());
  return match || raw;
}

/**
 * Resolve the region for a state name. `fallback` is used when the state is not
 * present in the sheet (the value stored on the record is normalized instead).
 */
export function regionForState(stateName, fallback) {
  const key = normalizeStateName(stateName);
  const canonical = STATE_ALIASES[key] || key;
  return REGION_BY_STATE[canonical] || normalizeRegion(fallback) || '';
}
