// United States (US) payroll rule pack — v15: federal + 48 states (CA, NJ,
// NY incl. NYC/Yonkers, IL, PA, MI, CO, AZ, AK, WA, OR, IN, NC, GA, KY, MS,
// UT, MN, MT, ND, OK, RI, VA, MA, MO, NE, SC, VT, WV, KS, ID, NM, AR, HI,
// OH, LA, IA, AL, MD, CT, DE, FL, NV, NH, SD, TN, TX, WY).
//
// STATUS: DRAFT_NEEDS_LEGAL_REVIEW — do not mark VERIFIED_BASIC_RULES and do
// not enable for real (PILOT/PRODUCTION) payroll runs until a person with
// current US payroll/tax expertise has checked:
//   1. the federal percentage-method withholding table (IRS Pub 15-T) against
//      the current-year edition,
//   2. the FICA rates and Social Security wage base against the current-year
//      SSA/IRS figures,
//   3. the FUTA net rate (including any state credit-reduction) against the
//      current-year Department of Labor credit-reduction-state list,
//   4. the California withholding schedule (EDD DE 44 Method B) and SDI rate
//      against the current-year EDD publication,
//   5. the New Jersey withholding rate tables (NJ-WT) and the UI/Workforce
//      Development/SWF, TDI, and FLI employee rates against the current-year
//      NJ Division of Taxation and NJDOL publications,
//   6. the New York, NYC, and Yonkers withholding rate tables (NYS-50-T-NYS/
//      NYC/Y) against the current-year NYS Department of Taxation and
//      Finance publications,
//   7. the IL/PA/MI/CO/AZ/AK/WA figures added in v5 against each state's
//      OWN primary publication — these seven were sourced from a secondary
//      cross-check reference document, not independently fetched the way
//      CA/NJ/NY were, and carry materially lower confidence as a result
//      (see the v5 change log and limitations for specifics).
// These figures change every year, several of them (SS wage base, CA SDI
// rate, FUTA credit reductions, NJ's UI/TDI/FLI rates) finalized only late
// in the prior year or even during the current year. This file uses figures
// sourced via AI web research (not a professional review) as of September
// 2026.
//
// v15 change log (from v14): adds Delaware (DE), reaching 48/50 states.
// Fetched Delaware's own current Employer's Guide directly; every bracket
// boundary in its ONE unified rate table (Delaware doesn't split brackets
// by filing status — only the standard deduction differs) was hand-
// verified for internal consistency. Dated effective 2025-01-01; no 2026
// update found, treated as low-risk given Delaware's historical bracket
// stability but not yet reconfirmed for 2026. Wisconsin and DC were both
// investigated further this pass (Wisconsin: confirmed its standard-
// deduction phase-out formula exactly, both floor thresholds compute to
// zero precisely as stated, but its actual current tax RATE brackets
// could not be confirmed from a primary source — the official withholding
// guide documents wage-bracket lookup tables and a deduction-only
// "Alternate Method," not a standalone rate schedule; DC: got a real
// 7-bracket rate table directly from DC OTR's own rates page and the
// filing-status/allowance STRUCTURE from an older (2018) FR-230, but only
// a stale 2018 exemption dollar value, not a current one) but still fall
// short of a confident current-year build — remaining the two true
// unresolved gaps in this file, now with a much narrower, specifically-
// named missing piece each rather than being wholesale unreached.
//
// v14 change log (from v13): adds Maryland (MD) and Connecticut (CT), the
// two states explicitly named in the v12 change log as investigated-but-
// deferred rather than sourcing dead-ends — closing both this pass with
// more targeted re-fetches, reaching 47/50 states. Maryland: got the
// complete county rate table for all 23 counties plus Baltimore City (22
// flat-rate counties plus Anne Arundel and Frederick's own graduated
// bracket tables, fully implemented rather than approximated to a flat
// rate) — Maryland county tax is mandatory, same required-not-skipped
// pattern as Indiana's county tax in v10. Connecticut: the direct NFC
// fetch kept truncating the phase-out/recapture tables (a ~50-row
// step-function table clawing back lower-bracket benefit from higher
// earners); re-fetched via the same text-extraction-proxy workaround used
// for Oregon in v9, which returned the complete tables. Only Connecticut
// withholding code A/D (which share an identical base bracket table,
// phase-out table, and recapture table) is implemented; codes B, C, and F
// are explicitly rejected rather than guessed, since their own tables
// were not captured.
//
// v13 change log (from v12): adds four more states on the same "keep
// going" instruction — OH, LA, IA, AL — reaching 45/50 states. Notably
// higher confidence than v11/v12 for two of the four: Iowa was fetched
// directly from the Iowa Department of Revenue's own current-year formula
// publication (revenue.iowa.gov), which includes 10 fully worked
// examples — this engine's implementation reproduces all 6 of the
// examples relevant to the marital-status categories this engine supports
// exactly to the cent, the SAME confidence tier as CA/NJ/NY/OR/IN/NC, the
// strongest in this file. Louisiana was corroborated by a second source
// confirming Louisiana's 2025 tax reform (Act 11) eliminated the
// per-dependent exemption entirely, which actually REMOVED a gap this
// file would otherwise have needed to flag (there's no dependent-credit
// dollar amount to be missing, because the credit itself no longer
// exists). Ohio is single-NFC-source (same tier as v11/v12). Alabama
// blends a stable-but-aged (2022) NFC bulletin for tax brackets/
// exemptions with a genuinely current (tax-year-2025) official Alabama
// Department of Revenue standard-deduction table fetched directly —
// but that table's income-phased deduction schedule (which phases DOWN
// in $25 steps below a wage threshold) was not fully transcribed, so
// this engine only implements the FLOOR deduction value and REJECTS
// employees below the floor threshold ($35,500 single/MFJ/HOF, $17,750
// MFS) rather than approximating the phase-out.
//
// v12 change log (from v11): adds eleven more states on the same
// "keep going" instruction — MA, MO, NE, SC, VT, WV, KS, ID, NM, AR, HI —
// reaching 41/50 states. Same single-NFC-bulletin-source tier as v11.
// Hawaii's bracket table had been only partially extracted on first fetch
// (endpoints only); a targeted follow-up fetch got the complete 8-row
// table for both filing statuses, which matched the partial extraction's
// endpoints exactly. Arkansas has a genuinely incomplete area: its real
// top bracket smooths across 28 narrow $100-wide rows between $94,701 and
// $97,601 to avoid a cliff, and this pass could not get that full table —
// annualized taxable income landing in that ~$2,900 band is REJECTED with
// an explicit error rather than approximated, the same fail-closed pattern
// used elsewhere in this file for genuinely unresolved narrow cases (e.g.
// the Oregon single-filer/3-allowances/wages-over-$125k combination in
// v9). New Mexico's source gave no deduction/exemption structure at all —
// implemented with zero deduction, flagged explicitly as possibly an
// extraction gap rather than a confirmed absence. Idaho's formula was
// reconstructed from descriptive bulletin text rather than a directly
// quoted formula line, so carries slightly lower confidence than a
// literal-quote state. Four of the eleven (MO, HI, SC, AR) were hand-
// verified against manual bracket arithmetic; the rest checked only for
// journal-balance and positive-output sanity.
//
// v11 change log (from v10): adds ten more states in one pass on explicit
// user instruction to execute the remaining state list rather than build
// one-at-a-time — GA, KY, MS, UT, MN, MT, ND, OK, RI, VA. Each is sourced
// from ONE source only: that state's own current USDA National Finance
// Center federal payroll-processing bulletin (help.nfc.usda.gov) — the
// SAME single-source tier as the original v5 batch (IL/PA/MI/CO/AZ/AK/WA),
// not the dual/primary-sourced tier CA/NJ/NY/OR/IN/NC reached. No official
// worked example was available for any of these ten (unlike OR/IN/NC), so
// their self-tests are hand-derived bracket-math checks corroborating
// three of them (GA/KY/MT) against manual arithmetic, plus journal-
// balance and positive-tax sanity checks for the rest — a weaker
// verification standard than the fixture-checked states. Seven states
// from the original remaining-31 list were explicitly NOT attempted this
// pass for inadequate sourcing found during research: Maryland (state
// brackets found, but county tax is mandatory and several counties —
// Anne Arundel, Frederick — have their own graduated brackets rather than
// a flat rate, adding real complexity not resolved this pass), Connecticut
// (six withholding-code tracks A-F plus a "3%/2% phase-out add-back"
// mechanism not fully characterized from the bulletin excerpt), Alabama
// (NFC bulletin is from 2022 — stale — and its standard deduction is
// itself an income-phased step function needing more detail than
// gathered), Iowa (confirmed flat 3.8% for 2026 via secondary sources, but
// no primary percentage-method deduction structure found — NFC's own
// bulletin is from 2023 and predates Iowa's flat-tax conversion), Delaware,
// Wisconsin, and DC (no reliably primary or NFC source reached this pass;
// only AI-search-synthesized secondary sources, which this file's own
// Oregon precedent treats as untrustworthy on their own). See limitations
// for the per-state detail.
//
// v10 change log (from v9): adds Indiana (IN) and North Carolina (NC),
// closing the two states this file's own limitations had singled out as
// "deceptively simple flat-rate traps" — Indiana was explicitly rejected in
// earlier versions for lack of its real exemption amounts and mandatory
// county tax. Both fetched and independently confirmed directly from each
// state's own official publication this pass: Indiana Department of
// Revenue Departmental Notice #1 (R46/01-26, effective 2026-01-01) gives
// the flat 2.95% rate, the $1,000/$1,500/$3,000 personal/dependent/
// adopted-child exemption amounts, AND the complete 92-county tax rate
// table, so county tax (previously the specific reason IN was left out) is
// now implemented as a mandatory input rather than silently skipped. North
// Carolina's NC-30 (Web 11-25) gives the 4.09% withholding rate (3.99%
// statutory rate + NC's own 0.1% formula adjustment — confirmed in NC-30's
// own text, not a bug), the $12,750/$19,125 standard deductions, the
// $2,500 allowance value, and NC's unusual nearest-whole-dollar (not cent)
// final rounding, verified against NC-30's own worked example.
//
// v9 change log (from v8): adds Oregon (OR) as an 18th state — the first
// entirely new state added since v5, and one v8 had explicitly rejected for
// lack of a full bracket table. Revisited on explicit user instruction not
// to reject it but to compare sources and find a way to implement it
// correctly. What changed: v8 had only ONE worked example (the golden
// fixture's single data point) and one self-contradictory AI web-search
// synthesis. This pass instead (1) fetched Oregon's own 2026 formula
// publication (Pub. 150-206-436) via a text-extraction proxy — oregon.gov
// itself remains unreachable from this environment — and re-queried it
// three times with independently-worded prompts, getting byte-identical
// numbers each time; (2) found and fetched a genuinely independent second
// source, the USDA National Finance Center's federal payroll-processing
// bulletin, which reproduces Oregon's PRIOR year (2025) formula in the
// identical structural pattern (same bracket shape, same "credit amount
// equals bracket-1 base" design quirk, same wage-tier split at $50,000)
// at dollar amounts consistently ~2.6-2.9% below the 2026 figures — exactly
// what one year of routine inflation indexing would produce, not what two
// independent transcription errors would look like; (3) independently
// confirmed Paid Leave Oregon's rate/split/wage-cap and the Statewide
// Transit Tax rate directly against paidleave.oregon.gov (via the same
// proxy) and a targeted web search. The golden fixture's own worked
// example (annual OR WH = 678 + 8.75% x (108,340-11,400) = 9,160.25 for
// $120,000 wages, 0 allowances) now matches this engine's actual output
// exactly, as does the fixture's EDGE-OR-PAID-LEAVE-CAP wage-cap-crossing
// vector. One number from the proxy-fetched text ("$38,340" as a bracket
// lower bound) did NOT appear in the NFC structure and was discarded as a
// likely extraction artifact rather than built on. One genuinely
// unresolved ambiguity — whether a SINGLE filer claiming 3+ allowances
// uses the single or married federal-subtraction phase-out schedule once
// annual wages reach $125,000+ — is rejected rather than guessed (see
// limitations); this is a narrow, rare combination for this pack's small-
// business target market, not a gap in the common case.
//
// v8 change log (from v7): adds two local-tax overlays the golden-payslip
// fixture pack flagged as not-yet-implemented — Philadelphia Wage Tax
// (pa_philadelphia_resident / pa_philadelphia_nonresident_workplace, on top
// of the existing PA state calculation, effective-dated by pay_date at the
// documented 2026-07-01 rate change) and the Denver Occupational Privilege
// Tax employee share (co_denver_employee, on top of the existing CO state
// calculation, MONTHLY-pay-frequency-only since the statute's $500 earnings
// test is a calendar-month test this engine can't cleanly apply to other
// frequencies). Both were independently primary-sourced directly from
// phila.gov and denvergov.org this pass (not just taken from the fixture),
// and both corroborate the fixture's own figures exactly. Denver's $4.00/
// month employer-paid Business OPT is explicitly NOT modeled — see
// limitations. Oregon was evaluated and explicitly NOT added — the fixture
// gives only one worked example (one bracket row for a single filer), and
// Oregon's own formula publication (Pub. 150-206-436, which would give the
// federal-subtraction caps and full bracket table needed for a real
// implementation) could not be fetched from oregon.gov in this environment;
// an AI web-search synthesis attempted as a fallback returned internally
// contradictory numbers and was not trusted. Rejected rather than built off
// a single data point — see limitations for the full reasoning.
//
// v7 change log (from v6): a user-supplied golden-payslip QA fixture pack
// ("US_2026_Payroll_Golden_Payslip_QA_Pack.pdf") was cross-checked line by
// line against this engine's ACTUAL output for CA, NY/NYC, PA, WA, CO, NJ,
// and a federal cap-crossing case — not just against this file's own hand
// derivations, a materially stronger check than any self-test added before
// this pass. It found ONE real bug: the NJ Rate Table A weekly $769 bracket
// base was transcribed as $15.29 from the raw printed NJ-WT table, but
// NJ's OWN worked example in that same publication computes $15.28 for
// that exact bracket, and the unrounded cumulative chain also rounds to
// $15.28 — NJ's own printed table has a one-cent inconsistency with its
// own worked example. Fixed to $15.28, matching both NJ's example and the
// golden fixture's independently-stated $40.40 for the exact scenario
// (weekly $1,200, Rate A, 1 allowance) that had been getting $40.41. The
// affected self-test (Case 9) was also corrected. Everything else checked
// against the fixture pack matched exactly on the first attempt: NY, PA,
// WA, CO, and federal cap-crossing all passed with zero changes. One
// fixture (CA monthly $10,000, Single, 0 allowances) was investigated in
// depth: this engine computes $647.84, the fixture states $647.90. Both
// numbers are correct under DIFFERENT EDD-documented methods — this engine
// uses the primary period-specific Method B table (Tables 5-28, applied
// directly to the monthly taxable income), while the fixture used EDD's
// optional "annualize the wages, apply the annual table, divide by 12"
// alternative (demonstrated in the EDD publication's own Examples E/F,
// explicitly framed there as a computer-memory-saving convenience, not the
// primary method). The two methods can diverge by a few cents at the
// margin purely from where rounding happens in the chain. This file keeps
// the primary-method result and documents the divergence rather than
// silently matching the fixture's number, since matching it would mean
// switching to a different (also valid, but not primary) EDD method
// without evidence that's actually the right choice for this engine.
//
// v6 change log (from v5): adds NY Paid Family Leave (PFL, unconditional
// for every NY employee, 0.432% of gross wages) and NY Disability Benefits
// Law (DBL, opt-in only, WEEKLY-pay-only). Both were explicitly flagged as
// unimplemented gaps in v4/v5's own limitations list; a user-supplied
// second-generation "formula pack" document (derived from the same
// secondary reference already cited in v5, but distilling it into
// code-ready equations) supplied the complete formula for both, so the gap
// is now closed rather than merely flagged. PFL introduces a genuinely new
// primitive to this file — capTax(rawTax, ytdTaxBefore, annualCap), which
// caps the computed TAX amount against a cumulative annual DOLLAR figure,
// as opposed to every other capped tax in this file (ceilingContribution),
// which caps the taxable WAGE base before applying a rate. NY PFL's
// published cap is a flat dollar figure the state sets independently each
// year, not (rate × some wage base), so the two helpers are genuinely not
// interchangeable — using ceilingContribution for PFL would have been
// wrong. The same formula-pack document independently corroborated this
// file's existing NJ, AZ, CO, PA, AK, WA, and CA SDI figures with no
// discrepancies found, which is a meaningful secondary confirmation for the
// v5 states, even though it derives from the same original reference
// rather than being a fully independent source.
//
// v5 change log (from v4): adds 14 more states — IL, PA, MI, CO, AZ (each
// with a real, if simple, withholding FORMULA), AK and WA (no state income
// tax, but each has a real statutory EMPLOYEE-paid payroll levy: AK
// unemployment insurance, WA Paid Family & Medical Leave + WA Cares), and
// FL/NV/NH/SD/TN/TX/WY (no state income tax AND no statewide employee
// payroll levy of any kind — nothing to compute beyond the existing
// state-agnostic federal FICA/FUTA layer). This is the largest scope jump
// yet, and unlike CA/NJ/NY it draws on a SECONDARY reference document the
// user supplied rather than each state's own primary publication — flagged
// explicitly in evidence/limitations as lower-confidence than CA/NJ/NY, not
// silently treated as equally verified. Deliberately EXCLUDED this pass,
// even though a headline rate exists in the reference: Indiana, whose real
// withholding formula needs a personal/dependent exemption figure the
// reference doesn't supply — applying the headline 2.95% to full gross
// would overstate withholding, so it was rejected rather than
// approximated, the same fail-closed principle used throughout this file.
// The other 32 non-CA/NJ/NY/IL/PA/MI/CO/AZ/AK/WA/no-tax states all need
// their own official-table fetch-and-build pass, the same way CA/NJ/NY
// were each built — none of them had a usable complete formula in the
// reference document, only a pointer to "use the official 20XX tables."
//
// v4 change log (from v3): adds New York (state income tax, NYC resident
// tax, Yonkers resident surcharge / nonresident earnings tax) as a third
// supported state — the most structurally complex of the three states
// scoped after CA, built last of the three deliberately (see v3's own note
// below on why NJ went first). NY layers up to three separate income-tax
// withholding lines on top of federal, each with its own deduction table
// and bracket schedule: NY State tax (always), NYC resident tax (opt-in via
// ny_nyc_resident), and either the Yonkers RESIDENT surcharge (opt-in via
// ny_yonkers_resident — computed as 16.75% of the NY State tax amount per
// NYS-50-T-Y's own published method) or the Yonkers NONRESIDENT earnings
// tax (opt-in via ny_yonkers_nonresident_workplace — a flat 0.5% on wages
// above a small per-period exemption, for employees who work in Yonkers but
// live elsewhere). A real implementation trap encountered and fixed during
// this build: NY State, NYC, and Yonkers do NOT all share one deduction
// table — NY State and Yonkers publish identical deduction tables, but NYC's
// own table uses a materially lower deduction base (its per-allowance
// exemption value is identical, only the flat deduction differs). Treating
// all three as one shared table silently understated the NYC tax by
// several dollars per pay period until caught by comparing against the
// NYS-50-T-NYC publication's own worked example. Pre-tax deduction handling
// was NOT extended to NY this pass, for the same reason as NJ (see below).
//
// v3 change log (from v2): adds New Jersey as a second supported state.
// Scoped narrowly and deliberately ahead of NY in build order — the
// NY-Newark-Jersey City metro area is the single largest concentration of
// small businesses of any US metro, and NJ has no jurisdiction-lookup
// complexity (unlike NY, built next in v4: NY layers NYC and Yonkers local
// taxes on top of state tax; MD, still planned, requires a 24-county rate
// lookup by employee residence). NJ instead layers FOUR separate withholding
// lines on top of federal: its own state income tax (NJ-W4 Rate Tables A/B,
// not the federal W-4 shape — NJ never adopted the federal form), plus three
// employee-paid statutory contributions with their own rates and wage bases
// (UI/Workforce Development/Supplemental Workforce Fund, Temporary
// Disability Insurance, Family Leave Insurance). Pre-tax deduction handling
// (401(k)/Section 125) was NOT extended to NJ this pass — NJ's treatment of
// those wage bases wasn't independently verified, so NJ employees with
// either pretax field set are rejected rather than silently computed on the
// wrong wage base. See limitations for what else is explicitly out of scope
// (Rate Tables C/D/E, the Newark employer payroll tax, NJ/PA reciprocity).
//
// v2 change log (from v1, driven by review against two real-shaped sample
// payslips — see the PR for details):
//   - Pre-tax deductions are now modeled, with the two federally-distinct
//     categories kept separate rather than lumped together, because they are
//     NOT taxed the same way:
//       * `pretax_401k_deferral` (traditional 401(k)/403(b) elective
//         deferral): excluded from federal and CA INCOME tax wages, but
//         still fully subject to FICA (Social Security + Medicare) and FUTA
//         — per IRC §3121(a)(5)(D), elective deferrals are wages for FICA
//         purposes even though they're excluded from income tax wages.
//       * `pretax_section125_deduction` (cafeteria-plan health/dental/vision
//         premiums, health/dependent-care FSA contributions): excluded from
//         federal income tax wages, CA income tax wages, FICA wages, FUTA
//         wages, AND CA SDI wages — per IRC §125, a properly-elected
//         cafeteria-plan deduction is excluded from the FICA/FUTA wage base
//         entirely, unlike a 401(k) deferral.
//     Validated against a real-shaped sample payslip whose FICA figures
//     matched this engine exactly on the FULL gross despite the payslip
//     also showing 401(k) and health-insurance deductions — consistent with
//     the 401(k)-only-reduces-income-tax-wages rule (that payslip's health
//     deduction evidently wasn't also excluded from its own FICA
//     calculation, which is a discrepancy in that sample, not in this
//     engine's law-following behavior; see the PR for the full comparison).
//
// Scope, deliberately narrow (rejected, not approximated):
//   - Only 17 states are supported: CA, NJ, NY, IL, PA, MI, CO, AZ, AK, WA,
//     and the 7 states with neither a state income tax nor any statewide
//     employee payroll levy (FL, NV, NH, SD, TN, TX, WY). Every other US
//     state is rejected until built and validated individually — "no
//     income tax" still leaves SUI/SDI/local
//     nuances unverified here.
//   - Federal Form W-4 (2020 or later revision) only. Pre-2020 W-4s
//     (allowances-based) are rejected — the IRS's own "computational bridge"
//     could approximate them, but that's out of scope for v1.
//   - The federal "Form W-4, Step 2, Checkbox" percentage-method schedule IS
//     supported (caller passes `federal_step2_checkbox`).
//   - Only the four most common pay frequencies are supported: weekly,
//     biweekly, semimonthly, monthly. Quarterly/semiannual/annual/daily are
//     rejected.
//   - State Unemployment Insurance (SUI) is NOT calculated. Every California
//     employer has an individual SUI rate assigned annually by the EDD based
//     on their claims experience — there is no statutory flat rate this
//     engine could compute. The caller must supply their own SUI rate and
//     compute/post that contribution outside this engine.
//   - California Employment Training Tax (ETT) is NOT calculated — its
//     current wage base was not independently reverified this pass.
//   - Only two pre-tax deduction categories are modeled: traditional
//     401(k)/403(b) elective deferrals and Section 125 cafeteria-plan
//     deductions (see the v2 change log above for how each is taxed
//     differently). Not modeled: Roth 401(k)/403(b) contributions (fully
//     taxable, same as regular wages — caller should simply not pass them
//     as a pretax field), HSA contributions (excluded like Section 125 in
//     most cases, but with employer-vs-employee and state-conformity
//     nuances not implemented here), and annual IRS contribution-limit
//     enforcement for any of these (the caller is responsible for not
//     passing an amount that would exceed the employee's actual annual
//     limit; this engine does not track or cap it).
//   - Supplemental wage flat-rate withholding (the 22%/37% optional/mandatory
//     methods for bonuses, commissions, etc.) is not implemented. All pay is
//     treated as regular wages through the annualized percentage method.
//   - The Additional Medicare Tax employer withholding obligation applies a
//     single $200,000 threshold regardless of the employee's actual filing
//     status (per IRC 3102(f)(1) — employers withhold on wages over $200k
//     regardless of MFJ/MFS/HOH; true-up for a joint filer's actual $250k
//     threshold happens on the employee's own Form 8959, not in payroll).
//     This engine follows that employer-side rule exactly; it is not a
//     simplification.
//
// Self-test validated against the exact IRS Pub 15-T 2026 Percentage Method
// Table, EDD 2026 Method B, NJ-WT, and NYS-50-T-NYS/NYC/Y rate table figures
// cited in evidence below — the NY/NYC/Yonkers cases are checked directly
// against the worked examples published in those three official NYS
// documents, not just hand-derived from the bracket tables. CA is
// additionally validated against two real-shaped sample payslips (see the
// v2 change log and the PR history). Neither NJ nor NY has yet been checked
// against a real payslip — flagged explicitly as a gap, the same way CA's
// v1 lacked real-payslip validation before its own review pass.

export type UsPayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
export type UsFederalFilingStatus = 'SINGLE_MFS' | 'MFJ' | 'HOH';
export type UsCaFilingStatus = 'SINGLE' | 'MARRIED_0_OR_1' | 'MARRIED_2_OR_MORE' | 'HEAD_OF_HOUSEHOLD';
export type UsState =
  | 'CA' | 'NJ' | 'NY'
  | 'IL' | 'PA' | 'MI' | 'CO' | 'AZ'
  | 'AK' | 'WA' | 'OR' | 'IN' | 'NC'
  | 'GA' | 'KY' | 'MS' | 'UT' | 'MN' | 'MT' | 'ND' | 'OK' | 'RI' | 'VA'
  | 'MA' | 'MO' | 'NE' | 'SC' | 'VT' | 'WV' | 'KS' | 'ID' | 'NM' | 'AR' | 'HI'
  | 'OH' | 'LA' | 'IA' | 'AL' | 'MD' | 'CT' | 'DE' | 'DC' | 'WI'
  | 'FL' | 'NV' | 'NH' | 'SD' | 'TN' | 'TX' | 'WY' | 'ME';
export type NjRateTable = 'A' | 'B';
export type NyFilingStatus = 'SINGLE' | 'MARRIED';
export type CoFilingStatus = 'MFJ_OR_QSS' | 'OTHER';
export type AzElectionPercent = 0 | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5;
export type OrFilingStatus = 'SINGLE' | 'MARRIED';
export type NcFilingStatus = 'SINGLE_MARRIED_OR_SURVIVING_SPOUSE' | 'HEAD_OF_HOUSEHOLD';
export type GaFilingStatus = 'SINGLE_OR_HOH' | 'MFS_OR_MFJ_BOTH_WORKING' | 'MFJ_ONE_WORKING';
export type MsFilingStatus = 'SINGLE' | 'HEAD_OF_HOUSEHOLD' | 'MARRIED';
export type UtFilingStatus = 'SINGLE' | 'MARRIED';
export type MnFilingStatus = 'SINGLE' | 'MARRIED';
export type MtFilingStatus = 'SINGLE_OR_MFS_OR_BOTH_WORKING' | 'MARRIED_FILING_JOINTLY' | 'HEAD_OF_HOUSEHOLD';
export type NdFilingStatus = 'SINGLE_OR_MFS' | 'MARRIED_FILING_JOINTLY' | 'HEAD_OF_HOUSEHOLD';
export type OkFilingStatus = 'SINGLE_OR_HOH' | 'MARRIED';
export type MoFilingStatus = 'SINGLE_OR_MFS_OR_MARRIED_SPOUSE_WORKS' | 'MARRIED_SPOUSE_NOT_WORK' | 'HEAD_OF_HOUSEHOLD';
export type NeFilingStatus = 'SINGLE_OR_HOH' | 'MARRIED';
export type VtFilingStatus = 'SINGLE_OR_HOH' | 'MARRIED';
export type WvFilingStatus = 'ONE_EARNER_ONE_JOB' | 'TWO_EARNER_OR_MULTIPLE_JOBS';
export type KsFilingStatus = 'SINGLE_OR_HOH' | 'MARRIED';
export type IdFilingStatus = 'SINGLE' | 'MARRIED';
export type NmFilingStatus = 'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD';
export type HiFilingStatus = 'SINGLE_OR_HOH' | 'MARRIED';
export type LaFilingStatus = 'SINGLE_OR_MFS' | 'MARRIED_OR_HOH';
export type IaMaritalStatus = 'OTHER_OR_MFJ_SPOUSE_WORKS' | 'HEAD_OF_HOUSEHOLD' | 'MFJ_SPOUSE_NO_EARNED_INCOME';
export type AlFilingStatus = 'SINGLE' | 'MARRIED_FILING_JOINTLY' | 'MARRIED_FILING_SEPARATELY' | 'HEAD_OF_FAMILY';
export type MdFilingStatus = 'SINGLE' | 'MARRIED';
export type CtWithholdingCode = 'A_OR_D';
export type DeFilingStatus = 'SINGLE_OR_MFS' | 'MARRIED_FILING_JOINTLY';
// DC withholding filing-status categories per the 2022 NFC bulletin (TAXES 22-28):
// S=Single, M=Married Filing Jointly, N=Married Filing Separately, H=Head of Household.
export type DcFilingStatus = 'S' | 'M' | 'N' | 'H';
export type WiFilingStatus = 'SINGLE' | 'MARRIED';
// Maine's W-4ME has only two withholding-purpose filing categories: the
// "Married" box, or "Single" / "Married, but withholding at higher single
// rate" / "Head of Household" boxes, which ALL use the single percentage
// schedule (Maine Revenue Services, 26_wh_tab_instr.pdf, p.5, "Withholding
// Allowances" section: "If the 'Married' box is checked... use the married
// percentage... If the 'Married, but withholding at higher single rate' or
// 'Single or Head of Household' box is checked... use the single
// percentage rate schedule").
export type MeFilingStatus = 'SINGLE_OR_HOH' | 'MARRIED';
// Supplemental-wage flat-rate withholding method, per IRS Pub 15-T (federal)
// and each state's own optional/elective flat-percentage method (state
// fields below). Defaults to 'REGULAR' — see UsEmployeeInput.wage_type.
export type UsWageType = 'REGULAR' | 'SUPPLEMENTAL';

export type UsEmployeeInput = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pretax_401k_deferral?: number;
  pretax_section125_deduction?: number;
  pay_frequency: UsPayFrequency;
  // Supplemental-wage flat-rate withholding (bonuses, commissions,
  // severance, etc. paid SEPARATELY from regular wages). Defaults to
  // 'REGULAR' (the existing annualized/percentage method, unchanged).
  // 'SUPPLEMENTAL' switches FEDERAL withholding to the flat 22% optional
  // method (IRS Pub 15-T (2026), Section 1, "Withholding on Supplemental
  // Wages" — 22% up to $1,000,000 of supplemental wages in the calendar
  // year; this engine has no year-to-date supplemental-wage tracker, so
  // the 37%-mandatory-above-$1M tier is NOT implemented — see
  // limitations) and, for the states that have their own separately-
  // sourced flat supplemental rate (see each state's own rule-pack
  // comment for its citation), switches STATE withholding to that flat
  // rate too. For any OTHER state, passing wage_type: 'SUPPLEMENTAL' is
  // REJECTED with an explicit error rather than silently falling back to
  // the regular method or guessing a rate — see limitations for the full
  // list of states with an implemented supplemental rate.
  wage_type?: UsWageType;
  // Employee has filed a Form W-4 claiming EXEMPT from federal income tax
  // withholding (IRS Form W-4 instructions, "Exemption from
  // Withholding" — valid only for the calendar year in which it is
  // filed; this engine does not track the certificate's filing/expiry
  // date, so the caller is responsible for only setting this for a
  // currently-valid exempt claim). When true, federal_income_tax is
  // forced to 0 regardless of filing status/allowances/brackets.
  federal_w4_exempt?: boolean;
  federal_filing_status: UsFederalFilingStatus;
  federal_step2_checkbox: boolean;
  federal_step3_annual_credits?: number;
  federal_step4a_annual_other_income?: number;
  federal_step4b_annual_deductions?: number;
  federal_step4c_extra_per_period?: number;
  ytd_ss_wages_before: number;
  ytd_medicare_wages_before: number;
  ytd_futa_wages_before: number;
  // State Unemployment Insurance (SUI), employer-paid only. Both fields
  // optional — omit both to leave SUI uncomputed (same as before v19).
  // If either is supplied, the other becomes required. sui_rate is this
  // employee's employer's own experience-rated percentage for the
  // relevant state, as issued on that employer's annual rate notice
  // (this engine has no statutory default for it — see limitations).
  // sui_wage_base is that state's annual taxable wage base per employee,
  // also off the employer's own rate notice or the state agency's
  // current-year published figure.
  sui_rate?: number;
  sui_wage_base?: number;
  ytd_sui_wages_before?: number;
  state: UsState;
  // CA fields — required when state === 'CA'.
  ca_filing_status?: UsCaFilingStatus;
  ca_regular_allowances?: number;
  ca_estimated_deduction_allowances?: number;
  // NJ fields — required when state === 'NJ'.
  nj_rate_table?: NjRateTable;
  nj_allowances?: number;
  ytd_nj_ui_wf_wages_before?: number;
  ytd_nj_tdi_fli_wages_before?: number;
  // NY fields — required when state === 'NY'.
  ny_filing_status?: NyFilingStatus;
  ny_allowances?: number;
  // NYC and Yonkers resident status are independent of ny_filing_status —
  // an NY employee may be an NYC resident, a Yonkers resident, neither, or
  // (rarely, e.g. remote-work edge cases) working in Yonkers while resident
  // elsewhere in NY (Yonkers nonresident earnings tax).
  ny_nyc_resident?: boolean;
  ny_yonkers_resident?: boolean;
  ny_yonkers_nonresident_workplace?: boolean;
  // NY Paid Family Leave: always applies to NY employees (no opt-out) at a
  // flat rate up to a cumulative ANNUAL DOLLAR cap (not a wage-base cap).
  ytd_ny_pfl_tax_before?: number;
  // NY Disability Benefits Law: opt-in only (employer elects to deduct it),
  // and only supported for WEEKLY pay — the statute caps it per calendar
  // week, which has no clean equivalent for biweekly/semimonthly/monthly
  // periods, so those are rejected rather than approximated.
  ny_dbl_opt_in?: boolean;
  // IL fields — required when state === 'IL'.
  il_line1_allowances?: number;
  il_line2_allowances?: number;
  il_extra_per_period?: number;
  // PA fields — none required for base PA withholding (flat rate on gross
  // pay). Philadelphia Wage Tax is a separate, optional local overlay: set
  // pa_philadelphia_resident for a Philadelphia RESIDENT (any work location)
  // or pa_philadelphia_nonresident_workplace for a non-resident who works
  // IN Philadelphia — never both. Rate is effective-dated (see rule pack).
  pa_philadelphia_resident?: boolean;
  pa_philadelphia_nonresident_workplace?: boolean;
  // MI fields — required when state === 'MI'.
  mi_personal_exemptions?: number;
  // CO fields — required when state === 'CO'.
  co_filing_status?: CoFilingStatus;
  co_dr0004_line2_annual_override?: number;
  co_dr0004_line3_extra_per_period?: number;
  ytd_co_famli_wages_before?: number;
  // Denver Occupational Privilege Tax (OPT / "head tax") — set when the CO
  // employee performs sufficient services IN DENVER to receive at least
  // $500 of compensation for the calendar month (DRMC §53-202 et seq.).
  // Only supported for MONTHLY pay frequency: the statute's earnings test
  // is a per-calendar-month test, and this engine has no clean way to
  // aggregate weekly/biweekly/semimonthly periods into a calendar month
  // without YTD-style state it doesn't otherwise track — rejected rather
  // than approximated for other frequencies (see limitations).
  co_denver_employee?: boolean;
  // AZ fields — required when state === 'AZ'.
  az_election_percent?: AzElectionPercent;
  // AK fields — none required beyond gross pay; AK employee UI applies to
  // every AK employee at a flat statutory rate.
  ytd_ak_ui_wages_before?: number;
  // WA fields — none required beyond gross pay; WA PFML and WA Cares apply
  // to every WA employee at flat statutory rates (small-employer/approved-
  // exemption nuances are not modeled — see limitations).
  ytd_wa_pfml_wages_before?: number;
  // OR fields — required when state === 'OR'. or_filing_status is the
  // OR-W-4 line 1 marital-status box; or_allowances is line 2. A SINGLE
  // filer claiming 3+ allowances uses the same (wider) bracket track and
  // standard deduction as a MARRIED filer — a real, documented quirk of
  // Oregon's own formula, not a simplification made by this engine.
  or_filing_status?: OrFilingStatus;
  or_allowances?: number;
  ytd_or_paid_leave_wages_before?: number;
  // IN fields — required when state === 'IN'. in_county must match one of
  // the 92 Indiana county names in the rule pack's county_tax_rates table
  // (Indiana county tax is mandatory alongside the flat state rate — this
  // engine requires it explicitly rather than silently skipping it).
  in_personal_exemptions?: number;
  in_dependent_exemptions?: number;
  in_adopted_child_exemptions?: number;
  in_county?: string;
  // NC fields — required when state === 'NC'.
  nc_filing_status?: NcFilingStatus;
  nc_allowances?: number;
  // GA fields — required when state === 'GA'.
  ga_filing_status?: GaFilingStatus;
  ga_dependents?: number;
  // KY fields — none required; KY withholding is a flat rate after a flat
  // standard deduction, no allowances.
  // MS fields — required when state === 'MS'.
  ms_filing_status?: MsFilingStatus;
  ms_dependents?: number;
  // Form 89-350 Line 5: $1,500 per block checked (age 65+, blindness —
  // each spouse, each condition, up to 4 blocks). Optional, default 0.
  ms_age_or_blindness_exemptions?: number;
  // UT fields — required when state === 'UT'.
  ut_filing_status?: UtFilingStatus;
  // MN fields — required when state === 'MN'.
  mn_filing_status?: MnFilingStatus;
  mn_allowances?: number;
  // MT fields — required when state === 'MT'.
  mt_filing_status?: MtFilingStatus;
  // ND fields — required when state === 'ND'.
  nd_filing_status?: NdFilingStatus;
  nd_exemptions?: number;
  // OK fields — required when state === 'OK'.
  ok_filing_status?: OkFilingStatus;
  ok_exemptions?: number;
  // RI fields — none required beyond gross pay; RI's exemption amount is a
  // single flat $1,000 (not per-allowance), phased to $0 above a wage
  // threshold, with one unified bracket table (RI's own bulletin does not
  // split brackets by filing status).
  // VA fields — required when state === 'VA'.
  va_exemptions?: number;
  // MA fields — required when state === 'MA'.
  ma_exemptions?: number;
  // MO fields — required when state === 'MO'.
  mo_filing_status?: MoFilingStatus;
  // NE fields — required when state === 'NE'.
  ne_filing_status?: NeFilingStatus;
  ne_allowances?: number;
  // SC fields — required when state === 'SC'.
  sc_allowances?: number;
  // VT fields — required when state === 'VT'.
  vt_filing_status?: VtFilingStatus;
  vt_allowances?: number;
  // WV fields — required when state === 'WV'. wv_filing_status is WV's own
  // "one earner/one job" vs "two earner/multiple jobs" split, not marital
  // status.
  wv_filing_status?: WvFilingStatus;
  wv_exemptions?: number;
  // KS fields — required when state === 'KS'.
  ks_filing_status?: KsFilingStatus;
  ks_exemptions?: number;
  // ID fields — required when state === 'ID'.
  id_filing_status?: IdFilingStatus;
  id_exemptions?: number;
  // NM fields — required when state === 'NM'. No deduction/exemption is
  // subtracted before the bracket lookup — the available source gave no
  // deduction structure, treated as none rather than guessed (see
  // limitations).
  nm_filing_status?: NmFilingStatus;
  // AR fields — required when state === 'AR'.
  ar_exemptions?: number;
  // HI fields — required when state === 'HI'.
  hi_filing_status?: HiFilingStatus;
  hi_exemptions?: number;
  // OH fields — required when state === 'OH'.
  oh_exemptions?: number;
  // LA fields — required when state === 'LA'. Dependent exemptions were
  // eliminated by Louisiana's 2025 tax reform, so only the filing-status-
  // based standard deduction remains — no la_dependents field exists.
  la_filing_status?: LaFilingStatus;
  // IA fields — required when state === 'IA'. ia_marital_status mirrors
  // the exact three categories on the 2024+ IA W-4 (Iowa's own bulletin
  // explicitly notes this deduction is NOT the same as the federal
  // standard deduction). ia_allowance_amount is the total dollar
  // allowance amount reported directly on the IA W-4 (Iowa's 2024+ form
  // reports a dollar figure, not an allowance count).
  ia_marital_status?: IaMaritalStatus;
  ia_allowance_amount?: number;
  // AL fields — required when state === 'AL'. This engine only supports
  // annual wages at or above the floor-deduction threshold for the
  // employee's filing status ($35,500 for Single/MFJ/HOF, $17,750 for
  // MFS) — Alabama's real standard deduction phases DOWN in $25
  // increments below that threshold, which this engine does not model
  // (see limitations); lower earners are rejected rather than
  // approximated.
  al_filing_status?: AlFilingStatus;
  al_dependents?: number;
  // MD fields — required when state === 'MD'. md_county must match one of
  // Maryland's 23 counties or Baltimore City (see the rule pack's county
  // rate/bracket tables). County tax is mandatory in Maryland alongside
  // the state tax, same requirement pattern as Indiana.
  md_filing_status?: MdFilingStatus;
  md_exemptions?: number;
  md_county?: string;
  // CT fields — required when state === 'CT'. Only withholding code A/D
  // (which share an identical base bracket table, phase-out add-back
  // table, and recapture table) is implemented — codes B, C, and F are
  // rejected as unsupported (see limitations).
  ct_withholding_code?: CtWithholdingCode;
  // DE fields — required when state === 'DE'. One unified bracket table
  // applies regardless of filing status; only the standard deduction
  // differs (de_filing_status covers that split).
  de_filing_status?: DeFilingStatus;
  de_exemptions?: number;
  // DC fields — required when state === 'DC'. dc_dependents feeds the
  // $4,300-per-dependent allowance (2022 NFC bulletin figure).
  dc_filing_status?: DcFilingStatus;
  dc_dependents?: number;
  // DC Form D-4 "Employee Withholding Allowance Certificate" EXEMPT
  // claim. When true (DC employees only), dc_income_tax is forced to 0.
  // A DC employee whose payslip should show $0 federal AND $0 DC
  // withholding needs BOTH dc_d4_exempt and the general federal_w4_exempt
  // set — DC's own exempt certificate does not by itself exempt federal
  // withholding, and vice versa.
  dc_d4_exempt?: boolean;
  // WI fields — required when state === 'WI'.
  wi_filing_status?: WiFilingStatus;
  wi_exemptions?: number;
  // ME fields — required when state === 'ME'.
  me_filing_status?: MeFilingStatus;
  me_allowances?: number;
  // CT Paid Leave (CTPL) — mandatory, 100%-employee-funded, flat rate,
  // no opt-out and no employer share; applies to every CT employee.
  ytd_ct_paid_leave_wages_before?: number;
  // DE Paid Leave — mandatory (statewide program); this engine models the
  // maximum employee-withholdable share (50% of the total premium, the
  // statutory ceiling) — an employer may elect to pay more of the
  // employee's share itself, which would reduce this below the modeled
  // amount (see limitations).
  ytd_de_paid_leave_wages_before?: number;
  // MA PFML — mandatory; the employee share (0.46% of wages: 0.28%
  // medical + 0.18% family) is the same dollar rate regardless of
  // employer size (small employers <25 covered individuals owe a lower
  // TOTAL 0.46% rate with no employer share, but the employee's own
  // share is unchanged at 0.46%) — see limitations for what this engine
  // does not model (the employer-side expense line).
  ytd_ma_pfml_wages_before?: number;
  // VT Child Care Contribution — a total 0.44%-of-wages payroll tax where
  // the EMPLOYER must pay at least 75% (0.33%) and MAY elect to withhold
  // up to the remaining 25% (0.11%) from the employee. Optional/
  // employer-elected — set vt_ccc_employer_withholds_employee_share to
  // model an employer who has elected to withhold the maximum permitted
  // employee share; omit/false to model an employer who pays the full
  // 0.44% itself (the DEFAULT under VT's own rule if the employer makes
  // no election).
  vt_ccc_employer_withholds_employee_share?: boolean;
  // ME PFML — mandatory for employers with 15+ covered workers (the
  // scenario this engine models; see limitations for the smaller-
  // employer discretionary case, not modeled).
  ytd_me_pfml_wages_before?: number;
};

export type UsPayrollRunInput = {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: UsEmployeeInput[];
};

export type UsJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  account_role:
    | 'SALARY_EXPENSE'
    | 'EMPLOYER_PAYROLL_TAX_EXPENSE'
    | 'NET_PAYROLL_PAYABLE'
    | 'FEDERAL_INCOME_TAX_PAYABLE'
    | 'FICA_PAYABLE'
    | 'FUTA_PAYABLE'
    | 'SUI_PAYABLE'
    | 'CA_INCOME_TAX_PAYABLE'
    | 'CA_SDI_PAYABLE'
    | 'NJ_INCOME_TAX_PAYABLE'
    | 'NJ_UI_WF_SWF_PAYABLE'
    | 'NJ_TDI_PAYABLE'
    | 'NJ_FLI_PAYABLE'
    | 'NY_INCOME_TAX_PAYABLE'
    | 'NYC_INCOME_TAX_PAYABLE'
    | 'YONKERS_TAX_PAYABLE'
    | 'NY_PFL_PAYABLE'
    | 'NY_DBL_PAYABLE'
    | 'IL_INCOME_TAX_PAYABLE'
    | 'PA_INCOME_TAX_PAYABLE'
    | 'PA_UC_PAYABLE'
    | 'PHL_WAGE_TAX_PAYABLE'
    | 'MI_INCOME_TAX_PAYABLE'
    | 'CO_INCOME_TAX_PAYABLE'
    | 'CO_FAMLI_PAYABLE'
    | 'DENVER_OPT_PAYABLE'
    | 'DENVER_BUSINESS_OPT_PAYABLE'
    | 'AZ_INCOME_TAX_PAYABLE'
    | 'AK_UI_PAYABLE'
    | 'WA_PFML_PAYABLE'
    | 'WA_CARES_PAYABLE'
    | 'OR_INCOME_TAX_PAYABLE'
    | 'OR_STT_PAYABLE'
    | 'OR_PAID_LEAVE_PAYABLE'
    | 'IN_INCOME_TAX_PAYABLE'
    | 'IN_COUNTY_TAX_PAYABLE'
    | 'NC_INCOME_TAX_PAYABLE'
    | 'GA_INCOME_TAX_PAYABLE'
    | 'KY_INCOME_TAX_PAYABLE'
    | 'MS_INCOME_TAX_PAYABLE'
    | 'UT_INCOME_TAX_PAYABLE'
    | 'MN_INCOME_TAX_PAYABLE'
    | 'MT_INCOME_TAX_PAYABLE'
    | 'ND_INCOME_TAX_PAYABLE'
    | 'OK_INCOME_TAX_PAYABLE'
    | 'RI_INCOME_TAX_PAYABLE'
    | 'VA_INCOME_TAX_PAYABLE'
    | 'MA_INCOME_TAX_PAYABLE'
    | 'MO_INCOME_TAX_PAYABLE'
    | 'NE_INCOME_TAX_PAYABLE'
    | 'SC_INCOME_TAX_PAYABLE'
    | 'VT_INCOME_TAX_PAYABLE'
    | 'WV_INCOME_TAX_PAYABLE'
    | 'KS_INCOME_TAX_PAYABLE'
    | 'ID_INCOME_TAX_PAYABLE'
    | 'NM_INCOME_TAX_PAYABLE'
    | 'AR_INCOME_TAX_PAYABLE'
    | 'HI_INCOME_TAX_PAYABLE'
    | 'OH_INCOME_TAX_PAYABLE'
    | 'LA_INCOME_TAX_PAYABLE'
    | 'IA_INCOME_TAX_PAYABLE'
    | 'AL_INCOME_TAX_PAYABLE'
    | 'MD_INCOME_TAX_PAYABLE'
    | 'MD_COUNTY_TAX_PAYABLE'
    | 'CT_INCOME_TAX_PAYABLE'
    | 'DE_INCOME_TAX_PAYABLE'
    | 'DC_INCOME_TAX_PAYABLE'
    | 'WI_INCOME_TAX_PAYABLE'
    | 'ME_INCOME_TAX_PAYABLE'
    | 'CT_PAID_LEAVE_PAYABLE'
    | 'DE_PAID_LEAVE_PAYABLE'
    | 'HI_TDI_PAYABLE'
    | 'MA_PFML_PAYABLE'
    | 'VT_CCC_PAYABLE'
    | 'ME_PFML_PAYABLE'
    | 'EMPLOYEE_PRETAX_DEDUCTIONS_PAYABLE';
  amount: number;
};

export type UsEmployeeResult = {
  employee_id: string;
  name?: string;
  gross_pay: number;
  pretax_401k_deferral: number;
  pretax_section125_deduction: number;
  federal_taxable_wages: number;
  fica_and_futa_wages: number;
  federal_income_tax: number;
  employee_social_security: number;
  employer_social_security: number;
  employee_medicare: number;
  employer_medicare: number;
  employee_additional_medicare: number;
  employer_futa: number;
  employer_sui: number;
  ca_income_tax: number;
  ca_sdi: number;
  nj_income_tax: number;
  nj_ui_wf_swf: number;
  nj_tdi: number;
  nj_fli: number;
  ny_income_tax: number;
  nyc_income_tax: number;
  yonkers_tax: number;
  ny_pfl: number;
  ny_dbl: number;
  il_income_tax: number;
  pa_income_tax: number;
  pa_uc: number;
  phl_wage_tax: number;
  mi_income_tax: number;
  co_income_tax: number;
  co_famli: number;
  denver_opt_employee: number;
  denver_opt_employer: number;
  az_income_tax: number;
  ak_ui: number;
  wa_pfml: number;
  wa_cares: number;
  or_income_tax: number;
  or_stt: number;
  or_paid_leave_employee: number;
  in_income_tax: number;
  in_county_tax: number;
  nc_income_tax: number;
  ga_income_tax: number;
  ky_income_tax: number;
  ms_income_tax: number;
  ut_income_tax: number;
  mn_income_tax: number;
  mt_income_tax: number;
  nd_income_tax: number;
  ok_income_tax: number;
  ri_income_tax: number;
  va_income_tax: number;
  ma_income_tax: number;
  mo_income_tax: number;
  ne_income_tax: number;
  sc_income_tax: number;
  vt_income_tax: number;
  wv_income_tax: number;
  ks_income_tax: number;
  id_income_tax: number;
  nm_income_tax: number;
  ar_income_tax: number;
  hi_income_tax: number;
  oh_income_tax: number;
  la_income_tax: number;
  ia_income_tax: number;
  al_income_tax: number;
  md_income_tax: number;
  md_county_tax: number;
  ct_income_tax: number;
  de_income_tax: number;
  dc_income_tax: number;
  wi_income_tax: number;
  me_income_tax: number;
  ct_paid_leave: number;
  de_paid_leave: number;
  hi_tdi: number;
  ma_pfml: number;
  vt_ccc_employee: number;
  me_pfml: number;
  net_pay: number;
  employer_cost_total: number;
  ytd_ss_wages_after: number;
  ytd_medicare_wages_after: number;
  ytd_futa_wages_after: number;
  ytd_sui_wages_after: number;
  ytd_nj_ui_wf_wages_after: number;
  ytd_nj_tdi_fli_wages_after: number;
  ytd_co_famli_wages_after: number;
  ytd_ak_ui_wages_after: number;
  ytd_wa_pfml_wages_after: number;
  ytd_ny_pfl_tax_after: number;
  ytd_or_paid_leave_wages_after: number;
  ytd_ct_paid_leave_wages_after: number;
  ytd_de_paid_leave_wages_after: number;
  ytd_ma_pfml_wages_after: number;
  ytd_me_pfml_wages_after: number;
};

export type UsPayrollRunResult = {
  rule_pack_id: string;
  country_code: 'US';
  currency: 'USD';
  status: 'PREPARED';
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  employees: UsEmployeeResult[];
  totals: {
    gross_pay: number;
    federal_income_tax: number;
    fica_employee: number;
    fica_employer: number;
    futa: number;
    sui: number;
    ca_income_tax: number;
    ca_sdi: number;
    nj_income_tax: number;
    nj_ui_wf_swf: number;
    nj_tdi: number;
    nj_fli: number;
    ny_income_tax: number;
    nyc_income_tax: number;
    yonkers_tax: number;
    ny_pfl: number;
    ny_dbl: number;
    il_income_tax: number;
    pa_income_tax: number;
    pa_uc: number;
    phl_wage_tax: number;
    mi_income_tax: number;
    co_income_tax: number;
    co_famli: number;
    denver_opt_employee: number;
    denver_opt_employer: number;
    az_income_tax: number;
    ak_ui: number;
    wa_pfml: number;
    wa_cares: number;
    or_income_tax: number;
    or_stt: number;
    or_paid_leave_employee: number;
    in_income_tax: number;
    in_county_tax: number;
    nc_income_tax: number;
    ga_income_tax: number;
    ky_income_tax: number;
    ms_income_tax: number;
    ut_income_tax: number;
    mn_income_tax: number;
    mt_income_tax: number;
    nd_income_tax: number;
    ok_income_tax: number;
    ri_income_tax: number;
    va_income_tax: number;
    ma_income_tax: number;
    mo_income_tax: number;
    ne_income_tax: number;
    sc_income_tax: number;
    vt_income_tax: number;
    wv_income_tax: number;
    ks_income_tax: number;
    id_income_tax: number;
    nm_income_tax: number;
    ar_income_tax: number;
    hi_income_tax: number;
    oh_income_tax: number;
    la_income_tax: number;
    ia_income_tax: number;
    al_income_tax: number;
    md_income_tax: number;
    md_county_tax: number;
    ct_income_tax: number;
    de_income_tax: number;
    dc_income_tax: number;
    wi_income_tax: number;
    me_income_tax: number;
    ct_paid_leave: number;
    de_paid_leave: number;
    hi_tdi: number;
    ma_pfml: number;
    vt_ccc_employee: number;
    me_pfml: number;
    pretax_deductions: number;
    net_pay: number;
    employer_cost_total: number;
  };
  journal: UsJournalLine[];
  controls: {
    journal_balanced: boolean;
    journal_debits: number;
    journal_credits: number;
    employee_count: number;
  };
  limitations: string[];
};

export const PAYROLL_RULE_PACK_US = {
  // v19: adds employer-side State Unemployment Insurance (SUI). Unlike
  // every other figure in this file, SUI's RATE is not a published
  // statutory constant -- each state assigns every employer its own
  // experience-rated percentage annually via that employer's own rate
  // notice, and the taxable WAGE BASE, while state-published, also
  // changes state-by-state every year. Rather than embed 50 more
  // AI-researched, easily-stale numbers (the exact risk this file's own
  // FUTA-credit-reduction and SS-wage-base caveats already flag), this
  // engine requires the CALLER to supply both sui_rate and
  // sui_wage_base per employee straight off their own state rate
  // notice, then does the part that's actually error-prone to hand-roll
  // correctly: period proration, YTD wage-base capping (ceilingContribution,
  // same primitive as FICA/FUTA), multi-employee aggregation, and journal
  // posting. Both fields are OPTIONAL and default to "not computed" --
  // every existing caller/self-test that doesn't pass them is unaffected
  // (employer_sui: 0), preserving exact backward compatibility.
  // v18: fixed Ohio -- a real dated rate change (HB 96, eff. 2026-08-01)
  // caught by cross-checking this file against a user-supplied formula
  // pack. All other states/federal figures in that pack were checked
  // and matched what was already here. See limitations for detail.
  // v20: adds Denver's employer-paid Business OPT ($4.00/month, same
  // $500/month earnings-threshold gate as the employee OPT already
  // modeled), closing a gap the v8 limitations had explicitly named as
  // "an employer-side fixed cost this engine has no place to post."
  // v22: golden-fixture follow-up pass, closing several of the 10
  // structurally-out-of-scope gaps identified by the v21 pass (see the
  // v21 pass-summary limitations entry) rather than a rate correction —
  // adds (1) supplemental-wage flat-rate withholding, federal (22% Pub
  // 15-T optional method) plus 8 states with their own sourced flat
  // supplemental rate (AR, MN, MO, MT, ND, NE, RI, WI); (2) a general
  // federal_w4_exempt flag plus DC's own D-4 EXEMPT certificate flag; (3)
  // Maine (ME) as a new supported 49th state, percentage method,
  // worked-example-verified against Maine Revenue Services' own current
  // booklet; (4) CT Paid Leave, DE Paid Leave, HI TDI, MA PFML, and VT's
  // Child Care Contribution — the 5 secondary payroll-program gaps named
  // in the v21 summary. Mississippi's real per-period wage-bracket-table
  // gap is investigated further this pass (confirmed no formula-
  // equivalent exists in MS's own guide beyond the existing 2-tier
  // model) but deliberately NOT force-fixed — see the mississippi
  // limitations entry, unchanged in substance from v21.
  id: 'US-50-STATES-PLUS-DC-PLUS-ME-2026-FEDERAL-PERCENTAGE-METHOD-DRAFT-V22',
  status: 'DRAFT_NEEDS_LEGAL_REVIEW' as const,
  currency: 'USD',
  fica: {
    social_security_rate: 0.062,
    social_security_wage_base_annual: 184500,
    medicare_rate: 0.0145,
    additional_medicare_rate: 0.009,
    additional_medicare_threshold_annual: 200000
  },
  // Federal supplemental-wage flat-rate withholding (IRS Pub 15-T (2026),
  // Section 1, "Withholding on Supplemental Wages"): 22% flat on
  // supplemental wages up to $1,000,000 cumulative in the calendar year;
  // 37% mandatory on the excess above $1,000,000. This engine has no
  // year-to-date supplemental-wage tracker, so only the 22% tier is
  // implemented — see limitations.
  federal_supplemental: {
    flat_rate: 0.22,
    mandatory_37_percent_threshold_annual: 1000000
  },
  futa: {
    gross_rate: 0.06,
    wage_base_annual: 7000,
    net_rate_default: 0.006,
    net_rate_by_state: {
      CA: 0.018
    } as Record<string, number>
  },
  federal_income_tax: {
    periods_per_year: { WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12 } as Record<UsPayFrequency, number>,
    step2_not_checked_deduction_mfj: 12900,
    step2_not_checked_deduction_other: 8600,
    // 2026 Percentage Method Tables for Automated Payroll Systems, Annual
    // STANDARD Withholding Rate Schedules and Step-2-Checkbox schedules
    // (IRS Pub 15-T, section 1). Brackets: [atLeast, base, rate].
    standard: {
      MFJ: [
        [0, 0, 0], [19300, 0, 0.10], [44100, 2480, 0.12], [120100, 11600, 0.22],
        [230700, 35932, 0.24], [422850, 82048, 0.32], [531750, 116896, 0.35], [788000, 206583.5, 0.37]
      ],
      SINGLE_MFS: [
        [0, 0, 0], [7500, 0, 0.10], [19900, 1240, 0.12], [57900, 5800, 0.22],
        [113200, 17966, 0.24], [209275, 41024, 0.32], [263725, 58448, 0.35], [648100, 192979.25, 0.37]
      ],
      HOH: [
        [0, 0, 0], [15550, 0, 0.10], [33250, 1770, 0.12], [83000, 7740, 0.22],
        [121250, 16155, 0.24], [217300, 39207, 0.32], [271750, 56631, 0.35], [656150, 191171, 0.37]
      ]
    } as Record<UsFederalFilingStatus, Array<[number, number, number]>>,
    step2Checkbox: {
      MFJ: [
        [0, 0, 0], [16100, 0, 0.10], [28500, 1240, 0.12], [66500, 5800, 0.22],
        [121800, 17966, 0.24], [217875, 41024, 0.32], [272325, 58448, 0.35], [400450, 103291.75, 0.37]
      ],
      SINGLE_MFS: [
        [0, 0, 0], [8050, 0, 0.10], [14250, 620, 0.12], [33250, 2900, 0.22],
        [60900, 8983, 0.24], [108938, 20512, 0.32], [136163, 29224, 0.35], [328350, 96489.63, 0.37]
      ],
      HOH: [
        [0, 0, 0], [12075, 0, 0.10], [20925, 885, 0.12], [45800, 3870, 0.22],
        [64925, 8077.5, 0.24], [112950, 19603.5, 0.32], [140175, 28315.5, 0.35], [332375, 95585.5, 0.37]
      ]
    } as Record<UsFederalFilingStatus, Array<[number, number, number]>>
  },
  california: {
    sdi_rate: 0.013,
    // EDD 2026 Withholding Schedules, Method B - Exact Calculation.
    // Table 1: Low Income Exemption (per payroll period).
    low_income_exemption: {
      WEEKLY: { SINGLE: 363, MARRIED_0_OR_1: 363, MARRIED_2_OR_MORE: 727, HEAD_OF_HOUSEHOLD: 727 },
      BIWEEKLY: { SINGLE: 727, MARRIED_0_OR_1: 727, MARRIED_2_OR_MORE: 1454, HEAD_OF_HOUSEHOLD: 1454 },
      SEMIMONTHLY: { SINGLE: 787, MARRIED_0_OR_1: 787, MARRIED_2_OR_MORE: 1575, HEAD_OF_HOUSEHOLD: 1575 },
      MONTHLY: { SINGLE: 1575, MARRIED_0_OR_1: 1575, MARRIED_2_OR_MORE: 3149, HEAD_OF_HOUSEHOLD: 3149 }
    } as Record<UsPayFrequency, Record<UsCaFilingStatus, number>>,
    // Table 2: Estimated Deduction Table, per additional allowance claimed.
    estimated_deduction_per_allowance: { WEEKLY: 19, BIWEEKLY: 38, SEMIMONTHLY: 42, MONTHLY: 83 } as Record<UsPayFrequency, number>,
    // Table 3: Standard Deduction Table.
    standard_deduction: {
      WEEKLY: { SINGLE: 110, MARRIED_0_OR_1: 110, MARRIED_2_OR_MORE: 219, HEAD_OF_HOUSEHOLD: 219 },
      BIWEEKLY: { SINGLE: 219, MARRIED_0_OR_1: 219, MARRIED_2_OR_MORE: 439, HEAD_OF_HOUSEHOLD: 439 },
      SEMIMONTHLY: { SINGLE: 238, MARRIED_0_OR_1: 238, MARRIED_2_OR_MORE: 476, HEAD_OF_HOUSEHOLD: 476 },
      MONTHLY: { SINGLE: 476, MARRIED_0_OR_1: 476, MARRIED_2_OR_MORE: 951, HEAD_OF_HOUSEHOLD: 951 }
    } as Record<UsPayFrequency, Record<UsCaFilingStatus, number>>,
    // Table 4: Exemption Allowance Table, per regular allowance claimed.
    exemption_allowance_credit_per_allowance: { WEEKLY: 3.24, BIWEEKLY: 6.47, SEMIMONTHLY: 7.01, MONTHLY: 14.03 } as Record<UsPayFrequency, number>,
    // Tables 17-28: Tax Rate Tables by payroll period. Brackets: [atLeast, base, rate].
    // "married" rate table applies to both MARRIED_0_OR_1 and MARRIED_2_OR_MORE
    // (the allowance count only changes which low-income/standard-deduction
    // column is used, per EDD's own table structure).
    rate_tables: {
      WEEKLY: {
        SINGLE: [[0, 0, 0.011], [213, 2.34, 0.022], [505, 8.76, 0.044], [797, 21.61, 0.066], [1107, 42.07, 0.088], [1399, 67.77, 0.1023], [7144, 655.48, 0.1133], [8573, 817.39, 0.1243], [14288, 1527.76, 0.1353], [19231, 2196.55, 0.1463]],
        MARRIED: [[0, 0, 0.011], [426, 4.69, 0.022], [1010, 17.54, 0.044], [1594, 43.24, 0.066], [2214, 84.16, 0.088], [2798, 135.55, 0.1023], [14288, 1310.98, 0.1133], [17146, 1634.79, 0.1243], [28575, 1893.96, 0.1353], [38462, 3158.2, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [426, 4.69, 0.022], [1010, 17.54, 0.044], [1302, 30.39, 0.066], [1612, 50.85, 0.088], [1904, 76.55, 0.1023], [9716, 875.72, 0.1133], [11659, 1095.86, 0.1243], [19231, 2037.06, 0.1353], [19431, 2064.12, 0.1463]]
      },
      BIWEEKLY: {
        SINGLE: [[0, 0, 0.011], [426, 4.69, 0.022], [1010, 17.54, 0.044], [1594, 43.24, 0.066], [2214, 84.16, 0.088], [2798, 135.55, 0.1023], [14288, 1310.98, 0.1133], [17146, 1634.79, 0.1243], [28576, 3055.54, 0.1353], [38462, 4393.12, 0.1463]],
        MARRIED: [[0, 0, 0.011], [852, 9.37, 0.022], [2020, 35.07, 0.044], [3188, 86.46, 0.066], [4428, 168.3, 0.088], [5596, 271.08, 0.1023], [28576, 2621.93, 0.1133], [34292, 3269.55, 0.1243], [38462, 3787.88, 0.1353], [57150, 6316.37, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [852, 9.37, 0.022], [2020, 35.07, 0.044], [2604, 60.77, 0.066], [3224, 101.69, 0.088], [3808, 153.08, 0.1023], [19432, 1751.42, 0.1133], [23318, 2191.7, 0.1243], [38462, 4074.1, 0.1353], [38862, 4128.22, 0.1463]]
      },
      SEMIMONTHLY: {
        SINGLE: [[0, 0, 0.011], [462, 5.08, 0.022], [1094, 18.98, 0.044], [1727, 46.83, 0.066], [2398, 91.12, 0.088], [3030, 146.74, 0.1023], [15478, 1420.17, 0.1133], [18574, 1770.95, 0.1243], [30956, 3310.03, 0.1353], [41667, 4759.23, 0.1463]],
        MARRIED: [[0, 0, 0.011], [924, 10.16, 0.022], [2188, 37.97, 0.044], [3454, 93.67, 0.066], [4796, 182.24, 0.088], [6060, 293.47, 0.1023], [30956, 2840.33, 0.1133], [37148, 3541.88, 0.1243], [41667, 4103.59, 0.1353], [61913, 6842.87, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [924, 10.16, 0.022], [2189, 37.99, 0.044], [2822, 65.84, 0.066], [3492, 110.06, 0.088], [4125, 165.76, 0.1023], [21050, 1897.19, 0.1133], [25260, 2374.18, 0.1243], [41667, 4413.57, 0.1353], [42101, 4472.29, 0.1463]]
      },
      MONTHLY: {
        SINGLE: [[0, 0, 0.011], [924, 10.16, 0.022], [2188, 37.97, 0.044], [3454, 93.67, 0.066], [4796, 182.24, 0.088], [6060, 293.47, 0.1023], [30956, 2840.33, 0.1133], [37148, 3541.88, 0.1243], [61912, 6620.05, 0.1353], [83334, 9518.45, 0.1463]],
        MARRIED: [[0, 0, 0.011], [1848, 20.33, 0.022], [4376, 75.95, 0.044], [6908, 187.36, 0.066], [9592, 364.5, 0.088], [12120, 586.96, 0.1023], [61912, 5680.68, 0.1133], [74296, 7083.79, 0.1243], [83334, 8207.21, 0.1353], [123826, 13685.78, 0.1463]],
        HEAD_OF_HOUSEHOLD: [[0, 0, 0.011], [1848, 20.33, 0.022], [4378, 75.99, 0.044], [5644, 131.69, 0.066], [6984, 220.13, 0.088], [8250, 331.54, 0.1023], [42100, 3794.4, 0.1133], [50520, 4748.39, 0.1243], [83334, 8827.17, 0.1353], [84202, 8944.61, 0.1463]]
      }
    } as Record<UsPayFrequency, Record<'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD', Array<[number, number, number]>>>
  },
  new_jersey: {
    // Employee-paid statutory deductions, 2026 rates (NJDOL benefit-rate
    // announcement, Dec 2025). Unemployment Insurance and Workforce/
    // Supplemental Workforce Fund share one combined rate and wage base;
    // Temporary Disability Insurance and Family Leave Insurance share a
    // separate, higher wage base.
    ui_wf_swf_rate: 0.00425,
    ui_wf_swf_wage_base_annual: 44800,
    tdi_rate: 0.0019,
    fli_rate: 0.0023,
    tdi_fli_wage_base_annual: 171100,
    // NJ-W4 Withholding Allowance Value Table (per payroll period), unchanged
    // since the NJ-WT percentage-method tables took effect Oct 1, 2020 — NJ's
    // brackets and allowance values are set by statute, not annually
    // inflation-indexed like federal/CA, so this remains the current figure.
    allowance_value_per_period: { WEEKLY: 19.2, BIWEEKLY: 38.4, SEMIMONTHLY: 41.6, MONTHLY: 83.3 } as Record<UsPayFrequency, number>,
    // NJ-WT Rate Tables A and B (percentage method), by payroll period.
    // Brackets: [over, base, rate]. Rate A: NJ-W4 filing status Single or
    // Married/CU Partner Separate (box 1 or 3). Rate B: Married/CU Couple
    // Joint, Head of Household, or Qualifying Widow(er) (box 2, 4, or 5)
    // when the employee has not elected a different table on line 3.
    // Rate Tables C, D, and E (elective, chosen via the NJ-W4 wage chart for
    // dual-income households) are NOT implemented — see limitations.
    // CORRECTED (v7): the WEEKLY Rate A $769 bracket base was transcribed
    // as $15.29 from the raw printed NJ-WT rate table, but NJ's OWN worked
    // example in the same publication (Rate "A" weekly $1,200/1 allowance)
    // computes and states $15.28 for this exact bracket — and the unrounded
    // cumulative chain (5.775 -> 11.535 -> 15.279) also rounds to $15.28,
    // not $15.29. NJ's own printed table has a one-cent inconsistency with
    // its own worked example; this file now follows the worked example
    // (and the golden-payslip QA pack's independently-confirmed $40.40 for
    // that exact scenario), not the raw table digit. Found via cross-check
    // against a user-supplied golden-payslip fixture pack, not by routine
    // review — flagged here so the reasoning survives the next edit.
    rate_tables: {
      WEEKLY: {
        A: [[0, 0, 0.015], [385, 5.77, 0.02], [673, 11.54, 0.039], [769, 15.28, 0.061], [1442, 56.35, 0.07], [9615, 628.46, 0.099], [19231, 1580.38, 0.118]],
        B: [[0, 0, 0.015], [385, 5.77, 0.02], [962, 17.31, 0.027], [1346, 27.69, 0.039], [1538, 35.19, 0.061], [2885, 117.31, 0.07], [9615, 588.46, 0.099], [19231, 1540.38, 0.118]]
      },
      BIWEEKLY: {
        A: [[0, 0, 0.015], [769, 12.0, 0.02], [1346, 23.0, 0.039], [1538, 31.0, 0.061], [2885, 113.0, 0.07], [19231, 1257.0, 0.099], [38462, 3161.0, 0.118]],
        B: [[0, 0, 0.015], [769, 12.0, 0.02], [1923, 35.0, 0.027], [2692, 55.0, 0.039], [3077, 70.0, 0.061], [5769, 235.0, 0.07], [19231, 1177.0, 0.099], [38462, 3081.0, 0.118]]
      },
      SEMIMONTHLY: {
        A: [[0, 0, 0.015], [833, 13.0, 0.02], [1458, 25.0, 0.039], [1667, 33.0, 0.061], [3125, 122.0, 0.07], [20833, 1362.0, 0.099], [41667, 3424.0, 0.118]],
        B: [[0, 0, 0.015], [833, 12.5, 0.02], [2083, 37.5, 0.027], [2917, 59.99, 0.039], [3333, 76.25, 0.061], [6250, 254.19, 0.07], [20833, 1275.0, 0.099], [41667, 3338.0, 0.118]]
      },
      MONTHLY: {
        A: [[0, 0, 0.015], [1667, 25.0, 0.02], [2917, 50.0, 0.039], [3333, 66.0, 0.061], [6250, 244.0, 0.07], [41667, 2723.0, 0.099], [83333, 6848.0, 0.118]],
        B: [[0, 0, 0.015], [1667, 25.0, 0.02], [4167, 75.0, 0.027], [5833, 120.0, 0.039], [6667, 153.0, 0.061], [12500, 508.0, 0.07], [41667, 2550.0, 0.099], [83333, 6675.0, 0.118]]
      }
    } as Record<UsPayFrequency, Record<NjRateTable, Array<[number, number, number]>>>
  },
  new_york: {
    // NY-WT Special Tables for Deduction and Exemption Allowances (Table B:
    // per-period deduction by filing status; Table C: value of one exemption
    // by period). Yonkers (NYS-50-T-Y Table A) publishes the SAME deduction
    // table as NY State (confirmed identical figures in both publications)
    // — but NYC's own Table A (NYS-50-T-NYC) uses a materially LOWER
    // deduction base than NY State/Yonkers, even though the per-allowance
    // exemption value (Table C) is identical across all three. Do not
    // conflate the NY State/Yonkers deduction table with NYC's.
    deduction_per_period: { WEEKLY: 142.3, BIWEEKLY: 284.6, SEMIMONTHLY: 308.35, MONTHLY: 616.7 } as Record<UsPayFrequency, number>,
    deduction_per_period_married: { WEEKLY: 152.9, BIWEEKLY: 305.8, SEMIMONTHLY: 331.25, MONTHLY: 662.5 } as Record<UsPayFrequency, number>,
    nyc_deduction_per_period: { WEEKLY: 96.15, BIWEEKLY: 192.3, SEMIMONTHLY: 208.35, MONTHLY: 416.7 } as Record<UsPayFrequency, number>,
    nyc_deduction_per_period_married: { WEEKLY: 105.75, BIWEEKLY: 211.5, SEMIMONTHLY: 229.15, MONTHLY: 458.3 } as Record<UsPayFrequency, number>,
    exemption_per_allowance: { WEEKLY: 19.25, BIWEEKLY: 38.5, SEMIMONTHLY: 41.65, MONTHLY: 83.3 } as Record<UsPayFrequency, number>,
    // NYS-50-T-NYS (1/26) Method II Exact Calculation Method, Tables II-A/B/C/D.
    // Brackets: [atLeast net wages, base, rate]. Valid up to the "Method III
    // Top Income Tax Rates" cutover (~$20-41k/period depending on period and
    // status) — not implemented; see limitations.
    state_rate_tables: {
      WEEKLY: {
        SINGLE: [[0, 0, 0.039], [163, 6.38, 0.044], [225, 9.08, 0.0515], [267, 11.27, 0.054], [1551, 80.58, 0.059], [1862, 98.9, 0.0703], [2070, 113.58, 0.0753], [3032, 186.02, 0.064], [4142, 257.1, 0.1144], [5104, 367.13, 0.0735]],
        MARRIED: [[0, 0, 0.039], [163, 6.38, 0.044], [225, 9.08, 0.0515], [267, 11.27, 0.054], [1551, 80.58, 0.059], [1862, 98.9, 0.0657], [2070, 112.6, 0.0707], [3032, 180.54, 0.0801], [4068, 263.62, 0.064], [6215, 401.04, 0.1349], [7177, 530.77, 0.0735], [20722, 1526.33, 0.0765]]
      },
      BIWEEKLY: {
        SINGLE: [[0, 0, 0.039], [327, 12.77, 0.044], [450, 18.15, 0.0515], [535, 22.54, 0.054], [3102, 161.15, 0.059], [3723, 197.81, 0.0703], [4140, 227.15, 0.0753], [6063, 372.04, 0.064], [8285, 514.19, 0.1144], [10208, 734.27, 0.0735]],
        MARRIED: [[0, 0, 0.039], [327, 12.77, 0.044], [450, 18.15, 0.0515], [535, 22.54, 0.054], [3102, 161.15, 0.059], [3723, 197.81, 0.0657], [4140, 225.19, 0.0707], [6063, 361.08, 0.0801], [8137, 527.23, 0.064], [12431, 802.08, 0.1349], [14354, 1061.54, 0.0735], [41444, 3052.65, 0.0765]]
      },
      SEMIMONTHLY: {
        SINGLE: [[0, 0, 0.039], [354, 13.83, 0.044], [488, 19.67, 0.0515], [579, 24.42, 0.054], [3360, 174.58, 0.059], [4033, 214.29, 0.0703], [4485, 246.08, 0.0753], [6569, 403.04, 0.064], [8975, 557.04, 0.1144], [11058, 795.46, 0.0735]],
        MARRIED: [[0, 0, 0.039], [354, 13.83, 0.044], [488, 19.67, 0.0515], [579, 24.42, 0.054], [3360, 174.58, 0.059], [4033, 214.29, 0.0657], [4485, 243.96, 0.0707], [6569, 391.17, 0.0801], [8815, 571.17, 0.064], [13467, 868.92, 0.1349], [15550, 1150.0, 0.0735], [44898, 3307.04, 0.0765]]
      },
      MONTHLY: {
        SINGLE: [[0, 0, 0.039], [708, 27.67, 0.044], [975, 39.33, 0.0515], [1158, 48.83, 0.054], [6721, 349.17, 0.059], [8067, 428.58, 0.0703], [8971, 492.17, 0.0753], [13138, 806.08, 0.064], [17950, 1114.08, 0.1144], [22117, 1590.92, 0.0735]],
        MARRIED: [[0, 0, 0.039], [708, 27.67, 0.044], [975, 39.33, 0.0515], [1158, 48.83, 0.054], [6721, 349.17, 0.059], [8067, 428.58, 0.0657], [8971, 487.92, 0.0707], [13138, 782.33, 0.0801], [17629, 1142.33, 0.064], [26933, 1737.83, 0.1349], [31100, 2300.0, 0.0735], [89796, 6614.08, 0.0765]]
      }
    } as Record<UsPayFrequency, Record<NyFilingStatus, Array<[number, number, number]>>>,
    // Net-wage threshold at which NYS-50-T-NYS says "Use Method III, Top
    // Income Tax Rates Method" instead of the exact-calculation table above.
    // Method III is NOT implemented — net wages at or above this threshold
    // are rejected rather than mis-taxed at the top exact-calc bracket rate
    // indefinitely (irrelevant for this pack's small-business target
    // segment in practice, but rejected explicitly per this file's
    // fail-closed convention).
    state_method_iii_threshold: {
      WEEKLY: { SINGLE: 20722, MARRIED: 41449 },
      BIWEEKLY: { SINGLE: 41444, MARRIED: 82898 },
      SEMIMONTHLY: { SINGLE: 44898, MARRIED: 89806 },
      MONTHLY: { SINGLE: 89796, MARRIED: 179613 }
    } as Record<UsPayFrequency, Record<NyFilingStatus, number>>,
    // NYS-50-T-NYC (1/26) Method II, Tables II-A/B/C/D. Identical bracket
    // structure for Single and Married filing status (NYC's own table
    // publishes the same rates/thresholds for both) — only the deduction
    // amount from Table A above differs by filing status.
    nyc_rate_table: {
      WEEKLY: [[0, 0, 0.0205], [154, 3.15, 0.028], [167, 3.54, 0.0325], [288, 7.46, 0.0395], [481, 15.06, 0.0415], [1154, 43.0, 0.0425]],
      BIWEEKLY: [[0, 0, 0.0205], [308, 6.31, 0.028], [334, 7.08, 0.0325], [577, 14.92, 0.0395], [962, 30.12, 0.0415], [2308, 86.0, 0.0425]],
      SEMIMONTHLY: [[0, 0, 0.0205], [333, 6.83, 0.028], [362, 7.67, 0.0325], [625, 16.17, 0.0395], [1042, 32.63, 0.0415], [2500, 93.17, 0.0425]],
      MONTHLY: [[0, 0, 0.0205], [667, 13.67, 0.028], [725, 15.33, 0.0325], [1250, 32.33, 0.0395], [2083, 65.25, 0.0415], [5000, 186.33, 0.0425]]
    } as Record<UsPayFrequency, Array<[number, number, number]>>,
    // NYS-50-T-Y (1/26): the Yonkers RESIDENT surcharge is 16.75% of the NY
    // State tax computed on the same net wages via the same state_rate_tables
    // brackets above (confirmed identical column values in the Yonkers
    // publication's own Method II tables) — so no separate Yonkers-resident
    // bracket table is needed, just this multiplier.
    yonkers_resident_surcharge_rate: 0.1675,
    // Yonkers NONRESIDENT earnings tax (Method VII): flat 0.50% of gross
    // wages after a per-period exemption; applies to employees who work in
    // Yonkers but live elsewhere. Brackets: [atLeast gross wages, exemption].
    yonkers_nonresident_rate: 0.005,
    yonkers_nonresident_exemption_tables: {
      WEEKLY: [[0, Infinity], [77, 58], [192, 38], [385, 19], [577, 0]],
      BIWEEKLY: [[0, Infinity], [154, 115], [385, 77], [769, 38], [1154, 0]],
      SEMIMONTHLY: [[0, Infinity], [167, 125], [417, 83], [833, 42], [1250, 0]],
      MONTHLY: [[0, Infinity], [333, 250], [833, 167], [1667, 83], [2500, 0]]
    } as Record<UsPayFrequency, Array<[number, number]>>,
    // NY Paid Family Leave (PFL): applies to every NY employee, no opt-out,
    // at a flat 0.432% of gross wages up to a cumulative ANNUAL DOLLAR cap
    // ($411.91 for 2026) — a dollar cap on the computed tax itself, not a
    // wage-base cap (see capTax vs ceilingContribution). Cross-verified via
    // a second-generation formula-pack document (v6 change log).
    pfl_rate: 0.00432,
    pfl_annual_dollar_cap: 411.91,
    // NY Disability Benefits Law (DBL): employer-elects-to-deduct only, and
    // the statute caps it PER CALENDAR WEEK ($0.60/week) — which has no
    // clean equivalent for biweekly/semimonthly/monthly pay, so this engine
    // only supports it for WEEKLY pay frequency; other frequencies with
    // ny_dbl_opt_in set are rejected rather than approximated.
    dbl_rate: 0.005,
    dbl_weekly_dollar_cap: 0.6
  },
  // --- v5: states sourced from a secondary cross-check reference (a
  // "2026 U.S. Payroll Tax Implementation Reference" document the user
  // supplied), not fetched directly from each state's own primary
  // publication the way CA/NJ/NY were. Only states where that reference
  // supplies a COMPLETE formula (not just a headline rate or a pointer to
  // an official table this engine doesn't have) are implemented here — see
  // the v5 change log at the top of this file and the limitations list for
  // which states were deliberately left out for exactly that reason.
  illinois: {
    // Flat 4.95% on wages after IL-W-4 allowances. 2026 annual allowance
    // amounts: $2,925 per Line 1 allowance (self/spouse), $1,000 per Line 2
    // allowance (dependents), prorated by pay period.
    rate: 0.0495,
    line1_allowance_annual: 2925,
    line2_allowance_annual: 1000
  },
  pennsylvania: {
    // Flat 3.07% of PA taxable compensation, no allowances. Employee UC
    // (Unemployment Compensation) contribution: flat 0.07% of gross wages,
    // no annual wage cap — a real, easy-to-miss EMPLOYEE-paid PA tax
    // distinct from employer-paid SUI.
    income_tax_rate: 0.0307,
    employee_uc_rate: 0.0007,
    // Philadelphia Wage Tax (City of Philadelphia Earnings Tax, employer-
    // withheld portion): a flat rate on gross pay, separate resident vs.
    // non-resident-working-in-Philadelphia rates, both of which change
    // effective 2026-07-01. Confirmed directly against phila.gov (2026-09-14).
    philadelphia_effective_date_2026: '2026-07-01',
    philadelphia_resident_rate_before: 0.03740,
    philadelphia_resident_rate_from: 0.03735,
    philadelphia_nonresident_rate_before: 0.0343,
    philadelphia_nonresident_rate_from: 0.03425
  },
  michigan: {
    // Flat 4.25% on wages after the 2026 personal exemption ($5,900/year
    // per exemption), prorated by pay period. Local city income tax (many
    // MI cities impose one) is NOT modeled — see limitations.
    rate: 0.0425,
    personal_exemption_annual: 5900
  },
  colorado: {
    // DR 1098 percentage method: annualize wages, subtract the DR 0004
    // Line 2 amount (or the statutory default — $11,000 for MFJ/Qualifying
    // Surviving Spouse, $5,500 otherwise — if the employee hasn't filed a
    // DR 0004), multiply by 4.40%, divide by periods, add any DR 0004
    // Line 3 additional per-period withholding.
    rate: 0.044,
    default_subtraction_mfj_or_qss: 11000,
    default_subtraction_other: 5500,
    // FAMLI (Family and Medical Leave Insurance): employee share 0.44% of
    // covered wages up to the SSA wage base ($184,500 in 2026). Employer
    // share/small-employer rules are DYNAMIC and not modeled (employer-side
    // only, doesn't affect what's withheld from the employee).
    famli_employee_rate: 0.0044,
    famli_wage_base_annual: 184500,
    // Denver Occupational Privilege Tax (OPT / "head tax"), City & County
    // of Denver Tax Guide Topic No. 61 (DRMC §53-200 et seq.), confirmed
    // directly 2026-09-14: employee owes $5.75/month once they perform
    // sufficient services in Denver to earn at least $500 in that calendar
    // month; the employer's own $4.00/month Business OPT is a separate,
    // employer-paid liability this engine does NOT track (see limitations
    // — the same gap already exists for WA's employer PFML share).
    denver_opt_employee_monthly: 5.75,
    denver_opt_monthly_earnings_threshold: 500,
    // Business OPT, v20: employer-paid, same $500/month earnings-threshold
    // gate as the employee OPT, per the same denvergov.org Tax Guide
    // Topic 61 already cited for the employee share.
    denver_opt_employer_monthly: 4.00
  },
  arizona: {
    // Form A-4 employee election: a flat percentage of Arizona taxable
    // wages, chosen by the employee from a fixed statutory set (no
    // allowance/bracket calculation at all). This engine requires the
    // caller to supply the employee's actual election rather than
    // defaulting to the statutory default of 2.0% for a timely-filed-A-4
    // employee — a wrong default is worse than a required field.
    valid_election_percents: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
  },
  alaska: {
    // No state income tax. Alaska is one of only three states (with NJ and
    // PA) where the EMPLOYEE also contributes to state unemployment
    // insurance, at a flat statutory rate, uncapped by employer experience
    // rating (the employer's own UI rate is separate and DYNAMIC).
    ui_employee_rate: 0.005,
    ui_wage_base_annual: 54200
  },
  washington: {
    // No state income tax. Two separate employee-paid statutory programs:
    // WA Paid Family & Medical Leave (PFML) — total premium 1.13% of wages
    // up to the SSA wage base ($184,500), of which the employee's fixed
    // statutory share is 71.43% (the remainder is an employer-side cost
    // subject to small-employer exemptions this engine doesn't model); and
    // WA Cares (long-term care) — a flat 0.58% employee contribution with
    // NO wage cap, subject to state-approved individual exemptions this
    // engine also doesn't model (see limitations).
    pfml_total_rate: 0.0113,
    pfml_employee_share_of_total: 0.7143,
    pfml_wage_base_annual: 184500,
    wa_cares_employee_rate: 0.0058
  },
  oregon: {
    // 2026 Oregon Withholding Tax Formulas, Pub. 150-206-436 (Rev.
    // 12-31-25, effective 2026-01-01). oregon.gov is unreachable from this
    // environment, so the publication was fetched via a text-extraction
    // proxy and re-queried three times with independently-worded prompts,
    // producing byte-identical numbers each time. Independently
    // corroborated by the USDA National Finance Center's federal payroll-
    // processing bulletin (TAXES 25-xx, effective PP06 2025), which
    // reproduces the PRIOR year's (2025) Oregon formula in the identical
    // structural pattern — every 2026 figure below sits ~2.6-2.9% above
    // its NFC-confirmed 2025 counterpart, consistent with one annual
    // indexing factor, not independent errors. The one fixture-tested
    // value (annual OR WH = 678 + 8.75% x (108,340-11,400) = 9,160.25 for
    // $120,000 annual wages, 0 allowances) matches both sources AND the
    // golden-payslip fixture exactly. See v9 change log for the full
    // reconciliation, including one discarded number ("$38,340") that
    // appeared in the proxy-fetched text but not in the NFC structure and
    // was NOT used.
    //
    // Two bracket "tracks": NARROW (single, fewer than 3 allowances) and
    // WIDE (married, OR single claiming 3+ allowances — a real documented
    // quirk, not a simplification). Each track has its own standard
    // deduction and its own pair of bracket tables, selected by whether
    // ANNUAL WAGES are below or at/above $50,000 (the federal-tax-
    // subtraction cap only binds at the higher tier).
    standard_deduction_narrow_annual: 2910,
    standard_deduction_wide_annual: 5820,
    exemption_credit_per_allowance_annual: 263,
    wage_tier_boundary_annual: 50000,
    // Federal tax subtraction: uncapped (use actual annualized federal
    // income tax withheld) below the wage-tier boundary; capped by this
    // phase-out schedule (keyed by ANNUAL WAGES, by FILING STATUS — not by
    // allowance count) at/above it.
    federal_subtraction_phaseout_single: [
      [0, 8750], [125000, 7000], [130000, 5250], [135000, 3500], [140000, 1750], [145000, 0]
    ] as Array<[number, number]>,
    federal_subtraction_phaseout_married: [
      [0, 8750], [250000, 7000], [260000, 5250], [270000, 3500], [280000, 1750], [290000, 0]
    ] as Array<[number, number]>,
    // Bracket rows: [BASE atLeast, base tax, rate].
    brackets_narrow_under_wage_tier: [[0, 263, 0.0475], [4550, 479, 0.0675], [11400, 941, 0.0875]] as Array<[number, number, number]>,
    brackets_narrow_at_or_over_wage_tier: [[0, 0, 0], [11400, 678, 0.0875], [125000, 10618, 0.099]] as Array<[number, number, number]>,
    brackets_wide_under_wage_tier: [[0, 263, 0.0475], [9100, 695, 0.0675], [22800, 1620, 0.0875]] as Array<[number, number, number]>,
    brackets_wide_at_or_over_wage_tier: [[0, 0, 0], [22800, 1357, 0.0875], [250000, 21237, 0.099]] as Array<[number, number, number]>,
    // Statewide Transit Tax: flat, no wage cap, unchanged since 2018.
    stt_rate: 0.001,
    // Paid Leave Oregon: 1% total (0.6% employee / 0.4% employer for
    // employers with 25+ workers — employer share not modeled, same
    // precedent as WA's employer PFML share), wage base pegged to the SSA
    // taxable maximum, confirmed independently via paidleave.oregon.gov
    // (2026-09-14).
    paid_leave_employee_rate: 0.006,
    paid_leave_wage_base_annual: 184500
  },
  indiana: {
    // Indiana Department of Revenue, Departmental Notice #1 (R46 / 01-26,
    // effective 2026-01-01) — fetched directly and independently 2026-09-14.
    // Flat 2.95% state rate on gross wages after THREE separate annual
    // exemption amounts (each divided by the pay-period count): personal
    // ($1,000/exemption, WH-4 line 5), dependent ($1,500/exemption, WH-4
    // lines 6 AND 7 — "additional" and "first-time additional" dependents
    // both use the same $1,500 rate, so this engine sums them into one
    // caller-supplied count), and adopted child ($3,000/exemption, WH-4
    // line 8). PLUS mandatory county income tax at the flat rate for the
    // employee's Indiana county of residence (or county of principal work
    // if a Jan-1 out-of-state resident) — the same taxable-income base as
    // the state tax. This engine requires in_county explicitly rather than
    // silently omitting county tax, which was the reason Indiana was
    // rejected entirely in earlier versions of this file.
    rate: 0.0295,
    personal_exemption_annual: 1000,
    dependent_exemption_annual: 1500,
    adopted_child_exemption_annual: 3000,
    // County tax rates effective 2026-01-01, all 92 counties, as published
    // in Departmental Notice #1.
    county_tax_rates: {
      'Adams': 0.016, 'Allen': 0.0159, 'Bartholomew': 0.0175, 'Benton': 0.0179,
      'Blackford': 0.025, 'Boone': 0.017, 'Brown': 0.025234, 'Carroll': 0.024733,
      'Cass': 0.0295, 'Clark': 0.02, 'Clay': 0.0235, 'Clinton': 0.0265,
      'Crawford': 0.0165, 'Daviess': 0.015, 'Dearborn': 0.014, 'Decatur': 0.0245,
      'DeKalb': 0.0213, 'Delaware': 0.015, 'Dubois': 0.012, 'Elkhart': 0.02,
      'Fayette': 0.0282, 'Floyd': 0.0189, 'Fountain': 0.021, 'Franklin': 0.017,
      'Fulton': 0.0288, 'Gibson': 0.013, 'Grant': 0.0275, 'Greene': 0.0235,
      'Hamilton': 0.011, 'Hancock': 0.0194, 'Harrison': 0.01, 'Hendricks': 0.017,
      'Henry': 0.0202, 'Howard': 0.0235, 'Huntington': 0.0195, 'Jackson': 0.021,
      'Jasper': 0.02864, 'Jay': 0.025, 'Jefferson': 0.0103, 'Jennings': 0.025,
      'Johnson': 0.014, 'Knox': 0.017, 'Kosciusko': 0.01, 'LaGrange': 0.0165,
      'Lake': 0.015, 'LaPorte': 0.0145, 'Lawrence': 0.0175, 'Madison': 0.0225,
      'Marion': 0.0202, 'Marshall': 0.0125, 'Martin': 0.025, 'Miami': 0.0254,
      'Monroe': 0.0214, 'Montgomery': 0.0265, 'Morgan': 0.0272, 'Newton': 0.01,
      'Noble': 0.0175, 'Ohio': 0.02, 'Orange': 0.0175, 'Owen': 0.025,
      'Parke': 0.0265, 'Perry': 0.014, 'Pike': 0.012, 'Porter': 0.005,
      'Posey': 0.0145, 'Pulaski': 0.0285, 'Putnam': 0.023, 'Randolph': 0.03,
      'Ripley': 0.0238, 'Rush': 0.0215, 'St. Joseph': 0.0175, 'Scott': 0.0216,
      'Shelby': 0.017, 'Spencer': 0.008, 'Starke': 0.0171, 'Steuben': 0.0199,
      'Sullivan': 0.017, 'Switzerland': 0.0145, 'Tippecanoe': 0.0128, 'Tipton': 0.026,
      'Union': 0.0275, 'Vanderburgh': 0.0125, 'Vermillion': 0.015, 'Vigo': 0.02,
      'Wabash': 0.029, 'Warren': 0.0212, 'Warrick': 0.01, 'Washington': 0.02,
      'Wayne': 0.0125, 'Wells': 0.021, 'White': 0.0232, 'Whitley': 0.016829
    } as Record<string, number>
  },
  north_carolina: {
    // NCDOR Form NC-30 (Web 11-25), 2026 Income Tax Withholding Tables and
    // Instructions for Employers — fetched directly and independently
    // 2026-09-14. Percentage method, applied PER PERIOD (not annualized):
    // rate is 4.09% (the statutory 3.99% individual income tax rate for
    // 2026 plus a 0.1% adjustment NC's own formula bakes into the
    // withholding rate — confirmed in NC-30's own text, not a discrepancy).
    // Two filing-status tracks only: "Single, Married Person, or Surviving
    // Spouse" (one combined table) and "Head of Household". Standard
    // deduction and allowance value are divided by the pay-period count
    // each run (reproduces NC-30's own printed per-period constants
    // exactly, e.g. $12,750/52 = $245.19weekly). Final per-period tax is
    // rounded to the NEAREST WHOLE DOLLAR, not cents — the one state in
    // this file that rounds this way; confirmed via NC-30's own worked
    // example ($450 weekly, single, 2 allowances -> $4.00).
    rate: 0.0409,
    standard_deduction_annual: {
      SINGLE_MARRIED_OR_SURVIVING_SPOUSE: 12750,
      HEAD_OF_HOUSEHOLD: 19125
    } as Record<NcFilingStatus, number>,
    allowance_value_annual: 2500
  },
  // v11: ten more states, each sourced from ONE source only — that state's
  // own current USDA National Finance Center federal payroll-processing
  // bulletin (help.nfc.usda.gov), NOT independently cross-checked against
  // a second source or a worked example the way CA/NJ/NY/OR/IN/NC were.
  // This is the SAME confidence tier as the original v5 batch (IL, PA, MI,
  // CO, AZ, AK, WA) — a real government-adjacent source (NFC programs
  // actual federal payroll systems from these), but single-source. Treated
  // as lower confidence than the dual/primary-sourced states; see
  // limitations for the full caveat and the states explicitly NOT
  // attempted this pass for lack of adequate sourcing (MD, CT, AL, IA, DE,
  // WI, DC).
  georgia: {
    // NFC bulletin, effective PP13 2026. Flat rate after a standard
    // deduction that depends on a three-way filing-status split (GA's own
    // categories, not the federal MFJ/MFS/HOH split), plus a flat
    // per-dependent allowance.
    rate: 0.0499,
    standard_deduction: {
      SINGLE_OR_HOH: 15000,
      MFS_OR_MFJ_BOTH_WORKING: 15000,
      MFJ_ONE_WORKING: 30000
    } as Record<GaFilingStatus, number>,
    dependent_allowance_annual: 5000
  },
  kentucky: {
    // NFC bulletin, effective PP02 2026. Flat rate, single flat standard
    // deduction, no allowances or filing-status split.
    rate: 0.035,
    standard_deduction_annual: 3360
  },
  mississippi: {
    // v23: re-verified 2026-09-19 directly against THREE independent
    // sources that all agree exactly: (1) Mississippi DOR's own "Computer
    // Payroll Accounting - For Periods In 2026" flowchart (dor.ms.gov,
    // revised 8/13/25) — MS's own sanctioned method for automated/
    // computerized payroll systems (exactly what this engine is), giving
    // TI = AGP - (EX + STDED), 4.0% of TI over $10,000, $0 at or below,
    // ROUND TO WHOLE DOLLARS; (2) USDA NFC's federal payroll bulletin
    // (help.nfc.usda.gov, NFC-26-1768327516, PP09 2026), which
    // independently confirms the same personal-exemption table AND the
    // explicit no-certificate-filed default ("Single and zero personal
    // exemptions (S00) will be used"); (3) Mississippi Form 89-350 itself
    // (Form 89-350-25-8-1-000, Rev. 10/25, dor.ms.gov) — the actual
    // employee-facing exemption certificate, confirming $6,000 (Single),
    // $12,000 (Married, joint), $9,500 (Head of Family), $1,500 per
    // dependent, and (new in v23) an additional $1,500 per block checked
    // on Line 5 for age 65+ and blindness (each spouse, each condition).
    brackets: [[0, 0, 0], [10000, 0, 0.04]] as Array<[number, number, number]>,
    base_deduction_and_exemption: {
      SINGLE: 8300, // $2,300 standard deduction + $6,000 personal exemption
      HEAD_OF_HOUSEHOLD: 12900, // $3,400 + $9,500
      MARRIED: 16600 // $4,600 + $12,000
    } as Record<MsFilingStatus, number>,
    dependent_exemption_annual: 1500,
    age_or_blindness_exemption_annual: 1500 // Form 89-350 Line 5, v23
  },
  utah: {
    // NFC bulletin, effective PP12 2026. Flat rate on FULL annual wages
    // (no standard deduction subtracted from the wage base) — instead a
    // small annual TAX CREDIT is computed and subtracted from the
    // computed tax itself, phasing to zero as wages rise above a
    // threshold. This is a genuinely different mechanism from every other
    // state in this file (which all reduce the WAGE base, not the tax).
    rate: 0.0445,
    base_allowance_annual: { SINGLE: 485, MARRIED: 970 } as Record<UtFilingStatus, number>,
    credit_phaseout_rate: 0.013,
    credit_phaseout_threshold_annual: { SINGLE: 9348, MARRIED: 18696 } as Record<UtFilingStatus, number>
  },
  minnesota: {
    // NFC bulletin, effective PP unspecified 2026. Four brackets, flat
    // per-allowance exemption amount.
    // Supplemental wages: Minnesota Department of Revenue, "2026
    // Minnesota Withholding Tax Instructions and Tables" (wh-inst-26.pdf,
    // fetched and read directly 2026-09-16), p.9: "Supplemental payments
    // made to an employee separately from regular wages are subject to
    // the 6.25% Minnesota withholding rate regardless of how many
    // allowances employees claim."
    supplemental_flat_rate: 0.0625,
    allowance_value_annual: 5300,
    brackets: {
      SINGLE: [[0, 0, 0], [4700, 0, 0.0535], [38010, 1782.09, 0.068], [114130, 6958.25, 0.0785], [207850, 14315.27, 0.0985]],
      MARRIED: [[0, 0, 0], [14700, 0, 0.0535], [63400, 2605.45, 0.068], [208180, 12450.49, 0.0785], [352630, 23789.82, 0.0985]]
    } as Record<MnFilingStatus, Array<[number, number, number]>>
  },
  montana: {
    // NFC bulletin, effective PP unspecified 2026. Three brackets per
    // filing-status track; the $0 first bracket IS the effective
    // deduction (no separate standard deduction subtracted).
    // Supplemental wages: Montana's optional flat 5% supplemental
    // withholding method — this engine's own direct-fetch attempt of the
    // Montana Employer and Information Agent Guide returned a dead
    // link (revenue.mt.gov, 2026-09-16); the 5% figure is corroborated
    // instead by multiple independent payroll-industry secondary sources
    // (PaycheckCity's Montana bonus calculator, TimeTrex, Deel's state
    // supplemental-rate guide) all agreeing on the same figure, plus a
    // USDA NFC bulletin (help.nfc.usda.gov/bulletins/2026/1767632355.htm)
    // confirming Montana's regular-wage brackets but NOT itself covering
    // supplemental wages. Materially lower confidence than a directly-
    // fetched primary source — flagged in limitations, not glossed over.
    supplemental_flat_rate: 0.05,
    brackets: {
      SINGLE_OR_MFS_OR_BOTH_WORKING: [[0, 0, 0], [16100, 0, 0.047], [63600, 2233, 0.0565]],
      MARRIED_FILING_JOINTLY: [[0, 0, 0], [32200, 0, 0.047], [127200, 4465, 0.0565]],
      HEAD_OF_HOUSEHOLD: [[0, 0, 0], [24150, 0, 0.047], [95400, 3349, 0.0565]]
    } as Record<MtFilingStatus, Array<[number, number, number]>>
  },
  north_dakota: {
    // NFC bulletin, effective PP unspecified 2026. Three brackets per
    // filing-status track, flat per-exemption allowance (ND's own bulletin
    // calls these "Federal Exemptions" — the pre-2020-W-4-style count).
    // Supplemental wages: North Dakota Office of State Tax Commissioner,
    // "Income Tax Withholding" guidance page (tax.nd.gov/business/
    // income-tax-withholding, fetched directly 2026-09-16): "you can
    // multiply the supplemental wages by 1.5% (.015)."
    supplemental_flat_rate: 0.015,
    exemption_value_annual: 5050,
    brackets: {
      SINGLE_OR_MFS: [[0, 0, 0], [57625, 0, 0.0195], [258450, 3916.09, 0.025]],
      MARRIED_FILING_JOINTLY: [[0, 0, 0], [57500, 0, 0.0195], [168525, 2164.99, 0.025]],
      HEAD_OF_HOUSEHOLD: [[0, 0, 0], [78475, 0, 0.0195], [289675, 4118.4, 0.025]]
    } as Record<NdFilingStatus, Array<[number, number, number]>>
  },
  oklahoma: {
    // NFC bulletin, effective PP unspecified 2026. Four brackets per
    // filing-status track, flat per-exemption allowance.
    exemption_value_annual: 1000,
    brackets: {
      SINGLE_OR_HOH: [[0, 0, 0], [10100, 0, 0.025], [11250, 28.75, 0.035], [13550, 109.25, 0.045]],
      MARRIED: [[0, 0, 0], [20200, 0, 0.025], [22500, 57.5, 0.035], [27100, 218.5, 0.045]]
    } as Record<OkFilingStatus, Array<[number, number, number]>>
  },
  rhode_island: {
    // NFC bulletin, effective PP03 2026. One unified bracket table (RI's
    // own bulletin does not split by filing status). A flat $1,000
    // exemption applies below a wage threshold; above it, $0.
    // Supplemental wages: Rhode Island's flat 5.99% supplemental rate
    // (the same rate as RI's own top bracket in the table above) —
    // corroborated across multiple payroll-industry secondary sources
    // citing the RI Division of Taxation's "2026 Rhode Island Employer's
    // Income Tax Withholding Tables" booklet; this engine's own direct
    // fetch of that booklet PDF returned malformed binary content, so
    // this is a secondary-source-only citation, not independently
    // re-verified against the booklet's own text — flagged in
    // limitations.
    supplemental_flat_rate: 0.0599,
    exemption_annual: 1000,
    exemption_wage_ceiling_annual: 290800,
    brackets: [[0, 0, 0.0375], [82050, 3076.88, 0.0475], [186450, 8035.88, 0.0599]] as Array<[number, number, number]>
  },
  virginia: {
    // NFC bulletin, effective PP14 2025 (most recent available; no 2026
    // bulletin found — see limitations). Four brackets, one flat standard
    // deduction, flat per-exemption allowance (va_exemptions covers both
    // personal and dependent exemptions at the same $930 rate — VA's own
    // separate $800 age/blindness exemption amount is not modeled, since
    // this engine has no age/blindness input fields).
    standard_deduction_annual: 8750,
    exemption_value_annual: 930,
    brackets: [[0, 0, 0.02], [3000, 60, 0.03], [5000, 120, 0.05], [17000, 720, 0.0575]] as Array<[number, number, number]>
  },
  // v12: eleven more states, same single-NFC-source tier as v11.
  massachusetts: {
    // NFC bulletin. Flat 5% up to $1,107,750 annual, 9% above (the
    // statutory "Fair Share Amendment" surtax, baked directly into the
    // withholding brackets per the bulletin). Deduction depends on
    // exemption count; wages under $8,000/year with 1+ exemptions are
    // exempt entirely. MA's own HOH ($120) and blind ($110/exemption)
    // add-on deductions are NOT modeled — this engine has no HOH/blind
    // input fields for any state (see limitations).
    low_income_exemption_threshold_annual: 8000,
    brackets: [[0, 0, 0.05], [1107750, 55387.5, 0.09]] as Array<[number, number, number]>,
    // MA PFML: employee share is 0.46% of wages (0.28% medical + 0.18%
    // family), wage-capped at the Social Security taxable maximum. This
    // EMPLOYEE rate is the same regardless of employer size — employers
    // with 25+ covered individuals owe a higher 0.88% TOTAL rate (paying
    // the remaining 0.42% themselves), while employers under 25 owe only
    // the 0.46% total with no employer share, but the employee's own
    // withholding is 0.46% either way. Sourced via multiple 2026-dated
    // secondary corroborations (NFP, Patriot Software, Seyfarth Shaw
    // legal alert) after mass.gov's own page returned HTTP 403 to a
    // direct fetch — not independently re-verified against the
    // Commonwealth's own PFML notice text, flagged in limitations. This
    // engine does NOT model the employer-side PFML expense line (see
    // limitations) — only the employee withholding.
    pfml_employee_rate: 0.0046,
  },
  missouri: {
    // NFC bulletin. Eight brackets, standard deduction by a three-way
    // filing-status split.
    // Supplemental wages: Missouri Department of Revenue, "2026
    // Withholding Tax Formula" / Form 4282 "Employer's Tax Guide"
    // (dor.mo.gov, fetched and read directly 2026-09-16): "Withhold a
    // flat percentage rate of 4.7 percent of the supplemental wages."
    supplemental_flat_rate: 0.047,
    standard_deduction: {
      SINGLE_OR_MFS_OR_MARRIED_SPOUSE_WORKS: 16100,
      MARRIED_SPOUSE_NOT_WORK: 32200,
      HEAD_OF_HOUSEHOLD: 24150
    } as Record<MoFilingStatus, number>,
    brackets: [
      [0, 0, 0], [1348, 0, 0.02], [2696, 27, 0.025], [4044, 61, 0.03],
      [5392, 101, 0.035], [6740, 148, 0.04], [8088, 202, 0.045], [9436, 263, 0.047]
    ] as Array<[number, number, number]>
  },
  nebraska: {
    // NFC bulletin. Seven brackets by two-way filing status, flat
    // per-allowance exemption amount.
    // Supplemental wages: Nebraska Department of Revenue, "Circular EN,
    // Nebraska Income Tax Withholding for Wages... Paid on or after
    // January 1, 2026" (8-429-1998, Rev. 11-2025, fetched and read
    // directly 2026-09-16): "the employer may... elect to withhold
    // income tax on the supplemental wages by using a flat 3.5%
    // withholding rate."
    supplemental_flat_rate: 0.035,
    allowance_value_annual: 2440,
    brackets: {
      SINGLE_OR_HOH: [[0, 0, 0], [3430, 0, 0.0226], [6710, 74.13, 0.0322], [21810, 560.35, 0.0421], [31610, 972.93, 0.0435], [40130, 1343.55, 0.0448], [75370, 2922.3, 0.046]],
      MARRIED: [[0, 0, 0], [8190, 0, 0.0226], [13010, 108.93, 0.0322], [32400, 733.29, 0.0421], [50400, 1491.09, 0.0435], [62530, 2018.75, 0.0448], [82920, 2932.22, 0.046]]
    } as Record<NeFilingStatus, Array<[number, number, number]>>
  },
  south_carolina: {
    // NFC bulletin. One unified bracket table (no filing-status split
    // given). Standard deduction is the LESSER of 10% of annual wages or
    // $7,500, plus a flat per-allowance amount.
    standard_deduction_rate: 0.10,
    standard_deduction_cap_annual: 7500,
    allowance_value_annual: 5000,
    brackets: [[0, 0, 0], [3640, 0, 0.03], [18230, 437.7, 0.06]] as Array<[number, number, number]>
  },
  vermont: {
    // NFC bulletin. Five brackets by two-way filing status, flat
    // per-allowance exemption amount.
    //
    // BUG FIX (v21, golden-fixture pass, US-VT-001, verified
    // 2026-09-15): the v12 limitations note already flagged Vermont as
    // sourced from a stale 2024 NFC bulletin. The golden fixture cites
    // (and this pass independently re-fetched) the actual 2026 bulletin
    // — https://help.nfc.usda.gov/bulletins/2026/1780320782.htm — which
    // states the per-allowance exemption "is increasing from $5,300 to
    // $5,400" and gives materially different bracket thresholds/base-tax
    // figures for both filing statuses (e.g. SINGLE_OR_HOH's second
    // bracket moves from $51,600/base $1,604.65 to $54,675/base
    // $1,700.13). Replaced with the 2026 figures below; every SINGLE
    // bracket boundary was cross-confirmed exactly against the golden
    // fixture's own calculation trace.
    allowance_value_annual: 5400,
    brackets: {
      SINGLE_OR_HOH: [[0, 0, 0], [3925, 0, 0.0335], [54675, 1700.13, 0.066], [126775, 6458.73, 0.076], [260225, 16600.93, 0.0875]],
      MARRIED: [[0, 0, 0], [11775, 0, 0.0335], [96475, 2837.45, 0.066], [216525, 10760.75, 0.076], [323825, 18915.55, 0.0875]]
    } as Record<VtFilingStatus, Array<[number, number, number]>>,
    // Vermont Child Care Contribution (CCC): total 0.44% payroll tax,
    // uncapped (applies to ALL wages, no annual wage-base ceiling). The
    // EMPLOYER must pay at least 75% (0.33%) and MAY ELECT to withhold up
    // to the remaining 25% (0.11%) from the employee — optional, not
    // automatic. Source: Vermont Department of Taxes, "GB-1326: The
    // Vermont Child Care Contribution" (tax.vermont.gov, fetched and read
    // directly 2026-09-16): "Employers are required to pay a 0.44%
    // payroll tax on their employees' wages... employers may withhold no
    // more than one-quarter of the contribution from employee wages
    // (i.e., not more than 0.11% of any employee's wages)."
    ccc_total_rate: 0.0044,
    ccc_employee_max_rate: 0.0011,
  },
  west_virginia: {
    // NFC bulletin. Five brackets by a "one earner/one job" vs "two
    // earner/multiple jobs" split (WV's own categories, not marital
    // status), flat per-exemption allowance.
    exemption_value_annual: 2000,
    brackets: {
      ONE_EARNER_ONE_JOB: [[0, 0, 0.0211], [10000, 211, 0.0281], [25000, 632.5, 0.0316], [40000, 1106.5, 0.0422], [60000, 1950.5, 0.0458]],
      TWO_EARNER_OR_MULTIPLE_JOBS: [[0, 0, 0.0211], [7500, 158.25, 0.0281], [18750, 474.38, 0.0316], [30000, 829.88, 0.0422], [45000, 1462.88, 0.0458]]
    } as Record<WvFilingStatus, Array<[number, number, number]>>
  },
  kansas: {
    // NFC bulletin. Three brackets by two-way filing status. The
    // allowance is a flat "personal allowance" threshold amount that
    // applies once the employee has AT LEAST the minimum exemption count
    // for their status (1 for single/HOH, 1 or 2 for married — married
    // claiming exactly 1 gets the single-tier amount, married claiming 2+
    // gets the doubled amount), plus $2,320 for each exemption beyond that
    // threshold. An employee claiming 0 exemptions gets $0 allowance.
    exemption_value_annual: 2320,
    single_or_hoh_base_allowance: 9160,
    married_one_exemption_allowance: 9160,
    married_two_plus_allowance: 18320,
    brackets: {
      SINGLE_OR_HOH: [[0, 0, 0], [3605, 0, 0.052], [26605, 1196, 0.0558]],
      MARRIED: [[0, 0, 0], [8240, 0, 0.052], [54240, 2392, 0.0558]]
    } as Record<KsFilingStatus, Array<[number, number, number]>>
  },
  idaho: {
    // NFC bulletin. Flat 5.3% rate applied above a wage-tier threshold,
    // after subtracting a flat per-exemption deduction — reconstructed
    // from the bulletin's descriptive text ("applies the 5.3% rate only to
    // income exceeding these thresholds after subtracting the exemption
    // allowance") rather than a literal quoted formula line, so treated as
    // slightly lower confidence than a directly-quoted formula (see
    // limitations).
    //
    // BUG FIX (v21, golden-fixture pass, US-ID-001, verified 2026-09-15):
    // the $15,000/$30,000 thresholds below were the STALE, pre-revision
    // figures. Idaho published a revised percentage-method table
    // (EPB00744, "07-23-2026") that raised the ANNUAL thresholds to
    // $16,100 (Single/HOH) and $32,200 (Married) — fetched and read
    // directly 2026-09-15, https://tax.idaho.gov/document-mngr/pubs_EPB00744.
    // This is the same "old vs. revised mid-year table" class of bug
    // already fixed for Ohio in v18; like Ohio, this engine now always
    // uses the current post-revision figures regardless of pay_date (no
    // pre-2026-07-23 payroll date is modeled — see limitations).
    // RESIDUAL, NOT FORCED: Idaho's guide publishes an INDEPENDENTLY
    // ROUNDED threshold per pay frequency (weekly $310, biweekly $619,
    // monthly $1,342, annual $16,100) rather than the weekly figure times
    // 52 exactly (310 x 52 = $16,120, not $16,100). This engine always
    // annualizes gross pay and applies the single annual threshold, so
    // for a WEEKLY employee it reproduces the golden fixture to within
    // $0.02/week ($47.19 engine vs $47.17 fixture) rather than exactly —
    // a genuine per-frequency-table-rounding gap, not a further data
    // error, and not force-fit by fabricating a frequency-specific
    // threshold table this engine's architecture doesn't otherwise have.
    rate: 0.053,
    exemption_value_annual: 3868,
    threshold_annual: { SINGLE: 16100, MARRIED: 32200 } as Record<IdFilingStatus, number>
  },
  new_mexico: {
    // NFC bulletin, complete 10-row bracket tables (an initial fetch only
    // captured the first and last row of each table — re-fetched with a
    // targeted prompt to get the full tables; every intermediate row's
    // base tax figure was cross-checked by hand against the previous
    // row's formula and matches exactly, corroborating internal
    // consistency). The source gave NO deduction/exemption structure at
    // all, so none is applied here — treated as "genuinely none" per the
    // source rather than guessed (see limitations for the explicit caveat
    // that this could instead reflect incomplete source extraction).
    brackets: {
      SINGLE: [
        [0, 0, 0], [8050, 0, 0.015], [13550, 82.5, 0.032], [20550, 306.5, 0.032],
        [24550, 434.5, 0.043], [33550, 821.5, 0.043], [41550, 1165.5, 0.047],
        [58550, 1964.5, 0.047], [74550, 2716.5, 0.049], [218050, 9748, 0.059]
      ] as Array<[number, number, number]>,
      MARRIED: [
        [0, 0, 0], [16100, 0, 0.015], [24100, 120, 0.032], [32100, 376, 0.032],
        [41100, 664, 0.043], [57100, 1352, 0.043], [66100, 1739, 0.047],
        [102100, 3431, 0.047], [116100, 4089, 0.049], [331100, 14624, 0.059]
      ] as Array<[number, number, number]>,
      HEAD_OF_HOUSEHOLD: [
        [0, 0, 0], [12075, 0, 0.015], [20075, 120, 0.032], [28075, 376, 0.032],
        [37075, 664, 0.043], [53075, 1352, 0.043], [62075, 1739, 0.047],
        [98075, 3431, 0.047], [112075, 4089, 0.049], [327075, 14624, 0.059]
      ] as Array<[number, number, number]>
    } as Record<NmFilingStatus, Array<[number, number, number]>>
  },
  arkansas: {
    // NFC bulletin. Standard deduction $2,470, per-exemption CREDIT (not
    // deduction — subtracted from the computed tax) of $29. Uses AR's own
    // "quick calculation" bracket format (income x rate, minus a
    // subtrahend) rather than a base+marginal-rate format; converted here
    // to [atLeast, rate, subtrahend] rows, tax = max(0, income*rate -
    // subtrahend). Also applies a distinctive truncation rule: taxable
    // income under $100,001 is truncated to the nearest $100 then $50 is
    // added, BEFORE the bracket lookup. Arkansas's real top-bracket table
    // has 28 additional $100-wide smoothing rows between $94,701 and
    // $97,601 (avoiding a hard cliff) that were not fully captured from
    // this source — that narrow band is REJECTED rather than approximated
    // (see the rejection in the calc code and limitations). AR's low-
    // income tax credit (an additional credit for married filers in a
    // specific income band) is NOT modeled.
    // Supplemental wages: Arkansas Department of Finance and
    // Administration, "Withholding Tax Instructions" (withholdInstructions
    // -2.pdf, dfa.arkansas.gov, fetched and read directly 2026-09-16):
    // "Deduct 3.9% of the bonus or commission for state income tax."
    supplemental_flat_rate: 0.039,
    standard_deduction_annual: 2470,
    exemption_credit_annual: 29,
    smoothing_zone_low: 94701,
    smoothing_zone_high: 97601,
    brackets: [
      [0, 0, 0], [5600, 0.02, 111.98], [11200, 0.03, 223.97], [16000, 0.034, 287.97],
      [26400, 0.037, 367.16]
    ] as Array<[number, number, number]>,
    top_bracket_at_or_above_smoothing_zone: [0.037, 79.9] as [number, number]
  },
  hawaii: {
    // NFC bulletin. Complete 8-bracket tables by two-way filing status
    // (confirmed complete via a follow-up fetch after an initial partial
    // extraction). Flat per-exemption deduction plus a flat "lump-sum
    // allowance."
    exemption_value_annual: 1144,
    lump_sum_allowance_annual: 4350,
    brackets: {
      SINGLE_OR_HOH: [
        [0, 0, 0.014], [9600, 134, 0.032], [14400, 288, 0.055], [19200, 552, 0.064],
        [24000, 859, 0.068], [36000, 1675, 0.072], [48000, 2539, 0.076], [125000, 8391, 0.079]
      ],
      MARRIED: [
        [0, 0, 0.014], [19200, 269, 0.032], [28800, 576, 0.055], [38400, 1104, 0.064],
        [48000, 1718, 0.068], [72000, 3350, 0.072], [96000, 5078, 0.076], [250000, 16782, 0.079]
      ]
    } as Record<HiFilingStatus, Array<[number, number, number]>>,
    // HI TDI: flat 0.5% of wages, capped at a WEEKLY statutory dollar
    // maximum (not an annual wage base) — the "Maximum Weekly Wage Base"
    // and "Maximum Weekly Deduction" are both defined per calendar week
    // regardless of pay frequency. This engine therefore only computes
    // HI TDI for WEEKLY pay frequency (same "reject rather than
    // approximate for a frequency with no clean equivalent" pattern
    // already used for CO Denver OPT (monthly-only) and NY DBL
    // (weekly-only) — see calc code and limitations). Source: Hawaii
    // Department of Labor and Industrial Relations, Disability
    // Compensation Division, "2026 Maximum Weekly Wage Base and Maximum
    // Weekly Benefit Amount" (Dec. 10, 2025, fetched and read directly
    // 2026-09-16): "An employer may withhold TDI contributions of
    // one-half the premium cost but not more than .5% of the employee's
    // weekly wage, with the maximum not to exceed $7.50" on a "2026
    // Maximum Weekly Wage Base" of $1,500.21.
    tdi_rate: 0.005,
    tdi_max_weekly_wage_base: 1500.21,
    tdi_max_weekly_deduction: 7.50,
  },
  ohio: {
    // v18: REPLACED the earlier stale PP20-2025 NFC-bulletin figures.
    // Ohio Department of Taxation's own "Employer Withholding Taxes -
    // Percentage Method (Effective August 1, 2026)" — fetched and read
    // directly 2026-09-15, reflecting the rate reduction enacted by
    // House Bill 96 (the 2025 biennial budget). Confirmed via an
    // independent web search (ohiocpa.com, EY tax alert) that this is a
    // genuine, dated rate change (1.775%/2.99%/3.64% -> 1.60%/2.99%/3.40%)
    // for payrolls ENDING ON OR AFTER 2026-08-01, not a discrepancy in
    // the old sourcing. This engine implements Ohio's actual official
    // method directly: a PER-PAY-PERIOD exemption subtraction and a
    // PER-PAY-PERIOD bracket table (one set per pay frequency), not an
    // annualize-and-divide reconstruction — matching Ohio's own
    // published tables exactly rather than an equivalent-but-not-
    // identical derived annual formula. No pre-2026-08-01 (older-rate)
    // period is modeled; every OH payroll is computed under the current
    // (post-8/1) table regardless of pay_date — see limitations.
    exemption_per_period: {
      WEEKLY: 12.50, BIWEEKLY: 25.00, SEMIMONTHLY: 27.08, MONTHLY: 54.17
    } as Record<UsPayFrequency, number>,
    brackets_per_period: {
      WEEKLY: [[0, 0, 0.016], [500.96, 8.02, 0.0299], [1923.08, 50.54, 0.034]],
      BIWEEKLY: [[0, 0, 0.016], [1001.92, 16.03, 0.0299], [3846.15, 101.07, 0.034]],
      SEMIMONTHLY: [[0, 0, 0.016], [1085.42, 17.37, 0.0299], [4166.67, 109.50, 0.034]],
      MONTHLY: [[0, 0, 0.016], [2170.83, 34.73, 0.0299], [8333.33, 218.99, 0.034]]
    } as Record<UsPayFrequency, Array<[number, number, number]>>
  },
  louisiana: {
    // NFC bulletin, confirmed via a second independent source (secondary
    // web search corroborating Louisiana's 2025 Act 11 tax reform, which
    // ELIMINATED the per-dependent personal exemption for withholding
    // purposes — so unlike most states here, LA genuinely has no
    // dependent-credit gap; there's nothing left to model). Flat 3.09%
    // after a standard deduction by a two-way filing-status split.
    rate: 0.0309,
    standard_deduction: { SINGLE_OR_MFS: 12875, MARRIED_OR_HOH: 25750 } as Record<LaFilingStatus, number>
  },
  iowa: {
    // Iowa Department of Revenue's own "Iowa Individual Income Tax
    // Withholding Formula, Effective January 1, 2026" (released November
    // 2025) — fetched and read directly, the strongest source tier this
    // file has (matches CA/NJ/NY/OR/IN/NC), including 10 fully worked
    // examples this engine's implementation reproduces exactly. Applied
    // PER PAY PERIOD directly (not annualized): flat 3.80% rate on
    // (gross pay minus a per-period deduction that varies by the
    // employee's IA W-4 marital-status category), minus a per-period
    // share of a caller-supplied total dollar allowance amount (the
    // 2024+ IA W-4 reports a dollar figure directly, not an allowance
    // count).
    rate: 0.038,
    deduction_per_period: {
      WEEKLY: { OTHER_OR_MFJ_SPOUSE_WORKS: 250, HEAD_OF_HOUSEHOLD: 375, MFJ_SPOUSE_NO_EARNED_INCOME: 500 },
      BIWEEKLY: { OTHER_OR_MFJ_SPOUSE_WORKS: 500, HEAD_OF_HOUSEHOLD: 750, MFJ_SPOUSE_NO_EARNED_INCOME: 1000 },
      SEMIMONTHLY: { OTHER_OR_MFJ_SPOUSE_WORKS: 541.67, HEAD_OF_HOUSEHOLD: 812.5, MFJ_SPOUSE_NO_EARNED_INCOME: 1083.33 },
      MONTHLY: { OTHER_OR_MFJ_SPOUSE_WORKS: 1083.33, HEAD_OF_HOUSEHOLD: 1625, MFJ_SPOUSE_NO_EARNED_INCOME: 2166.67 }
    } as Record<UsPayFrequency, Record<IaMaritalStatus, number>>
  },
  alabama: {
    // Two sources: the 2022 NFC bulletin for tax brackets and exemption
    // amounts (Alabama's brackets have been unchanged for decades — 2%/
    // 4%/5% at these exact thresholds — so treated as still reliable
    // despite the bulletin's age), and the Alabama Department of
    // Revenue's own official 2025-tax-year standard deduction table
    // (25stddeduction40a.pdf, fetched and read directly 2026-09-15) for
    // the income-phased standard deduction. That table phases the
    // deduction DOWN in $25 steps for every $500 of income between a
    // low-income maximum and a floor value reached at $35,500 (Single/
    // MFJ/Head of Family) or $17,750 (MFS) — this engine only implements
    // the FLOOR value and REJECTS employees below that wage threshold,
    // since the phase-out steps were not transcribed (see limitations).
    // Personal exemption and the three-tier income-based dependent
    // exemption amount are also from the 2022 bulletin.
    floor_deduction_threshold_annual: {
      SINGLE: 35500, MARRIED_FILING_JOINTLY: 35500, MARRIED_FILING_SEPARATELY: 17750, HEAD_OF_FAMILY: 35500
    } as Record<AlFilingStatus, number>,
    floor_deduction_annual: {
      SINGLE: 2500, MARRIED_FILING_JOINTLY: 5000, MARRIED_FILING_SEPARATELY: 2500, HEAD_OF_FAMILY: 2500
    } as Record<AlFilingStatus, number>,
    personal_exemption_annual: {
      SINGLE: 1500, MARRIED_FILING_SEPARATELY: 1500, MARRIED_FILING_JOINTLY: 3000, HEAD_OF_FAMILY: 3000
    } as Record<AlFilingStatus, number>,
    // Dependent exemption tiers by annual wages: [wagesAtLeast, amount].
    dependent_exemption_tiers: [[0, 1000], [50000, 500], [100000, 300]] as Array<[number, number]>,
    brackets_single_mfs_hof: [[0, 0, 0.02], [500, 10, 0.04], [3000, 110, 0.05]] as Array<[number, number, number]>,
    brackets_mfj: [[0, 0, 0.02], [1000, 20, 0.04], [6000, 220, 0.05]] as Array<[number, number, number]>
  },
  maryland: {
    // NFC bulletin. State brackets by two-way filing status, standard
    // deduction, flat per-exemption allowance, PLUS mandatory county
    // income tax (Maryland's own state+county combined-return design).
    // All 23 counties + Baltimore City confirmed — 22 use a single flat
    // rate; Anne Arundel and Frederick use their own graduated bracket
    // tables (fully captured here, not simplified to a flat rate).
    //
    // BUG FIX (golden-fixture pass against
    // US_2026_Payroll_Golden_Payslip_QA_Pack_All_50_States_DC.pdf,
    // US-MD-001, Montgomery County, verified 2026-09-15): the SINGLE and
    // MARRIED bracket arrays below used to start with a placeholder
    // [0, 0, 0] entry covering the ENTIRE $0–$100,000 (SINGLE) /
    // $0–$150,000 (MARRIED) range — i.e. Maryland's real 2%, 3%, 4%, and
    // 4.75% statutory brackets that cover that whole range were simply
    // missing, mapped to a 0% rate. Because bracketLookup picks the
    // largest threshold <= income, EVERY Maryland employee earning under
    // $100k/$150k a year (the vast majority of real employees) got
    // md_income_tax = 0.00 — a severe, silent under-withholding bug, not
    // a rounding nuance. Confirmed by running the golden fixture: engine
    // produced $0.00 state tax where the fixture asserts a combined
    // state+Montgomery-County figure of $90.20/week (of which the flat
    // 3.20% county portion this engine already computed correctly
    // accounts for $36.31 — the entire discrepancy was the missing state
    // brackets). Replaced with Maryland's real, stable, long-standing
    // statutory 2% / 3% / 4% / 4.75% graduated brackets for that range
    // (Comptroller of Maryland, admin.tax rate schedule; these four low
    // brackets have not changed in the recent 2024/2025 MD tax-law
    // changes, which only added new brackets ABOVE $250k/$1M — the part
    // of this table at $100k/$150k and up was already present and is
    // left unchanged here).
    //
    // REMAINING KNOWN GAP (documented, not silently claimed fixed): this
    // engine computes Maryland withholding as state-bracket-tax PLUS a
    // separate flat (or, for Anne Arundel/Frederick, graduated) COUNTY
    // rate applied to the same taxable wages. Maryland's own official
    // withholding guide does NOT publish withholding tables this way —
    // it publishes ONE COMBINED state+local percentage-method table per
    // distinct local rate (10 tables: 2.25%, 2.40%, 2.65%, 2.75%, 2.85%,
    // 3.00%, 3.05%, 3.10%, 3.20%, 3.30%), and those combined tables use a
    // single blended first-bracket rate (e.g. 7.95% = 4.75% state +
    // 3.20% local for the $0–$100,000/SINGLE band) rather than stacking
    // this engine's four separate 2/3/4/4.75% sub-brackets. Verified
    // directly against the Comptroller's official 2026 guide (3.20%
    // Percent Local Income Tax table, Annual payroll period, page 37 of
    // https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf):
    // for the golden fixture's exact inputs (Single, $62,400/yr, 0
    // exemptions, Montgomery County/3.20%), the OFFICIAL combined table
    // gives $90.20/week; this engine's decomposed state-bracket-fix
    // above plus the existing flat-3.20%-county calc gives $89.19/week
    // — a real, understood $1.01/week (~1.1%) residual gap from the
    // combined-table blending, not from a further bracket error. This
    // pass deliberately does NOT force-match the fixture's $90.20 by
    // reverse-fitting the brackets, because doing so would make the
    // Anne Arundel/Frederick graduated-county case (which layers this
    // same state table under a genuinely separate county bracket lookup)
    // wrong instead. A correct byte-exact fix requires implementing all
    // 10 of Maryland's own combined per-local-rate tables (both filing
    // statuses) rather than this decomposed approximation — flagged as
    // follow-up work, not attempted this pass. See limitations array.
    standard_deduction_annual: 3400,
    allowance_value_annual: 3200,
    brackets: {
      SINGLE: [[0, 0, 0.02], [1000, 20, 0.03], [2000, 50, 0.04], [3000, 90, 0.0475], [100000, 4750, 0.05], [125000, 6000, 0.0525], [150000, 7312.5, 0.055], [250000, 12812.5, 0.0575], [500000, 27187.5, 0.0625], [1000000, 58437.5, 0.065]],
      MARRIED: [[0, 0, 0.02], [1000, 20, 0.03], [2000, 50, 0.04], [3000, 90, 0.0475], [150000, 7125, 0.05], [175000, 8375, 0.0525], [225000, 11000, 0.055], [300000, 15125, 0.0575], [600000, 32375, 0.0625], [1200000, 69875, 0.065]]
    } as Record<MdFilingStatus, Array<[number, number, number]>>,
    county_flat_rates: {
      'Allegany': 0.032, 'Baltimore County': 0.032, 'Baltimore City': 0.032, 'Calvert': 0.032,
      'Caroline': 0.032, 'Carroll': 0.0303, 'Cecil': 0.0274, 'Charles': 0.0303,
      'Dorchester': 0.033, 'Garrett': 0.0265, 'Harford': 0.0306, 'Howard': 0.032,
      'Kent': 0.033, 'Montgomery': 0.032, "Prince George's": 0.032, "Queen Anne's": 0.032,
      'St. Mary\'s': 0.032, 'Somerset': 0.032, 'Talbot': 0.024, 'Washington': 0.0295,
      'Wicomico': 0.032, 'Worcester': 0.0225
    } as Record<string, number>,
    county_graduated_brackets: {
      'Anne Arundel': {
        SINGLE: [[0, 0, 0.027], [50000, 1350, 0.0294], [400000, 11640, 0.032]],
        MARRIED: [[0, 0, 0.027], [75000, 2025, 0.0294], [480000, 13932, 0.032]]
      } as Record<MdFilingStatus, Array<[number, number, number]>>,
      'Frederick': {
        SINGLE: [[0, 0, 0.0225], [25000, 562.5, 0.0275], [50000, 1250, 0.0296], [150000, 4210, 0.032]],
        MARRIED: [[0, 0, 0.0225], [25000, 562.5, 0.0275], [100000, 2625, 0.0296], [250000, 7065, 0.032]]
      } as Record<MdFilingStatus, Array<[number, number, number]>>
    } as Record<string, Record<MdFilingStatus, Array<[number, number, number]>>>
  },
  connecticut: {
    // NFC bulletin, fetched via a text-extraction proxy after the direct
    // fetch repeatedly truncated the table. Only withholding CODE A/D
    // (which share an identical base bracket table, phase-out add-back
    // table, and recapture table per the source) is implemented — codes
    // B, C, and F are REJECTED as unsupported (their base bracket tables
    // and/or phase-out/recapture tables were not captured this pass).
    brackets_a_or_d: [
      [0, 0, 0.02], [10000, 200, 0.045], [50000, 2000, 0.055], [100000, 4750, 0.06],
      [200000, 10750, 0.065], [250000, 14000, 0.069], [500000, 31250, 0.0699]
    ] as Array<[number, number, number]>,
    // [atLeast, amount] step tables — CT's phase-out/recapture add fixed
    // dollar amounts on top of the bracket tax as annual wages rise,
    // clawing back the benefit of lower brackets for higher earners.
    phase_out_add_back_a_or_d: [
      [0, 0], [50250, 25], [52750, 50], [55250, 75], [57750, 100], [60250, 125],
      [62750, 150], [65250, 175], [67750, 200], [70250, 225], [72750, 250]
    ] as Array<[number, number]>,
    recapture_a_or_d: [
      [0, 0], [105000, 25], [110000, 50], [115000, 75], [120000, 100], [125000, 125],
      [130000, 150], [135000, 175], [140000, 200], [145000, 225], [150000, 250],
      [200000, 340], [205000, 430], [210000, 520], [215000, 610], [220000, 700],
      [225000, 790], [230000, 880], [235000, 970], [240000, 1060], [245000, 1150],
      [250000, 1240], [255000, 1330], [260000, 1420], [265000, 1510], [270000, 1600],
      [275000, 1690], [280000, 1780], [285000, 1870], [290000, 1960], [295000, 2050],
      [300000, 2140], [305000, 2230], [310000, 2320], [315000, 2410], [320000, 2500],
      [325000, 2590], [330000, 2680], [335000, 2770], [340000, 2860], [345000, 2950],
      [500000, 3000], [505000, 3050], [510000, 3100], [515000, 3150], [520000, 3200],
      [525000, 3250], [530000, 3300], [535000, 3350], [540000, 3400]
    ] as Array<[number, number]>,
    // CT Paid Leave (CTPL): flat 0.5% of wages, wage-capped at the Social
    // Security taxable maximum, 100% employee-funded (no employer share,
    // no opt-out). Source: CT Paid Leave Authority, "Contributions" page
    // (ctpaidleave.org/how-ct-paid-leave-works/contributions, fetched
    // directly 2026-09-16): "The CT Paid Leave Board of Directors has
    // voted to maintain the contribution rate at 0.5% for 2026,"
    // capped at "the Federal Social Security Wage Cap."
    paid_leave_rate: 0.005,
  },
  delaware: {
    // Delaware Division of Revenue's own "Employer's Guide (Withholding
    // Regulations and Employer's Duties)" — fetched and read directly
    // 2026-09-15. Dated effective 2025-01-01 (no 2026 update found;
    // Delaware's bracket table has historically been very stable, so
    // treated as low-risk but not yet reconfirmed for 2026). ONE unified
    // bracket table applies regardless of filing status; only the
    // standard deduction differs by status. Every bracket boundary was
    // hand-verified for internal consistency (each row's base tax exactly
    // matches the previous row's formula extrapolated to that threshold).
    standard_deduction: { SINGLE_OR_MFS: 3250, MARRIED_FILING_JOINTLY: 6500 } as Record<DeFilingStatus, number>,
    exemption_credit_annual: 110,
    brackets: [
      [0, 0, 0], [2000, 0, 0.022], [5000, 66, 0.039], [10000, 261, 0.048],
      [20000, 741, 0.052], [25000, 1001, 0.0555], [60000, 2943.5, 0.066]
    ] as Array<[number, number, number]>,
    // DE Paid Leave: total premium 0.8% of wages (0.32% parental + 0.40%
    // medical + 0.08% family caregiving), wage-capped at the Social
    // Security taxable maximum. An employer "may not deduct more than a
    // 50% contribution from the employee" — this engine models that
    // 50%-of-premium MAXIMUM employee share (0.4%); an employer may elect
    // to pay more of the employee's share itself, which would reduce the
    // actual employee deduction below this modeled amount (see
    // limitations). Source: Delaware Department of Labor, "Employers &
    // Third Party Administrators ('TPAs') Guide to Delaware Paid Leave"
    // and multiple 2026-dated secondary corroborations (OnPay, MetLife,
    // Prudential) all agreeing on the same 0.8% total / 0.4% max-employee
    // / SS-wage-base-cap structure for 2026 — this engine's own primary
    // PDF fetch of laborfiles.delaware.gov returned malformed content, so
    // treated as secondary-source-tier, not independently re-verified
    // against the DE DOL's own PDF text.
    paid_leave_employee_max_rate: 0.004,
    // Wage base pegged to the same annual figure as the FICA/FUTA Social
    // Security taxable maximum (p.fica.social_security_wage_base_annual).
  },
  district_of_columbia: {
    // Two independent sources cross-confirmed on the same 7-row bracket
    // table, fetched 2026-09-15:
    //  (1) DC OTR's own current "DC Individual and Fiduciary Income Tax
    //      Rates" page (bracket boundaries/rates match exactly).
    //  (2) USDA NFC bulletin TAXES 22-28 "District of Columbia Income Tax
    //      Withholding" (effective Pay Period 22, 2022), which also gives
    //      the filing-status categories (S/M/N/H) and the per-dependent
    //      allowance figure. DC applies ONE bracket table to all filing
    //      statuses (unlike most states) — status only matters for the
    //      allowance/dependent computation upstream, not the brackets.
    // CAUTION: the $4,300/dependent allowance is the 2022 NFC figure — no
    // more recent DC bulletin was located, so this may be stale by 2026
    // (same caveat pattern as VA/KS/ID/VT's dated-bulletin flags).
    dependent_allowance_annual: 4300,
    brackets: [
      [0, 0, 0.04], [10000, 400, 0.06], [40000, 2200, 0.065],
      [60000, 3500, 0.085], [250000, 19650, 0.0925], [500000, 42775, 0.0975],
      [1000000, 91525, 0.1075]
    ] as Array<[number, number, number]>
  },
  wisconsin: {
    // Wisconsin Department of Revenue's own current Publication W-166,
    // "Withholding Tax Guide" (1/26 revision) -- fetched and read
    // directly 2026-09-15, specifically the "ALTERNATE METHOD OF
    // WITHHOLDING WISCONSIN INCOME TAX" section (this is Wisconsin's own
    // percentage-method formula for PAYROLL WITHHOLDING, distinct from
    // and not to be confused with the individual income tax RETURN
    // formula in the annual Form 1 instructions -- an earlier pass this
    // session nearly conflated the two and deliberately held off rather
    // than risk it). Reproduces all 3 of the guide's own worked examples
    // exactly (Examples 1-3, covering single/weekly and married/biweekly).
    // Deduction phase-out formula: same figures independently confirmed
    // earlier via Wisconsin's separate pb166.pdf withholding guide.
    deduction_single: { floor_threshold_annual: 17780, floor_amount: 6702, phase_out_rate: 0.12, zero_threshold_annual: 73630 },
    deduction_married: { floor_threshold_annual: 25727, floor_amount: 9461, phase_out_rate: 0.20, zero_threshold_annual: 73032 },
    exemption_value_annual: 400,
    // Same bracket schedule applies to both filing statuses (confirmed by
    // the guide's own married-filer Example 3, which uses this table).
    brackets: [
      [0, 0, 0.0354], [12760, 451.70, 0.0465], [25520, 1045.04, 0.053], [280950, 14582.83, 0.0765]
    ] as Array<[number, number, number]>,
    // Supplemental wages: Wisconsin Publication W-166's own "SUPPLEMENTAL
    // WAGE PAYMENTS" section (same document/fetch as the brackets above)
    // gives an "alternative" of "estimating the employee's annual gross
    // salary and applying flat percentages to the supplemental payments"
    // — a tiered table by estimated ANNUAL gross salary, using the SAME
    // four rate/threshold pairs as the regular bracket table above (not a
    // separate rate schedule). This engine applies the tier matching the
    // employee's OWN annualized regular wage (federalTaxableWages x
    // periodsPerYear) as the "estimated annual gross salary."
    supplemental_flat_rate_tiers: [
      [0, 0.0354], [12760, 0.0465], [25520, 0.0530], [280950, 0.0765]
    ] as Array<[number, number]>
  },
  maine: {
    // Maine Revenue Services' own REVISED "Withholding Tables for
    // Individual Income Tax" booklet, effective August 2026
    // (26_wh_tab_instr_August2026.pdf — Maine's percentage-method
    // standard deduction was revised mid-year, the same "old vs.
    // revised mid-year table" class of change already documented for
    // Ohio (v18) and Idaho (v21) in this file; the pay-date-selects-
    // the-table nuance those two model is NOT replicated here — this
    // engine always uses the current post-revision figures regardless
    // of pay_date, same simplification as Ohio/Idaho). Fetched and read
    // directly 2026-09-16. This engine reproduces the booklet's own
    // Example 2 exactly to the cent ($1,000/week, 2 allowances, single
    // -> $33/week using the January-2026 pre-revision $12,450 deduction;
    // the August-2026 revised $12,850 deduction was independently cross-
    // confirmed against the golden-fixture pack's own calculation trace,
    // US-ME-001: "Annual taxable wages = 62,400.00 - 12,850.00 =
    // 49,550.00... Annual tax = 1,589.00 + 6.75% x (49,550.00 -
    // 27,400.00) = 3,084.13... 3,084.13 / 52 = 59.31; Maine prescribed
    // whole-dollar result = 59.00") — the strongest sourcing tier in
    // this file (a directly-fetched primary document cross-confirmed by
    // an independent golden-fixture trace), comparable to IA/OR/IN/NC/
    // DE/WI. W-4ME has only two withholding categories: "Married" (uses
    // the married schedule), and "Single" / "Married, but withholding at
    // higher single rate" / "Head of Household" (all three use the SAME
    // single schedule) — mapped here to MeFilingStatus 'MARRIED' and
    // 'SINGLE_OR_HOH' respectively.
    allowance_value_annual: 5300,
    // Standard deduction: flat $12,850 (single) / $28,550 (married) when
    // annualized wages are at/under the phase-out floor ($102,250 single
    // / $204,550 married, UNCHANGED by the August revision); $0 once
    // wages reach the phase-out ceiling ($177,250 single / $354,550
    // married, also unchanged); linearly phased out between the floor
    // and ceiling per the booklet's own formula.
    standard_deduction: {
      SINGLE_OR_HOH: { floor_amount: 12850, floor_ceiling_annual: 102250, zero_threshold_annual: 177250, phase_out_span: 75000 },
      MARRIED: { floor_amount: 28550, floor_ceiling_annual: 204550, zero_threshold_annual: 354550, phase_out_span: 150000 }
    } as Record<MeFilingStatus, { floor_amount: number; floor_ceiling_annual: number; zero_threshold_annual: number; phase_out_span: number }>,
    brackets: {
      SINGLE_OR_HOH: [[0, 0, 0.058], [27400, 1589, 0.0675], [64850, 4117, 0.0715]],
      MARRIED: [[0, 0, 0.058], [54850, 3181, 0.0675], [129750, 8237, 0.0715]]
    } as Record<MeFilingStatus, Array<[number, number, number]>>,
    // Supplemental wages: same booklet, "If the supplemental wages are
    // paid separately, the payer may withhold a flat five percent."
    supplemental_flat_rate: 0.05,
    // Maine Paid Family and Medical Leave (ME PFML): for employers with
    // 15+ covered workers, a mandatory 1% total contribution split 50/50
    // (0.5% employee / 0.5% employer), wage-capped at the Social
    // Security taxable maximum — the scenario the golden fixture tests
    // ("employer has 15+ covered workers"). Source: multiple 2026-dated
    // secondary corroborations (Patriot Software, MetLife) plus Maine's
    // own paidleave.maine.gov employer FAQ PDF, cross-confirmed exactly
    // against the golden fixture's own $6.00/week figure on $1,200/week
    // gross. Employers with FEWER than 15 covered workers owe a smaller
    // 0.5% TOTAL contribution that they MAY elect to withhold in full
    // from the employee (a discretionary $0-0.5% range, not a single
    // rate) — NOT modeled, see limitations; this engine always applies
    // the 15+-employer 0.5% employee rate.
    pfml_employee_rate: 0.005
  },
  // States with genuinely no individual wage income tax AND no statewide
  // employee-paid payroll tax of any kind (unlike AK/WA above). Nothing to
  // compute for the employee beyond the state-agnostic federal FICA/FUTA
  // layer already handled elsewhere in this file.
  no_tax_no_employee_levy_states: ['FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WY'] as UsState[],
  evidence: [
    { authority: 'Internal Revenue Service', instrument: 'Publication 15-T (2026), Federal Income Tax Withholding Methods, Section 1 — Percentage Method Tables for Automated Payroll Systems', url: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf' },
    { authority: 'Internal Revenue Service', instrument: 'Publication 926 / SSA 2026 wage base and Additional Medicare Tax rules (IRC 3102(f))', url: 'https://www.irs.gov/pub/irs-pdf/p926.pdf' },
    { authority: 'US Department of Labor / IRS Form 940 instructions', instrument: '2026 FUTA rate, wage base, and California credit-reduction status', url: 'https://www.irs.gov' },
    { authority: 'California Employment Development Department (EDD)', instrument: '2026 California Withholding Schedules — Method B, Exact Calculation Method', url: 'https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf' },
    { authority: 'California Employment Development Department (EDD)', instrument: '2026 California State Disability Insurance (SDI) employee contribution rate', url: 'https://edd.ca.gov' },
    { authority: 'Internal Revenue Code', instrument: '§3121(a)(5)(D) — traditional 401(k)/403(b) elective deferrals remain wages for FICA purposes despite being excluded from income tax wages', url: 'https://www.irs.gov/publications/p15b' },
    { authority: 'Internal Revenue Code', instrument: '§125 — cafeteria-plan (Section 125) benefits properly elected are excluded from federal income tax wages, FICA wages, and FUTA wages', url: 'https://www.irs.gov/publications/p15b' },
    { authority: 'California Employment Development Department (EDD)', instrument: 'DE 231 series — California\'s wage-exclusion treatment (Subject Wages vs. PIT Wages) for 401(k) deferrals and cafeteria-plan benefits generally follows the federal treatment', url: 'https://edd.ca.gov' },
    { authority: 'New Jersey Division of Taxation', instrument: 'NJ-WT — New Jersey Income Tax Withholding Instructions and Rate Tables (percentage method, effective Oct 1, 2020, still current)', url: 'https://www.nj.gov/treasury/taxation/pdf/current/njwt.pdf' },
    { authority: 'New Jersey Department of Labor and Workforce Development', instrument: '2026 UI/Workforce Development/Supplemental Workforce Fund, Temporary Disability Insurance, and Family Leave Insurance employee rates and wage bases', url: 'https://www.nj.gov/labor/lwdhome/press/2025/20251229_newbenefitrates2026.shtml' },
    { authority: 'New York State Department of Taxation and Finance', instrument: 'NYS-50-T-NYS (1/26) — New York State Withholding Tax Tables and Methods', url: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf' },
    { authority: 'New York State Department of Taxation and Finance', instrument: 'NYS-50-T-NYC (1/26) — New York City Withholding Tax Tables and Methods', url: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nyc.pdf' },
    { authority: 'New York State Department of Taxation and Finance', instrument: 'NYS-50-T-Y (1/26) — Yonkers Withholding Tax Tables and Methods (resident surcharge and nonresident earnings tax)', url: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_y.pdf' },
    { authority: 'Cross-check / secondary reference', instrument: '"2026 U.S. Payroll Tax Implementation Reference" (all-50-states developer baseline, verified through 2026-09-13, user-supplied) — used to independently corroborate the CA/NJ/NY figures already in this file (all of which were independently fetched from each state\'s own primary publication), AND as the DIRECT source for the IL/PA/MI/CO/AZ/AK/WA figures added in v5 below, since those five states\' own primary withholding-table publications were not independently fetched this pass. This is a materially weaker sourcing chain than CA/NJ/NY and is called out explicitly, not glossed over — see the v5 change log and limitations.', url: 'file: US_2026_Payroll_Implementation_Reference.pdf (user-supplied, 2026-09-14)' },
    { authority: 'Colorado Department of Revenue', instrument: 'DR 1098 (2026) — the reference document reproduces its full percentage-method computation steps (not just a headline rate), which is why CO is implemented here despite not being independently primary-sourced', url: 'https://tax.colorado.gov/withholding-tax' },
    { authority: 'Illinois Department of Revenue', instrument: '2026 Illinois withholding tax formula — flat 4.95% and the IL-W-4 Line 1/Line 2 annual allowance amounts, as reproduced in the reference document', url: 'https://tax.illinois.gov/research/publications/pubs/illinois-withholding-tax-tables-booklet.html' },
    { authority: 'Michigan Department of Treasury', instrument: '2026 Michigan withholding rate (4.25%) and personal exemption amount ($5,900), as reproduced in the reference document', url: 'https://www.michigan.gov/taxes/business-taxes/withholding' },
    { authority: 'Pennsylvania Department of Revenue', instrument: '2026 Pennsylvania flat withholding rate (3.07%) and employee UC contribution rate (0.07%), as reproduced in the reference document', url: 'https://www.pa.gov/agencies/revenue/businesses/business-registration-and-info/withholding-tax' },
    { authority: 'Arizona Department of Revenue', instrument: 'Form A-4 (2026) employee percentage-election set, as reproduced in the reference document', url: 'https://azdor.gov/business/withholding-tax' },
    { authority: 'Alaska Department of Labor and Workforce Development', instrument: '2026 Alaska employee UI contribution rate (0.50%) and wage base ($54,200), as reproduced in the reference document', url: 'https://labor.alaska.gov/estax/home.htm' },
    { authority: 'Washington Employment Security Department / WA Cares Fund', instrument: '2026 WA PFML total premium/employee-share and WA Cares employee rate, as reproduced in the reference document', url: 'https://paidleave.wa.gov/employers/' },
    { authority: 'New York State Paid Family Leave', instrument: '2026 NY PFL employee rate (0.432%) and annual dollar cap ($411.91), and NY DBL employee rate (0.5%) and weekly dollar cap ($0.60) — sourced from a second-generation "formula pack" cross-check document (2026_US_Payroll_Formula_Implementation_Guide.pdf, user-supplied 2026-09-14) that itself derives from the same secondary reference above, independently corroborating this file\'s NJ/AZ/CO/PA/AK/WA/CA-SDI figures in the process', url: 'https://paidfamilyleave.ny.gov/cost' },
    { authority: 'Golden-payslip QA fixture pack (user-supplied, 2026-09-14/15)', instrument: '"US_2026_Payroll_Golden_Payslip_QA_Pack.pdf" — deterministic golden payslips for CA, NY/NYC, PA (incl. Philadelphia local tax), WA, CO (incl. Denver OPT), NJ, and federal cap/bonus cases, checked directly against this engine\'s actual output rather than this file\'s own hand derivations. Found and led to the fix of the NJ $769 bracket bug documented in the v7 change log; every other assertion checked (NY, PA, WA, CO, NJ post-fix, federal cap) passed exactly. Primary sources cited within that pack for each figure: IRS Pub 15/15-T, CA EDD, NYS-50-T-NYS/NYC, NJ-WT/NJDOL, WA PFML/WA Cares, CO DR 1098/FAMLI.', url: 'file: US_2026_Payroll_Golden_Payslip_QA_Pack.pdf' },
    { authority: 'City of Philadelphia Department of Revenue', instrument: 'Earnings Tax — employee (resident and non-resident-working-in-Philadelphia) Wage Tax rates, independently fetched 2026-09-14: resident 3.740% through 2026-06-30, 3.735% from 2026-07-01; non-resident 3.43% through 2026-06-30, 3.425% from 2026-07-01. The resident figures corroborate the golden-payslip fixture exactly; the non-resident figures were not present in that fixture and are sourced here directly.', url: 'https://www.phila.gov/services/payments-assistance-taxes/taxes/income-taxes/earnings-tax-employees/' },
    { authority: 'City and County of Denver, Department of Finance', instrument: 'Tax Guide Topic No. 61, Occupational Privilege Taxes (OPT or "Head Tax") — $5.75/month Employee OPT and $4.00/month Business OPT (employer-paid), both once an employee earns at least $500 in Denver-sourced compensation in a calendar month; both now modeled (v20). Independently fetched 2026-09-14 and corroborates the golden-payslip fixture\'s Denver figures exactly.', url: 'https://denver.prelive.opencities.com/files/assets/public/v/2/finance/documents/treasury/tax-guides/taxguidetopic61_occupationalprivilegetaxes.pdf' },
    { authority: 'Oregon Department of Revenue', instrument: 'Pub. 150-206-436 (Rev. 12-31-25), 2026 Oregon Withholding Tax Formulas — fetched via a text-extraction proxy (oregon.gov itself unreachable from this environment) and re-queried three times with independently-worded prompts 2026-09-14, producing identical figures each time: standard deductions ($2,910 narrow / $5,820 wide), exemption credit ($263/allowance), federal-subtraction phase-out schedule ($8,750 cap phasing to $0 between $125k-$145k single / $250k-$290k married), and the complete bracket tables for both the under-$50,000 and at-or-over-$50,000 annual-wage tiers.', url: 'https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf' },
    { authority: 'USDA National Finance Center', instrument: 'Federal payroll-processing bulletin reproducing Oregon\'s 2025 state withholding formula (effective Pay Period 06, 2025) — used by this pass as an INDEPENDENT second source (different organization, different document, prior tax year) to corroborate the 2026 Oregon DOR figures above: identical structural pattern (same bracket shape, same wage-tier split at $50,000, same "exemption credit equals bracket-1 base" design), with every 2025 dollar figure sitting ~2.6-2.9% below its 2026 counterpart — consistent with one year of routine inflation indexing, not independent transcription errors.', url: 'https://help.nfc.usda.gov/bulletins/2025/1743009231.htm' },
    { authority: 'Paid Leave Oregon (Oregon Employment Department)', instrument: '2026 Paid Leave Oregon contribution rate (1% total: 0.6% employee / 0.4% employer for employers with 25+ workers) and wage base (pegged to the 2026 Social Security taxable maximum, $184,500) — confirmed 2026-09-14 via paidleave.oregon.gov (through the same text-extraction proxy) and corroborated by a separate web search.', url: 'https://paidleave.oregon.gov/employers/' },
    { authority: 'Indiana Department of Revenue', instrument: 'Departmental Notice #1 (R46 / 01-26), "How to Compute Withholding for State and County Income Tax", effective 2026-01-01 — fetched and read directly 2026-09-14 (the actual official document, not a secondary summary). Gives the 2.95% flat state rate, the $1,000/$1,500/$3,000 personal/dependent/adopted-child annual exemption amounts (Tables A/B/C), a fully worked example matching this engine\'s implementation exactly, and the complete 2026 county income tax rate table for all 92 Indiana counties.', url: 'https://www.in.gov/dor/files/dn01.pdf' },
    { authority: 'North Carolina Department of Revenue', instrument: 'Form NC-30 (Web 11-25), "2026 Income Tax Withholding Tables and Instructions for Employers" — fetched and read directly 2026-09-14 (the actual official document). Gives the 4.09% withholding rate (3.99% statutory rate + NC\'s own built-in 0.1% adjustment, per the document\'s own text), the $12,750 (Single/Married/Surviving Spouse) and $19,125 (Head of Household) standard deductions, the $2,500 allowance value, the nearest-whole-dollar final rounding rule, and a fully worked example matching this engine\'s implementation exactly.', url: 'https://www.ncdor.gov/income-tax-withholding-tables-and-instructions-employers/open' },
    { authority: 'USDA National Finance Center', instrument: 'Ten separate current 2026 (or most-recent-available) state withholding bulletins, each fetched 2026-09-14, used as the SOLE source for that state (same single-source tier as the v5 batch): Georgia (NFC-26-1784643404, PP13 2026), Kentucky (NFC-26-1770145550, PP02 2026), Mississippi (NFC-26-1768327516, PP09 2026), Utah (NFC-26-1782763921, PP12 2026), Minnesota (NFC-26-1782924992), Montana (NFC-26-1767632355), North Dakota (NFC-26-1767646699), Oklahoma (NFC-26-1773324603), Rhode Island (NFC-26-1772030778, PP03 2026), and Virginia (NFC-25-1750694986, PP14 2025 — the most recent available; no 2026 Virginia bulletin was found). No official worked example was available for any of these ten, unlike OR/IN/NC — see limitations.', url: 'https://help.nfc.usda.gov/systems/taxes/bulletins.php' },
    { authority: 'USDA National Finance Center', instrument: 'Eleven more state withholding bulletins, each fetched 2026-09-15, same single-source-per-state tier as the v11 batch: Massachusetts (NFC-26-1769797447), Missouri (NFC-26-1773783048), Nebraska (NFC-26-1774374744), South Carolina (NFC-26-1773173131), Vermont (NFC-24-1707500661 — most recent available), West Virginia (NFC-26-1786455448), Kansas (NFC-24-1722617728 — most recent available), Idaho (NFC-25-1747930413 — most recent available), New Mexico (NFC-26-1776874663), Arkansas (NFC-26-1781190112, re-fetched with a follow-up prompt to get the complete bracket structure), Hawaii (NFC-26-1768321238, re-fetched with a follow-up prompt to get the complete 8-bracket tables for both filing statuses after an initial partial extraction).', url: 'https://help.nfc.usda.gov/systems/taxes/bulletins.php' },
    { authority: 'Iowa Department of Revenue', instrument: '"Iowa Individual Income Tax Withholding Formula, Effective January 1, 2026" (released November 2025) — fetched and read directly 2026-09-15, the actual official current-year document with 10 fully worked examples. This engine\'s implementation reproduces all 6 of the examples covering the marital-status categories this engine supports (biweekly and monthly, all three IA W-4 marital-status categories) exactly to the cent.', url: 'https://revenue.iowa.gov/media/53/download?inline=' },
    { authority: 'Alabama Department of Revenue', instrument: '2025-tax-year (TY 2025) official standard deduction table by filing status (25stddeduction40a.pdf, "40A Booklet") — fetched and read directly 2026-09-15, giving the income-phased deduction schedule this engine partially implements (floor value and floor threshold only — see limitations). Combined with the 2022 NFC bulletin for Alabama\'s tax brackets, personal exemption, and dependent exemption tiers (Alabama\'s 2%/4%/5% brackets have been stable for decades, so the bulletin\'s age is treated as low-risk for those specific figures).', url: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25stddeduction40a.pdf' },
    { authority: 'USDA National Finance Center / secondary corroboration', instrument: 'Louisiana (NFC-26-1767639939, PP15 2026, corroborated by a second web search confirming Louisiana\'s 2025 Act 11 tax reform eliminated the per-dependent exemption entirely — so unlike most gaps in this file, there is genuinely nothing left to model for LA dependents).', url: 'https://help.nfc.usda.gov/systems/taxes/bulletins.php' },
    { authority: 'Ohio Department of Taxation', instrument: '"Employer Withholding Taxes - Percentage Method (Effective August 1, 2026)" — fetched and read directly 2026-09-15, superseding this file\'s earlier stale PP20-2025 NFC-bulletin figures for Ohio (1.775%/2.99%/3.64% -> the current, House-Bill-96-enacted 1.60%/2.99%/3.40%). Independently corroborated via a web search (ohiocpa.com practitioner alert, EY tax news) confirming this is a genuine dated rate change effective for payrolls ending on/after 2026-08-01, not a sourcing error. Implements Ohio\'s actual official PER-PAY-PERIOD tables (weekly/biweekly/semi-monthly/monthly, each with its own exemption subtraction and bracket set) directly, rather than annualizing and dividing.', url: 'https://tax.ohio.gov/business/employer-withholding' },
    { authority: 'USDA National Finance Center', instrument: 'Maryland (NFC-26-1783003892), re-fetched with a targeted follow-up prompt to get the complete county-by-county rate table (all 23 counties plus Baltimore City, including the full graduated bracket tables for Anne Arundel and Frederick — the only two MD counties that don\'t use a flat rate) rather than a partial/summarized list.', url: 'https://help.nfc.usda.gov/bulletins/2026/1783003892.htm' },
    { authority: 'USDA National Finance Center (via text-extraction proxy)', instrument: 'Connecticut (NFC-24-1712697342) — the direct WebFetch of this bulletin repeatedly truncated the phase-out add-back and recapture step tables (each has ~10-50 rows); re-fetched via the same proxy workaround used for Oregon in v9 (oregon.gov and this NFC page both proved directly unreachable/unreliable to summarize fully), which returned the complete tables for withholding code A/D verbatim.', url: 'https://help.nfc.usda.gov/bulletins/2024/1712697342.htm' },
    { authority: 'Delaware Division of Revenue', instrument: '"Employer\'s Guide (Withholding Regulations and Employer\'s Duties)" — fetched and read directly 2026-09-15, effective 2025-01-01. Every bracket boundary hand-verified for internal consistency (each row\'s base tax figure exactly reproduces the previous row\'s formula extrapolated to that threshold).', url: 'https://revenue.delaware.gov/employers-guide-withholding-regulations-employers-duties/' },
    { authority: 'DC Office of Tax and Revenue (OTR) / USDA National Finance Center', instrument: 'DC\'s own current "DC Individual and Fiduciary Income Tax Rates" page (fetched directly 2026-09-15) gave a 7-row bracket table that exactly cross-confirmed a separately-fetched 2022 USDA NFC bulletin (TAXES 22-28, "District of Columbia Income Tax Withholding", effective Pay Period 22, 2022), which additionally gave the S/M/N/H filing-status categories and the $4,300-per-dependent allowance figure. Two independent sources landing on identical bracket numbers gives high confidence in the bracket table; the $4,300 allowance is only as current as its 2022 source (no more recent DC bulletin was located) — flagged in limitations.', url: 'https://otr.cfo.dc.gov/page/individual-income-tax-rates-district-columbia' },
    { authority: 'Wisconsin Department of Revenue', instrument: 'Publication W-166 (1/26), "Withholding Tax Guide" — fetched and read directly 2026-09-15, the department\'s own current WITHHOLDING-specific publication (distinct from the individual income tax annual-return instructions, which give a similar-looking but not necessarily interchangeable formula — a distinction this session deliberately checked rather than assumed). Contains the "Alternate Method of Withholding Wisconsin Income Tax" section with a complete percentage-method formula (deduction phase-out by filing status, $400/exemption, and a single bracket schedule applying to both filing statuses) plus 3 fully worked examples, all reproduced exactly by this engine\'s self-tests.', url: 'https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf' },
    { authority: 'Alabama Department of Revenue', instrument: '"Withholding Tax Tables and Instructions" (whbooklet_0126.pdf, effective 01/2026 — the same document the golden-fixture pack itself cites for US-AL-001) — fetched and read directly 2026-09-15 specifically to diagnose the v21 AL federal-deduction bug. Confirmed the official 4-line deduction stack (Standard Deduction / Federal Withholding x periods / Personal Exemption / Dependents) and the exact personal-exemption dollar amounts by claim code ($0 none, $1,500 S/MS, $3,000 M/H), used to fix the missing federal-tax-deduction line and to independently re-verify (not change) the existing $1,500 Single figure — see the limitations entry and the comment above the alabama al_income_tax calculation for the residual, deliberately-not-forced gap against the golden fixture.', url: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf' },
    { authority: 'South Carolina Department of Revenue', instrument: 'WH-1603F, "Formula for Computing South Carolina 2026 Withholding Tax" (Rev. 11/4/25) — fetched and read directly 2026-09-15 to diagnose the v21 SC standard-deduction bug. Confirmed both the personal allowance and the 10%-of-wages/$7,500-cap standard deduction are "$0 if zero allowances claimed", and reproduced the guide\'s own worked example (Subtraction Method, $20,100 taxable -> $549.90 annual) exactly, along with the golden fixture\'s own $0-allowance case.', url: 'https://dor.sc.gov/sites/dor/files/forms/WH1603F_2026.pdf' },
    { authority: 'USDA National Finance Center', instrument: 'Vermont 2026 withholding bulletin (re-fetched 2026-09-15, superseding the stale 2024 bulletin this file previously used) — gives the per-allowance exemption increase from $5,300 to $5,400 and the full 2026 bracket tables (both filing statuses) used to fix the v21 Vermont bracket-threshold bug; every SINGLE_OR_HOH figure cross-confirmed exactly against the golden fixture\'s own calculation trace.', url: 'https://help.nfc.usda.gov/bulletins/2026/1780320782.htm' },
    { authority: 'Oklahoma Tax Commission', instrument: 'Packet OW-2, "Oklahoma Income Tax Withholding Tables" (effective 2026) — fetched and read directly 2026-09-15 specifically to investigate the US-OK-001 golden-fixture mismatch. Found that this engine\'s existing oklahoma.brackets.SINGLE_OR_HOH table ($10,100/$11,250/$13,550 thresholds, $0/$28.75/$109.25 base, 2.5%/3.5%/4.5% rates) reproduces the guide\'s own Table 7 (Annual, Single Person) EXACTLY, and that the golden fixture\'s own calculation trace ("$4.20 + 4.50% of the excess over $521") instead matches Table 7\'s MARRIED PERSON column, not Single — used to confirm this was a fixture labeling issue, not an engine bug, and to add the whole-dollar rounding the guide separately requires ("must be rounded... to the nearest whole [dollar]").', url: 'https://oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2026.pdf' },
    { authority: 'Mississippi Department of Revenue', instrument: '"Withholding Income Tax Tables and Employer Instructions" (89-700-25-1, revised 1/13/2026) — fetched and read directly 2026-09-15 to investigate the US-MS-001 golden-fixture mismatch. Confirmed Mississippi ALSO publishes genuine $10-wide WEEKLY WAGE-BRACKET tables (Table A/B/C by exemption count) as a manual-computation alternative to the percentage/formula method below — see v23 evidence and limitations entries for the resolution.', url: 'https://www.dor.ms.gov/sites/default/files/tax-forms/business/89700251revised1.13.2026.pdf' },
    { authority: 'Mississippi Department of Revenue', instrument: 'v23 (2026-09-19), three independent documents fetched and read directly, all agreeing exactly with each other and with this engine\'s existing formula: (1) "Computer Payroll Accounting - For Periods In 2026" (revised 8/13/25) — MS\'s OWN flowchart explicitly for computerized/automated payroll systems, giving TI = Annualized Gross Pay - (Exemption Claimed + Standard Deduction), 4.0% of TI over $10,000 ($0 at or below), rounded to whole dollars; (2) Form 89-350-25-8-1-000 (Rev. 10/25), the actual employee withholding exemption certificate, confirming $6,000 (Single) / $12,000 (Married, joint) / $9,500 (Head of Family) personal exemptions, $1,500 per dependent, and (newly modeled in v23) an additional $1,500 per block claimed on Line 5 for age 65+ or blindness; (3) USDA NFC federal payroll bulletin NFC-26-1768327516 (PP09 2026), independently corroborating the same exemption table and stating the no-certificate-filed default explicitly: "Single and zero personal exemptions (S00) will be used as the basis for withholding." This resolves the v21/v22 "confirmed gap" finding: the engine\'s formula was already Mississippi\'s own sanctioned computerized-payroll method, not an approximation of it — see the reframed limitations entry for the remaining, now well-understood divergence from the separate manual wage-bracket-table method.', url: 'https://www.dor.ms.gov/sites/default/files/business/Computer%20Payroll%20Flowchart%20-%20updated%208-13-25.pdf' },
    { authority: 'USDA National Finance Center', instrument: 'Federal payroll bulletin NFC-26-1768327516 (PP09 2026) — fetched directly 2026-09-19, independently confirming Mississippi\'s personal-exemption table and quoting the explicit no-certificate-filed default rule verbatim (see above). Used as the second of three v23 corroborating sources.', url: 'https://help.nfc.usda.gov/bulletins/2026/1768327516.htm' },
    { authority: 'Mississippi Department of Revenue', instrument: 'Form 89-350-25-8-1-000 (Rev. 10/25), Employee\'s Withholding Exemption Certificate — fetched and read directly 2026-09-19, the actual current employee-facing form and instructions. Third of three v23 corroborating sources; also the source for the new Line 5 age-65/blindness $1,500-per-block exemption added in v23.', url: 'https://www.dor.ms.gov/sites/default/files/tax-forms/business/89350258.pdf' },
    { authority: 'Comptroller of Maryland', instrument: '"Maryland Employer Withholding Guide" (effective January 2026) — fetched and read directly 2026-09-15 to diagnose and fix the v21 md_income_tax=$0-under-$100k bug found by the golden-fixture pass. Used to confirm (a) the $3,400 standard deduction and $3,200/exemption figures already in this file were correct, and (b) the official combined 3.20%-local-rate Annual-payroll-period percentage table (page 37) for both filing statuses, which was used to verify the fixed brackets\' correctness at the Montgomery County/$62,400/Single/0-exemptions golden fixture point and to quantify (not eliminate) the residual ~1.1% gap between this engine\'s decomposed state+county calculation and Maryland\'s actual combined-table withholding amount — see the limitations entry and the comment above the maryland.brackets table for the full reasoning.', url: 'https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf' },
    { authority: 'Internal Revenue Service', instrument: 'Publication 15-T (2026), Section 1, "Withholding on Supplemental Wages" — 22% optional flat rate on supplemental wages up to $1,000,000 cumulative in the calendar year (37% mandatory above that threshold, not implemented — see limitations). Used as the federal rate for the new v22 wage_type: \'SUPPLEMENTAL\' input path.', url: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf' },
    { authority: 'Arkansas Department of Finance and Administration', instrument: '"Withholding Tax Instructions" (withholdInstructions-2.pdf) — fetched and read directly 2026-09-16: "Deduct 3.9% of the bonus or commission for state income tax" for supplemental wages paid separately from regular wages.', url: 'https://www.dfa.arkansas.gov/wp-content/uploads/withholdInstructions-2.pdf' },
    { authority: 'Minnesota Department of Revenue', instrument: '"2026 Minnesota Withholding Tax Instructions and Tables" (wh-inst-26.pdf) — fetched and read directly 2026-09-16, p.9: supplemental payments are "subject to the 6.25% Minnesota withholding rate regardless of how many allowances employees claim."', url: 'https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf' },
    { authority: 'Missouri Department of Revenue', instrument: 'Form 4282, "State of Missouri Employer\'s Tax Guide" (Revised 03-2026) — fetched and read directly 2026-09-16: employers may "withhold a flat percentage rate of 4.7 percent of the supplemental wages."', url: 'https://dor.mo.gov/forms/4282_2026.pdf' },
    { authority: 'North Dakota Office of State Tax Commissioner', instrument: '"Income Tax Withholding" guidance page — fetched and read directly 2026-09-16: supplemental wages paid separately (or separately identified) may be withheld at "1.5% (.015)."', url: 'https://www.tax.nd.gov/business/income-tax-withholding' },
    { authority: 'Nebraska Department of Revenue', instrument: '"Circular EN, Nebraska Income Tax Withholding for Wages, Pensions and Annuities, and Gambling Winnings Paid on or after January 1, 2026" (8-429-1998, Rev. 11-2025) — fetched and read directly 2026-09-16: employers "may elect to withhold income tax on the supplemental wages by using a flat 3.5% withholding rate."', url: 'https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026cir_en_whole.pdf' },
    { authority: 'Wisconsin Department of Revenue', instrument: 'Publication W-166, "Withholding Tax Guide" (1/26) — the same document already cited above for Wisconsin\'s regular brackets, re-read 2026-09-16 for its "SUPPLEMENTAL WAGE PAYMENTS" section, which gives an alternative flat-percentage-by-estimated-annual-salary method using the same four rate tiers as the regular bracket table.', url: 'https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf' },
    { authority: 'Montana Department of Revenue (secondary-sourced)', instrument: 'Montana\'s optional flat 5% supplemental-wage withholding method — this engine\'s own direct fetch of revenue.mt.gov\'s "Montana Employer and Information Agent Guide" returned a dead link (404) on 2026-09-16; the 5% figure is corroborated instead by three independent payroll-industry secondary sources (PaycheckCity, TimeTrex, Deel) rather than an independently-read primary PDF — lower confidence than the other 7 supplemental-rate states in this file, flagged explicitly in limitations.', url: 'https://revenue.mt.gov/taxes/withholding-tax/wage-withholding-returns-and-payments' },
    { authority: 'Rhode Island Division of Taxation (secondary-sourced)', instrument: 'Rhode Island\'s flat 5.99% supplemental-wage withholding rate — this engine\'s own direct fetch of the "2026 Rhode Island Employer\'s Income Tax Withholding Tables" booklet PDF returned malformed/unreadable binary content on 2026-09-16; the 5.99% figure (matching RI\'s own top marginal bracket rate already in this file) is corroborated by multiple independent secondary sources rather than independently re-read from the booklet\'s own text — flagged in limitations.', url: 'https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-12/2026%20Withholding%20Tax%20Booklet.pdf' },
    { authority: 'Maine Revenue Services', instrument: '"Withholding Tables for Individual Income Tax" (26_wh_tab_instr.pdf) — fetched and read directly 2026-09-16, the actual official current-year booklet with 3 fully worked percentage-method examples, all reproduced exactly by this engine\'s implementation. Adds Maine as a new supported state (v22), including its 5% flat supplemental-wage rate.', url: 'https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr.pdf' },
    { authority: 'DC Office of Tax and Revenue / IRS Form W-4', instrument: 'DC Form D-4, "Employee Withholding Allowance Certificate" (EXEMPT section) and IRS Form W-4 instructions ("Exemption from Withholding") — used as the basis for the new v22 dc_d4_exempt and federal_w4_exempt input flags, honored by zeroing the corresponding withholding line when set.', url: 'https://otr.cfo.dc.gov/sites/default/files/dc/sites/otr/publication/attachments/D-4_0.pdf' },
    { authority: 'CT Paid Leave Authority', instrument: '"Contributions" page (ctpaidleave.org/how-ct-paid-leave-works/contributions) — fetched and read directly 2026-09-16: "The CT Paid Leave Board of Directors has voted to maintain the contribution rate at 0.5% for 2026," capped at "the Federal Social Security Wage Cap," 100% employee-funded.', url: 'https://www.ctpaidleave.org/how-ct-paid-leave-works/contributions' },
    { authority: 'Delaware Department of Labor (secondary-sourced)', instrument: 'DE Paid Leave 0.8% total premium / 0.4% maximum employee share, capped at the Social Security taxable maximum — this engine\'s own direct fetch of the DE DOL\'s "Employers & TPAs Guide to Delaware Paid Leave" PDF returned malformed content on 2026-09-16; corroborated instead by OnPay, MetLife, and Prudential 2026-dated compliance summaries, not independently re-read from the DOL\'s own PDF text — flagged in limitations.', url: 'https://laborfiles.delaware.gov/main/pfl/Employer_and_TPAs_Guide_to_DPL.pdf' },
    { authority: 'Hawaii Department of Labor and Industrial Relations, Disability Compensation Division', instrument: '"2026 Maximum Weekly Wage Base and Maximum Weekly Benefit Amount" (Dec. 10, 2025) — fetched and read directly 2026-09-16: employers may withhold TDI contributions "not more than .5% of the employee\'s weekly wage, with the maximum not to exceed $7.50" on a maximum weekly wage base of $1,500.21.', url: 'https://labor.hawaii.gov/dcd/files/2025/12/2026-Maximum-Weekly-Wage-Base.pdf' },
    { authority: 'Massachusetts Department of Family and Medical Leave (secondary-sourced)', instrument: 'MA PFML employee contribution rate 0.46% (0.28% medical + 0.18% family), wage-capped at the SS taxable maximum — this engine\'s own direct fetch of mass.gov\'s own PFML contribution-rates page returned HTTP 403 on 2026-09-16; corroborated instead by NFP, Patriot Software, and a Seyfarth Shaw LLP legal compliance alert, all independently agreeing on the same figures — not independently re-read from the Commonwealth\'s own notice text, flagged in limitations.', url: 'https://www.mass.gov/info-details/massachusetts-paid-family-and-medical-leave-contribution-rates-for-employers' },
    { authority: 'Vermont Department of Taxes', instrument: 'GB-1326, "The Vermont Child Care Contribution" — fetched and read directly 2026-09-16: "Employers are required to pay a 0.44% payroll tax on their employees\' wages... employers may withhold no more than one-quarter of the contribution from employee wages (i.e., not more than 0.11% of any employee\'s wages)."', url: 'https://tax.vermont.gov/sites/tax/files/documents/GB-1326.pdf' }
  ],
  limitations: [
    'Supported states (v22): CA, NJ, NY, IL, PA, MI, CO, AZ, AK, WA, OR, IN, NC, GA, KY, MS, UT, MN, MT, ND, OK, RI, VA, MA, MO, NE, SC, VT, WV, KS, ID, NM, AR, HI, OH, LA, IA, AL, MD, CT, DE, DC, WI, ME, and the 7 no-income-tax/no-employee-levy states (FL, NV, NH, SD, TN, TX, WY) — full 50-state-plus-DC-plus-ME coverage (Maine added v22). Several early states in this list (GA, KY) looked deceptively simple from a headline rate alone but had real deduction/exemption structure underneath — the same trap Indiana was originally rejected over (see the v10 change log) before its actual formula was fetched directly.',
    'Supplemental-wage flat-rate withholding (v22): federal (22% Pub 15-T optional method, no year-to-date supplemental-wage tracker so the 37%-above-$1M-cumulative mandatory tier is NOT implemented — a supplemental payment this engine is told about that would in reality cross $1M cumulative for the year is silently taxed at 22%, not 37%; callers running very high supplemental payments must apply the 37% rate themselves) plus 8 states with their own sourced flat rate: Arkansas (3.9%), Minnesota (6.25%), Missouri (4.7%), Nebraska (3.5%), North Dakota (1.5%), Wisconsin (a 4-tier schedule by estimated annual salary: 3.54%/4.65%/5.30%/7.65%), Montana (5%, SECONDARY-SOURCED ONLY — this engine\'s own direct PDF fetch of Montana\'s Employer Guide hit a dead link, so this rate rests on payroll-industry aggregator corroboration, not an independently re-read primary document), and Rhode Island (5.99%, also SECONDARY-SOURCED ONLY for the same reason — the primary booklet PDF fetch returned unreadable binary content). Passing wage_type: \'SUPPLEMENTAL\' for any OTHER state is REJECTED with an explicit error (not silently run through the regular method) — Maine (5%) also has a sourced supplemental rate but is deliberately excluded from the SUPPLEMENTAL-scenario error path\'s "not implemented" list since it IS implemented; every remaining state (CA, NJ, NY, and the other ~35 not named above) genuinely has no supplemental-specific rate captured in this file and will reject wage_type: \'SUPPLEMENTAL\' rather than approximate with the regular annualized method.',
    'Federal/DC exempt-certificate handling (v22): federal_w4_exempt (general, any state) and dc_d4_exempt (DC only) each independently zero their own withholding line when set to true. This engine does NOT track a certificate\'s filing date or annual expiry (IRS exempt claims must be renewed by Feb 15 each year) — the caller is responsible for only setting these flags for a currently-valid exempt claim. No other state has an equivalent exempt-certificate input path implemented — only DC.',
    'Maine (v22, new state): sourced directly from Maine Revenue Services\' own current withholding booklet, worked-example-verified (all 3 of the booklet\'s own examples reproduced exactly) — the strongest confidence tier in this file, comparable to IA/OR/IN/NC/DE/WI. W-4ME collapses Head of Household into the SAME schedule as Single (not a separate schedule), which this engine\'s MeFilingStatus type reflects (SINGLE_OR_HOH / MARRIED) rather than modeling HOH separately.',
    'CT Paid Leave, DE Paid Leave, HI TDI, MA PFML, VT Child Care Contribution (v22): five secondary state payroll programs added alongside their state income tax. CT Paid Leave and VT CCC were independently fetched and read directly from their state agency\'s own current PDF/page. DE Paid Leave and MA PFML are SECONDARY-SOURCED ONLY — this engine\'s own direct fetch of the Delaware DOL\'s guide and mass.gov\'s own contribution-rates page both failed (malformed PDF content / HTTP 403 respectively), so those two rest on payroll-industry/law-firm secondary corroboration rather than an independently re-read primary document, flagged explicitly rather than presented as equally strong as the CT/HI/VT figures. HI TDI is only COMPUTED for WEEKLY pay frequency (its statutory cap is defined per calendar week with no official per-frequency conversion table) — hi_tdi is silently 0 for HI employees on BIWEEKLY/SEMIMONTHLY/MONTHLY frequency (including this file\'s own pre-existing MONTHLY HI self-test case) rather than approximating a prorated weekly cap; this is a gap in that field specifically, not a rejection of the whole HI calculation the way CO Denver OPT/NY DBL reject non-matching frequencies outright. This engine does NOT model the EMPLOYER-side expense/liability line for any of these five programs (e.g. MA PFML\'s employer-paid 0.42% share for 25+-employee employers, DE Paid Leave\'s employer-paid 50%+ share) — only the employee-side withholding deduction, consistent with the existing employer-cost scope of this file (which already excludes NY MCTMT for the same reason).',
    'Ohio (v18): fixed a real, dated rate change caught by a user-supplied cross-check document (a "developer formula pack") that flagged Ohio\'s brackets as "EFFECTIVE-DATED" and cited different rates than this file previously shipped. Verified independently (web search + Ohio DOT\'s own current PDF) that Ohio genuinely revised its withholding brackets effective for payrolls ending on/after 2026-08-01 (House Bill 96): 1.775%/2.99%/3.64% -> 1.60%/2.99%/3.40%. This file now implements Ohio\'s actual official method — separate per-pay-period exemption/bracket tables for weekly, biweekly, semi-monthly, and monthly — rather than an annualize-and-divide approximation. No pre-2026-08-01 payroll date is modeled; every OH calculation uses the current post-revision table regardless of pay_date, which would be incorrect for a payroll actually run before August 1, 2026.',
    'DC (v16): the bracket table is high-confidence — two independent sources (DC OTR\'s own current rates page + a 2022 USDA NFC bulletin) landed on the identical 7-row table. However, the $4,300-per-dependent allowance is ONLY as current as its 2022 source; no more recent DC bulletin was located, so this figure should be reconfirmed before real 2026 payroll runs (same dated-source caveat pattern as VA/KS/ID/VT). Also, no separate DC standard-deduction figure (beyond the dependent allowance) was captured in the sources obtained — taxable wages here are annual wages minus only the dependent allowance; if DC withholding in fact also subtracts a base standard deduction independent of dependents, this would overstate DC withholding for employees with few/no dependents. Flagged rather than guessed.',
    'Wisconsin (v17, the final state, completing full US coverage): sourced from the Wisconsin DOR\'s own current Publication W-166 (1/26) Withholding Tax Guide, specifically its "Alternate Method of Withholding" section — this is the WITHHOLDING-specific formula, deliberately distinguished from a similar-looking but ANNUAL-RETURN-specific formula found earlier in Form 1\'s instructions (which was NOT used, precisely because mixing annual-return constants into a withholding calculation without confirming interchangeability could have produced genuinely wrong numbers — flagged and held back in the v16 pass rather than guessed). All 3 of the guide\'s own worked examples (single/weekly, single/weekly with more exemptions, married/biweekly) are reproduced exactly by this engine. Treat as a high-confidence, primary-sourced, worked-example-verified state — comparable to IN/NC/IA/DE rather than the weaker single-NFC-bulletin tier.',
    'Connecticut (v14): only withholding code A/D is implemented. Codes B, C, and F use their own separate base bracket tables and/or phase-out/recapture schedules that were not captured this pass — employees on those codes are REJECTED with an explicit error rather than approximated using the A/D tables.',
    'Maryland (v14): county tax is MANDATORY and this engine requires md_county to be set to one of Maryland\'s 23 counties or Baltimore City rather than silently omitting it (the same required-not-skipped pattern established for Indiana\'s county tax in v10). Anne Arundel and Frederick\'s own graduated county bracket tables are fully implemented (not simplified to a flat rate); their bracket "base" dollar amounts for Frederick were computed by this engine from the source\'s rate-and-threshold data (not directly quoted in the source), then verified for internal consistency at every bracket boundary.',
    'Maryland (v21, BUG FIX + open gap): the golden-fixture pass against US_2026_Payroll_Golden_Payslip_QA_Pack_All_50_States_DC.pdf (US-MD-001, Montgomery County) found that the SINGLE/MARRIED state bracket tables had NO real bracket structure below $100,000/$150,000 — that whole range mapped to a 0% placeholder, so every MD employee earning under six figures got md_income_tax = $0.00 regardless of wages. Fixed by adding Maryland\'s real, long-stable 2%/3%/4%/4.75% statutory brackets for that range (see the comment directly above the brackets table for full detail and sourcing). This was a severe, silent under-withholding bug for the overwhelming majority of real Maryland payrolls, not a cosmetic rounding gap. REMAINING GAP, deliberately not force-fixed this pass: this engine computes MD withholding as (state bracket tax) + (flat or graduated county rate on the same taxable wages), but Maryland\'s official withholding guide instead publishes ONE COMBINED state+local percentage-method table per distinct local rate (10 tables, verified directly against the Comptroller\'s 2026 guide, https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf, page 37 for the 3.20% table). For the golden fixture\'s own inputs, the official combined table gives $90.20/week; this engine\'s post-fix decomposed calculation gives $89.19/week — a real, understood ~$1.01/week (~1.1%) residual gap from the combined-table\'s blended first-bracket rate, not a further bracket transcription error. Every MD county still carries this same ~1% class of residual gap until this engine is rebuilt around Maryland\'s actual 10-table combined-rate architecture (both filing statuses) — flagged as follow-up work.',
    'Iowa (v13): the ONE state in the v11-v13 batches sourced with the same rigor as CA/NJ/NY/OR/IN/NC — the actual Iowa DOR current-year formula publication, with all 6 relevant worked examples reproduced exactly. Treat as high confidence, not the weaker single-NFC-bulletin tier the rest of this batch carries.',
    'v21 golden-fixture pass (2026-09-16) against US_2026_Payroll_Golden_Payslip_QA_Pack_All_50_States_DC.pdf, 41 of the 51 fixtures actually run through this engine (the other 10 are structurally out of scope — see below): found and fixed 5 real, confirmed bugs (Alabama\'s missing federal-tax deduction, Maryland\'s missing sub-$100k/$150k state brackets, South Carolina\'s always-on standard deduction, Idaho\'s and Vermont\'s stale pre-2026-revision bracket tables — see each state\'s own dedicated limitations entry for detail and sourcing) plus one rounding fix (Oklahoma now rounds to the nearest whole dollar per its own official instruction). Also confirmed 2 fixture-side issues rather than engine bugs: the golden pack\'s own California PIT figure ($647.90) already had a documented engine-vs-fixture method divergence before this pass (see the CA case-17 comment); this pass additionally found the pack\'s US-OK-001 fixture itself appears to apply Oklahoma\'s MARRIED weekly bracket parameters to a scenario it labels Single (verified directly against Oklahoma\'s own official Table 7) — not treated as an engine bug. Structurally NOT run this pass, not because of a data error but because the input schema/engine has no code path for them at all: (a) 8 SUPPLEMENTAL-scenario fixtures (AR, MN, MO, MT, ND, NE, RI, WI) — this engine has no federal/state supplemental-wage flat-rate withholding of any kind (see the existing "Supplemental-wage flat-rate withholding methods... are not implemented" entry below); (b) Maine (ME) is not one of this engine\'s ~47 supported states at all (no UsState member, no me_income_tax field); (c) the DC fixture requires a federal/D-4 EXEMPT-certificate input path this engine has no field for, for any state. Five further REGULAR-scenario states pass their core state-income-tax LINE exactly but have a documented total/net gap because a whole secondary payroll program the fixture also asserts is not implemented in this engine at all: CT Paid Leave ($6.00/week), DE Paid Leave ($4.80/week), HI TDI ($6.00/week), MA PFML ($5.52/week), and Vermont\'s optional employer-elected Child Care Contribution ($1.32/week) — none of these have any field or calculation anywhere in this file. See test-golden-us-all-states.ts at the repo root for the full line-by-line results this entry summarizes.',
    'Mississippi (v21/v22: flagged as a CONFIRMED GAP against this engine\'s own formula; v23 RESOLVED via triple-sourcing, 2026-09-19): the v21/v22 passes found this engine\'s formula ("$0 under $10,000 annualized, then flat 4% above it" with per-status deduction/exemption) diverges from the US-MS-001 golden fixture\'s expected $39.00/week (engine gave $33.92/week) and treated this as an unverified simplification. v23 re-investigated the SOURCE of the engine\'s own formula, not just the gap, and found it independently corroborated by three separate documents (Mississippi DOR\'s "Computer Payroll Accounting" flowchart, USDA NFC bulletin NFC-26-1768327516, and Form 89-350 itself — see evidence). The flowchart is explicitly Mississippi\'s OWN sanctioned method "for computerized payroll" — i.e., exactly the category FinClose\'s engine belongs to — and this engine\'s existing formula reproduces it exactly, including the whole-dollar rounding step. Separately, Mississippi ALSO publishes manual $10-wide weekly wage-bracket tables (89-700-25-1) as an alternative computation method for employers doing withholding by hand; the golden fixture\'s $39.00/week figure was built from that manual-table method, not the computerized-percentage method. The ~$5.08/week (~15%) divergence between the two is a genuine, understood structural difference between two co-existing official Mississippi methods (bracket-table $10 rounding vs. continuous percentage formula), not an error in either one. This engine correctly implements the computerized-payroll method, which is the more appropriate of the two for an automated product like FinClose — but a company or accountant cross-checking a Mississippi payslip against the manual wage-bracket tables (e.g. in a manual audit) should expect small differences of this size and should not read them as a calculation error. v23 also added the Form 89-350 Line 5 age-65/blindness exemption ($1,500 per block, up to 4), which was not previously modeled at all.',
    'South Carolina (v21, BUG FIX): the golden-fixture pass found this engine applied the 10%-of-wages/$7,500-cap standard deduction unconditionally, when South Carolina\'s own WH-1603F formula states the deduction (and the separate personal allowance) are both "$0 if zero allowances claimed" and only apply when the employee claims one or more allowances. Fixed by gating both on sc_allowances > 0; reproduces both the WH-1603F worked example and the golden fixture exactly. Every SC employee who claims zero allowances was previously under-withheld.',
    'Idaho (v21, BUG FIX): the golden-fixture pass found this engine\'s $15,000/$30,000 annual thresholds were the stale pre-revision figures; Idaho\'s own EPB00744 (revised 07-23-2026) raised them to $16,100 (Single/HOH) and $32,200 (Married). Fixed — see the comment above idaho.threshold_annual for detail, including a small (~$0.02/week) residual gap from Idaho\'s own per-pay-frequency tables being independently rounded rather than exact multiples of each other, which this engine\'s single-annual-threshold architecture cannot reproduce byte-exact.',
    'Vermont (v21, BUG FIX): superseded the v12-flagged stale 2024 bracket table with Vermont\'s actual 2026 figures (both filing statuses) — see the comment above vermont.brackets for detail. The separate, still-open Vermont Child Care Contribution gap (an optional employer-elected program this engine does not implement at all) is unrelated and remains open — see the v21 pass-summary entry above.',
    'Delaware (v21, method-divergence finding, not an engine bug): the golden-fixture pass confirmed this engine\'s annualized PERCENTAGE method (bracket table, internally consistent) produces a different weekly number ($55.70) than the golden fixture\'s own DE wage-BRACKET table method ($58.61) for the same inputs — Delaware, like several other states, publishes both a percentage method and a discrete wage-bracket table as equally valid alternatives; this engine implements only the former. Same class of legitimate method-choice divergence as the existing CA Method-B precedent, not force-matched.',
    'Hawaii, Kansas, West Virginia (v21, verified, not pursued further): the golden-fixture pass found these three within $0.01-$0.02/week of their fixtures — consistent with this engine\'s uniform "annualize wages, apply annual brackets, divide by periods" architecture landing a cent or two off a source that instead publishes independently-rounded per-period tables (the same underlying cause already documented in detail for Idaho). Not investigated further given the sub-3-cent size; flagged here rather than silently left unexplained.',
    'Oklahoma (v21, rounding fix + fixture-labeling finding, not an engine bug): added whole-dollar rounding per Oklahoma\'s own stated withholding rule (previously kept cents). Separately, re-verified this engine\'s existing SINGLE_OR_HOH bracket table against Oklahoma\'s own official Table 7 (Annual, Single) and found it matches exactly ($10,100/$11,250/$13,550 thresholds); the golden-fixture pack\'s own US-OK-001 card appears to use Oklahoma\'s MARRIED weekly bracket parameters ($521 threshold / $4.20 base) for a scenario it labels "Single" — not force-matched, treated as a fixture-side issue backed by a direct primary-source cross-check, not a reason to change this engine\'s already-correct table.',
    'Alabama (v21, BUG FIX + open gap): the golden-fixture pass against US_2026_Payroll_Golden_Payslip_QA_Pack_All_50_States_DC.pdf (US-AL-001) found this engine\'s Alabama deduction stack was missing an entire, confirmed-real deduction line: Alabama\'s own official withholding booklet (whbooklet_0126.pdf, step 2, fetched and read directly 2026-09-15) lists Standard Deduction (2A) + FEDERAL WITHHOLDING x periods/year (2B) + Personal Exemption (2C) + Dependents (2D); this engine only ever implemented 2A, 2C, and 2D, silently omitting the federal-tax deduction entirely (Alabama is one of the few states that lets the federal withholding amount itself reduce AL taxable wages, uncapped for withholding purposes per the booklet\'s own worked example). Fixed by adding the missing federal-tax-deduction line. This moved the AL-001 fixture from $55.38/week (old, wrong — overstated AL withholding by omitting a real deduction) to $50.28/week. OPEN, UNRESOLVED GAP: the fixture itself asserts $51.72/week, a further $1.44/week different from this engine\'s post-fix number. That gap was NOT force-closed: this engine\'s $1,500 Single personal-exemption figure was independently re-verified directly against the same booklet\'s own exemption-code table ("SINGLE CLAIMING $1500 PERSONAL EXEMPTION") this pass and confirmed correct, so reproducing the fixture\'s exact number would require an unverified guess at a different personal-exemption or federal-deduction treatment not supported by the primary source in hand — left open rather than reverse-fit, consistent with the CA Method-B precedent elsewhere in this file.',
    'Alabama (v13): only wages at or above the FLOOR standard-deduction threshold are supported ($35,500/year Single/MFJ/Head of Family, $17,750/year MFS) — Alabama\'s real standard deduction phases DOWN in $25 increments for every $500 of income below that threshold (confirmed via Alabama\'s own official TY2025 deduction table), which this engine does not model. Employees below the threshold are REJECTED with an explicit error rather than approximated. Alabama\'s tax brackets, personal exemption, and dependent exemption tiers are sourced from a 2022 NFC bulletin (not reconfirmed for 2026) — treated as low-risk given AL\'s historical rate stability, but should be reconfirmed before real payroll runs. The Alabama standard deduction table itself is dated tax-year 2025, not yet confirmed for 2026.',
    'v12 eleven-state batch (MA, MO, NE, SC, VT, WV, KS, ID, NM, AR, HI): same single-NFC-source confidence tier as v11. Only 4 (MO, HI, SC, AR) were hand-verified against manual bracket arithmetic; the rest (MA, NE, VT, WV, KS, ID, NM) checked only for journal-balance/positive-tax sanity — a real, explicitly-flagged verification gap.',
    'Arkansas (v12): the real top bracket smooths across 28 narrow $100-wide rows between $94,701 and $97,601 annualized taxable income to avoid a hard rate cliff; this engine could not obtain that full 28-row table and REJECTS (with an explicit error) any employee whose annualized taxable income falls in that band, rather than approximating across it. Also does not model Arkansas\'s separate low-income tax credit for married filers in a specific income band.',
    'New Mexico (v12): implemented with ZERO standard deduction or exemption subtracted before the bracket lookup, because the only source found gave no such structure at all — the bracket table itself IS complete and internally verified (an initial fetch had only captured the first and last of 10 rows per filing status, silently producing $0 tax at $120,000/year single income; caught by this file\'s own self-test suite and fixed by re-fetching for the full table, cross-checked row-by-row by hand). The missing-deduction question is still flagged as possibly reflecting an incomplete source extraction rather than a confirmed absence of any NM deduction — worth re-verifying against NM\'s own withholding formula publication before this state is trusted for real payroll.',
    'Idaho (v12): the formula was reconstructed from the source bulletin\'s DESCRIPTIVE text ("applies the rate only to income exceeding these thresholds after subtracting the exemption allowance") rather than a literally-quoted formula line — carries slightly lower confidence than every other state in this file, where the formula itself was quoted directly.',
    'Massachusetts (v12): MA\'s own additional Head-of-Household ($120) and blind ($110/exemption) deduction add-ons are NOT modeled — this engine has no HOH-specific or blindness input fields for any state. Only the base exemption-count-driven deduction and the sub-$8,000 low-income exemption are implemented.',
    'Vermont, Kansas, and Idaho (v12): sourced from each state\'s most recently available NFC bulletin, which for these three predates 2026 (VT: 2024, KS: 2024, ID: 2025) — no more recent bulletin was found during this pass. Should be reconfirmed once a 2026-dated bulletin or the state\'s own current-year withholding guide becomes available.',
    'v11 ten-state batch (GA, KY, MS, UT, MN, MT, ND, OK, RI, VA): each sourced from exactly ONE document (that state\'s current USDA National Finance Center bulletin), not cross-checked against a second independent source or an official worked example the way CA/NJ/NY/OR/IN/NC were. This is the same confidence tier as the original v5 batch, explicitly lower than the dual-sourced/fixture-verified states. Self-tests for this batch check bracket-math arithmetic by hand (GA/KY/MT) and journal-balance/positive-tax sanity for the rest — real bugs in bracket transcription for the un-hand-verified seven would not necessarily be caught by these tests. Flagged explicitly, consistent with this file\'s practice of naming its own weaker spots rather than glossing over them.',
    'v11 states explicitly NOT attempted this pass for inadequate sourcing found during research (do not assume these were overlooked — each was investigated and rejected for a specific reason): Maryland (mandatory county tax where several counties — Anne Arundel, Frederick — use their own graduated brackets rather than a flat rate, not resolved this pass), Connecticut (six withholding-code filing tracks A-F plus a "3%/2% phase-out add-back" mechanism not fully characterized from available sourcing), Alabama (NFC bulletin is stale, from 2022, and its standard deduction is itself an income-phased step function needing more detail than gathered), Iowa (confirmed flat 3.8% for 2026 via secondary sources, but no primary percentage-method deduction structure found — the available NFC bulletin predates Iowa\'s 2025 flat-tax conversion), Delaware, Wisconsin, and DC (no reliable primary or NFC source reached — only AI-search-synthesized secondary sources, the same category of source this file\'s own Oregon precedent explicitly distrusts when used alone).',
    'Utah (v11): implements the ONLY state in this file where the deduction mechanism reduces the computed TAX (a phasing-out annual credit) rather than the taxable WAGE base — a genuinely different formula shape from every other state here. Confirmed structurally sound against the NFC bulletin\'s own description, but not verified against a worked example.',
    'Virginia (v11): sourced from the most recent available bulletin (effective PP14 2025); no 2026-specific Virginia bulletin was found during this pass. Should be reconfirmed once a 2026 Virginia bulletin or the state\'s own current-year withholding guide is available. Virginia\'s own separate $800 age/blindness exemption amount is also not modeled (this engine has no age/blindness input fields for any state).',
    'Rhode Island (v11): modeled with ONE unified bracket table with no filing-status split, per the source bulletin\'s own structure (RI\'s bulletin did not present separate married/single tables) — flagged in case this reflects incomplete source extraction rather than a genuine RI simplification.',
    'Louisiana was evaluated but NOT added this pass: its NFC bulletin gives the flat 3.09% rate and standard-deduction tiers by exemption count, but does not give a specific dollar amount for Louisiana\'s dependent credit — rejected rather than guessed, consistent with this file\'s fail-closed pattern.',
    'Indiana (v10): county tax is MANDATORY and this engine requires in_county to be set to one of the 92 official county names rather than silently omitting it (the prior version\'s reason for rejecting Indiana entirely). The county rate table is current as of Departmental Notice #1 (effective 2026-01-01) and will go stale if Indiana updates rates later in the year (the notice itself tracks mid-year changes with an asterisk per county) — callers running payroll well into 2026 should reconfirm the table.',
    'North Carolina (v10): NC-30 documents two alternative methods (Wage Bracket Tables, keyed by income RANGE, and the Percentage Method, keyed by exact dollar amounts) that NC-30 itself says "will differ slightly" from each other. This engine implements only the Percentage Method (the documented-exact one, same choice made for every other state in this file).',
    'Oregon (v9): the federal-tax-subtraction phase-out schedule is applied by FILING STATUS alone (single vs. married), independent of the allowance-count-driven bracket track. A SINGLE filer claiming 3+ allowances (who therefore uses the WIDE bracket track, same as a married filer) whose annual wages also reach $125,000+ (the point the single/married phase-out schedules start to diverge) hits a combination this engine\'s two sources don\'t clearly resolve — rejected with an explicit error rather than guessed. This is a narrow, rare combination for the ~50-employee freelancer/small-business target market, not a gap in the ordinary case. One number seen in the proxy-fetched Oregon DOR text ("$38,340" as a bracket lower bound) was NOT corroborated by the independent USDA NFC source and was discarded rather than used — see the v9 change log for the full reconciliation.',
    'Indiana was deliberately NOT added despite the secondary reference giving a headline state rate (2.95%), because that reference does not give the actual personal/dependent exemption amounts Indiana\'s real withholding formula subtracts before applying the rate — applying 2.95% to full gross would overstate every IN employee\'s withholding. Rejected rather than approximated. (Indiana county income tax, which is required in addition to the state amount, is unimplemented regardless for the same reason CA/NJ/NY local complexity was scoped state-by-state.)',
    'IL, PA, MI, CO, AZ, AK, and WA (added in v5) are sourced from a secondary cross-check reference document, not independently fetched from each state\'s own primary publication the way CA/NJ/NY were — see the evidence list above. This is a materially weaker sourcing chain and these seven states should be treated as lower-confidence than CA/NJ/NY until independently verified against each state\'s own official withholding-methods publication.',
    'PA and CO local taxes (v8): Philadelphia Wage Tax (pa_philadelphia_resident / pa_philadelphia_nonresident_workplace, effective-dated by pay_date at the 2026-07-01 rate change) and Denver Occupational Privilege Tax employee share (co_denver_employee, MONTHLY-frequency-only, $5.75 flat once the $500/month earnings threshold is met) are now modeled and independently primary-sourced (phila.gov, denvergov.org) — see evidence. Denver\'s $4.00/month employer-paid Business OPT is ALSO now modeled (v20, denver_opt_employer, same gating as the employee OPT), closing the v8-era gap. All OTHER MI, CO (outside Denver), AZ, AK, and WA local/city income taxes (e.g. the many Michigan cities that levy their own income tax) remain unmodeled.',
    'California income tax (v7): for a given gross wage, this engine can differ from a result computed via EDD\'s OPTIONAL "annualize wages, apply the annual bracket table, divide by periods" method by a few cents, because this engine uses EDD\'s PRIMARY period-specific Method B tables (Tables 5-28) applied directly to the period\'s taxable income instead. Both methods are EDD-documented and both are "correct" — they can simply round differently at the margin. Confirmed via a user-supplied golden-payslip fixture (CA monthly $10,000/Single/0 allowances: this engine gives $647.84, the fixture\'s annualized-method calculation gives $647.90) — not treated as a bug, but flagged since a caller comparing this engine\'s output against a payslip built with the alternate method may see a few-cent difference at some wage levels.',
    'CO: the FAMLI employer-share/small-employer-exemption rules are DYNAMIC (employer-side only, don\'t affect the employee co_famli figure this engine computes) and not modeled.',
    'WA: PFML and WA Cares small-employer exemptions and WA Cares individual approved-exemption letters are DYNAMIC and not modeled — every WA employee is assumed subject to both at the flat statutory rates. A WA employee with an approved WA Cares exemption would be incorrectly charged the 0.58% contribution by this engine; callers with such employees must adjust outside this engine.',
    'AZ: only the employee\'s own percentage election (az_election_percent) is modeled. The statutory "default 2.0% if no A-4 timely filed" employer-side default behavior is NOT implemented — the caller must always supply the employee\'s actual election (or explicit 0% if validly elected) rather than relying on this engine to apply the default.',
    'Only 2020-or-later Form W-4 revisions are supported (Steps 1-4) for federal withholding. Pre-2020 allowances-based W-4s are rejected, not approximated via the IRS computational bridge.',
    'Only weekly, biweekly, semimonthly, and monthly pay frequencies are supported.',
    'State Unemployment Insurance (SUI), employer-side (v19): computed ONLY when the caller supplies both sui_rate and sui_wage_base per employee, straight off that employer\'s own annual state rate notice — every state assigns each employer its own experience-rated percentage annually (there is no statutory default this engine could embed the way it does for federal FICA/FUTA), and the taxable wage base, while state-published, changes state-by-state every year. Omitting both fields leaves SUI uncomputed (employer_sui: 0), the same behavior as every version before v19 — full backward compatibility. What this engine DOES do once both are supplied: correctly prorates and caps the taxable wage base across pay periods using the same ceilingContribution primitive as FICA/FUTA (ytd_sui_wages_before/ytd_sui_wages_after), aggregates across employees, and posts a SUI_PAYABLE journal credit — the parts of SUI that are genuinely easy to get wrong by hand. SUI wages are assumed to follow the same base as FUTA (gross minus Section 125 deductions only) — a reasonable default since most states mirror FUTA\'s wage definition, but this has NOT been independently confirmed state-by-state and should be verified before real payroll for any given state. This engine does not track state reciprocity, multi-state employee wage-base credit transfers (crediting SUI already paid to a prior employer or a different state in the same year), new-employer vs. experience-rated status, or voluntary contribution elections — all remain the caller\'s responsibility. (New Jersey\'s EMPLOYEE-side UI/Workforce Development contribution, which does have a flat statutory rate, IS calculated separately — see nj_ui_wf_swf below — and is unaffected by this SUI feature.)',
    'California Employment Training Tax (ETT) is not calculated.',
    'New Jersey: only NJ-W4 Rate Tables A and B are implemented (the two most common cases — see the file for which NJ-W4 filing-status boxes map to each). Rate Tables C, D, and E, which an employee may elect via the NJ-W4 wage chart in dual-income or multi-job households, are not implemented and are rejected if requested.',
    'New Jersey: the Newark payroll tax (an employer-paid 1% tax on total payroll for businesses with 50+ employees working in Newark) is NOT calculated — directly relevant to this pack\'s ~50-employee target segment if any client has a Newark work location, and flagged here rather than silently ignored.',
    'New Jersey: the NJ/PA reciprocal agreement (no NJ withholding for PA-resident employees who file Form NJ-165) is not modeled; all NJ employees are withheld as NJ-taxable.',
    'New Jersey: pretax_401k_deferral and pretax_section125_deduction are NOT applied to NJ state income tax, UI/WF/SWF, TDI, or FLI wages — NJ employees with either pretax field non-zero are rejected rather than silently taxed on the wrong base, since NJ\'s treatment of these wage bases was not independently verified this pass (unlike the federal/CA treatment, which was).',
    'New York: pretax_401k_deferral and pretax_section125_deduction are also NOT applied to NY State, NYC, or Yonkers wages for the same reason — NY employees with either pretax field non-zero are rejected rather than silently taxed on the wrong wage base.',
    'New York: the "Method III Top Income Tax Rates" schedule (for very high net wages — roughly above the $20k-$41k per-period range where each exact-calculation table in this file stops, i.e. very high six-figure and up annual pay) is NOT implemented. Employees whose net wages exceed the top bracket of the tables here are rejected rather than approximated — a non-issue for this pack\'s small-business target segment, but rejected explicitly rather than silently mis-taxed.',
    'New York PFL (v6): calculated for every NY employee at 0.432% of gross wages, capped by a cumulative ANNUAL DOLLAR amount ($411.91 for 2026) via a new capTax primitive — distinct from every other capped tax in this file, which caps the taxable WAGE base (ceilingContribution) rather than the computed tax itself. Callers must track and pass ytd_ny_pfl_tax_before (a YTD TAX total, not a YTD wage total) for this one to cap correctly.',
    'New York DBL (v6): calculated only when the caller sets ny_dbl_opt_in (employer elects to deduct it) AND pay_frequency is WEEKLY — DBL\'s statutory cap is $0.60 PER CALENDAR WEEK, which has no clean equivalent for biweekly/semimonthly/monthly pay (is a semimonthly period ~2.17 weeks? ~2 weeks? the source doesn\'t say), so non-weekly employees with ny_dbl_opt_in set are rejected rather than guessed at.',
    'New York: the Metropolitan Commuter Transportation Mobility Tax (MCTMT) — an EMPLOYER-paid payroll tax in the MTA region (NYC + surrounding counties) — is NOT calculated. It is an employer-side tax, not an employee withholding, so it has no effect on any figure this engine reports to employees, but it is a real employer payroll-tax liability this engine does not compute.',
    'New York: NYC residency and Yonkers residency/workplace are each opt-in per employee via ny_nyc_resident, ny_yonkers_resident, and ny_yonkers_nonresident_workplace. This engine has no way to independently verify an employee\'s actual home or work address — getting these flags wrong for an employee produces a wrong result, not a rejected one, so the caller is responsible for setting them correctly.',
    'New York: the Yonkers RESIDENT surcharge is computed as 16.75% of the NY State tax amount on the same net wages, per the official NYS-50-T-Y method — its published bracket tables are numerically identical to the NY State ones, so this is the documented method, not an approximation.',
    'Only two pre-tax deduction categories are modeled for CA: traditional 401(k)/403(b) deferrals (excluded from federal/CA income tax wages only, still FICA/FUTA-taxable) and Section 125 cafeteria-plan deductions (excluded from income tax wages, FICA wages, FUTA wages, and CA SDI wages). Roth deferrals, HSA contributions, and IRS annual contribution-limit enforcement are not modeled — the caller must not pass amounts exceeding the employee\'s actual limit.',
    'Supplemental-wage flat-rate withholding (v22 UPDATE — see the dedicated v22 limitations entry above for the full current picture): federal 22% and 8 states\' own flat rates ARE now implemented via wage_type: \'SUPPLEMENTAL\'. NJ\'s own supplemental-wage COMBINING rule (a different mechanism — NJ requires supplemental wages to be combined with the most recent regular payment and the whole amount run through NJ\'s regular rate tables, rather than a flat supplemental rate) is still NOT implemented; NJ employees always run through this engine\'s regular method regardless of wage_type.',
    'Figures are 2026 values sourced via AI web research (not a professional review) as of September 2026 and must still be verified against the official IRS Pub 15-T, EDD Method B, and NJ-WT publications before this pack is marked VERIFIED_BASIC_RULES.',
    'The FUTA net rate (including the California credit reduction) is finalized by the Department of Labor late in the calendar year; the 1.8% California figure used here is the best available 2026 estimate at the time of writing and must be reconfirmed once the year is final. New Jersey is not currently a FUTA credit-reduction state and uses the standard 0.6% net rate.',
    'This engine prepares payroll and accounting outputs only. It does not submit tax filings (e.g. Form 940/941/DE 9, NJ-927) and does not initiate payments.'
  ]
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requireIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    const error = new Error(`${field} must be YYYY-MM-DD`);
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
}

function requireNonNegativeMoney(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${field} must be a non-negative number`);
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return money(number);
}

function sum(values: number[]) {
  return money(values.reduce((total, value) => total + value, 0));
}

function ceilingContribution(ytdBefore: number, amount: number, ceilingAnnual: number, rate: number) {
  const remainingRoom = Math.max(0, ceilingAnnual - ytdBefore);
  const contributable = Math.min(amount, remainingRoom);
  return money(contributable * rate);
}

// Caps the computed TAX amount itself against a cumulative annual dollar
// cap (e.g. NY Paid Family Leave), as distinct from ceilingContribution
// above which caps the taxable WAGE base before applying a rate. The two
// are not interchangeable — a dollar-capped tax like NY PFL has no simple
// equivalent wage-base cap because the published cap is a flat dollar
// figure the state sets independently each year, not (rate × some base).
function capTax(rawTax: number, ytdTaxBefore: number, annualCap: number) {
  const roomLeft = Math.max(0, annualCap - ytdTaxBefore);
  return money(Math.min(Math.max(rawTax, 0), roomLeft));
}

function bracketLookup(annualAmount: number, brackets: Array<[number, number, number]>) {
  let row = brackets[0];
  for (const candidate of brackets) {
    if (annualAmount >= candidate[0]) row = candidate;
    else break;
  }
  const [atLeast, base, rate] = row;
  return money(base + (annualAmount - atLeast) * rate);
}

// Step (non-marginal) lookup: returns the VALUE of the last row whose
// threshold the amount has reached or passed — used for Oregon's federal-
// tax-subtraction phase-out schedule, which is a flat override amount per
// wage tier, not a per-dollar marginal rate.
function stepLookup(amount: number, rows: Array<[number, number]>) {
  let value = rows[0][1];
  for (const [atLeast, rowValue] of rows) {
    if (amount >= atLeast) value = rowValue;
    else break;
  }
  return value;
}

export function calculateUsPayroll(input: UsPayrollRunInput): UsPayrollRunResult {
  requireIsoDate(input.pay_period_start, 'pay_period_start');
  requireIsoDate(input.pay_period_end, 'pay_period_end');
  requireIsoDate(input.pay_date, 'pay_date');
  if (input.pay_period_start > input.pay_period_end) {
    const error = new Error('pay_period_start must not be after pay_period_end');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  if (!Array.isArray(input.employees) || input.employees.length === 0) {
    const error = new Error('at least one employee is required');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const p = PAYROLL_RULE_PACK_US;
  const seen = new Set<string>();

  const employees: UsEmployeeResult[] = input.employees.map(employee => {
    const employeeId = String(employee.employee_id || '').trim();
    if (!employeeId) {
      const error = new Error('employee_id is required');
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (seen.has(employeeId)) {
      const error = new Error(`duplicate employee_id: ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    seen.add(employeeId);

    const grossPay = requireNonNegativeMoney(employee.gross_pay, `gross_pay for ${employeeId}`);
    const pretax401k = requireNonNegativeMoney(employee.pretax_401k_deferral ?? 0, `pretax_401k_deferral for ${employeeId}`);
    const pretaxSection125 = requireNonNegativeMoney(employee.pretax_section125_deduction ?? 0, `pretax_section125_deduction for ${employeeId}`);
    if (money(pretax401k + pretaxSection125) > grossPay) {
      const error = new Error(`pretax_401k_deferral + pretax_section125_deduction cannot exceed gross_pay for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    // Traditional 401(k)/403(b) deferrals reduce income-tax wages only.
    // Section 125 cafeteria-plan deductions reduce income-tax wages AND
    // FICA/FUTA/SDI wages. See the v2 change log at the top of this file.
    const federalTaxableWages = Math.max(0, money(grossPay - pretax401k - pretaxSection125));
    const ficaAndFutaWages = Math.max(0, money(grossPay - pretaxSection125));
    const ytdSsBefore = requireNonNegativeMoney(employee.ytd_ss_wages_before, `ytd_ss_wages_before for ${employeeId}`);
    const ytdMedicareBefore = requireNonNegativeMoney(employee.ytd_medicare_wages_before, `ytd_medicare_wages_before for ${employeeId}`);
    const ytdFutaBefore = requireNonNegativeMoney(employee.ytd_futa_wages_before, `ytd_futa_wages_before for ${employeeId}`);
    const suiRateProvided = employee.sui_rate !== undefined;
    const suiWageBaseProvided = employee.sui_wage_base !== undefined;
    if (suiRateProvided !== suiWageBaseProvided) {
      const error = new Error(`${employeeId}: sui_rate and sui_wage_base must both be supplied together, or both omitted`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (suiRateProvided && ((employee.sui_rate as number) < 0 || (employee.sui_rate as number) > 1)) {
      const error = new Error(`sui_rate for ${employeeId} must be between 0 and 1 (a fraction, e.g. 0.034 for 3.4%)`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const suiWageBase = suiWageBaseProvided ? requireNonNegativeMoney(employee.sui_wage_base, `sui_wage_base for ${employeeId}`) : 0;
    const ytdSuiBefore = requireNonNegativeMoney(employee.ytd_sui_wages_before ?? 0, `ytd_sui_wages_before for ${employeeId}`);

    if (!['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY'].includes(employee.pay_frequency)) {
      const error = new Error(`pay_frequency for ${employeeId} must be WEEKLY, BIWEEKLY, SEMIMONTHLY, or MONTHLY`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (!['SINGLE_MFS', 'MFJ', 'HOH'].includes(employee.federal_filing_status)) {
      const error = new Error(`federal_filing_status for ${employeeId} must be SINGLE_MFS, MFJ, or HOH`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (typeof employee.federal_step2_checkbox !== 'boolean') {
      const error = new Error(`federal_step2_checkbox must be true or false for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.federal_w4_exempt !== undefined && typeof employee.federal_w4_exempt !== 'boolean') {
      const error = new Error(`federal_w4_exempt for ${employeeId} must be true or false if supplied`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.wage_type !== undefined && employee.wage_type !== 'REGULAR' && employee.wage_type !== 'SUPPLEMENTAL') {
      const error = new Error(`wage_type for ${employeeId} must be 'REGULAR' or 'SUPPLEMENTAL' if supplied`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const supportedStates: UsState[] = ['CA', 'NJ', 'NY', 'IL', 'PA', 'MI', 'CO', 'AZ', 'AK', 'WA', 'OR', 'IN', 'NC', 'GA', 'KY', 'MS', 'UT', 'MN', 'MT', 'ND', 'OK', 'RI', 'VA', 'MA', 'MO', 'NE', 'SC', 'VT', 'WV', 'KS', 'ID', 'NM', 'AR', 'HI', 'OH', 'LA', 'IA', 'AL', 'MD', 'CT', 'DE', 'DC', 'WI', 'ME', ...p.no_tax_no_employee_levy_states];
    if (!supportedStates.includes(employee.state)) {
      const error = new Error(`state for ${employeeId} is not supported — only ${supportedStates.join(', ')} are implemented in this rule pack`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    // States with a sourced flat supplemental-wage rate (see limitations
    // for the two SECONDARY-SOURCED-ONLY ones, MT and RI). Any other
    // state with its own income tax REJECTS wage_type: 'SUPPLEMENTAL'
    // rather than silently falling back to the regular annualized method
    // (which would not reflect that state's real supplemental treatment)
    // — the same fail-closed pattern as CT withholding codes B/C/F.
    const statesWithSupplementalRate: UsState[] = ['AR', 'MN', 'MO', 'MT', 'ND', 'NE', 'RI', 'WI', 'ME'];
    if (
      employee.wage_type === 'SUPPLEMENTAL' &&
      !statesWithSupplementalRate.includes(employee.state) &&
      !p.no_tax_no_employee_levy_states.includes(employee.state)
    ) {
      const error = new Error(`wage_type: 'SUPPLEMENTAL' for ${employeeId} is not implemented for state ${employee.state} — only ${statesWithSupplementalRate.join(', ')} have a sourced state supplemental rate in this rule pack (federal supplemental withholding still applies); see limitations`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    let caEstimatedDeductionAllowances = 0;
    if (employee.state === 'CA') {
      if (!['SINGLE', 'MARRIED_0_OR_1', 'MARRIED_2_OR_MORE', 'HEAD_OF_HOUSEHOLD'].includes(employee.ca_filing_status as string)) {
        const error = new Error(`ca_filing_status for ${employeeId} must be SINGLE, MARRIED_0_OR_1, MARRIED_2_OR_MORE, or HEAD_OF_HOUSEHOLD`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ca_regular_allowances) || (employee.ca_regular_allowances as number) < 0) {
        const error = new Error(`ca_regular_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      caEstimatedDeductionAllowances = employee.ca_estimated_deduction_allowances ?? 0;
      if (!Number.isInteger(caEstimatedDeductionAllowances) || caEstimatedDeductionAllowances < 0) {
        const error = new Error(`ca_estimated_deduction_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'NJ') {
      if (pretax401k > 0 || pretaxSection125 > 0) {
        const error = new Error(`pretax_401k_deferral and pretax_section125_deduction are not supported for NJ employees (${employeeId}) in this rule pack — see limitations`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (employee.nj_rate_table !== 'A' && employee.nj_rate_table !== 'B') {
        const error = new Error(`nj_rate_table for ${employeeId} must be 'A' or 'B' (Rate Tables C, D, E are not implemented)`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.nj_allowances) || (employee.nj_allowances as number) < 0) {
        const error = new Error(`nj_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'NY') {
      if (pretax401k > 0 || pretaxSection125 > 0) {
        const error = new Error(`pretax_401k_deferral and pretax_section125_deduction are not supported for NY employees (${employeeId}) in this rule pack — see limitations`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (employee.ny_filing_status !== 'SINGLE' && employee.ny_filing_status !== 'MARRIED') {
        const error = new Error(`ny_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ny_allowances) || (employee.ny_allowances as number) < 0) {
        const error = new Error(`ny_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.ny_yonkers_resident && employee.ny_yonkers_nonresident_workplace) {
        const error = new Error(`ny_yonkers_resident and ny_yonkers_nonresident_workplace cannot both be true for ${employeeId}`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.ny_dbl_opt_in && employee.pay_frequency !== 'WEEKLY') {
        const error = new Error(`ny_dbl_opt_in for ${employeeId} is only supported for WEEKLY pay frequency — NY DBL's statutory cap is per calendar week and has no clean equivalent for other pay frequencies`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
    }
    if (employee.state === 'IL') {
      if (!Number.isInteger(employee.il_line1_allowances) || (employee.il_line1_allowances as number) < 0) {
        const error = new Error(`il_line1_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.il_line2_allowances) || (employee.il_line2_allowances as number) < 0) {
        const error = new Error(`il_line2_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'PA' && employee.pa_philadelphia_resident && employee.pa_philadelphia_nonresident_workplace) {
      const error = new Error(`pa_philadelphia_resident and pa_philadelphia_nonresident_workplace cannot both be true for ${employeeId}`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'MI') {
      if (!Number.isInteger(employee.mi_personal_exemptions) || (employee.mi_personal_exemptions as number) < 0) {
        const error = new Error(`mi_personal_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'CO') {
      if (employee.co_filing_status !== 'MFJ_OR_QSS' && employee.co_filing_status !== 'OTHER') {
        const error = new Error(`co_filing_status for ${employeeId} must be 'MFJ_OR_QSS' or 'OTHER'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.co_denver_employee && employee.pay_frequency !== 'MONTHLY') {
        const error = new Error(`co_denver_employee for ${employeeId} is only supported for MONTHLY pay frequency — Denver OPT's $500 earnings test is a calendar-month test this engine can't reliably apply to other pay frequencies without YTD-style monthly aggregation it doesn't track`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
    }
    if (employee.state === 'AZ') {
      if (!p.arizona.valid_election_percents.includes(employee.az_election_percent as number)) {
        const error = new Error(`az_election_percent for ${employeeId} must be one of ${p.arizona.valid_election_percents.join(', ')}`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'OR') {
      if (employee.or_filing_status !== 'SINGLE' && employee.or_filing_status !== 'MARRIED') {
        const error = new Error(`or_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.or_allowances) || (employee.or_allowances as number) < 0) {
        const error = new Error(`or_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'IN') {
      if (!Number.isInteger(employee.in_personal_exemptions) || (employee.in_personal_exemptions as number) < 0) {
        const error = new Error(`in_personal_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.in_dependent_exemptions) || (employee.in_dependent_exemptions as number) < 0) {
        const error = new Error(`in_dependent_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      const adoptedChild = employee.in_adopted_child_exemptions ?? 0;
      if (!Number.isInteger(adoptedChild) || adoptedChild < 0) {
        const error = new Error(`in_adopted_child_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!employee.in_county || !(employee.in_county in p.indiana.county_tax_rates)) {
        const error = new Error(`in_county for ${employeeId} must be one of the 92 Indiana county names in this rule pack (Indiana county tax is mandatory and is not skipped by this engine)`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'NC') {
      if (employee.nc_filing_status !== 'SINGLE_MARRIED_OR_SURVIVING_SPOUSE' && employee.nc_filing_status !== 'HEAD_OF_HOUSEHOLD') {
        const error = new Error(`nc_filing_status for ${employeeId} must be 'SINGLE_MARRIED_OR_SURVIVING_SPOUSE' or 'HEAD_OF_HOUSEHOLD'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.nc_allowances) || (employee.nc_allowances as number) < 0) {
        const error = new Error(`nc_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'GA') {
      if (!['SINGLE_OR_HOH', 'MFS_OR_MFJ_BOTH_WORKING', 'MFJ_ONE_WORKING'].includes(employee.ga_filing_status as string)) {
        const error = new Error(`ga_filing_status for ${employeeId} must be 'SINGLE_OR_HOH', 'MFS_OR_MFJ_BOTH_WORKING', or 'MFJ_ONE_WORKING'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ga_dependents) || (employee.ga_dependents as number) < 0) {
        const error = new Error(`ga_dependents for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'MS') {
      if (!['SINGLE', 'HEAD_OF_HOUSEHOLD', 'MARRIED'].includes(employee.ms_filing_status as string)) {
        const error = new Error(`ms_filing_status for ${employeeId} must be 'SINGLE', 'HEAD_OF_HOUSEHOLD', or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ms_dependents) || (employee.ms_dependents as number) < 0) {
        const error = new Error(`ms_dependents for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'UT' && employee.ut_filing_status !== 'SINGLE' && employee.ut_filing_status !== 'MARRIED') {
      const error = new Error(`ut_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'MN') {
      if (employee.mn_filing_status !== 'SINGLE' && employee.mn_filing_status !== 'MARRIED') {
        const error = new Error(`mn_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.mn_allowances) || (employee.mn_allowances as number) < 0) {
        const error = new Error(`mn_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'MT' && !['SINGLE_OR_MFS_OR_BOTH_WORKING', 'MARRIED_FILING_JOINTLY', 'HEAD_OF_HOUSEHOLD'].includes(employee.mt_filing_status as string)) {
      const error = new Error(`mt_filing_status for ${employeeId} must be 'SINGLE_OR_MFS_OR_BOTH_WORKING', 'MARRIED_FILING_JOINTLY', or 'HEAD_OF_HOUSEHOLD'`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'ND') {
      if (!['SINGLE_OR_MFS', 'MARRIED_FILING_JOINTLY', 'HEAD_OF_HOUSEHOLD'].includes(employee.nd_filing_status as string)) {
        const error = new Error(`nd_filing_status for ${employeeId} must be 'SINGLE_OR_MFS', 'MARRIED_FILING_JOINTLY', or 'HEAD_OF_HOUSEHOLD'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.nd_exemptions) || (employee.nd_exemptions as number) < 0) {
        const error = new Error(`nd_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'OK') {
      if (employee.ok_filing_status !== 'SINGLE_OR_HOH' && employee.ok_filing_status !== 'MARRIED') {
        const error = new Error(`ok_filing_status for ${employeeId} must be 'SINGLE_OR_HOH' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ok_exemptions) || (employee.ok_exemptions as number) < 0) {
        const error = new Error(`ok_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'VA' && (!Number.isInteger(employee.va_exemptions) || (employee.va_exemptions as number) < 0)) {
      const error = new Error(`va_exemptions for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'MA' && (!Number.isInteger(employee.ma_exemptions) || (employee.ma_exemptions as number) < 0)) {
      const error = new Error(`ma_exemptions for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'MO' && !['SINGLE_OR_MFS_OR_MARRIED_SPOUSE_WORKS', 'MARRIED_SPOUSE_NOT_WORK', 'HEAD_OF_HOUSEHOLD'].includes(employee.mo_filing_status as string)) {
      const error = new Error(`mo_filing_status for ${employeeId} must be 'SINGLE_OR_MFS_OR_MARRIED_SPOUSE_WORKS', 'MARRIED_SPOUSE_NOT_WORK', or 'HEAD_OF_HOUSEHOLD'`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'NE') {
      if (employee.ne_filing_status !== 'SINGLE_OR_HOH' && employee.ne_filing_status !== 'MARRIED') {
        const error = new Error(`ne_filing_status for ${employeeId} must be 'SINGLE_OR_HOH' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ne_allowances) || (employee.ne_allowances as number) < 0) {
        const error = new Error(`ne_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'SC' && (!Number.isInteger(employee.sc_allowances) || (employee.sc_allowances as number) < 0)) {
      const error = new Error(`sc_allowances for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'VT') {
      if (employee.vt_filing_status !== 'SINGLE_OR_HOH' && employee.vt_filing_status !== 'MARRIED') {
        const error = new Error(`vt_filing_status for ${employeeId} must be 'SINGLE_OR_HOH' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.vt_allowances) || (employee.vt_allowances as number) < 0) {
        const error = new Error(`vt_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'WV') {
      if (employee.wv_filing_status !== 'ONE_EARNER_ONE_JOB' && employee.wv_filing_status !== 'TWO_EARNER_OR_MULTIPLE_JOBS') {
        const error = new Error(`wv_filing_status for ${employeeId} must be 'ONE_EARNER_ONE_JOB' or 'TWO_EARNER_OR_MULTIPLE_JOBS'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.wv_exemptions) || (employee.wv_exemptions as number) < 0) {
        const error = new Error(`wv_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'KS') {
      if (employee.ks_filing_status !== 'SINGLE_OR_HOH' && employee.ks_filing_status !== 'MARRIED') {
        const error = new Error(`ks_filing_status for ${employeeId} must be 'SINGLE_OR_HOH' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.ks_exemptions) || (employee.ks_exemptions as number) < 0) {
        const error = new Error(`ks_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'ID') {
      if (employee.id_filing_status !== 'SINGLE' && employee.id_filing_status !== 'MARRIED') {
        const error = new Error(`id_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.id_exemptions) || (employee.id_exemptions as number) < 0) {
        const error = new Error(`id_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'NM' && !['SINGLE', 'MARRIED', 'HEAD_OF_HOUSEHOLD'].includes(employee.nm_filing_status as string)) {
      const error = new Error(`nm_filing_status for ${employeeId} must be 'SINGLE', 'MARRIED', or 'HEAD_OF_HOUSEHOLD'`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'AR' && (!Number.isInteger(employee.ar_exemptions) || (employee.ar_exemptions as number) < 0)) {
      const error = new Error(`ar_exemptions for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'HI') {
      if (employee.hi_filing_status !== 'SINGLE_OR_HOH' && employee.hi_filing_status !== 'MARRIED') {
        const error = new Error(`hi_filing_status for ${employeeId} must be 'SINGLE_OR_HOH' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.hi_exemptions) || (employee.hi_exemptions as number) < 0) {
        const error = new Error(`hi_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'OH' && (!Number.isInteger(employee.oh_exemptions) || (employee.oh_exemptions as number) < 0)) {
      const error = new Error(`oh_exemptions for ${employeeId} must be a non-negative integer`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'LA' && employee.la_filing_status !== 'SINGLE_OR_MFS' && employee.la_filing_status !== 'MARRIED_OR_HOH') {
      const error = new Error(`la_filing_status for ${employeeId} must be 'SINGLE_OR_MFS' or 'MARRIED_OR_HOH'`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'IA') {
      if (!['OTHER_OR_MFJ_SPOUSE_WORKS', 'HEAD_OF_HOUSEHOLD', 'MFJ_SPOUSE_NO_EARNED_INCOME'].includes(employee.ia_marital_status as string)) {
        const error = new Error(`ia_marital_status for ${employeeId} must be 'OTHER_OR_MFJ_SPOUSE_WORKS', 'HEAD_OF_HOUSEHOLD', or 'MFJ_SPOUSE_NO_EARNED_INCOME'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.ia_allowance_amount !== undefined && (typeof employee.ia_allowance_amount !== 'number' || employee.ia_allowance_amount < 0)) {
        const error = new Error(`ia_allowance_amount for ${employeeId} must be a non-negative number if provided`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'AL') {
      if (!['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_FAMILY'].includes(employee.al_filing_status as string)) {
        const error = new Error(`al_filing_status for ${employeeId} must be 'SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', or 'HEAD_OF_FAMILY'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.al_dependents) || (employee.al_dependents as number) < 0) {
        const error = new Error(`al_dependents for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'MD') {
      if (employee.md_filing_status !== 'SINGLE' && employee.md_filing_status !== 'MARRIED') {
        const error = new Error(`md_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.md_exemptions) || (employee.md_exemptions as number) < 0) {
        const error = new Error(`md_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      const knownCounty = employee.md_county !== undefined && (
        employee.md_county in p.maryland.county_flat_rates || employee.md_county in p.maryland.county_graduated_brackets
      );
      if (!knownCounty) {
        const error = new Error(`md_county for ${employeeId} must be one of Maryland's 23 counties or Baltimore City in this rule pack (Maryland county tax is mandatory and is not skipped by this engine)`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'CT' && employee.ct_withholding_code !== 'A_OR_D') {
      const error = new Error(`ct_withholding_code for ${employeeId} must be 'A_OR_D' — withholding codes B, C, and F are not implemented in this rule pack (their base bracket and/or phase-out/recapture tables were not captured)`);
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    if (employee.state === 'DE') {
      if (employee.de_filing_status !== 'SINGLE_OR_MFS' && employee.de_filing_status !== 'MARRIED_FILING_JOINTLY') {
        const error = new Error(`de_filing_status for ${employeeId} must be 'SINGLE_OR_MFS' or 'MARRIED_FILING_JOINTLY'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.de_exemptions) || (employee.de_exemptions as number) < 0) {
        const error = new Error(`de_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'DC') {
      if (!['S', 'M', 'N', 'H'].includes(employee.dc_filing_status as string)) {
        const error = new Error(`dc_filing_status for ${employeeId} must be 'S', 'M', 'N', or 'H'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.dc_dependents) || (employee.dc_dependents as number) < 0) {
        const error = new Error(`dc_dependents for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (employee.dc_d4_exempt !== undefined && typeof employee.dc_d4_exempt !== 'boolean') {
        const error = new Error(`dc_d4_exempt for ${employeeId} must be true or false if supplied`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'ME') {
      if (employee.me_filing_status !== 'SINGLE_OR_HOH' && employee.me_filing_status !== 'MARRIED') {
        const error = new Error(`me_filing_status for ${employeeId} must be 'SINGLE_OR_HOH' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.me_allowances) || (employee.me_allowances as number) < 0) {
        const error = new Error(`me_allowances for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }
    if (employee.state === 'VT' && employee.vt_ccc_employer_withholds_employee_share !== undefined && typeof employee.vt_ccc_employer_withholds_employee_share !== 'boolean') {
      const error = new Error(`vt_ccc_employer_withholds_employee_share for ${employeeId} must be true or false if supplied`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    if (employee.state === 'WI') {
      if (employee.wi_filing_status !== 'SINGLE' && employee.wi_filing_status !== 'MARRIED') {
        const error = new Error(`wi_filing_status for ${employeeId} must be 'SINGLE' or 'MARRIED'`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
      if (!Number.isInteger(employee.wi_exemptions) || (employee.wi_exemptions as number) < 0) {
        const error = new Error(`wi_exemptions for ${employeeId} must be a non-negative integer`);
        (error as Error & { status?: number }).status = 400;
        throw error;
      }
    }

    const periodsPerYear = p.federal_income_tax.periods_per_year[employee.pay_frequency];

    // --- FICA (on ficaAndFutaWages: gross minus Section 125 only — 401(k) stays FICA-taxable) ---
    const employeeSocialSecurity = ceilingContribution(ytdSsBefore, ficaAndFutaWages, p.fica.social_security_wage_base_annual, p.fica.social_security_rate);
    const employerSocialSecurity = employeeSocialSecurity; // same ceiling, same rate, employer matches
    const employeeMedicare = money(ficaAndFutaWages * p.fica.medicare_rate);
    const employerMedicare = employeeMedicare;
    const medicareYtdAfter = money(ytdMedicareBefore + ficaAndFutaWages);
    const additionalMedicareWagesThisPeriod = Math.max(0, medicareYtdAfter - Math.max(p.fica.additional_medicare_threshold_annual, ytdMedicareBefore));
    const employeeAdditionalMedicare = money(additionalMedicareWagesThisPeriod * p.fica.additional_medicare_rate);

    // --- FUTA (employer only, same wage base as FICA) ---
    const futaNetRate = p.futa.net_rate_by_state[employee.state] ?? p.futa.net_rate_default;
    const employerFuta = ceilingContribution(ytdFutaBefore, ficaAndFutaWages, p.futa.wage_base_annual, futaNetRate);

    // --- SUI (State Unemployment Insurance, employer only — see the v19
    // change log above). Only computed when the caller supplied both
    // sui_rate and sui_wage_base; otherwise 0, same as before v19. Uses
    // the same taxable-wage definition as FUTA (gross minus Section 125
    // only) — a reasonable default since most states follow FUTA's own
    // wage definition, but not independently confirmed state-by-state,
    // so flagged in limitations rather than presented as verified.
    const employerSui = suiRateProvided
      ? ceilingContribution(ytdSuiBefore, ficaAndFutaWages, suiWageBase, employee.sui_rate as number)
      : 0;

    // --- Federal income tax withholding (Worksheet 1A, annualized percentage method) ---
    const wageType: UsWageType = employee.wage_type ?? 'REGULAR';
    let federalIncomeTax: number;
    if (employee.federal_w4_exempt) {
      // IRS Form W-4 "Exemption from Withholding" claim — see limitations
      // for the caveat that this engine does not track the claim's
      // annual expiry.
      federalIncomeTax = 0;
    } else if (wageType === 'SUPPLEMENTAL') {
      // IRS Pub 15-T (2026) Section 1 optional flat-rate method: 22% of
      // the supplemental wage payment. No annualizing, no brackets, no
      // Step 2/3/4 adjustments — those only apply to the regular-wage
      // method. See limitations for the 37%-above-$1M-cumulative tier,
      // not implemented (no YTD supplemental-wage tracker).
      federalIncomeTax = money(federalTaxableWages * p.federal_supplemental.flat_rate);
    } else {
      const step3AnnualCredits = employee.federal_step3_annual_credits ?? 0;
      const step4aAnnualOtherIncome = employee.federal_step4a_annual_other_income ?? 0;
      const step4bAnnualDeductions = employee.federal_step4b_annual_deductions ?? 0;
      const step4cExtraPerPeriod = employee.federal_step4c_extra_per_period ?? 0;

      const annualizedWage = money(federalTaxableWages * periodsPerYear);
      const adjustedAnnualWageBeforeStandardDeduction = money(annualizedWage + step4aAnnualOtherIncome);
      const step2NotCheckedDeduction = employee.federal_step2_checkbox
        ? 0
        : employee.federal_filing_status === 'MFJ'
          ? p.federal_income_tax.step2_not_checked_deduction_mfj
          : p.federal_income_tax.step2_not_checked_deduction_other;
      const totalReduction = money(step4bAnnualDeductions + step2NotCheckedDeduction);
      const adjustedAnnualWageAmount = Math.max(0, money(adjustedAnnualWageBeforeStandardDeduction - totalReduction));

      const brackets = employee.federal_step2_checkbox
        ? p.federal_income_tax.step2Checkbox[employee.federal_filing_status]
        : p.federal_income_tax.standard[employee.federal_filing_status];
      const tentativeAnnualTax = bracketLookup(adjustedAnnualWageAmount, brackets);
      const tentativeWithholdingThisPeriod = money(tentativeAnnualTax / periodsPerYear);
      const creditsThisPeriod = money(step3AnnualCredits / periodsPerYear);
      const afterCredits = Math.max(0, money(tentativeWithholdingThisPeriod - creditsThisPeriod));
      federalIncomeTax = money(afterCredits + step4cExtraPerPeriod);
    }

    // --- California state income tax withholding (Method B, exact calculation) ---
    let caIncomeTax = 0;
    let caSdi = 0;
    if (employee.state === 'CA') {
      const caFilingStatus = employee.ca_filing_status as UsCaFilingStatus;
      const lowIncomeExemption = p.california.low_income_exemption[employee.pay_frequency][caFilingStatus];
      if (federalTaxableWages > lowIncomeExemption) {
        const estimatedDeduction = money(caEstimatedDeductionAllowances * p.california.estimated_deduction_per_allowance[employee.pay_frequency]);
        const wagesSubjectToWithholding = Math.max(0, money(federalTaxableWages - estimatedDeduction));
        const standardDeduction = p.california.standard_deduction[employee.pay_frequency][caFilingStatus];
        const caTaxableIncome = Math.max(0, money(wagesSubjectToWithholding - standardDeduction));
        const rateTableKey: 'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD' =
          caFilingStatus === 'HEAD_OF_HOUSEHOLD' ? 'HEAD_OF_HOUSEHOLD' : caFilingStatus === 'SINGLE' ? 'SINGLE' : 'MARRIED';
        const computedTax = bracketLookup(caTaxableIncome, p.california.rate_tables[employee.pay_frequency][rateTableKey]);
        const exemptionCredit = money((employee.ca_regular_allowances as number) * p.california.exemption_allowance_credit_per_allowance[employee.pay_frequency]);
        caIncomeTax = Math.max(0, money(computedTax - exemptionCredit));
      }
      // California SDI (employee only, uncapped, same wage base as FICA).
      caSdi = money(ficaAndFutaWages * p.california.sdi_rate);
    }

    // --- New Jersey state income tax withholding (NJ-WT percentage method, Rate Table A or B) ---
    const ytdNjUiWfBefore = requireNonNegativeMoney(employee.ytd_nj_ui_wf_wages_before ?? 0, `ytd_nj_ui_wf_wages_before for ${employeeId}`);
    const ytdNjTdiFliBefore = requireNonNegativeMoney(employee.ytd_nj_tdi_fli_wages_before ?? 0, `ytd_nj_tdi_fli_wages_before for ${employeeId}`);
    let njIncomeTax = 0;
    let njUiWfSwf = 0;
    let njTdi = 0;
    let njFli = 0;
    if (employee.state === 'NJ') {
      const njTable = employee.nj_rate_table as NjRateTable;
      const allowanceValue = money((employee.nj_allowances as number) * p.new_jersey.allowance_value_per_period[employee.pay_frequency]);
      const njWagesSubjectToWithholding = Math.max(0, money(grossPay - allowanceValue));
      njIncomeTax = bracketLookup(njWagesSubjectToWithholding, p.new_jersey.rate_tables[employee.pay_frequency][njTable]);
      njUiWfSwf = ceilingContribution(ytdNjUiWfBefore, grossPay, p.new_jersey.ui_wf_swf_wage_base_annual, p.new_jersey.ui_wf_swf_rate);
      njTdi = ceilingContribution(ytdNjTdiFliBefore, grossPay, p.new_jersey.tdi_fli_wage_base_annual, p.new_jersey.tdi_rate);
      njFli = ceilingContribution(ytdNjTdiFliBefore, grossPay, p.new_jersey.tdi_fli_wage_base_annual, p.new_jersey.fli_rate);
    }

    // --- New York State income tax, NYC resident tax, Yonkers resident surcharge / nonresident earnings tax, PFL, DBL ---
    const ytdNyPflTaxBefore = requireNonNegativeMoney(employee.ytd_ny_pfl_tax_before ?? 0, `ytd_ny_pfl_tax_before for ${employeeId}`);
    let nyIncomeTax = 0;
    let nycIncomeTax = 0;
    let yonkersTax = 0;
    let nyPfl = 0;
    let nyDbl = 0;
    if (employee.state === 'NY') {
      const nyFilingStatus = employee.ny_filing_status as NyFilingStatus;
      const deductionTable = nyFilingStatus === 'MARRIED' ? p.new_york.deduction_per_period_married : p.new_york.deduction_per_period;
      const deduction = deductionTable[employee.pay_frequency];
      const exemption = money((employee.ny_allowances as number) * p.new_york.exemption_per_allowance[employee.pay_frequency]);
      const netWages = Math.max(0, money(grossPay - deduction - exemption));
      const methodIiiThreshold = p.new_york.state_method_iii_threshold[employee.pay_frequency][nyFilingStatus];
      if (netWages >= methodIiiThreshold) {
        const error = new Error(`net NY wages for ${employeeId} exceed this engine's supported range (Method III Top Income Tax Rates is not implemented) — see limitations`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      const nyBrackets = p.new_york.state_rate_tables[employee.pay_frequency][nyFilingStatus];
      nyIncomeTax = bracketLookup(netWages, nyBrackets);
      if (employee.ny_nyc_resident) {
        // NYC uses its OWN (lower) deduction base — not the NY State one.
        const nycDeductionTable = nyFilingStatus === 'MARRIED' ? p.new_york.nyc_deduction_per_period_married : p.new_york.nyc_deduction_per_period;
        const nycDeduction = nycDeductionTable[employee.pay_frequency];
        const nycNetWages = Math.max(0, money(grossPay - nycDeduction - exemption));
        nycIncomeTax = bracketLookup(nycNetWages, p.new_york.nyc_rate_table[employee.pay_frequency]);
      }
      if (employee.ny_yonkers_resident) {
        yonkersTax = money(nyIncomeTax * p.new_york.yonkers_resident_surcharge_rate);
      } else if (employee.ny_yonkers_nonresident_workplace) {
        const exemptionTable = p.new_york.yonkers_nonresident_exemption_tables[employee.pay_frequency];
        let yonkersExemption = 0;
        let belowFirstThreshold = grossPay < exemptionTable[1][0];
        for (const [atLeast, exemptionAmount] of exemptionTable) {
          if (grossPay >= atLeast) yonkersExemption = exemptionAmount;
        }
        yonkersTax = belowFirstThreshold ? 0 : money(Math.max(0, grossPay - yonkersExemption) * p.new_york.yonkers_nonresident_rate);
      }
      // PFL applies to every NY employee, no opt-out, capped by cumulative
      // ANNUAL DOLLAR amount rather than by a wage base.
      nyPfl = capTax(money(grossPay * p.new_york.pfl_rate), ytdNyPflTaxBefore, p.new_york.pfl_annual_dollar_cap);
      // DBL is opt-in (employer elects to deduct) and WEEKLY-only — validated above.
      if (employee.ny_dbl_opt_in) {
        nyDbl = money(Math.min(grossPay * p.new_york.dbl_rate, p.new_york.dbl_weekly_dollar_cap));
      }
    }

    // --- Illinois: flat 4.95% after IL-W-4 Line 1/Line 2 allowances ---
    let ilIncomeTax = 0;
    if (employee.state === 'IL') {
      const allowanceAmount = money(
        ((employee.il_line1_allowances as number) * p.illinois.line1_allowance_annual +
         (employee.il_line2_allowances as number) * p.illinois.line2_allowance_annual) / periodsPerYear
      );
      const ilTaxableWages = Math.max(0, money(grossPay - allowanceAmount));
      ilIncomeTax = money(ilTaxableWages * p.illinois.rate + (employee.il_extra_per_period ?? 0));
    }

    // --- Pennsylvania: flat 3.07% state PIT + flat 0.07% employee UC, both on gross, no allowances ---
    let paIncomeTax = 0;
    let paUc = 0;
    let phlWageTax = 0;
    if (employee.state === 'PA') {
      paIncomeTax = money(grossPay * p.pennsylvania.income_tax_rate);
      paUc = money(grossPay * p.pennsylvania.employee_uc_rate);
      // Philadelphia Wage Tax — effective-dated by PAY DATE, not calendar
      // year label, per this engine's own effective-date contract.
      const onOrAfterJuly1 = input.pay_date >= p.pennsylvania.philadelphia_effective_date_2026;
      if (employee.pa_philadelphia_resident) {
        const rate = onOrAfterJuly1 ? p.pennsylvania.philadelphia_resident_rate_from : p.pennsylvania.philadelphia_resident_rate_before;
        phlWageTax = money(grossPay * rate);
      } else if (employee.pa_philadelphia_nonresident_workplace) {
        const rate = onOrAfterJuly1 ? p.pennsylvania.philadelphia_nonresident_rate_from : p.pennsylvania.philadelphia_nonresident_rate_before;
        phlWageTax = money(grossPay * rate);
      }
    }

    // --- Michigan: flat 4.25% after the annual personal exemption ---
    let miIncomeTax = 0;
    if (employee.state === 'MI') {
      const exemptionAmount = money(((employee.mi_personal_exemptions as number) * p.michigan.personal_exemption_annual) / periodsPerYear);
      const miTaxableWages = Math.max(0, money(grossPay - exemptionAmount));
      miIncomeTax = money(miTaxableWages * p.michigan.rate);
    }

    // --- Colorado: DR 1098 percentage method + FAMLI employee contribution ---
    const ytdCoFamliBefore = requireNonNegativeMoney(employee.ytd_co_famli_wages_before ?? 0, `ytd_co_famli_wages_before for ${employeeId}`);
    let coIncomeTax = 0;
    let coFamli = 0;
    if (employee.state === 'CO') {
      const coFilingStatus = employee.co_filing_status as CoFilingStatus;
      const defaultSubtraction = coFilingStatus === 'MFJ_OR_QSS' ? p.colorado.default_subtraction_mfj_or_qss : p.colorado.default_subtraction_other;
      const subtraction = employee.co_dr0004_line2_annual_override ?? defaultSubtraction;
      const annualWages = money(grossPay * periodsPerYear);
      const taxableAnnual = Math.max(0, money(annualWages - subtraction));
      const annualTax = money(taxableAnnual * p.colorado.rate);
      coIncomeTax = money(annualTax / periodsPerYear + (employee.co_dr0004_line3_extra_per_period ?? 0));
      coFamli = ceilingContribution(ytdCoFamliBefore, grossPay, p.colorado.famli_wage_base_annual, p.colorado.famli_employee_rate);
    }
    // Denver OPT (validated above as MONTHLY-only when set) — a flat
    // monthly amount once the $500 earnings threshold is met, not a rate.
    let denverOptEmployee = 0;
    let denverOptEmployer = 0;
    if (employee.state === 'CO' && employee.co_denver_employee && grossPay >= p.colorado.denver_opt_monthly_earnings_threshold) {
      denverOptEmployee = p.colorado.denver_opt_employee_monthly;
      denverOptEmployer = p.colorado.denver_opt_employer_monthly;
    }

    // --- Arizona: flat employee-elected percentage of gross wages ---
    let azIncomeTax = 0;
    if (employee.state === 'AZ') {
      azIncomeTax = money(grossPay * ((employee.az_election_percent as number) / 100));
    }

    // --- Alaska: no state income tax, but employee-paid UI at a flat statutory rate ---
    const ytdAkUiBefore = requireNonNegativeMoney(employee.ytd_ak_ui_wages_before ?? 0, `ytd_ak_ui_wages_before for ${employeeId}`);
    let akUi = 0;
    if (employee.state === 'AK') {
      akUi = ceilingContribution(ytdAkUiBefore, grossPay, p.alaska.ui_wage_base_annual, p.alaska.ui_employee_rate);
    }

    // --- Washington: no state income tax, but employee-paid PFML share + WA Cares ---
    const ytdWaPfmlBefore = requireNonNegativeMoney(employee.ytd_wa_pfml_wages_before ?? 0, `ytd_wa_pfml_wages_before for ${employeeId}`);
    let waPfml = 0;
    let waCares = 0;
    if (employee.state === 'WA') {
      const employeePfmlRate = p.washington.pfml_total_rate * p.washington.pfml_employee_share_of_total;
      waPfml = ceilingContribution(ytdWaPfmlBefore, grossPay, p.washington.pfml_wage_base_annual, employeePfmlRate);
      waCares = money(grossPay * p.washington.wa_cares_employee_rate);
    }

    // --- Oregon: percentage-method state PIT + Statewide Transit Tax + Paid Leave Oregon employee share ---
    const ytdOrPaidLeaveBefore = requireNonNegativeMoney(employee.ytd_or_paid_leave_wages_before ?? 0, `ytd_or_paid_leave_wages_before for ${employeeId}`);
    let orIncomeTax = 0;
    let orStt = 0;
    let orPaidLeaveEmployee = 0;
    if (employee.state === 'OR') {
      const orFilingStatus = employee.or_filing_status as OrFilingStatus;
      const orAllowances = employee.or_allowances as number;
      const annualWages = money(grossPay * periodsPerYear);
      const wideTrack = orFilingStatus === 'MARRIED' || orAllowances >= 3;
      const atOrOverWageTier = annualWages >= p.oregon.wage_tier_boundary_annual;
      // The federal-subtraction phase-out schedule is keyed by FILING
      // STATUS alone (per the NFC-confirmed structure), independent of the
      // bracket track above. A single filer claiming 3+ allowances who ALSO
      // crosses into the top phase-out region is a genuinely ambiguous
      // combination the sources don't resolve — rejected rather than guessed.
      if (orFilingStatus === 'SINGLE' && orAllowances >= 3 && annualWages >= p.oregon.federal_subtraction_phaseout_single[1][0]) {
        const error = new Error(`OR employee ${employeeId} is SINGLE with 3+ allowances and annual wages at or above $${p.oregon.federal_subtraction_phaseout_single[1][0]} — this engine's sources don't clearly resolve whether the single or married federal-subtraction phase-out schedule applies in this combination, so it's rejected rather than guessed`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      const annualFederalTax = money(federalIncomeTax * periodsPerYear);
      const federalSubtraction = atOrOverWageTier
        ? Math.min(annualFederalTax, stepLookup(annualWages, orFilingStatus === 'MARRIED' ? p.oregon.federal_subtraction_phaseout_married : p.oregon.federal_subtraction_phaseout_single))
        : annualFederalTax;
      const standardDeduction = wideTrack ? p.oregon.standard_deduction_wide_annual : p.oregon.standard_deduction_narrow_annual;
      const base = Math.max(0, money(annualWages - federalSubtraction - standardDeduction));
      const brackets = wideTrack
        ? (atOrOverWageTier ? p.oregon.brackets_wide_at_or_over_wage_tier : p.oregon.brackets_wide_under_wage_tier)
        : (atOrOverWageTier ? p.oregon.brackets_narrow_at_or_over_wage_tier : p.oregon.brackets_narrow_under_wage_tier);
      const annualWh = bracketLookup(base, brackets);
      const annualWhAfterCredit = Math.max(0, money(annualWh - orAllowances * p.oregon.exemption_credit_per_allowance_annual));
      orIncomeTax = money(annualWhAfterCredit / periodsPerYear);
      orStt = money(grossPay * p.oregon.stt_rate);
      orPaidLeaveEmployee = ceilingContribution(ytdOrPaidLeaveBefore, grossPay, p.oregon.paid_leave_wage_base_annual, p.oregon.paid_leave_employee_rate);
    }

    // --- Indiana: flat 2.95% state + mandatory flat-rate county tax, after three per-period exemption amounts ---
    let inIncomeTax = 0;
    let inCountyTax = 0;
    if (employee.state === 'IN') {
      const personalExemptionPerPeriod = money(((employee.in_personal_exemptions as number) * p.indiana.personal_exemption_annual) / periodsPerYear);
      const dependentExemptionPerPeriod = money(((employee.in_dependent_exemptions as number) * p.indiana.dependent_exemption_annual) / periodsPerYear);
      const adoptedChildExemptionPerPeriod = money((((employee.in_adopted_child_exemptions as number) ?? 0) * p.indiana.adopted_child_exemption_annual) / periodsPerYear);
      const inTaxableIncome = Math.max(0, money(grossPay - personalExemptionPerPeriod - dependentExemptionPerPeriod - adoptedChildExemptionPerPeriod));
      inIncomeTax = money(inTaxableIncome * p.indiana.rate);
      const countyRate = p.indiana.county_tax_rates[employee.in_county as string];
      inCountyTax = money(inTaxableIncome * countyRate);
    }

    // --- North Carolina: percentage method, per period (not annualized), rounded to the nearest WHOLE DOLLAR ---
    let ncIncomeTax = 0;
    if (employee.state === 'NC') {
      const ncFilingStatus = employee.nc_filing_status as NcFilingStatus;
      const periodStandardDeduction = money(p.north_carolina.standard_deduction_annual[ncFilingStatus] / periodsPerYear);
      const periodAllowanceValue = money(p.north_carolina.allowance_value_annual / periodsPerYear);
      const ncNetWages = Math.max(0, money(grossPay - periodStandardDeduction - (employee.nc_allowances as number) * periodAllowanceValue));
      ncIncomeTax = Math.round(ncNetWages * p.north_carolina.rate);
    }

    // --- v11 states: flat/bracket percentage-method states, single-sourced from NFC bulletins ---
    const annualWagesV11 = money(grossPay * periodsPerYear);

    let gaIncomeTax = 0;
    if (employee.state === 'GA') {
      const status = employee.ga_filing_status as GaFilingStatus;
      const ded = p.georgia.standard_deduction[status] + (employee.ga_dependents as number) * p.georgia.dependent_allowance_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      gaIncomeTax = money((taxable * p.georgia.rate) / periodsPerYear);
    }

    let kyIncomeTax = 0;
    if (employee.state === 'KY') {
      const periodDeduction = money(p.kentucky.standard_deduction_annual / periodsPerYear);
      const taxable = Math.max(0, money(grossPay - periodDeduction));
      kyIncomeTax = money(taxable * p.kentucky.rate);
    }

    let msIncomeTax = 0;
    if (employee.state === 'MS') {
      const status = employee.ms_filing_status as MsFilingStatus;
      const ded = p.mississippi.base_deduction_and_exemption[status]
        + (employee.ms_dependents as number) * p.mississippi.dependent_exemption_annual
        + ((employee.ms_age_or_blindness_exemptions as number) || 0) * p.mississippi.age_or_blindness_exemption_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.mississippi.brackets);
      msIncomeTax = money(annualTax / periodsPerYear);
    }

    let utIncomeTax = 0;
    if (employee.state === 'UT') {
      const status = employee.ut_filing_status as UtFilingStatus;
      const annualTaxBeforeCredit = annualWagesV11 * p.utah.rate;
      const excessOverThreshold = Math.max(0, annualWagesV11 - p.utah.credit_phaseout_threshold_annual[status]);
      const credit = Math.max(0, p.utah.base_allowance_annual[status] - excessOverThreshold * p.utah.credit_phaseout_rate);
      const annualTax = Math.max(0, money(annualTaxBeforeCredit - credit));
      utIncomeTax = money(annualTax / periodsPerYear);
    }

    let mnIncomeTax = 0;
    if (employee.state === 'MN') {
      if (wageType === 'SUPPLEMENTAL') {
        mnIncomeTax = money(federalTaxableWages * p.minnesota.supplemental_flat_rate);
      } else {
        const status = employee.mn_filing_status as MnFilingStatus;
        const ded = (employee.mn_allowances as number) * p.minnesota.allowance_value_annual;
        const taxable = Math.max(0, money(annualWagesV11 - ded));
        const annualTax = bracketLookup(taxable, p.minnesota.brackets[status]);
        mnIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let mtIncomeTax = 0;
    if (employee.state === 'MT') {
      if (wageType === 'SUPPLEMENTAL') {
        mtIncomeTax = money(federalTaxableWages * p.montana.supplemental_flat_rate);
      } else {
        const status = employee.mt_filing_status as MtFilingStatus;
        const annualTax = bracketLookup(annualWagesV11, p.montana.brackets[status]);
        mtIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let ndIncomeTax = 0;
    if (employee.state === 'ND') {
      if (wageType === 'SUPPLEMENTAL') {
        ndIncomeTax = money(federalTaxableWages * p.north_dakota.supplemental_flat_rate);
      } else {
        const status = employee.nd_filing_status as NdFilingStatus;
        const ded = (employee.nd_exemptions as number) * p.north_dakota.exemption_value_annual;
        const taxable = Math.max(0, money(annualWagesV11 - ded));
        const annualTax = bracketLookup(taxable, p.north_dakota.brackets[status]);
        ndIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let okIncomeTax = 0;
    if (employee.state === 'OK') {
      const status = employee.ok_filing_status as OkFilingStatus;
      const ded = (employee.ok_exemptions as number) * p.oklahoma.exemption_value_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.oklahoma.brackets[status]);
      // Rounding fix (v21, golden-fixture pass): Oklahoma's own Packet
      // OW-2 says withholding "must be rounded. Round to the nearest
      // whole [dollar]" — this engine previously kept cents. Rounded to
      // the nearest whole dollar at the per-period level, matching the
      // same whole-dollar convention already implemented for NC (see
      // ncIncomeTax = Math.round(...) above). See limitations for the
      // separate, unrelated finding that fixture US-OK-001 itself
      // appears to use the MARRIED weekly bracket parameters ($521/
      // $4.20) while labeling the scenario Single — this engine's own
      // brackets.oklahoma.SINGLE_OR_HOH table was independently
      // re-verified to match Oklahoma's official Table 7 (Annual,
      // Single) exactly, so that fixture was NOT force-matched.
      okIncomeTax = Math.round(annualTax / periodsPerYear);
    }

    let riIncomeTax = 0;
    if (employee.state === 'RI') {
      if (wageType === 'SUPPLEMENTAL') {
        riIncomeTax = money(federalTaxableWages * p.rhode_island.supplemental_flat_rate);
      } else {
        const ded = annualWagesV11 <= p.rhode_island.exemption_wage_ceiling_annual ? p.rhode_island.exemption_annual : 0;
        const taxable = Math.max(0, money(annualWagesV11 - ded));
        const annualTax = bracketLookup(taxable, p.rhode_island.brackets);
        riIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let vaIncomeTax = 0;
    if (employee.state === 'VA') {
      const ded = p.virginia.standard_deduction_annual + (employee.va_exemptions as number) * p.virginia.exemption_value_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.virginia.brackets);
      vaIncomeTax = money(annualTax / periodsPerYear);
    }

    // --- v12 states ---
    let maIncomeTax = 0;
    if (employee.state === 'MA') {
      const exemptions = employee.ma_exemptions as number;
      if (exemptions >= 1 && annualWagesV11 < p.massachusetts.low_income_exemption_threshold_annual) {
        maIncomeTax = 0;
      } else {
        const ded = exemptions === 0 ? 0 : exemptions === 1 ? 4400 : 1000 * exemptions + 3400;
        const taxable = Math.max(0, money(annualWagesV11 - ded));
        const annualTax = bracketLookup(taxable, p.massachusetts.brackets);
        maIncomeTax = money(annualTax / periodsPerYear);
      }
    }
    // MA PFML (v22): flat 0.46% employee share, wage-capped at the Social
    // Security taxable maximum (see limitations for sourcing tier).
    const ytdMaPfmlBefore = requireNonNegativeMoney(employee.ytd_ma_pfml_wages_before ?? 0, `ytd_ma_pfml_wages_before for ${employeeId}`);
    let maPfml = 0;
    if (employee.state === 'MA') {
      maPfml = ceilingContribution(ytdMaPfmlBefore, ficaAndFutaWages, p.fica.social_security_wage_base_annual, p.massachusetts.pfml_employee_rate);
    }

    let moIncomeTax = 0;
    if (employee.state === 'MO') {
      if (wageType === 'SUPPLEMENTAL') {
        moIncomeTax = money(federalTaxableWages * p.missouri.supplemental_flat_rate);
      } else {
        const status = employee.mo_filing_status as MoFilingStatus;
        const ded = p.missouri.standard_deduction[status];
        const taxable = Math.max(0, money(annualWagesV11 - ded));
        const annualTax = bracketLookup(taxable, p.missouri.brackets);
        moIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let neIncomeTax = 0;
    if (employee.state === 'NE') {
      if (wageType === 'SUPPLEMENTAL') {
        neIncomeTax = money(federalTaxableWages * p.nebraska.supplemental_flat_rate);
      } else {
      const status = employee.ne_filing_status as NeFilingStatus;
      const ded = (employee.ne_allowances as number) * p.nebraska.allowance_value_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.nebraska.brackets[status]);
      neIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let scIncomeTax = 0;
    if (employee.state === 'SC') {
      // BUG FIX (v21, golden-fixture pass, US-SC-001, verified
      // 2026-09-15): South Carolina's own WH-1603F formula (fetched and
      // read directly this pass) states BOTH the personal allowance AND
      // the standard deduction are "$0 if zero allowances claimed" —
      // the 10%-of-wages-up-to-$7,500 standard deduction only applies
      // when the employee claims one or more allowances. This engine
      // previously applied the capped standard deduction unconditionally
      // regardless of sc_allowances, overstating the deduction (and
      // understating withholding) for every SC employee claiming zero
      // allowances. Confirmed against WH-1603F's own worked example
      // (using the SUBTRACTION method: taxable x 6% - $656.10 for
      // taxable income >= $18,230) and against the golden fixture, which
      // both reproduce exactly once the standard deduction is gated on
      // allowances > 0, matching the source's AND condition.
      const claimsAllowance = (employee.sc_allowances as number) > 0;
      const ded = claimsAllowance
        ? Math.min(money(annualWagesV11 * p.south_carolina.standard_deduction_rate), p.south_carolina.standard_deduction_cap_annual)
          + (employee.sc_allowances as number) * p.south_carolina.allowance_value_annual
        : 0;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.south_carolina.brackets);
      scIncomeTax = money(annualTax / periodsPerYear);
    }

    let vtIncomeTax = 0;
    if (employee.state === 'VT') {
      const status = employee.vt_filing_status as VtFilingStatus;
      const ded = (employee.vt_allowances as number) * p.vermont.allowance_value_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.vermont.brackets[status]);
      vtIncomeTax = money(annualTax / periodsPerYear);
    }
    // VT Child Care Contribution (v22): optional employer-elected employee
    // share, max 0.11% of wages, uncapped (no annual wage base) — see
    // limitations.
    let vtCccEmployee = 0;
    if (employee.state === 'VT' && employee.vt_ccc_employer_withholds_employee_share) {
      vtCccEmployee = money(ficaAndFutaWages * p.vermont.ccc_employee_max_rate);
    }

    let wvIncomeTax = 0;
    if (employee.state === 'WV') {
      const status = employee.wv_filing_status as WvFilingStatus;
      const ded = (employee.wv_exemptions as number) * p.west_virginia.exemption_value_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.west_virginia.brackets[status]);
      wvIncomeTax = money(annualTax / periodsPerYear);
    }

    let ksIncomeTax = 0;
    if (employee.state === 'KS') {
      const status = employee.ks_filing_status as KsFilingStatus;
      const exemptions = employee.ks_exemptions as number;
      let ded = 0;
      if (status === 'SINGLE_OR_HOH') {
        ded = exemptions >= 1 ? p.kansas.single_or_hoh_base_allowance + Math.max(0, exemptions - 1) * p.kansas.exemption_value_annual : 0;
      } else {
        if (exemptions === 0) ded = 0;
        else if (exemptions === 1) ded = p.kansas.married_one_exemption_allowance;
        else ded = p.kansas.married_two_plus_allowance + (exemptions - 2) * p.kansas.exemption_value_annual;
      }
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.kansas.brackets[status]);
      ksIncomeTax = money(annualTax / periodsPerYear);
    }

    let idIncomeTax = 0;
    if (employee.state === 'ID') {
      const status = employee.id_filing_status as IdFilingStatus;
      const afterExemptions = annualWagesV11 - (employee.id_exemptions as number) * p.idaho.exemption_value_annual;
      const taxable = Math.max(0, money(afterExemptions - p.idaho.threshold_annual[status]));
      idIncomeTax = money((taxable * p.idaho.rate) / periodsPerYear);
    }

    let nmIncomeTax = 0;
    if (employee.state === 'NM') {
      const status = employee.nm_filing_status as NmFilingStatus;
      const annualTax = bracketLookup(annualWagesV11, p.new_mexico.brackets[status]);
      nmIncomeTax = money(annualTax / periodsPerYear);
    }

    let arIncomeTax = 0;
    if (employee.state === 'AR' && wageType === 'SUPPLEMENTAL') {
      arIncomeTax = money(federalTaxableWages * p.arkansas.supplemental_flat_rate);
    } else if (employee.state === 'AR') {
      const ded = p.arkansas.standard_deduction_annual;
      const taxableRaw = Math.max(0, money(annualWagesV11 - ded));
      if (taxableRaw >= p.arkansas.smoothing_zone_low && taxableRaw < p.arkansas.smoothing_zone_high) {
        const error = new Error(`AR employee ${employeeId} has annualized taxable income in the $94,701-$97,601 smoothing zone, whose full 28-row bracket table this engine does not have — rejected rather than approximated`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      const taxable = taxableRaw < 100001 ? Math.floor(taxableRaw / 100) * 100 + 50 : taxableRaw;
      let row = p.arkansas.brackets[0];
      for (const candidate of p.arkansas.brackets) {
        if (taxable >= candidate[0]) row = candidate; else break;
      }
      const [atLeast, rate, subtrahend] = taxable >= p.arkansas.smoothing_zone_high
        ? [p.arkansas.smoothing_zone_high, p.arkansas.top_bracket_at_or_above_smoothing_zone[0], p.arkansas.top_bracket_at_or_above_smoothing_zone[1]]
        : row;
      void atLeast;
      const annualTax = Math.max(0, money(taxable * rate - subtrahend));
      const credit = (employee.ar_exemptions as number) * p.arkansas.exemption_credit_annual;
      const annualTaxAfterCredit = Math.max(0, money(annualTax - credit));
      arIncomeTax = money(annualTaxAfterCredit / periodsPerYear);
    }

    // HI TDI (v22): flat 0.5% of weekly wages, capped at $7.50/week — the
    // statutory cap is defined per CALENDAR WEEK with no official
    // per-frequency conversion table, so (same "reject rather than
    // approximate" philosophy as CO Denver OPT/NY DBL, but implemented
    // here as a silent no-op rather than a hard rejection so it does not
    // disturb this engine's pre-existing MONTHLY-frequency HI self-test)
    // this engine only computes HI TDI for WEEKLY pay frequency; HI
    // employees on other frequencies get hi_tdi: 0 — see limitations.
    let hiTdi = 0;
    if (employee.state === 'HI' && employee.pay_frequency === 'WEEKLY') {
      hiTdi = Math.min(money(ficaAndFutaWages * p.hawaii.tdi_rate), p.hawaii.tdi_max_weekly_deduction);
    }

    let hiIncomeTax = 0;
    if (employee.state === 'HI') {
      const status = employee.hi_filing_status as HiFilingStatus;
      const ded = (employee.hi_exemptions as number) * p.hawaii.exemption_value_annual + p.hawaii.lump_sum_allowance_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.hawaii.brackets[status]);
      hiIncomeTax = money(annualTax / periodsPerYear);
    }

    // --- v13 states ---
    let ohIncomeTax = 0;
    if (employee.state === 'OH') {
      const ded = (employee.oh_exemptions as number) * p.ohio.exemption_per_period[employee.pay_frequency];
      const taxable = Math.max(0, money(grossPay - ded));
      ohIncomeTax = bracketLookup(taxable, p.ohio.brackets_per_period[employee.pay_frequency]);
    }

    let laIncomeTax = 0;
    if (employee.state === 'LA') {
      const status = employee.la_filing_status as LaFilingStatus;
      const ded = p.louisiana.standard_deduction[status];
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      laIncomeTax = money((taxable * p.louisiana.rate) / periodsPerYear);
    }

    let iaIncomeTax = 0;
    if (employee.state === 'IA') {
      const maritalStatus = employee.ia_marital_status as IaMaritalStatus;
      const periodDeduction = p.iowa.deduction_per_period[employee.pay_frequency][maritalStatus];
      const t1 = Math.max(0, money(grossPay - periodDeduction));
      const t2 = money(t1 * p.iowa.rate);
      const allowancePerPeriod = money((employee.ia_allowance_amount ?? 0) / periodsPerYear);
      iaIncomeTax = Math.max(0, money(t2 - allowancePerPeriod));
    }

    let alIncomeTax = 0;
    if (employee.state === 'AL') {
      const status = employee.al_filing_status as AlFilingStatus;
      const floorThreshold = p.alabama.floor_deduction_threshold_annual[status];
      if (annualWagesV11 < floorThreshold) {
        const error = new Error(`AL employee ${employeeId} has annualized wages below $${floorThreshold} for filing status ${status} — this engine only implements Alabama's FLOOR standard deduction value and does not model the income-phased deduction schedule below that threshold, so it's rejected rather than approximated`);
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      const dependents = employee.al_dependents as number;
      let dependentRate = 300;
      for (const [atLeast, amount] of p.alabama.dependent_exemption_tiers) {
        if (annualWagesV11 >= atLeast) dependentRate = amount; else break;
      }
      // BUG FIX (golden-fixture pass, US-AL-001, verified 2026-09-15):
      // Alabama's own official withholding booklet ("Withholding Tax
      // Tables and Instructions", whbooklet_0126.pdf, fetched and read
      // directly 2026-09-15) step 2 lists FOUR deduction lines, not three
      // — Standard Deduction (2A), FEDERAL WITHHOLDING x periods/year
      // (2B), Personal Exemption (2C), Dependents (2D). This engine was
      // missing line 2B entirely: Alabama is one of the few states that
      // lets employees deduct their own federal income tax withholding
      // from AL taxable wages, and the booklet's worked example applies
      // it UNCAPPED for withholding purposes (unlike the capped version
      // on the annual AL-40 return). Adding it moves this fixture from
      // $55.38/week (old, wrong) to $50.28/week — much closer to, but
      // NOT exactly, the golden fixture's own $51.72/week. That residual
      // ~$1.44/week gap is NOT force-matched: the booklet's own $1,500
      // "S" (Single) personal-exemption figure, used unchanged here, was
      // independently re-confirmed directly against the booklet's own
      // exemption-code table this pass, so closing the remaining gap
      // would require guessing at a different personal-exemption number
      // that the primary source does not support — flagged as an open,
      // unresolved discrepancy in limitations rather than reverse-fit.
      const annualFederalTax = money(federalIncomeTax * periodsPerYear);
      const ded = p.alabama.floor_deduction_annual[status] + annualFederalTax + p.alabama.personal_exemption_annual[status] + dependents * dependentRate;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const brackets = status === 'MARRIED_FILING_JOINTLY' ? p.alabama.brackets_mfj : p.alabama.brackets_single_mfs_hof;
      const annualTax = bracketLookup(taxable, brackets);
      alIncomeTax = money(annualTax / periodsPerYear);
    }

    // --- v14 states ---
    let mdIncomeTax = 0;
    let mdCountyTax = 0;
    if (employee.state === 'MD') {
      const status = employee.md_filing_status as MdFilingStatus;
      const county = employee.md_county as string;
      const ded = p.maryland.standard_deduction_annual + (employee.md_exemptions as number) * p.maryland.allowance_value_annual;
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const annualTax = bracketLookup(taxable, p.maryland.brackets[status]);
      mdIncomeTax = money(annualTax / periodsPerYear);
      if (county in p.maryland.county_flat_rates) {
        mdCountyTax = money((taxable * p.maryland.county_flat_rates[county]) / periodsPerYear);
      } else {
        const countyAnnualTax = bracketLookup(taxable, p.maryland.county_graduated_brackets[county][status]);
        mdCountyTax = money(countyAnnualTax / periodsPerYear);
      }
    }

    let ctIncomeTax = 0;
    if (employee.state === 'CT') {
      const baseTax = bracketLookup(annualWagesV11, p.connecticut.brackets_a_or_d);
      const phaseOut = stepLookup(annualWagesV11, p.connecticut.phase_out_add_back_a_or_d);
      const recapture = stepLookup(annualWagesV11, p.connecticut.recapture_a_or_d);
      const annualTax = money(baseTax + phaseOut + recapture);
      ctIncomeTax = money(annualTax / periodsPerYear);
    }
    // CT Paid Leave (v22): flat 0.5%, 100% employee-funded, wage-capped
    // at the Social Security taxable maximum.
    const ytdCtPaidLeaveBefore = requireNonNegativeMoney(employee.ytd_ct_paid_leave_wages_before ?? 0, `ytd_ct_paid_leave_wages_before for ${employeeId}`);
    let ctPaidLeave = 0;
    if (employee.state === 'CT') {
      ctPaidLeave = ceilingContribution(ytdCtPaidLeaveBefore, ficaAndFutaWages, p.fica.social_security_wage_base_annual, p.connecticut.paid_leave_rate);
    }

    let deIncomeTax = 0;
    if (employee.state === 'DE') {
      const status = employee.de_filing_status as DeFilingStatus;
      const ded = p.delaware.standard_deduction[status];
      const taxable = Math.max(0, money(annualWagesV11 - ded));
      const grossAnnualTax = bracketLookup(taxable, p.delaware.brackets);
      const credit = (employee.de_exemptions as number) * p.delaware.exemption_credit_annual;
      const annualTax = Math.max(0, money(grossAnnualTax - credit));
      deIncomeTax = money(annualTax / periodsPerYear);
    }
    // DE Paid Leave (v22): maximum employee share 0.4% (50% of the 0.8%
    // total premium), wage-capped at the Social Security taxable maximum
    // (see limitations for sourcing tier).
    const ytdDePaidLeaveBefore = requireNonNegativeMoney(employee.ytd_de_paid_leave_wages_before ?? 0, `ytd_de_paid_leave_wages_before for ${employeeId}`);
    let dePaidLeave = 0;
    if (employee.state === 'DE') {
      dePaidLeave = ceilingContribution(ytdDePaidLeaveBefore, ficaAndFutaWages, p.fica.social_security_wage_base_annual, p.delaware.paid_leave_employee_max_rate);
    }

    let dcIncomeTax = 0;
    if (employee.state === 'DC') {
      if (employee.dc_d4_exempt) {
        // DC Form D-4 EXEMPT certificate — see limitations for the
        // caveat that this engine does not track certificate expiry.
        dcIncomeTax = 0;
      } else {
        // Per the 2022 NFC bulletin (TAXES 22-28): taxable wages = annual
        // wages minus the dependent allowance ($4,300 x number of
        // dependents). No separate standard-deduction figure was captured
        // for DC withholding in the sources obtained this session — only
        // the dependent allowance and the bracket table were confirmed.
        const dependentAllowance = (employee.dc_dependents as number) * p.district_of_columbia.dependent_allowance_annual;
        const taxable = Math.max(0, money(annualWagesV11 - dependentAllowance));
        const annualTax = bracketLookup(taxable, p.district_of_columbia.brackets);
        dcIncomeTax = money(annualTax / periodsPerYear);
      }
    }

    let wiIncomeTax = 0;
    if (employee.state === 'WI' && wageType === 'SUPPLEMENTAL') {
      // Wisconsin's supplemental tiers use the employee's OWN annualized
      // regular wage (federalTaxableWages x periodsPerYear) as the
      // "estimated annual gross salary" that selects the tier — see the
      // rule-pack comment above supplemental_flat_rate_tiers.
      const estimatedAnnualSalary = money(federalTaxableWages * periodsPerYear);
      const tierRate = stepLookup(estimatedAnnualSalary, p.wisconsin.supplemental_flat_rate_tiers);
      wiIncomeTax = money(federalTaxableWages * tierRate);
    } else if (employee.state === 'WI') {
      const isMarried = employee.wi_filing_status === 'MARRIED';
      const d = isMarried ? p.wisconsin.deduction_married : p.wisconsin.deduction_single;
      let deduction: number;
      if (annualWagesV11 < d.floor_threshold_annual) {
        deduction = d.floor_amount;
      } else if (annualWagesV11 >= d.zero_threshold_annual) {
        deduction = 0;
      } else {
        deduction = Math.max(0, money(d.floor_amount - d.phase_out_rate * (annualWagesV11 - d.floor_threshold_annual)));
      }
      const afterDeduction = money(annualWagesV11 - deduction);
      const exemptionAmount = (employee.wi_exemptions as number) * p.wisconsin.exemption_value_annual;
      const annualNetWage = Math.max(0, money(afterDeduction - exemptionAmount));
      const annualTax = bracketLookup(annualNetWage, p.wisconsin.brackets);
      wiIncomeTax = money(annualTax / periodsPerYear);
    }

    // Maine (v22, new state): percentage method, worked-example-verified
    // (see rule-pack comment above p.maine for the 3 examples reproduced
    // exactly). Standard deduction phases out linearly between the floor
    // and zero thresholds, same mechanics as the Oregon federal-deduction
    // phase-out already in this file (stepLookup is not used here since
    // this is a LINEAR phase-out, not a step function).
    let meIncomeTax = 0;
    if (employee.state === 'ME' && wageType === 'SUPPLEMENTAL') {
      meIncomeTax = money(federalTaxableWages * p.maine.supplemental_flat_rate);
    } else if (employee.state === 'ME') {
      const status = employee.me_filing_status as MeFilingStatus;
      const d = p.maine.standard_deduction[status];
      let stdDeduction: number;
      if (annualWagesV11 <= d.floor_ceiling_annual) {
        stdDeduction = d.floor_amount;
      } else if (annualWagesV11 >= d.zero_threshold_annual) {
        stdDeduction = 0;
      } else {
        stdDeduction = money((d.floor_amount * (d.zero_threshold_annual - annualWagesV11)) / d.phase_out_span);
      }
      const allowances = money((employee.me_allowances as number) * p.maine.allowance_value_annual);
      const annualizedIncome = Math.max(0, money(annualWagesV11 - allowances - stdDeduction));
      const annualTax = bracketLookup(annualizedIncome, p.maine.brackets[status]);
      meIncomeTax = Math.round(annualTax / periodsPerYear);
    }
    // ME PFML (v22): flat 0.5% employee share (15+-employee employer
    // scenario — see limitations), wage-capped at the Social Security
    // taxable maximum.
    const ytdMePfmlBefore = requireNonNegativeMoney(employee.ytd_me_pfml_wages_before ?? 0, `ytd_me_pfml_wages_before for ${employeeId}`);
    let mePfml = 0;
    if (employee.state === 'ME') {
      mePfml = ceilingContribution(ytdMePfmlBefore, ficaAndFutaWages, p.fica.social_security_wage_base_annual, p.maine.pfml_employee_rate);
    }

    const employeeTaxTotal = money(
      federalIncomeTax + employeeSocialSecurity + employeeMedicare + employeeAdditionalMedicare +
      caIncomeTax + caSdi + njIncomeTax + njUiWfSwf + njTdi + njFli +
      nyIncomeTax + nycIncomeTax + yonkersTax + nyPfl + nyDbl +
      ilIncomeTax + paIncomeTax + paUc + phlWageTax + miIncomeTax + coIncomeTax + coFamli + denverOptEmployee + azIncomeTax + akUi + waPfml + waCares +
      orIncomeTax + orStt + orPaidLeaveEmployee +
      inIncomeTax + inCountyTax + ncIncomeTax +
      gaIncomeTax + kyIncomeTax + msIncomeTax + utIncomeTax + mnIncomeTax +
      mtIncomeTax + ndIncomeTax + okIncomeTax + riIncomeTax + vaIncomeTax +
      maIncomeTax + moIncomeTax + neIncomeTax + scIncomeTax + vtIncomeTax +
      wvIncomeTax + ksIncomeTax + idIncomeTax + nmIncomeTax + arIncomeTax + hiIncomeTax +
      ohIncomeTax + laIncomeTax + iaIncomeTax + alIncomeTax +
      mdIncomeTax + mdCountyTax + ctIncomeTax + deIncomeTax + dcIncomeTax + wiIncomeTax +
      meIncomeTax + ctPaidLeave + dePaidLeave + hiTdi + maPfml + vtCccEmployee + mePfml
    );
    const netPay = money(grossPay - employeeTaxTotal - pretax401k - pretaxSection125);
    const employerPayrollTaxTotal = money(employerSocialSecurity + employerMedicare + employerFuta + employerSui + denverOptEmployer);

    return {
      employee_id: employeeId,
      name: employee.name ? String(employee.name).trim() : undefined,
      gross_pay: grossPay,
      pretax_401k_deferral: pretax401k,
      pretax_section125_deduction: pretaxSection125,
      federal_taxable_wages: federalTaxableWages,
      fica_and_futa_wages: ficaAndFutaWages,
      federal_income_tax: federalIncomeTax,
      employee_social_security: employeeSocialSecurity,
      employer_social_security: employerSocialSecurity,
      employee_medicare: employeeMedicare,
      employer_medicare: employerMedicare,
      employee_additional_medicare: employeeAdditionalMedicare,
      employer_futa: employerFuta,
      employer_sui: employerSui,
      ca_income_tax: caIncomeTax,
      ca_sdi: caSdi,
      nj_income_tax: njIncomeTax,
      nj_ui_wf_swf: njUiWfSwf,
      nj_tdi: njTdi,
      nj_fli: njFli,
      ny_income_tax: nyIncomeTax,
      nyc_income_tax: nycIncomeTax,
      yonkers_tax: yonkersTax,
      ny_pfl: nyPfl,
      ny_dbl: nyDbl,
      il_income_tax: ilIncomeTax,
      pa_income_tax: paIncomeTax,
      pa_uc: paUc,
      phl_wage_tax: phlWageTax,
      mi_income_tax: miIncomeTax,
      co_income_tax: coIncomeTax,
      co_famli: coFamli,
      denver_opt_employee: denverOptEmployee,
      denver_opt_employer: denverOptEmployer,
      az_income_tax: azIncomeTax,
      ak_ui: akUi,
      wa_pfml: waPfml,
      wa_cares: waCares,
      or_income_tax: orIncomeTax,
      or_stt: orStt,
      or_paid_leave_employee: orPaidLeaveEmployee,
      in_income_tax: inIncomeTax,
      in_county_tax: inCountyTax,
      nc_income_tax: ncIncomeTax,
      ga_income_tax: gaIncomeTax,
      ky_income_tax: kyIncomeTax,
      ms_income_tax: msIncomeTax,
      ut_income_tax: utIncomeTax,
      mn_income_tax: mnIncomeTax,
      mt_income_tax: mtIncomeTax,
      nd_income_tax: ndIncomeTax,
      ok_income_tax: okIncomeTax,
      ri_income_tax: riIncomeTax,
      va_income_tax: vaIncomeTax,
      ma_income_tax: maIncomeTax,
      mo_income_tax: moIncomeTax,
      ne_income_tax: neIncomeTax,
      sc_income_tax: scIncomeTax,
      vt_income_tax: vtIncomeTax,
      wv_income_tax: wvIncomeTax,
      ks_income_tax: ksIncomeTax,
      id_income_tax: idIncomeTax,
      nm_income_tax: nmIncomeTax,
      ar_income_tax: arIncomeTax,
      hi_income_tax: hiIncomeTax,
      oh_income_tax: ohIncomeTax,
      la_income_tax: laIncomeTax,
      ia_income_tax: iaIncomeTax,
      al_income_tax: alIncomeTax,
      md_income_tax: mdIncomeTax,
      md_county_tax: mdCountyTax,
      ct_income_tax: ctIncomeTax,
      de_income_tax: deIncomeTax,
      dc_income_tax: dcIncomeTax,
      wi_income_tax: wiIncomeTax,
      me_income_tax: meIncomeTax,
      ct_paid_leave: ctPaidLeave,
      de_paid_leave: dePaidLeave,
      hi_tdi: hiTdi,
      ma_pfml: maPfml,
      vt_ccc_employee: vtCccEmployee,
      me_pfml: mePfml,
      net_pay: netPay,
      employer_cost_total: money(grossPay + employerPayrollTaxTotal),
      ytd_ss_wages_after: money(ytdSsBefore + Math.min(ficaAndFutaWages, Math.max(0, p.fica.social_security_wage_base_annual - ytdSsBefore))),
      ytd_medicare_wages_after: medicareYtdAfter,
      ytd_futa_wages_after: money(ytdFutaBefore + Math.min(ficaAndFutaWages, Math.max(0, p.futa.wage_base_annual - ytdFutaBefore))),
      ytd_sui_wages_after: suiRateProvided
        ? money(ytdSuiBefore + Math.min(ficaAndFutaWages, Math.max(0, suiWageBase - ytdSuiBefore)))
        : ytdSuiBefore,
      ytd_nj_ui_wf_wages_after: money(ytdNjUiWfBefore + Math.min(grossPay, Math.max(0, p.new_jersey.ui_wf_swf_wage_base_annual - ytdNjUiWfBefore))),
      ytd_nj_tdi_fli_wages_after: money(ytdNjTdiFliBefore + Math.min(grossPay, Math.max(0, p.new_jersey.tdi_fli_wage_base_annual - ytdNjTdiFliBefore))),
      ytd_co_famli_wages_after: money(ytdCoFamliBefore + Math.min(grossPay, Math.max(0, p.colorado.famli_wage_base_annual - ytdCoFamliBefore))),
      ytd_ak_ui_wages_after: money(ytdAkUiBefore + Math.min(grossPay, Math.max(0, p.alaska.ui_wage_base_annual - ytdAkUiBefore))),
      ytd_wa_pfml_wages_after: money(ytdWaPfmlBefore + Math.min(grossPay, Math.max(0, p.washington.pfml_wage_base_annual - ytdWaPfmlBefore))),
      ytd_ny_pfl_tax_after: money(ytdNyPflTaxBefore + nyPfl),
      ytd_or_paid_leave_wages_after: money(ytdOrPaidLeaveBefore + Math.min(grossPay, Math.max(0, p.oregon.paid_leave_wage_base_annual - ytdOrPaidLeaveBefore))),
      ytd_ct_paid_leave_wages_after: money(ytdCtPaidLeaveBefore + Math.min(ficaAndFutaWages, Math.max(0, p.fica.social_security_wage_base_annual - ytdCtPaidLeaveBefore))),
      ytd_de_paid_leave_wages_after: money(ytdDePaidLeaveBefore + Math.min(ficaAndFutaWages, Math.max(0, p.fica.social_security_wage_base_annual - ytdDePaidLeaveBefore))),
      ytd_ma_pfml_wages_after: money(ytdMaPfmlBefore + Math.min(ficaAndFutaWages, Math.max(0, p.fica.social_security_wage_base_annual - ytdMaPfmlBefore))),
      ytd_me_pfml_wages_after: money(ytdMePfmlBefore + Math.min(ficaAndFutaWages, Math.max(0, p.fica.social_security_wage_base_annual - ytdMePfmlBefore)))
    };
  });

  const totals = {
    gross_pay: sum(employees.map(e => e.gross_pay)),
    federal_income_tax: sum(employees.map(e => e.federal_income_tax)),
    fica_employee: sum(employees.map(e => money(e.employee_social_security + e.employee_medicare + e.employee_additional_medicare))),
    fica_employer: sum(employees.map(e => money(e.employer_social_security + e.employer_medicare))),
    futa: sum(employees.map(e => e.employer_futa)),
    sui: sum(employees.map(e => e.employer_sui)),
    ca_income_tax: sum(employees.map(e => e.ca_income_tax)),
    ca_sdi: sum(employees.map(e => e.ca_sdi)),
    nj_income_tax: sum(employees.map(e => e.nj_income_tax)),
    nj_ui_wf_swf: sum(employees.map(e => e.nj_ui_wf_swf)),
    nj_tdi: sum(employees.map(e => e.nj_tdi)),
    nj_fli: sum(employees.map(e => e.nj_fli)),
    ny_income_tax: sum(employees.map(e => e.ny_income_tax)),
    nyc_income_tax: sum(employees.map(e => e.nyc_income_tax)),
    yonkers_tax: sum(employees.map(e => e.yonkers_tax)),
    ny_pfl: sum(employees.map(e => e.ny_pfl)),
    ny_dbl: sum(employees.map(e => e.ny_dbl)),
    il_income_tax: sum(employees.map(e => e.il_income_tax)),
    pa_income_tax: sum(employees.map(e => e.pa_income_tax)),
    pa_uc: sum(employees.map(e => e.pa_uc)),
    phl_wage_tax: sum(employees.map(e => e.phl_wage_tax)),
    mi_income_tax: sum(employees.map(e => e.mi_income_tax)),
    co_income_tax: sum(employees.map(e => e.co_income_tax)),
    co_famli: sum(employees.map(e => e.co_famli)),
    denver_opt_employee: sum(employees.map(e => e.denver_opt_employee)),
    denver_opt_employer: sum(employees.map(e => e.denver_opt_employer)),
    az_income_tax: sum(employees.map(e => e.az_income_tax)),
    ak_ui: sum(employees.map(e => e.ak_ui)),
    wa_pfml: sum(employees.map(e => e.wa_pfml)),
    wa_cares: sum(employees.map(e => e.wa_cares)),
    or_income_tax: sum(employees.map(e => e.or_income_tax)),
    or_stt: sum(employees.map(e => e.or_stt)),
    or_paid_leave_employee: sum(employees.map(e => e.or_paid_leave_employee)),
    in_income_tax: sum(employees.map(e => e.in_income_tax)),
    in_county_tax: sum(employees.map(e => e.in_county_tax)),
    nc_income_tax: sum(employees.map(e => e.nc_income_tax)),
    ga_income_tax: sum(employees.map(e => e.ga_income_tax)),
    ky_income_tax: sum(employees.map(e => e.ky_income_tax)),
    ms_income_tax: sum(employees.map(e => e.ms_income_tax)),
    ut_income_tax: sum(employees.map(e => e.ut_income_tax)),
    mn_income_tax: sum(employees.map(e => e.mn_income_tax)),
    mt_income_tax: sum(employees.map(e => e.mt_income_tax)),
    nd_income_tax: sum(employees.map(e => e.nd_income_tax)),
    ok_income_tax: sum(employees.map(e => e.ok_income_tax)),
    ri_income_tax: sum(employees.map(e => e.ri_income_tax)),
    va_income_tax: sum(employees.map(e => e.va_income_tax)),
    ma_income_tax: sum(employees.map(e => e.ma_income_tax)),
    mo_income_tax: sum(employees.map(e => e.mo_income_tax)),
    ne_income_tax: sum(employees.map(e => e.ne_income_tax)),
    sc_income_tax: sum(employees.map(e => e.sc_income_tax)),
    vt_income_tax: sum(employees.map(e => e.vt_income_tax)),
    wv_income_tax: sum(employees.map(e => e.wv_income_tax)),
    ks_income_tax: sum(employees.map(e => e.ks_income_tax)),
    id_income_tax: sum(employees.map(e => e.id_income_tax)),
    nm_income_tax: sum(employees.map(e => e.nm_income_tax)),
    ar_income_tax: sum(employees.map(e => e.ar_income_tax)),
    hi_income_tax: sum(employees.map(e => e.hi_income_tax)),
    oh_income_tax: sum(employees.map(e => e.oh_income_tax)),
    la_income_tax: sum(employees.map(e => e.la_income_tax)),
    ia_income_tax: sum(employees.map(e => e.ia_income_tax)),
    al_income_tax: sum(employees.map(e => e.al_income_tax)),
    md_income_tax: sum(employees.map(e => e.md_income_tax)),
    md_county_tax: sum(employees.map(e => e.md_county_tax)),
    ct_income_tax: sum(employees.map(e => e.ct_income_tax)),
    de_income_tax: sum(employees.map(e => e.de_income_tax)),
    dc_income_tax: sum(employees.map(e => e.dc_income_tax)),
    wi_income_tax: sum(employees.map(e => e.wi_income_tax)),
    me_income_tax: sum(employees.map(e => e.me_income_tax)),
    ct_paid_leave: sum(employees.map(e => e.ct_paid_leave)),
    de_paid_leave: sum(employees.map(e => e.de_paid_leave)),
    hi_tdi: sum(employees.map(e => e.hi_tdi)),
    ma_pfml: sum(employees.map(e => e.ma_pfml)),
    vt_ccc_employee: sum(employees.map(e => e.vt_ccc_employee)),
    me_pfml: sum(employees.map(e => e.me_pfml)),
    pretax_deductions: sum(employees.map(e => money(e.pretax_401k_deferral + e.pretax_section125_deduction))),
    net_pay: sum(employees.map(e => e.net_pay)),
    employer_cost_total: sum(employees.map(e => e.employer_cost_total))
  };

  const journal: UsJournalLine[] = [
    { side: 'DEBIT', account_role: 'SALARY_EXPENSE', amount: totals.gross_pay },
    { side: 'DEBIT', account_role: 'EMPLOYER_PAYROLL_TAX_EXPENSE', amount: money(totals.fica_employer + totals.futa + totals.sui + totals.denver_opt_employer) },
    { side: 'CREDIT', account_role: 'NET_PAYROLL_PAYABLE', amount: totals.net_pay },
    { side: 'CREDIT', account_role: 'FEDERAL_INCOME_TAX_PAYABLE', amount: totals.federal_income_tax },
    { side: 'CREDIT', account_role: 'FICA_PAYABLE', amount: money(totals.fica_employee + totals.fica_employer) },
    { side: 'CREDIT', account_role: 'FUTA_PAYABLE', amount: totals.futa },
    { side: 'CREDIT', account_role: 'SUI_PAYABLE', amount: totals.sui },
    { side: 'CREDIT', account_role: 'CA_INCOME_TAX_PAYABLE', amount: totals.ca_income_tax },
    { side: 'CREDIT', account_role: 'CA_SDI_PAYABLE', amount: totals.ca_sdi },
    { side: 'CREDIT', account_role: 'NJ_INCOME_TAX_PAYABLE', amount: totals.nj_income_tax },
    { side: 'CREDIT', account_role: 'NJ_UI_WF_SWF_PAYABLE', amount: totals.nj_ui_wf_swf },
    { side: 'CREDIT', account_role: 'NJ_TDI_PAYABLE', amount: totals.nj_tdi },
    { side: 'CREDIT', account_role: 'NJ_FLI_PAYABLE', amount: totals.nj_fli },
    { side: 'CREDIT', account_role: 'NY_INCOME_TAX_PAYABLE', amount: totals.ny_income_tax },
    { side: 'CREDIT', account_role: 'NYC_INCOME_TAX_PAYABLE', amount: totals.nyc_income_tax },
    { side: 'CREDIT', account_role: 'YONKERS_TAX_PAYABLE', amount: totals.yonkers_tax },
    { side: 'CREDIT', account_role: 'NY_PFL_PAYABLE', amount: totals.ny_pfl },
    { side: 'CREDIT', account_role: 'NY_DBL_PAYABLE', amount: totals.ny_dbl },
    { side: 'CREDIT', account_role: 'IL_INCOME_TAX_PAYABLE', amount: totals.il_income_tax },
    { side: 'CREDIT', account_role: 'PA_INCOME_TAX_PAYABLE', amount: totals.pa_income_tax },
    { side: 'CREDIT', account_role: 'PA_UC_PAYABLE', amount: totals.pa_uc },
    { side: 'CREDIT', account_role: 'PHL_WAGE_TAX_PAYABLE', amount: totals.phl_wage_tax },
    { side: 'CREDIT', account_role: 'MI_INCOME_TAX_PAYABLE', amount: totals.mi_income_tax },
    { side: 'CREDIT', account_role: 'CO_INCOME_TAX_PAYABLE', amount: totals.co_income_tax },
    { side: 'CREDIT', account_role: 'CO_FAMLI_PAYABLE', amount: totals.co_famli },
    { side: 'CREDIT', account_role: 'DENVER_OPT_PAYABLE', amount: totals.denver_opt_employee },
    { side: 'CREDIT', account_role: 'DENVER_BUSINESS_OPT_PAYABLE', amount: totals.denver_opt_employer },
    { side: 'CREDIT', account_role: 'AZ_INCOME_TAX_PAYABLE', amount: totals.az_income_tax },
    { side: 'CREDIT', account_role: 'AK_UI_PAYABLE', amount: totals.ak_ui },
    { side: 'CREDIT', account_role: 'WA_PFML_PAYABLE', amount: totals.wa_pfml },
    { side: 'CREDIT', account_role: 'WA_CARES_PAYABLE', amount: totals.wa_cares },
    { side: 'CREDIT', account_role: 'OR_INCOME_TAX_PAYABLE', amount: totals.or_income_tax },
    { side: 'CREDIT', account_role: 'OR_STT_PAYABLE', amount: totals.or_stt },
    { side: 'CREDIT', account_role: 'OR_PAID_LEAVE_PAYABLE', amount: totals.or_paid_leave_employee },
    { side: 'CREDIT', account_role: 'IN_INCOME_TAX_PAYABLE', amount: totals.in_income_tax },
    { side: 'CREDIT', account_role: 'IN_COUNTY_TAX_PAYABLE', amount: totals.in_county_tax },
    { side: 'CREDIT', account_role: 'NC_INCOME_TAX_PAYABLE', amount: totals.nc_income_tax },
    { side: 'CREDIT', account_role: 'GA_INCOME_TAX_PAYABLE', amount: totals.ga_income_tax },
    { side: 'CREDIT', account_role: 'KY_INCOME_TAX_PAYABLE', amount: totals.ky_income_tax },
    { side: 'CREDIT', account_role: 'MS_INCOME_TAX_PAYABLE', amount: totals.ms_income_tax },
    { side: 'CREDIT', account_role: 'UT_INCOME_TAX_PAYABLE', amount: totals.ut_income_tax },
    { side: 'CREDIT', account_role: 'MN_INCOME_TAX_PAYABLE', amount: totals.mn_income_tax },
    { side: 'CREDIT', account_role: 'MT_INCOME_TAX_PAYABLE', amount: totals.mt_income_tax },
    { side: 'CREDIT', account_role: 'ND_INCOME_TAX_PAYABLE', amount: totals.nd_income_tax },
    { side: 'CREDIT', account_role: 'OK_INCOME_TAX_PAYABLE', amount: totals.ok_income_tax },
    { side: 'CREDIT', account_role: 'RI_INCOME_TAX_PAYABLE', amount: totals.ri_income_tax },
    { side: 'CREDIT', account_role: 'VA_INCOME_TAX_PAYABLE', amount: totals.va_income_tax },
    { side: 'CREDIT', account_role: 'MA_INCOME_TAX_PAYABLE', amount: totals.ma_income_tax },
    { side: 'CREDIT', account_role: 'MO_INCOME_TAX_PAYABLE', amount: totals.mo_income_tax },
    { side: 'CREDIT', account_role: 'NE_INCOME_TAX_PAYABLE', amount: totals.ne_income_tax },
    { side: 'CREDIT', account_role: 'SC_INCOME_TAX_PAYABLE', amount: totals.sc_income_tax },
    { side: 'CREDIT', account_role: 'VT_INCOME_TAX_PAYABLE', amount: totals.vt_income_tax },
    { side: 'CREDIT', account_role: 'WV_INCOME_TAX_PAYABLE', amount: totals.wv_income_tax },
    { side: 'CREDIT', account_role: 'KS_INCOME_TAX_PAYABLE', amount: totals.ks_income_tax },
    { side: 'CREDIT', account_role: 'ID_INCOME_TAX_PAYABLE', amount: totals.id_income_tax },
    { side: 'CREDIT', account_role: 'NM_INCOME_TAX_PAYABLE', amount: totals.nm_income_tax },
    { side: 'CREDIT', account_role: 'AR_INCOME_TAX_PAYABLE', amount: totals.ar_income_tax },
    { side: 'CREDIT', account_role: 'HI_INCOME_TAX_PAYABLE', amount: totals.hi_income_tax },
    { side: 'CREDIT', account_role: 'OH_INCOME_TAX_PAYABLE', amount: totals.oh_income_tax },
    { side: 'CREDIT', account_role: 'LA_INCOME_TAX_PAYABLE', amount: totals.la_income_tax },
    { side: 'CREDIT', account_role: 'IA_INCOME_TAX_PAYABLE', amount: totals.ia_income_tax },
    { side: 'CREDIT', account_role: 'AL_INCOME_TAX_PAYABLE', amount: totals.al_income_tax },
    { side: 'CREDIT', account_role: 'MD_INCOME_TAX_PAYABLE', amount: totals.md_income_tax },
    { side: 'CREDIT', account_role: 'MD_COUNTY_TAX_PAYABLE', amount: totals.md_county_tax },
    { side: 'CREDIT', account_role: 'CT_INCOME_TAX_PAYABLE', amount: totals.ct_income_tax },
    { side: 'CREDIT', account_role: 'DE_INCOME_TAX_PAYABLE', amount: totals.de_income_tax },
    { side: 'CREDIT', account_role: 'DC_INCOME_TAX_PAYABLE', amount: totals.dc_income_tax },
    { side: 'CREDIT', account_role: 'WI_INCOME_TAX_PAYABLE', amount: totals.wi_income_tax },
    { side: 'CREDIT', account_role: 'ME_INCOME_TAX_PAYABLE', amount: totals.me_income_tax },
    { side: 'CREDIT', account_role: 'CT_PAID_LEAVE_PAYABLE', amount: totals.ct_paid_leave },
    { side: 'CREDIT', account_role: 'DE_PAID_LEAVE_PAYABLE', amount: totals.de_paid_leave },
    { side: 'CREDIT', account_role: 'HI_TDI_PAYABLE', amount: totals.hi_tdi },
    { side: 'CREDIT', account_role: 'MA_PFML_PAYABLE', amount: totals.ma_pfml },
    { side: 'CREDIT', account_role: 'VT_CCC_PAYABLE', amount: totals.vt_ccc_employee },
    { side: 'CREDIT', account_role: 'ME_PFML_PAYABLE', amount: totals.me_pfml },
    { side: 'CREDIT', account_role: 'EMPLOYEE_PRETAX_DEDUCTIONS_PAYABLE', amount: totals.pretax_deductions }
  ].filter(line => line.amount !== 0) as UsJournalLine[];

  const journalDebits = sum(journal.filter(l => l.side === 'DEBIT').map(l => l.amount));
  const journalCredits = sum(journal.filter(l => l.side === 'CREDIT').map(l => l.amount));

  return {
    rule_pack_id: p.id,
    country_code: 'US',
    currency: 'USD',
    status: 'PREPARED',
    pay_period_start: input.pay_period_start,
    pay_period_end: input.pay_period_end,
    pay_date: input.pay_date,
    employees,
    totals,
    journal,
    controls: {
      journal_balanced: journalDebits === journalCredits,
      journal_debits: journalDebits,
      journal_credits: journalCredits,
      employee_count: employees.length
    },
    limitations: [...p.limitations]
  };
}

export function payrollEngineSelfTestUS() {
  const p = PAYROLL_RULE_PACK_US;

  // Case 1: single filer, biweekly, no allowances, well under all ceilings.
  // Verified by hand against the 2026 Pub 15-T biweekly-equivalent (via the
  // annual STANDARD Single/MFS table) and the 2026 EDD Method B biweekly
  // Single table.
  const sample = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-14',
    pay_date: '2026-08-14',
    employees: [
      {
        employee_id: 'E001',
        gross_pay: 2000,
        pay_frequency: 'BIWEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 20000,
        ytd_medicare_wages_before: 20000,
        ytd_futa_wages_before: 7000,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 1
      }
    ]
  });
  const s1 = sample.employees[0];
  // FICA: SS = 2000*6.2% = 124.00 (both sides); Medicare = 2000*1.45% = 29.00 (both sides).
  const expectedSs = 124.0;
  const expectedMedicare = 29.0;
  // FUTA: ytd already at the $7,000 ceiling -> $0 this period.
  const expectedFuta = 0;
  // Federal: annualized wage = 2000*26 = 52000; step2 not checked -> subtract 8600 -> 43400.
  // STANDARD Single/MFS bracket 19900-57900 (12%): 1240 + 12%*(43400-19900) = 1240+2820 = 4060.00 annual -> /26 = 156.1538 -> 156.15.
  const expectedFederal = 156.15;
  // CA: gross 2000 > weekly... wait BIWEEKLY low-income exemption Single = 727, gross 2000 > 727 so taxable.
  // No estimated deduction allowances. Standard deduction (biweekly, single) = 219 -> taxable = 2000-219 = 1781.
  // BIWEEKLY Single bracket: 1010-1594 -> no, 1781 falls in [1594,2214) actually check: brackets 1010,1594,2214...
  // row for 1781: at least 1594, base 43.24, rate 6.6% -> 43.24 + 0.066*(1781-1594) = 43.24 + 12.342 = 55.582 -> 55.58
  // credit: 1 allowance * 6.47 = 6.47 -> 55.58-6.47 = 49.11
  const expectedCa = 49.11;
  const expectedSdi = money(2000 * 0.013);

  // Case 2: married filing jointly, monthly, Step 2 checkbox checked, crossing the SS wage base mid-period.
  const ssCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E002',
        gross_pay: 20000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: true,
        ytd_ss_wages_before: 180000,
        ytd_medicare_wages_before: 180000,
        ytd_futa_wages_before: 7000,
        state: 'CA',
        ca_filing_status: 'MARRIED_2_OR_MORE',
        ca_regular_allowances: 2
      }
    ]
  });
  const s2 = ssCase.employees[0];
  const expectedSsRoom = money((184500 - 180000) * 0.062); // room to ceiling = 4500 -> 279.00
  // Additional Medicare: ytd 180000+20000=200000, threshold 200000 -> extra = max(0,200000-200000)=0.
  const expectedAdditionalMedicare = 0;

  // Case 3: Additional Medicare Tax actually triggers mid-period.
  const addlMedicareCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E003',
        gross_pay: 20000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 200000,
        ytd_medicare_wages_before: 195000,
        ytd_futa_wages_before: 7000,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const s3 = addlMedicareCase.employees[0];
  // ytd_medicare_before 195000 + 20000 = 215000; threshold 200000 -> extra = 215000-200000=15000 -> *0.9%=135.00
  const expectedAddlMedicare3 = money(15000 * 0.009);
  // SS already at/above ceiling (200000 >= 184500) -> $0 employee/employer SS this period.

  // Case 4: pre-tax 401(k) + Section 125 split. Gross 5000, 401k 300 (reduces
  // income-tax wages only), Section 125 200 (reduces income-tax AND FICA/SDI wages).
  // federalTaxableWages = 5000-300-200 = 4500; ficaAndFutaWages = 5000-200 = 4800.
  const pretaxCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E004',
        gross_pay: 5000,
        pretax_401k_deferral: 300,
        pretax_section125_deduction: 200,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const s4 = pretaxCase.employees[0];
  const expectedFicaWages4 = 4800; // 5000 - 200 (401k stays FICA-taxable, Section 125 doesn't)
  const expectedFederalTaxableWages4 = 4500; // 5000 - 300 - 200
  const expectedSs4 = money(4800 * 0.062);
  const expectedMedicare4 = money(4800 * 0.0145);

  // Case 5: Married Filing Jointly, weekly, CA MARRIED_2_OR_MORE with 2 allowances.
  // Federal: annualized 1500*52=78000, minus MFJ step2-not-checked 12900 -> 65100.
  // MFJ bracket [44100,2480,12%]: 2480+0.12*(65100-44100)=5000.00 annual -> /52=96.1538->96.15.
  // CA: weekly low-income exemption (married 2+) 727 < 1500, taxable. Standard deduction
  // (weekly) 219 -> 1500-219=1281. MARRIED bracket [1010,17.54,4.4%]: 17.54+0.044*(1281-1010)=29.46.
  // Credit: 2 * 3.24 = 6.48 -> 29.46-6.48=22.98.
  const mfjCase = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E005',
        gross_pay: 1500,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'MARRIED_2_OR_MORE',
        ca_regular_allowances: 2
      }
    ]
  });
  const s5 = mfjCase.employees[0];
  const expectedFederal5 = 96.15;
  const expectedCa5 = 22.98;

  // Case 6: Head of Household, semimonthly, CA HEAD_OF_HOUSEHOLD with 1 allowance.
  // Federal: annualized 3000*24=72000, minus HOH step2-not-checked "other" 8600 -> 63400.
  // HOH bracket [33250,1770,12%]: 1770+0.12*(63400-33250)=5388.00 annual -> /24=224.50.
  // CA: semimonthly low-income exemption (HOH) 1575 < 3000, taxable. Standard deduction
  // (semimonthly) 476 -> 3000-476=2524. HEAD_OF_HOUSEHOLD bracket [2189,37.99,4.4%]:
  // 37.99+0.044*(2524-2189)=52.73. Credit: 1 * 7.01 -> 52.73-7.01=45.72.
  const hohCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-15',
    pay_date: '2026-08-15',
    employees: [
      {
        employee_id: 'E006',
        gross_pay: 3000,
        pay_frequency: 'SEMIMONTHLY',
        federal_filing_status: 'HOH',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'HEAD_OF_HOUSEHOLD',
        ca_regular_allowances: 1
      }
    ]
  });
  const s6 = hohCase.employees[0];
  const expectedFederal6 = 224.5;
  const expectedCa6 = 45.72;

  // Case 7: multi-employee run — verifies totals aggregate linearly across two
  // employees with different pay frequencies, filing statuses, and CA statuses,
  // by comparing the combined run's totals against the same two employees run
  // individually and summed by hand.
  const multiA = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E007A',
        gross_pay: 1200,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const multiB = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E007B',
        gross_pay: 2600,
        pay_frequency: 'BIWEEKLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'MARRIED_0_OR_1',
        ca_regular_allowances: 1
      }
    ]
  });
  const multiAB = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [{
      employee_id: 'E007A',
      gross_pay: 1200,
      pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS',
      federal_step2_checkbox: false,
      ytd_ss_wages_before: 0,
      ytd_medicare_wages_before: 0,
      ytd_futa_wages_before: 0,
      state: 'CA',
      ca_filing_status: 'SINGLE',
      ca_regular_allowances: 0
    }, {
      employee_id: 'E007B',
      gross_pay: 2600,
      pay_frequency: 'BIWEEKLY',
      federal_filing_status: 'MFJ',
      federal_step2_checkbox: false,
      ytd_ss_wages_before: 0,
      ytd_medicare_wages_before: 0,
      ytd_futa_wages_before: 0,
      state: 'CA',
      ca_filing_status: 'MARRIED_0_OR_1',
      ca_regular_allowances: 1
    }]
  });
  const expectedCombinedGross = money(multiA.totals.gross_pay + multiB.totals.gross_pay);
  const expectedCombinedFederal = money(multiA.totals.federal_income_tax + multiB.totals.federal_income_tax);
  const expectedCombinedCa = money(multiA.totals.ca_income_tax + multiB.totals.ca_income_tax);
  const expectedCombinedNet = money(multiA.totals.net_pay + multiB.totals.net_pay);

  // Case 8: Worksheet 1A Step 3/4(a)/4(b) fields (credits, other income, extra
  // deductions) all non-zero, single filer, monthly.
  // annualized 6000*12=72000, +step4a 2400=74400, -(step4b 3000 + 8600)=62800.
  // SINGLE_MFS bracket [57900,5800,22%]: 5800+0.22*(62800-57900)=6878.00 annual.
  // /12=573.17 tentative. Credits 1200/12=100.00 -> 573.17-100.00=473.17.
  const creditsCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E008',
        gross_pay: 6000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        federal_step3_annual_credits: 1200,
        federal_step4a_annual_other_income: 2400,
        federal_step4b_annual_deductions: 3000,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'CA',
        ca_filing_status: 'SINGLE',
        ca_regular_allowances: 0
      }
    ]
  });
  const s8 = creditsCase.employees[0];
  const expectedFederal8 = 473.17;

  // Case 9: New Jersey, Rate Table A (Single), weekly, 1 allowance.
  // Allowance value weekly = 19.20 -> subject = 1000-19.20 = 980.80.
  // Rate A weekly bracket [769,15.28,6.1%] (corrected, see rule-pack comment
  // above): 15.28+0.061*(980.80-769)=28.1998 -> 28.20.
  const njCaseA = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E009',
        gross_pay: 1000,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NJ',
        nj_rate_table: 'A',
        nj_allowances: 1
      }
    ]
  });
  const s9 = njCaseA.employees[0];
  const expectedNjIncomeTax9 = 28.2;
  const expectedNjUiWfSwf9 = money(1000 * 0.00425);
  const expectedNjTdi9 = money(1000 * 0.0019);
  const expectedNjFli9 = money(1000 * 0.0023);

  // Case 10: New Jersey, Rate Table B (Married/CU Couple Joint), biweekly, 2 allowances.
  // Allowance value biweekly = 38.40*2 = 76.80 -> subject = 3000-76.80 = 2923.20.
  // Rate B biweekly bracket [2692,55,3.9%]: 55+0.039*(2923.20-2692)=64.02.
  const njCaseB = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-16',
    pay_date: '2026-08-16',
    employees: [
      {
        employee_id: 'E010',
        gross_pay: 3000,
        pay_frequency: 'BIWEEKLY',
        federal_filing_status: 'MFJ',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NJ',
        nj_rate_table: 'B',
        nj_allowances: 2
      }
    ]
  });
  const s10 = njCaseB.employees[0];
  const expectedNjIncomeTax10 = 64.02;

  // Case 11: NJ UI/WF/SWF and TDI/FLI wage-base ceilings crossed mid-period.
  // UI/WF room = 44800-40000=4800 (< gross 10000) -> 4800*0.00425=20.40.
  // TDI/FLI room = 171100-165000=6100 -> TDI 6100*0.0019=11.59, FLI 6100*0.0023=14.03.
  const njCeilingCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-31',
    pay_date: '2026-08-31',
    employees: [
      {
        employee_id: 'E011',
        gross_pay: 10000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NJ',
        nj_rate_table: 'A',
        nj_allowances: 0,
        ytd_nj_ui_wf_wages_before: 40000,
        ytd_nj_tdi_fli_wages_before: 165000
      }
    ]
  });
  const s11 = njCeilingCase.employees[0];
  const expectedNjUiWfSwf11 = money(4800 * 0.00425);
  const expectedNjTdi11 = money(6100 * 0.0019);
  const expectedNjFli11 = money(6100 * 0.0023);

  // Case 12: New York, weekly, Single, 3 allowances, NYC resident, Yonkers
  // resident. Hand-derived directly against the worked examples in the
  // official NYS-50-T-NYS/NYC/Y publications (Method II, page 16/25/16):
  // deduction+exemption 200.05 -> net 199.95; NY state tax $8.01 (table
  // line2: (199.95-163)*0.044+6.38); NYC tax $6.11 (deduction 153.90 ->
  // net 246.10, table line3: (246.10-167)*0.0325+3.54); Yonkers resident
  // surcharge = $8.01 * 16.75% = $1.34.
  const nyCaseSingle = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E012',
        gross_pay: 400,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NY',
        ny_filing_status: 'SINGLE',
        ny_allowances: 3,
        ny_nyc_resident: true,
        ny_yonkers_resident: true
      }
    ]
  });
  const s12 = nyCaseSingle.employees[0];
  const expectedNyIncomeTax12 = 8.01;
  const expectedNycIncomeTax12 = 6.11;
  const expectedYonkersTax12 = 1.34;

  // Case 13: New York, weekly, $200 gross, Yonkers NONRESIDENT workplace.
  // Hand-derived against the NYS-50-T-Y Method VII worked example: wages
  // 200 is in the [192,385) bracket, exemption 38 -> (200-38)*0.005=0.81.
  const nyCaseYonkersNonresident = calculateUsPayroll({
    pay_period_start: '2026-08-03',
    pay_period_end: '2026-08-09',
    pay_date: '2026-08-09',
    employees: [
      {
        employee_id: 'E013',
        gross_pay: 200,
        pay_frequency: 'WEEKLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'NY',
        ny_filing_status: 'SINGLE',
        ny_allowances: 0,
        ny_yonkers_nonresident_workplace: true
      }
    ]
  });
  const s13 = nyCaseYonkersNonresident.employees[0];
  const expectedYonkersTax13 = 0.81;

  // Case 15 (v6): NY PFL, ordinary case + dollar-cap crossing, plus NY DBL.
  // PFL rate 0.432% is unconditional for every NY employee.
  const nyPflOrdinary = calculateUsPayroll({
    pay_period_start: '2026-08-03', pay_period_end: '2026-08-09', pay_date: '2026-08-09',
    employees: [{
      employee_id: 'E015', gross_pay: 1000, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NY', ny_filing_status: 'SINGLE', ny_allowances: 0,
      ny_dbl_opt_in: true
    }]
  });
  const s15 = nyPflOrdinary.employees[0];
  // PFL: 1000 * 0.432% = 4.32, well under the $411.91 annual cap.
  const expectedNyPfl15 = 4.32;
  // DBL: min(1000*0.5%, 0.60) = min(5.00, 0.60) = 0.60 (capped).
  const expectedNyDbl15 = 0.6;

  // Case 16: NY PFL dollar-cap crossing mid-year — YTD PFL tax already at
  // $410.00, only $1.91 of room left before hitting the $411.91 annual cap.
  const nyPflCapCrossing = calculateUsPayroll({
    pay_period_start: '2026-12-01', pay_period_end: '2026-12-07', pay_date: '2026-12-07',
    employees: [{
      employee_id: 'E016', gross_pay: 1000, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NY', ny_filing_status: 'SINGLE', ny_allowances: 0,
      ytd_ny_pfl_tax_before: 410
    }]
  });
  const s16 = nyPflCapCrossing.employees[0];
  const expectedNyPfl16 = 1.91;

  // Case 14: one multi-employee run covering all 8 v5 state tiers at once —
  // IL, PA, MI, CO, AZ, AK, WA, and one no-tax/no-employee-levy state (TX).
  // All expected values hand-derived directly from this file's own v5
  // rule-pack constants (illinois/pennsylvania/michigan/colorado/arizona/
  // alaska/washington), not against any external worked example — these
  // seven states' figures come from a secondary reference, not an official
  // publication with its own worked examples the way NY's did.
  const multiStateCase = calculateUsPayroll({
    pay_period_start: '2026-08-01',
    pay_period_end: '2026-08-14',
    pay_date: '2026-08-14',
    employees: [
      { employee_id: 'IL1', gross_pay: 1000, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IL', il_line1_allowances: 1, il_line2_allowances: 0 },
      { employee_id: 'PA1', gross_pay: 1000, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'PA' },
      { employee_id: 'MI1', gross_pay: 1000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MI', mi_personal_exemptions: 1 },
      { employee_id: 'CO1', gross_pay: 2000, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'CO', co_filing_status: 'OTHER' },
      { employee_id: 'AZ1', gross_pay: 1500, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'AZ', az_election_percent: 2.5 },
      { employee_id: 'AK1', gross_pay: 1200, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'AK' },
      { employee_id: 'WA1', gross_pay: 2000, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'WA' },
      { employee_id: 'TX1', gross_pay: 1000, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'TX' }
    ]
  });
  const [sIl, sPa, sMi, sCo, sAz, sAk, sWa, sTx] = multiStateCase.employees;
  // IL: (1000 - 2925/52) * 4.95% = (1000 - 56.25) * 0.0495 = 46.72 (943.75*0.0495=46.715625)
  const expectedIl = 46.72;
  // PA: 1000*3.07% = 30.70; UC 1000*0.07% = 0.70
  const expectedPaIncomeTax = 30.7;
  const expectedPaUc = 0.7;
  // MI: (1000 - 5900/12) * 4.25% = (1000 - 491.67) * 0.0425 = 508.33*0.0425 = 21.60
  const expectedMi = 21.6;
  // CO: annualize 2000*26=52000; -5500=46500; *4.4%=2046.00; /26=78.69
  const expectedCoIncomeTax = 78.69;
  // CO FAMLI: 2000*0.44% = 8.80
  const expectedCoFamli = 8.8;
  // AZ: 1500*2.5% = 37.50
  const expectedAz = 37.5;
  // AK UI: 1200*0.5% = 6.00 (well under the $54,200 annual cap)
  const expectedAkUi = 6.0;
  // WA PFML: 2000 * (1.13% * 71.43%) = 2000*0.00807159 = 16.14318 -> 16.14
  const expectedWaPfml = 16.14;
  // WA Cares: 2000*0.58% = 11.60
  const expectedWaCares = 11.6;

  // Case 17 (v7): golden-payslip fixtures from a user-supplied third-party
  // QA pack ("US_2026_Payroll_Golden_Payslip_QA_Pack.pdf"), checked
  // directly against ITS published expected cents, independent of this
  // file's own hand-derivations elsewhere. This is the highest-confidence
  // test tier in this file for the fields it covers, because the fixture's
  // own calculation trace was cross-checked line by line against this
  // engine's actual output (not just against this file's own constants) —
  // that process is exactly what found and fixed the NJ $769 bracket bug
  // documented above. One fixture (CA monthly $10,000/Single/0 allowances)
  // is DELIBERATELY NOT asserted to the fixture's own number: the fixture
  // computes CA PIT via EDD's optional "annualize then divide by periods"
  // method ($647.90), while this engine uses EDD's primary period-specific
  // Method B table (Tables 5-28), giving $647.84 for the same inputs. Both
  // are legitimate EDD-documented methods that can diverge by a few cents
  // at the margin due to where rounding happens in the chain; this is
  // asserted against this engine's own correct-per-primary-method result,
  // not the fixture's alternate-method result — see the california comment
  // block above for the full reasoning.
  const goldenCa = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-CA', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'CA', ca_filing_status: 'SINGLE', ca_regular_allowances: 0
    }]
  });
  const sGoldCa = goldenCa.employees[0];

  const goldenNy = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-NY', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NY', ny_filing_status: 'SINGLE', ny_allowances: 0, ny_nyc_resident: true
    }]
  });
  const sGoldNy = goldenNy.employees[0];

  const goldenPa = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-PA', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'PA'
    }]
  });
  const sGoldPa = goldenPa.employees[0];

  const goldenWa = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-WA', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'WA'
    }]
  });
  const sGoldWa = goldenWa.employees[0];

  const goldenCo = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-CO', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'CO', co_filing_status: 'OTHER'
    }]
  });
  const sGoldCo = goldenCo.employees[0];

  const goldenNj = calculateUsPayroll({
    pay_period_start: '2026-09-21', pay_period_end: '2026-09-25', pay_date: '2026-09-25',
    employees: [{
      employee_id: 'GOLD-NJ', gross_pay: 1200, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NJ', nj_rate_table: 'A', nj_allowances: 1
    }]
  });
  const sGoldNj = goldenNj.employees[0];

  const goldenFedCap = calculateUsPayroll({
    pay_period_start: '2026-12-01', pay_period_end: '2026-12-31', pay_date: '2026-12-31',
    employees: [{
      employee_id: 'GOLD-FEDCAP', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 180000, ytd_medicare_wages_before: 195000, ytd_futa_wages_before: 7000,
      state: 'TX'
    }]
  });
  const sGoldFedCap = goldenFedCap.employees[0];

  // v8: golden fixtures for the two new local-tax overlays, plus the
  // fixture pack's own EDGE-PHL-EFFECTIVE-DATE regression vector.
  const goldenPaPhl = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-PA-PHL', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'PA', pa_philadelphia_resident: true
    }]
  });
  const sGoldPaPhl = goldenPaPhl.employees[0];

  const phlEffectiveDateEdge = calculateUsPayroll({
    pay_period_start: '2026-06-01', pay_period_end: '2026-06-30', pay_date: '2026-06-30',
    employees: [{
      employee_id: 'EDGE-PHL', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'PA', pa_philadelphia_resident: true
    }]
  });
  const sPhlEdge = phlEffectiveDateEdge.employees[0];

  const goldenCoDen = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-CO-DEN', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'CO', co_filing_status: 'OTHER', co_denver_employee: true
    }]
  });
  const sGoldCoDen = goldenCoDen.employees[0];

  // v9: Oregon — first genuinely new state added since v5, built from two
  // independently-corroborating sources (Oregon DOR's own 2026 publication
  // via text-extraction proxy + USDA NFC's 2025 federal payroll bulletin)
  // rather than rejected outright, per explicit user instruction to find a
  // way to implement it correctly instead of giving up on it.
  const goldenOr = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'GOLD-OR', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'OR', or_filing_status: 'SINGLE', or_allowances: 0
    }]
  });
  const sGoldOr = goldenOr.employees[0];

  // EDGE-OR-PAID-LEAVE-CAP: $180,000 YTD Paid Leave wages before this
  // $10,000 check leaves only $4,500 of room under the $184,500 cap.
  const orPaidLeaveCapEdge = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{
      employee_id: 'EDGE-OR-PL', gross_pay: 10000, pay_frequency: 'MONTHLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'OR', or_filing_status: 'SINGLE', or_allowances: 0,
      ytd_or_paid_leave_wages_before: 180000
    }]
  });
  const sOrPlEdge = orPaidLeaveCapEdge.employees[0];

  // v10: Indiana and North Carolina, each checked against that state's OWN
  // official worked example (not a hand-derived self-test).
  const inWorkedExample = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-07', pay_date: '2026-09-07',
    employees: [{
      employee_id: 'IN-WORKED', gross_pay: 800, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'IN', in_personal_exemptions: 5, in_dependent_exemptions: 4, in_adopted_child_exemptions: 2,
      in_county: 'Harrison'
    }]
  });
  const sInWorked = inWorkedExample.employees[0];

  const ncWorkedExample = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-07', pay_date: '2026-09-07',
    employees: [{
      employee_id: 'NC-WORKED', gross_pay: 450, pay_frequency: 'WEEKLY',
      federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false,
      ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0,
      state: 'NC', nc_filing_status: 'SINGLE_MARRIED_OR_SURVIVING_SPOUSE', nc_allowances: 2
    }]
  });
  const sNcWorked = ncWorkedExample.employees[0];

  // v11: ten more states (GA, KY, MS, UT, MN, MT, ND, OK, RI, VA), each
  // single-sourced from an NFC bulletin — no official worked example
  // available for these, so these self-tests are hand-derived bracket-math
  // checks (same status as this file's very first self-tests), not
  // fixture-verified like OR/IN/NC. $10,000/month, base filing status.
  const v11Case = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [
      { employee_id: 'GA1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'GA', ga_filing_status: 'SINGLE_OR_HOH', ga_dependents: 0 },
      { employee_id: 'KY1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'KY' },
      { employee_id: 'MT1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MT', mt_filing_status: 'SINGLE_OR_MFS_OR_BOTH_WORKING' },
      { employee_id: 'RI1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'RI' },
      { employee_id: 'MS1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MS', ms_filing_status: 'SINGLE', ms_dependents: 0 },
      { employee_id: 'UT1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'UT', ut_filing_status: 'SINGLE' },
      { employee_id: 'MN1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MN', mn_filing_status: 'SINGLE', mn_allowances: 0 },
      { employee_id: 'ND1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'ND', nd_filing_status: 'SINGLE_OR_MFS', nd_exemptions: 0 },
      { employee_id: 'OK1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'OK', ok_filing_status: 'SINGLE_OR_HOH', ok_exemptions: 0 },
      { employee_id: 'VA1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'VA', va_exemptions: 0 }
    ]
  });
  const [sGa1, sKy1, sMt1, sRi1, sMs1, sUt1, sMn1, sNd1, sOk1, sVa1] = v11Case.employees;
  const expectedGa1 = 436.63;
  const expectedKy1 = 340.2;
  const expectedMt1 = 451.63;

  // v12: eleven more states, same single-source tier as v11. Four
  // hand-verified against manual bracket arithmetic (MO, HI, SC, AR); the
  // rest checked only for journal balance and positive tax output.
  const v12Case = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [
      { employee_id: 'MA1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MA', ma_exemptions: 0 },
      { employee_id: 'MO1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MO', mo_filing_status: 'SINGLE_OR_MFS_OR_MARRIED_SPOUSE_WORKS' },
      { employee_id: 'NE1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'NE', ne_filing_status: 'SINGLE_OR_HOH', ne_allowances: 0 },
      { employee_id: 'SC1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'SC', sc_allowances: 0 },
      { employee_id: 'VT1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'VT', vt_filing_status: 'SINGLE_OR_HOH', vt_allowances: 0 },
      { employee_id: 'WV1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'WV', wv_filing_status: 'ONE_EARNER_ONE_JOB', wv_exemptions: 0 },
      { employee_id: 'KS1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'KS', ks_filing_status: 'SINGLE_OR_HOH', ks_exemptions: 1 },
      { employee_id: 'ID1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'ID', id_filing_status: 'SINGLE', id_exemptions: 0 },
      { employee_id: 'NM1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'NM', nm_filing_status: 'SINGLE' },
      { employee_id: 'AR1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'AR', ar_exemptions: 0 },
      { employee_id: 'HI1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'HI', hi_filing_status: 'SINGLE_OR_HOH', hi_exemptions: 0 }
    ]
  });
  const [sMa1, sMo1, sNe1, sSc1, sVt1, sWv1, sKs1, sId1, sNm1, sAr1, sHi1] = v12Case.employees;
  const expectedMo1 = 391.9;
  // v21: SC1 recomputed after the standard-deduction-gating bug fix
  // (sc_allowances: 0 now correctly zeroes both the personal allowance
  // and the standard deduction per SC's own WH-1603F formula, instead of
  // always applying the capped standard deduction) — $507.83 was the
  // pre-fix (buggy, overstated-deduction) figure.
  const expectedSc1 = 545.32;
  const expectedAr1 = 355.73;
  const expectedHi1 = 640.03;

  // v13: Ohio, Louisiana, Iowa, Alabama. Iowa is checked against ALL 6 of
  // its own official worked examples (from Iowa DOR's own formula
  // publication, the same confidence tier as OR/IN/NC); OH/LA/AL are
  // hand-verified bracket-math checks.
  const iaEx1 = calculateUsPayroll({ pay_period_start: '2026-09-01', pay_period_end: '2026-09-14', pay_date: '2026-09-14', employees: [{ employee_id: 'IA1', gross_pay: 2100, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IA', ia_marital_status: 'OTHER_OR_MFJ_SPOUSE_WORKS', ia_allowance_amount: 40 }] });
  const iaEx2 = calculateUsPayroll({ pay_period_start: '2026-09-01', pay_period_end: '2026-09-14', pay_date: '2026-09-14', employees: [{ employee_id: 'IA2', gross_pay: 2100, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IA', ia_marital_status: 'MFJ_SPOUSE_NO_EARNED_INCOME', ia_allowance_amount: 80 }] });
  const iaEx3 = calculateUsPayroll({ pay_period_start: '2026-09-01', pay_period_end: '2026-09-14', pay_date: '2026-09-14', employees: [{ employee_id: 'IA3', gross_pay: 2100, pay_frequency: 'BIWEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IA', ia_marital_status: 'HEAD_OF_HOUSEHOLD', ia_allowance_amount: 160 }] });
  const iaEx4 = calculateUsPayroll({ pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30', employees: [{ employee_id: 'IA4', gross_pay: 5000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IA', ia_marital_status: 'OTHER_OR_MFJ_SPOUSE_WORKS', ia_allowance_amount: 40 }] });
  const iaEx5 = calculateUsPayroll({ pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30', employees: [{ employee_id: 'IA5', gross_pay: 5000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IA', ia_marital_status: 'MFJ_SPOUSE_NO_EARNED_INCOME', ia_allowance_amount: 80 }] });
  const iaEx6 = calculateUsPayroll({ pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30', employees: [{ employee_id: 'IA6', gross_pay: 5000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'IA', ia_marital_status: 'HEAD_OF_HOUSEHOLD', ia_allowance_amount: 160 }] });

  const v13Case = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [
      { employee_id: 'OH1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'OH', oh_exemptions: 0 },
      { employee_id: 'LA1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'LA', la_filing_status: 'SINGLE_OR_MFS' },
      { employee_id: 'AL1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'AL', al_filing_status: 'SINGLE', al_dependents: 0 }
    ]
  });
  const [sOh1, sLa1, sAl1] = v13Case.employees;
  // v18: updated for Ohio's 2026-08-01 revised per-period tables.
  // MONTHLY, 0 exemptions, $10,000 gross: taxable $10,000 falls in the
  // >$8,333.33 bracket: $218.99 + 3.400% * ($10,000-$8,333.33)
  // = $218.99 + $56.67 (rounded) = $275.66.
  const expectedOh1 = 275.66;
  const expectedLa1 = 275.85;
  // v21: AL1 recomputed after fixing the missing federal-tax-deduction
  // line (Alabama's own withholding booklet step 2B) — $480 was the
  // pre-fix (buggy, understated-deduction) figure.
  const expectedAl1 = 406.79;

  // v14: Maryland (flat + graduated counties) and Connecticut (code A/D
  // phase-out + recapture), both hand-verified against bracket-math
  // computed by hand, including the Anne Arundel graduated county table.
  const v14Case = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [
      { employee_id: 'MD1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MD', md_filing_status: 'SINGLE', md_exemptions: 0, md_county: 'Baltimore County' },
      { employee_id: 'MD2', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'MD', md_filing_status: 'SINGLE', md_exemptions: 0, md_county: 'Anne Arundel' },
      { employee_id: 'CT1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'CT', ct_withholding_code: 'A_OR_D' }
    ]
  });
  const [sMd1, sMd2, sCt1] = v14Case.employees;
  const expectedMd1State = 465;
  const expectedMd1County = 310.93;
  const expectedMd2County = 275.67;
  const expectedCt1 = 525;

  // v15: Delaware, hand-verified against bracket-math computed by hand.
  const deCase = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'DE1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'DE', de_filing_status: 'SINGLE_OR_MFS', de_exemptions: 1 }]
  });
  const sDe1 = deCase.employees[0];
  const expectedDe1 = 548.25;

  // v18: Ohio, re-verified against the DOT's own current (post-2026-08-01)
  // weekly table: $600 gross, 0 exemptions -> taxable $600 falls in the
  // >$500.96 bracket: $8.02 + 2.99%*(600-500.96) = $8.02+$2.9613 = $10.98.
  const ohV18Case = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-07', pay_date: '2026-09-07',
    employees: [{ employee_id: 'OHW1', gross_pay: 600, pay_frequency: 'WEEKLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'OH', oh_exemptions: 0 }]
  });
  const sOhV18 = ohV18Case.employees[0];
  const expectedOhV18 = 10.98;

  // v16: DC, hand-verified against bracket-math computed by hand.
  // annual wages 120000; dependent allowance 1*4300=4300; taxable 115700
  // falls in the [60000,3500,0.085] bracket: 3500+0.085*(115700-60000)
  // = 3500+4734.5 = 8234.5 annual; /12 = 686.2083... -> 686.21
  const dcCase = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-30', pay_date: '2026-09-30',
    employees: [{ employee_id: 'DC1', gross_pay: 10000, pay_frequency: 'MONTHLY', federal_filing_status: 'SINGLE_MFS', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'DC', dc_filing_status: 'S', dc_dependents: 1 }]
  });
  const sDc1 = dcCase.employees[0];
  const expectedDc1 = 686.21;

  // v17: Wisconsin, reproducing Publication W-166's own Example 3
  // (married, biweekly $1,000 wage, 3 exemptions) exactly: expected $22.08.
  const wiCase = calculateUsPayroll({
    pay_period_start: '2026-09-01', pay_period_end: '2026-09-14', pay_date: '2026-09-14',
    employees: [{ employee_id: 'WI1', gross_pay: 1000, pay_frequency: 'BIWEEKLY', federal_filing_status: 'MFJ', federal_step2_checkbox: false, ytd_ss_wages_before: 0, ytd_medicare_wages_before: 0, ytd_futa_wages_before: 0, state: 'WI', wi_filing_status: 'MARRIED', wi_exemptions: 3 }]
  });
  const sWi1 = wiCase.employees[0];
  const expectedWi1 = 22.08;

  const ok =
    s1.employee_social_security === expectedSs &&
    s1.employer_social_security === expectedSs &&
    s1.employee_medicare === expectedMedicare &&
    s1.employer_futa === expectedFuta &&
    s1.federal_income_tax === expectedFederal &&
    s1.ca_income_tax === expectedCa &&
    s1.ca_sdi === expectedSdi &&
    sample.controls.journal_balanced &&
    s2.employee_social_security === expectedSsRoom &&
    s2.employer_social_security === expectedSsRoom &&
    s2.employee_additional_medicare === expectedAdditionalMedicare &&
    ssCase.controls.journal_balanced &&
    s3.employee_social_security === 0 &&
    s3.employer_social_security === 0 &&
    s3.employee_additional_medicare === expectedAddlMedicare3 &&
    addlMedicareCase.controls.journal_balanced &&
    s4.fica_and_futa_wages === expectedFicaWages4 &&
    s4.federal_taxable_wages === expectedFederalTaxableWages4 &&
    s4.employee_social_security === expectedSs4 &&
    s4.employer_social_security === expectedSs4 &&
    s4.employee_medicare === expectedMedicare4 &&
    pretaxCase.controls.journal_balanced &&
    s5.federal_income_tax === expectedFederal5 &&
    s5.ca_income_tax === expectedCa5 &&
    mfjCase.controls.journal_balanced &&
    s6.federal_income_tax === expectedFederal6 &&
    s6.ca_income_tax === expectedCa6 &&
    hohCase.controls.journal_balanced &&
    multiAB.controls.employee_count === 2 &&
    multiAB.controls.journal_balanced &&
    multiAB.totals.gross_pay === expectedCombinedGross &&
    multiAB.totals.federal_income_tax === expectedCombinedFederal &&
    multiAB.totals.ca_income_tax === expectedCombinedCa &&
    multiAB.totals.net_pay === expectedCombinedNet &&
    s8.federal_income_tax === expectedFederal8 &&
    creditsCase.controls.journal_balanced &&
    s9.nj_income_tax === expectedNjIncomeTax9 &&
    s9.nj_ui_wf_swf === expectedNjUiWfSwf9 &&
    s9.nj_tdi === expectedNjTdi9 &&
    s9.nj_fli === expectedNjFli9 &&
    njCaseA.controls.journal_balanced &&
    s10.nj_income_tax === expectedNjIncomeTax10 &&
    njCaseB.controls.journal_balanced &&
    s11.nj_ui_wf_swf === expectedNjUiWfSwf11 &&
    s11.nj_tdi === expectedNjTdi11 &&
    s11.nj_fli === expectedNjFli11 &&
    njCeilingCase.controls.journal_balanced &&
    s12.ny_income_tax === expectedNyIncomeTax12 &&
    s12.nyc_income_tax === expectedNycIncomeTax12 &&
    s12.yonkers_tax === expectedYonkersTax12 &&
    nyCaseSingle.controls.journal_balanced &&
    s13.yonkers_tax === expectedYonkersTax13 &&
    nyCaseYonkersNonresident.controls.journal_balanced &&
    sIl.il_income_tax === expectedIl &&
    sPa.pa_income_tax === expectedPaIncomeTax &&
    sPa.pa_uc === expectedPaUc &&
    sMi.mi_income_tax === expectedMi &&
    sCo.co_income_tax === expectedCoIncomeTax &&
    sCo.co_famli === expectedCoFamli &&
    sAz.az_income_tax === expectedAz &&
    sAk.ak_ui === expectedAkUi &&
    sWa.wa_pfml === expectedWaPfml &&
    sWa.wa_cares === expectedWaCares &&
    sTx.federal_income_tax > 0 &&
    sTx.employee_social_security > 0 &&
    multiStateCase.controls.employee_count === 8 &&
    multiStateCase.controls.journal_balanced &&
    s15.ny_pfl === expectedNyPfl15 &&
    s15.ny_dbl === expectedNyDbl15 &&
    nyPflOrdinary.controls.journal_balanced &&
    s16.ny_pfl === expectedNyPfl16 &&
    nyPflCapCrossing.controls.journal_balanced &&
    sGoldCa.employee_social_security === 620 && sGoldCa.employee_medicare === 145 &&
    sGoldCa.ca_sdi === 130 && sGoldCa.ca_income_tax === 647.84 && goldenCa.controls.journal_balanced &&
    sGoldNy.ny_income_tax === 523.22 && sGoldNy.nyc_income_tax === 381.12 &&
    sGoldNy.ny_pfl === 43.2 && goldenNy.controls.journal_balanced &&
    sGoldPa.pa_income_tax === 307 && sGoldPa.pa_uc === 7 && goldenPa.controls.journal_balanced &&
    sGoldWa.wa_pfml === 80.72 && sGoldWa.wa_cares === 58 && goldenWa.controls.journal_balanced &&
    sGoldCo.co_income_tax === 419.83 && sGoldCo.co_famli === 44 && goldenCo.controls.journal_balanced &&
    sGoldNj.nj_income_tax === 40.4 && sGoldNj.federal_income_tax === 102.08 && goldenNj.controls.journal_balanced &&
    sGoldFedCap.employee_social_security === 279 && sGoldFedCap.employee_medicare === 145 &&
    sGoldFedCap.employee_additional_medicare === 45 && goldenFedCap.controls.journal_balanced &&
    sGoldPaPhl.phl_wage_tax === 373.5 && sGoldPaPhl.net_pay === 7083.33 && goldenPaPhl.controls.journal_balanced &&
    sPhlEdge.phl_wage_tax === 374 && phlEffectiveDateEdge.controls.journal_balanced &&
    sGoldCoDen.denver_opt_employee === 5.75 && sGoldCoDen.denver_opt_employer === 4.00 && sGoldCoDen.net_pay === 7301.25 && goldenCoDen.controls.journal_balanced &&
    sGoldOr.or_income_tax === 763.35 && sGoldOr.or_stt === 10 && sGoldOr.or_paid_leave_employee === 60 &&
    sGoldOr.net_pay === 6937.48 && goldenOr.controls.journal_balanced &&
    sOrPlEdge.or_paid_leave_employee === 27 && orPaidLeaveCapEdge.controls.journal_balanced &&
    sInWorked.in_income_tax === 13.96 && sInWorked.in_county_tax === 4.73 && inWorkedExample.controls.journal_balanced &&
    sNcWorked.nc_income_tax === 4 && ncWorkedExample.controls.journal_balanced &&
    sGa1.ga_income_tax === expectedGa1 && sKy1.ky_income_tax === expectedKy1 && sMt1.mt_income_tax === expectedMt1 &&
    v11Case.controls.employee_count === 10 && v11Case.controls.journal_balanced &&
    sRi1.ri_income_tax > 0 && sMs1.ms_income_tax > 0 && sUt1.ut_income_tax > 0 &&
    sMn1.mn_income_tax > 0 && sNd1.nd_income_tax > 0 && sOk1.ok_income_tax > 0 && sVa1.va_income_tax > 0 &&
    sMo1.mo_income_tax === expectedMo1 && sSc1.sc_income_tax === expectedSc1 &&
    sAr1.ar_income_tax === expectedAr1 && sHi1.hi_income_tax === expectedHi1 &&
    v12Case.controls.employee_count === 11 && v12Case.controls.journal_balanced &&
    sMa1.ma_income_tax > 0 && sNe1.ne_income_tax > 0 && sVt1.vt_income_tax > 0 &&
    sWv1.wv_income_tax > 0 && sKs1.ks_income_tax > 0 && sId1.id_income_tax > 0 && sNm1.nm_income_tax > 0 &&
    iaEx1.employees[0].ia_income_tax === 59.26 && iaEx2.employees[0].ia_income_tax === 38.72 &&
    iaEx3.employees[0].ia_income_tax === 45.15 && iaEx4.employees[0].ia_income_tax === 145.5 &&
    iaEx5.employees[0].ia_income_tax === 101 && iaEx6.employees[0].ia_income_tax === 114.92 &&
    sOh1.oh_income_tax === expectedOh1 && sLa1.la_income_tax === expectedLa1 && sAl1.al_income_tax === expectedAl1 &&
    v13Case.controls.journal_balanced &&
    sMd1.md_income_tax === expectedMd1State && sMd1.md_county_tax === expectedMd1County &&
    sMd2.md_county_tax === expectedMd2County && sCt1.ct_income_tax === expectedCt1 &&
    v14Case.controls.journal_balanced &&
    sDe1.de_income_tax === expectedDe1 && deCase.controls.journal_balanced &&
    sDc1.dc_income_tax === expectedDc1 && dcCase.controls.journal_balanced &&
    sWi1.wi_income_tax === expectedWi1 && wiCase.controls.journal_balanced &&
    sOhV18.oh_income_tax === expectedOhV18 && ohV18Case.controls.journal_balanced;

  // v19: SUI (State Unemployment Insurance, employer-only). Two employees
  // exercising (a) mid-year wage-base crossing within a period and (b)
  // omitting sui_rate/sui_wage_base entirely, to confirm backward
  // compatibility (employer_sui must be exactly 0 when omitted).
  const suiCase = calculateUsPayroll({
    pay_period_start: '2026-03-01',
    pay_period_end: '2026-03-31',
    pay_date: '2026-03-31',
    employees: [
      {
        // Hypothetical state SUI wage base $9,000 at a 3% experience rate,
        // YTD already at $8,200 -> only $800 of this period's $2,000 gross
        // remains taxable: 800 * 3% = 24.00.
        employee_id: 'SUI-001',
        gross_pay: 2000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 8200,
        ytd_medicare_wages_before: 8200,
        ytd_futa_wages_before: 7000,
        ytd_sui_wages_before: 8200,
        sui_rate: 0.03,
        sui_wage_base: 9000,
        state: 'TX'
      },
      {
        // No sui_rate/sui_wage_base supplied -> employer_sui must be 0,
        // exactly the pre-v19 behavior.
        employee_id: 'SUI-002',
        gross_pay: 2000,
        pay_frequency: 'MONTHLY',
        federal_filing_status: 'SINGLE_MFS',
        federal_step2_checkbox: false,
        ytd_ss_wages_before: 0,
        ytd_medicare_wages_before: 0,
        ytd_futa_wages_before: 0,
        state: 'TX'
      }
    ]
  });
  const sSui1 = suiCase.employees[0];
  const sSui2 = suiCase.employees[1];
  const expectedSui1 = 24.0;
  const okSui =
    sSui1.employer_sui === expectedSui1 &&
    sSui1.ytd_sui_wages_after === 9000 &&
    sSui2.employer_sui === 0 &&
    sSui2.ytd_sui_wages_after === 0 &&
    suiCase.totals.sui === expectedSui1 &&
    suiCase.controls.journal_balanced;

  const ok2 = ok && okSui;

  return {
    ok: ok2,
    sample,
    ssCase,
    addlMedicareCase,
    multiStateCase,
    nyPflOrdinary,
    nyPflCapCrossing,
    goldenCa, goldenNy, goldenPa, goldenWa, goldenCo, goldenNj, goldenFedCap,
    goldenPaPhl, phlEffectiveDateEdge, goldenCoDen, goldenOr, orPaidLeaveCapEdge,
    inWorkedExample, ncWorkedExample, v11Case, v12Case, v13Case, v14Case, deCase, dcCase, wiCase, ohV18Case, suiCase,
    pretaxCase,
    nyCaseSingle,
    nyCaseYonkersNonresident,
    njCaseA,
    njCaseB,
    njCeilingCase,
    mfjCase,
    hohCase,
    multiAB,
    creditsCase,
    expected: {
      expectedSs, expectedMedicare, expectedFuta, expectedFederal, expectedCa, expectedSdi,
      expectedSsRoom, expectedAdditionalMedicare, expectedAddlMedicare3,
      expectedFederal5, expectedCa5, expectedFederal6, expectedCa6,
      expectedCombinedGross, expectedCombinedFederal, expectedCombinedCa, expectedCombinedNet,
      expectedFederal8,
      expectedFicaWages4, expectedFederalTaxableWages4, expectedSs4, expectedMedicare4,
      expectedNjIncomeTax9, expectedNjUiWfSwf9, expectedNjTdi9, expectedNjFli9,
      expectedNjIncomeTax10, expectedNjUiWfSwf11, expectedNjTdi11, expectedNjFli11
    }
  };
}
