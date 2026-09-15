// Pure-logic verification of the firm-tenancy permission-intersection
// arithmetic (lib/firm-tenancy.ts's effectiveDelegatedRole) — no Firebase
// connection needed, since this is the one security-critical calculation
// that CAN be verified without live credentials. Exercises the brief's
// own QA item: "Firm role does not override unauthorized client scope."
import { effectiveDelegatedRole } from './lib/firm-tenancy';

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: actual=${actual} expected=${expected}`);
  return ok;
}

let allOk = true;

// A PARTNER is capped at ADMIN even when the client delegated OWNER —
// portfolio oversight never implies full client ownership.
allOk = check('PARTNER capped below OWNER delegation', effectiveDelegatedRole('OWNER', 'PARTNER'), 'ADMIN') && allOk;

// A REVIEWER is capped at APPROVER (sign-off only) even when the client
// delegated OWNER.
allOk = check('REVIEWER capped below OWNER delegation', effectiveDelegatedRole('OWNER', 'REVIEWER'), 'APPROVER') && allOk;

// An ACCOUNTANT is capped at ACCOUNTANT even when the client delegated
// ADMIN.
allOk = check('ACCOUNTANT capped below ADMIN delegation', effectiveDelegatedRole('ADMIN', 'ACCOUNTANT'), 'ACCOUNTANT') && allOk;

// PAYROLL_SPECIALIST shares ACCOUNTANT's ceiling.
allOk = check('PAYROLL_SPECIALIST capped like ACCOUNTANT', effectiveDelegatedRole('ADMIN', 'PAYROLL_SPECIALIST'), 'ACCOUNTANT') && allOk;

// MANAGER shares PARTNER's ADMIN ceiling.
allOk = check('MANAGER capped at ADMIN', effectiveDelegatedRole('OWNER', 'MANAGER'), 'ADMIN') && allOk;

// The CLIENT's own narrower grant wins regardless of firm role — a
// PARTNER never exceeds what was actually delegated.
allOk = check('Narrow client delegation wins over PARTNER ceiling', effectiveDelegatedRole('VIEWER', 'PARTNER'), 'VIEWER') && allOk;
allOk = check('Narrow client delegation (ACCOUNTANT) wins over MANAGER ceiling', effectiveDelegatedRole('ACCOUNTANT', 'MANAGER'), 'ACCOUNTANT') && allOk;

// A REVIEWER can never exceed APPROVER even against a matching delegation.
allOk = check('REVIEWER exactly at APPROVER delegation', effectiveDelegatedRole('APPROVER', 'REVIEWER'), 'APPROVER') && allOk;

console.log('');
console.log(allOk ? 'ALL FIRM-TENANCY PERMISSION-ARITHMETIC TESTS: PASS' : 'FIRM-TENANCY PERMISSION-ARITHMETIC TESTS: SOME FAILED');
if (!allOk) process.exit(1);
