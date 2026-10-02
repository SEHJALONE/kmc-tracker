// src/export/*.js use `import jsPDF from 'jspdf'` (what the browser build
// exports). In Node, jspdf is CommonJS, so the default import is the whole
// exports object and `new jsPDF()` fails. This hands the code the class itself.
import * as mod from 'jspdf';
export default mod.jsPDF ?? mod.default?.jsPDF ?? mod.default;
