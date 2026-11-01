import fs from 'node:fs';
import { renderAccuracyReport, scoreLabelledCsv } from '../lib/rule-accuracy';

// Usage: npm run rule-accuracy -- path/to/labelled.csv [EE|GENERIC]
// The CSV is a normal bank export with an extra expected_category column. Reads the file locally and prints a report.
const [file, jurisdiction] = process.argv.slice(2);
if (!file) {
  console.error('usage: npm run rule-accuracy -- <labelled.csv> [EE|GENERIC]');
  process.exit(2);
}
const report = scoreLabelledCsv(fs.readFileSync(file, 'utf8'), jurisdiction === 'GENERIC' ? 'GENERIC' : 'EE');
process.stdout.write(renderAccuracyReport(report));
