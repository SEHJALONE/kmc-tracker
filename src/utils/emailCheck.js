// Catches a mistyped email on the Request Access form before it is stored, so
// the applicant sees an error (and a suggestion) instead of a success message
// and an approval email that can never reach them.
// Keep in step with emailProblem_ in tools/mail-relay/Code-with-email.gs.

export const EMAIL_TYPOS = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmail.coom': 'gmail.com',
  'gmailcom': 'gmail.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
};

// null when the address looks right, else { message, suggestion? }.
export function emailProblem(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return { message: 'Enter your email address.' };
  if (/\s/.test(email)) return { message: 'An email address cannot contain spaces.' };
  const at = email.lastIndexOf('@');
  const domain = at > 0 ? email.slice(at + 1) : '';
  const fix = EMAIL_TYPOS[domain];
  if (fix) {
    const suggestion = `${email.slice(0, at)}@${fix}`;
    return { message: `"${domain}" looks mistyped. Did you mean ${suggestion}?`, suggestion };
  }
  if (!/^[^@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email) || email.includes('..')) {
    return { message: 'That email address is not complete - it should look like name@example.com.' };
  }
  return null;
}
