// Test VINs typed while developing or demoing ("KMC TEST 001", "KMC-TEST-001",
// "TESTVIN-EDIT-001"). They are kept out of every dashboard so a stray test
// card filed against the live sheet never shows up as production data. A real
// VIN only matches if "TEST" starts the VIN or follows a space, "-" or "_".
export const isTestVin = (vin) => /(^|[\s_-])TEST/i.test(String(vin || '').trim());
