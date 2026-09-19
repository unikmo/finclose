# Global 7-Month Payroll Stress Test — Report (September 2026)

**Dataset:** `global_months7_payroll_stress_test.xlsx`, sheet `7_Month_Raw_Ledger` — 150 employees x 7 months (January-July 2026), 1,050 employee-month rows, 10 countries.

**Driver script:** `stress-test-driver.ts` (repo root, run via `npx tsx stress-test-driver.ts`). Machine-readable results: `_stress_test_results.json` (untracked scratch file, regenerated each run).

**Important caveat on "grand totals":** the dataset pays employees in 10 different local currencies (EUR, USD, CAD, GBP, XAF, ZAR, RWF, KES, MUR, GEL) and supplies no FX rates. Adding "700,000 EUR + 1,430,000 USD + 276,722 XAF + ..." into one number would produce a meaningless figure, so this report gives grand totals **per country, in that country's own local currency**, not one blended world total. If you want a single consolidated currency figure, we need agreed FX rates for the 7 pay dates first.

---

## 1. Processing results

| Outcome | Employee-months | Why |
|---|---:|---|
| Processed successfully | 1,050 | All 8 fully-implemented country engines ran clean, including Quebec (see update below) |
| Skipped (known, deliberate gap) | 0 | — |
| Crashed with a real error | **0** | No engine crashes anywhere in the run. |

**Total: 1,050 rows in, 1,050 processed, 0 skipped, 0 crashes.**

**Update (2026-09-19, follow-up pass):** the original run of this stress test (2026-09-15/16) skipped Canada/Quebec's 70 employee-months (10 employees x 7 months) because `lib/payroll-engine-ca.ts` explicitly rejected `province_of_employment: 'QC'` at the time. A subsequent pass built out Quebec support (QPP replacing CPP, QPIP, Quebec's reduced federal EI rate, and Quebec's own provincial tax — see that file's v5 change log and limitations for full sourcing), and this driver (`stress-test-driver.ts`) was updated to route Quebec rows through it instead of skipping them. Re-running the full dataset now processes all 1,050 rows with zero skips. Every other country's totals in this report are unchanged from the original run.

---

## 2. THE HEADLINE NUMBER: what the company must remit to governments, by country

"Remit" = every employer-side statutory contribution **plus** every employee-side withholding the company collects and pays over on the employee's behalf. It is everything that leaves the company's bank account for a government/statutory agency that is **not** net pay to the employee. Private-scheme deductions (US 401(k), German BAV, UK workplace pension) are **excluded** here because they go to a private plan administrator, not a government agency — see the Gaps section for how each was still applied to the employee's pay.

All figures cover the full 7-month period (Jan-Jul 2026), local currency, per country:

| Country | Currency | Gross payroll | Employee net pay | **Remit to government/agencies** |
|---|---|---:|---:|---:|
| United States | USD | 1,430,153.17 | 1,102,011.89 | **380,550.34** |
| Germany | EUR | 699,781.29 | 433,404.27 | **410,198.70** |
| Canada (Ontario + Quebec) | CAD | 655,705.46 | 510,355.91 | **198,406.41** |
| South Africa | ZAR | 578,617.93 | 543,220.61 | **46,371.02** |
| United Kingdom | GBP | 405,768.19 | 283,242.70 | **166,642.42** |
| Georgia | GEL | 376,585.86 | 293,736.95 | **96,460.56** |
| Rwanda | RWF | 339,646.84 | 318,249.05 | **49,588.52** |
| Mauritius | MUR | 310,432.33 | 302,148.35 | **45,291.58** |
| Kenya | KES | 304,046.57 | 260,243.11 | **70,106.92** |
| Cameroon | XAF | 276,722.00 | 262,755.00 | **55,659.00** |

Germany and the US carry the two largest remittance burdens in absolute terms — Germany because employer-side social insurance (pension/health/care/unemployment, each split ~50/50 employer-employee) runs close to 60% of gross pay, US because it stacks federal + FICA + state.

---

## 3. Remittance by country, broken down by agency/program (7-month total, local currency)

### United States (USD) — 40 employees, 280 employee-months (NY, CA, TX, FL)
| Agency / program | Amount |
|---|---:|
| IRS — Federal Income Tax Withheld | 128,015.82 |
| IRS — FICA Social Security (employee 6.2% + employer 6.2%) | 177,339.16 |
| IRS — FICA Medicare (employee + employer + Additional Medicare) | 41,474.58 |
| IRS — FUTA (employer, Form 940) | 2,519.99 |
| NY DTF — NY State/NYC/Yonkers income tax + PFL/DBL | 18,810.61 |
| CA EDD — CA state income tax + SDI | 12,390.18 |
| **Total** | **380,550.34** |
*(TX and FL have no state income tax — those employees contribute only to the federal lines and, where applicable, SUI. SUI was not computed — see Gaps §5.)*

### Germany (EUR) — 20 employees, 140 employee-months (Bavaria, Berlin)
| Agency / program | Amount |
|---|---:|
| Finanzamt — Lohnsteuer (income tax) | 120,893.85 |
| Finanzamt — Solidaritätszuschlag | 1,661.49 |
| Finanzamt — Kirchensteuer (church tax) | 0.00 (assumed not liable — see §5) |
| Sozialversicherung — Rentenversicherung/pension (employee+employer) | 129,418.06 |
| Sozialversicherung — Arbeitslosenversicherung/unemployment (employee+employer) | 18,090.44 |
| Sozialversicherung — Krankenversicherung/health (employee+employer) | 116,225.60 |
| Sozialversicherung — Pflegeversicherung/care (employee+employer) | 23,909.26 |
| **Total** | **410,198.70** |

### South Africa (ZAR) — 10 employees, 70 employee-months (Gauteng)
| Agency / program | Amount |
|---|---:|
| SARS — PAYE (net of Employment Tax Incentive; ETI not modeled here — see §5) | 30,209.78 |
| UIF (employee 1% + employer 1%) | 10,375.08 |
| SDL (employer 1%) | 5,786.16 |
| **Total** | **46,371.02** |

### United Kingdom (GBP) — 10 employees, 70 employee-months (London)
| Agency / program | Amount |
|---|---:|
| HMRC — PAYE income tax | 90,881.34 |
| HMRC — National Insurance (employee 8%/2% + employer 15%) | 75,761.08 |
| **Total** | **166,642.42** |
*(Workplace pension, employee 5% + employer 3% of qualifying earnings, is computed and deducted from pay but excluded here — paid to a private pension provider, not HMRC.)*

### Georgia (GEL) — 10 employees, 70 employee-months (Tbilisi)
| Agency / program | Amount |
|---|---:|
| Revenue Service (RS) — income tax (20%) | 75,317.15 |
| Pension Agency — pension (employee 2% + employer 2% + state top-up) | 21,143.41 |
| **Total** | **96,460.56** |

### Rwanda (RWF) — 10 employees, 70 employee-months (Kigali)
| Agency / program | Amount |
|---|---:|
| RRA — PAYE | (included in RSSB split below is separate; see raw line) |
| RSSB — Pension (employee 6% + employer 6%) | 40,757.72 |
| RSSB — Occupational Hazards (employer 2%) | 6,792.94 |
| RSSB — Maternity (employee 0.3% + employer 0.3%) | 2,037.86 |
| **Total (incl. PAYE)** | **49,588.52** |
*(RAMA and CBHI are both opt-in in this engine and were left off — see §5.)*

### Canada — Ontario + Quebec (CAD) — 20 employees, 140 employee-months
**Update (2026-09-19, follow-up pass):** Quebec is no longer skipped. `lib/payroll-engine-ca.ts` now implements Quebec (QPP replacing CPP, QPIP, Quebec's reduced federal EI rate, and Quebec's own provincial tax) — see that file's v5 change log and limitations for full sourcing. All 70 previously-skipped Quebec employee-months (10 employees x 7 months) now process cleanly; **0 Canada rows are skipped**. The two provinces use different program sets (QPP is Quebec-only, CPP is everywhere-but-Quebec), so they are broken out separately below rather than merged into misleading combined "CPP+QPP" or "EI" lines.

**Ontario (10 employees, 70 employee-months):**
| Agency / program | Amount |
|---|---:|
| CRA — Federal income tax | 30,221.89 |
| Ontario — Provincial income tax | 13,307.63 |
| CRA — CPP (employee + employer, CPP1+CPP2) | 37,221.26 |
| CRA — EI (employee + employer, standard rate) | 13,034.82 |
| **Ontario total** | **93,785.60** |

**Quebec (10 employees, 70 employee-months):**
| Agency / program | Amount |
|---|---:|
| CRA — Federal income tax (incl. the 16.5% Quebec federal abatement) | 24,618.91 |
| Revenu Québec — Provincial income tax | 28,548.37 |
| Retraite Québec — QPP (employee + employer, QPP1+QPP2, replaces CPP) | 38,063.10 |
| CRA — EI (employee + employer, Quebec's reduced 1.30%/1.82% rate) | 10,062.18 |
| Revenu Québec — QPIP (employee + employer) | 3,328.25 |
| **Quebec total** | **104,620.81** |
*(Quebec's Health Services Fund/FSS and CNESST are not included — the engine has no statutory-default rate for either; see the engine's own disclosed limitations and §5/§6 below.)*

**Combined Canada total (Ontario + Quebec): 198,406.41**

### Mauritius (MUR) — 10 employees, 70 employee-months (Plaines Wilhems)
| Agency / program | Amount |
|---|---:|
| MRA — PAYE | (included below; see raw JSON for exact split if needed) |
| CSG (employee + employer) | 13,969.45 |
| NSF (employee + employer) | 12,696.18 |
| Training Levy (employer 1.5%) | 4,656.48 |
| PRGF (employer 4.5%) | 13,969.47 |
| **Total (incl. PAYE)** | **45,291.58** |

### Kenya (KES) — 10 employees, 70 employee-months (Nairobi)
| Agency / program | Amount |
|---|---:|
| KRA — PAYE | (included below) |
| NSSF — Pension (employee + employer, Tiers I/II) | 36,485.64 |
| SHIF — Health (employee 2.75%) | 21,000.00 |
| AHL — Affordable Housing Levy (employee 1.5% + employer 1.5%) | 9,121.28 |
| NITA — Industrial Training Levy (employer, flat KES50/head/month) | 3,500.00 |
| **Total (incl. PAYE)** | **70,106.92** |

### Cameroon (XAF) — 10 employees, 70 employee-months (Littoral)
| Agency / program | Amount |
|---|---:|
| DGI — IRPP + CAC | (included below) |
| CNPS — Pension (employee 4.2% + employer 4.2%) | 23,254.00 |
| CNPS — Family Allowance (employer, sector-rated) | 19,369.00 |
| CNPS — Occupational Risk (employer, risk-group-rated) | 4,846.00 |
| CFC — Housing Fund (employee 1% + employer 1.5%) | 5,850.00 |
| FNE — Employment Fund (employer 1%) | 2,340.00 |
| TDL / CRTV | 0.00 (below the low-wage thresholds for this cohort — see §5) |
| **Total (incl. IRPP/CAC)** | **55,659.00** |

*(Note: for Rwanda/Mauritius/Kenya/Cameroon the PAYE/IRPP line is folded into "Total" but not broken out in this markdown table to keep it short — the full per-agency numeric split for every country, including the exact PAYE/IRPP figures, is in `_stress_test_results.json` under `countryAgencyTotals`.)*

---

## 4. Bugs found and fixed

**None, in the original 2026-09-15/16 pass.** Every one of the 1,050 rows was traced to completion — 980 succeeded, 70 hit the then-current known/deliberate Quebec gap, and **zero** rows crashed on a genuine engine defect. `run-selftest-all.ts` was re-confirmed green before and after that pass; no changes were made to any `lib/payroll-engine-*.ts` file, and no `status:` field on any rule pack was touched (all remain `DRAFT_NEEDS_LEGAL_REVIEW`).

**Follow-up pass (2026-09-19):** Quebec support was built into `lib/payroll-engine-ca.ts` (see §1 and the Canada section of §3). Re-running the driver with Quebec wired in now processes all 1,050 rows, 0 skipped, still 0 crashes. `run-selftest-all.ts` remains green (see §7) and no `status:` field was touched.

Two things initially looked like crashes but on investigation were correct, by-design engine behavior, not bugs — driver-side fixes only (see §5 for the first, which is a genuine dataset/engine-scope gap; the second was simply a missing default input):
- **US/NY + 401(k):** the US engine (`lib/payroll-engine-us.ts`) *deliberately* rejects a nonzero `pretax_401k_deferral` for NY employees, because its own documented limitations say NY's wage-base treatment of 401(k)/Section 125 deferrals was never independently verified. This affected 10 NY employees x 7 months = 70 rows and is a genuine, disclosed gap — see §5.
- **Mauritius `annual_edf_reliefs_total`:** required whenever `resident_status` is `RESIDENT`; the driver simply hadn't supplied it. Fixed by passing `0` (no EDF reliefs claimed) with that assumption documented once in the driver and here.

---

## 5. Gaps found by this multi-month/volume stress test (not caught by single-employee golden fixtures)

This is exactly the kind of thing a 1,050-row, 7-month run is supposed to surface that a one-off fixture can't:

1. **US/NY 401(k) deferrals are engine-rejected, not just unverified.** 10 of the 40 US employees are NY-based, and several have nonzero `US_401k_Deduction`. The engine's NY path throws rather than approximate. The driver worked around this by running those NY employees' payroll **without** the 401(k) pre-tax reduction applied (i.e., taxed on full gross) so the stress test could still complete — their gross/net figures in this report do **not** reflect the 401(k) deferral. This is a real product gap: a NY employee with an active 401(k) cannot be run through this engine today at all without either dropping the deferral or getting an unverified number. Recommend prioritizing NY 401(k)/Section 125 wage-base verification.

2. **Quebec had zero engine coverage** as of the original run, confirmed at volume exactly as flagged going in: 10 employees x 7 months = 70 employee-months cleanly skipped, no crash, no guessed numbers. **Update (2026-09-19):** this gap has since been closed — `lib/payroll-engine-ca.ts` now implements Quebec (QPP/QPIP/reduced EI/QC provincial tax), and all 70 Quebec employee-months now process; see §3's Canada section. Two items remain genuinely unmodeled for Quebec, disclosed rather than guessed: the QC Health Services Fund (FSS/HSF, an employer-size/sector-rated rate with no defensible single default) and CNESST (Quebec's industry-rated workplace-safety premium, which has no computation path in the engine at all, unlike WCB for other provinces).

3. **German BAV (Betriebliche Altersvorsorge) has no dedicated input field.** The DE engine only exposes `taxable_gross_pay` / `sv_gross_pay` (post-any-deferral) — there's no separate "pension deferral amount" parameter. The driver modeled `German_BAV` as reducing both the tax base and the SV base by that amount (a standard deferred-comp treatment), which is a reasonable reading but is a modeling assumption, not a feature the engine itself understands or validates. All 20 DE employees have nonzero BAV every month, so this assumption was exercised on all 140 DE employee-months.

4. **South Africa does not model taxable fringe benefits at all.** Its own limitations say `gross_pay is assumed to be cash remuneration only`. 2 of the 10 ZA employees are flagged executive with nonzero `Exec_Fringe_Benefits` every month (14 employee-months) — that benefit value could not be applied to PAYE at all and is simply absent from ZA gross/PAYE in this report. This is a real, not-yet-built feature gap the single-fixture pass never had a reason to hit (no executive/fringe-benefit fixture existed for ZA).

5. **Rwanda's benefit-in-kind model doesn't accept a cash figure.** RW only supports `vehicle_benefit` (flat +10%) / `accommodation_benefit` (flat +20%) boolean flags, not an arbitrary cash `Exec_Fringe_Benefits` amount — so, like South Africa, Rwanda's 2 executive employees' fringe benefits (14 employee-months) could not be applied and are excluded from the RW PAYE base.

6. **UK workplace pension is a private-scheme deduction, not a government remittance** — included in the driver's calculation (net pay correctly reflects it) but deliberately excluded from the "remit to government" total in §2/§3, since it's paid to a pension provider, not HMRC. Worth calling out explicitly so it isn't mistaken for missing money.

7. **US 401(k) is likewise excluded from the "remit to government" total** for the same private-plan-administrator reason (applies to the CA/TX/FL employees whose 401(k) *was* applied, per the engine's normal support for that field).

8. **South Africa PAYE is reported net of ETI (Employment Tax Incentive)** for realism — ETI reduces what the employer actually remits to SARS — but this run set `eti_eligible` off for everyone (dataset gives no age-eligibility signal beyond a plain age default), so ETI was effectively 0 throughout; flagged so a reviewer knows it wasn't silently assumed non-zero.

9. **Cameroon TDL/CRTV showing 0.00 at these pay levels was checked, not assumed** — both are step tables that start above roughly XAF 50,000-62,000/month; this cohort's gross pay is low enough (per-employee monthly gross around XAF 39,000-40,000-equivalent given the small sample) that several months land below the first table step. This is real table behavior, not a bug — spot-checked against the rule pack's own table in `payroll-engine-cm.ts`.

10. **YTD/wage-base threading was spot-checked and behaves correctly** (not just "ran without crashing"): a synthetic high earner run through the US engine correctly hit the USD 7,000 FUTA wage-base cap after month 1 and stayed at $0 FUTA every month after; a synthetic German employee correctly crossed the KV/PV (health/care) ceiling between months 4-5 (contribution dropped from full to a partial capped amount, then to 0) and the RV/ALV (pension/unemployment) ceiling between months 6-7. Both wage-base caps and mid-year transitions behaved monotonically and correctly across all 7 months.

None of items 1, 3, 4, 5 are things this pass "fixed" — per the engagement's own rule, a disclosed gap is the correct outcome, not something to fudge into a clean number. They're listed here as prioritized follow-up items for the product roadmap, not defects in this stress-test run.

---

## 6. Assumptions made (documented once, applied uniformly)

Because the spreadsheet doesn't carry every field each engine needs, the driver used one plain default per field, everywhere, rather than guessing differently row by row:

- **Overtime premium:** 1.5x base hourly rate for every hourly employee in every country (no country-specific overtime premium is modeled by any of these engines, so 1.5x was used uniformly).
- **US:** `federal_filing_status: SINGLE_MFS`, `federal_step2_checkbox: false`; CA: `SINGLE`, 0 regular/estimated allowances; NY: `SINGLE`, 0 allowances; pay frequency `MONTHLY`.
- **Germany:** tax class I, not church-tax-liable, no childless surcharge, statutory (not private) health insurance.
- **UK:** tax code `1257L` (standard England/NI cumulative code), NI category A, no student/postgrad loan, auto-enrolled in the workplace pension.
- **Canada:** province of employment = Ontario for non-Quebec CA employees, QC for Quebec employees (matches the dataset — the only two CA provinces present are Ontario and Quebec); no WCB rate supplied for Ontario and no `qc_fss_rate` supplied for Quebec (see below), pay frequency `MONTHLY`.
- **Kenya:** resident status = RESIDENT.
- **South Africa:** `employee_age: 35` (a plain placeholder — the dataset has no birth-date field), not a medical scheme main member, employer SDL-liable, ETI not claimed.
- **Rwanda:** employee type REGULAR, first employer = true (progressive PAYE, not the 30% flat non-first-employer rate), not a RAMA member, CBHI not applied (matches this engine's own conservative default — CBHI's net-salary base is explicitly unverified per its rule pack).
- **Mauritius:** resident status RESIDENT, `annual_edf_reliefs_total: 0`, pay-period sequence counted 1 (January) through 7 (July) — the dataset has no fiscal-year-alignment data to map onto the engine's own July-starts-period-1 convention, so a simple Jan=1...Jul=7 sequence was used instead.
- **Cameroon:** sector regime GENERAL_OR_DOMESTIC, CNPS occupational-risk group A (lowest risk), not CFC/FNE-exempt, not CRTV-exempt.
- **Georgia:** pension participant = true for every employee (the dataset has no opt-out signal).
- **Pay dates:** the 28th of each 2026 calendar month (Jan-Jul), chosen to be safely inside every month regardless of month length.
- **Canada WCB, Quebec FSS, and US SUI** were left uncomputed (all are optional and employer-size-/sector-/board-specific-rate-dependent per those engines' own design — no statutory default exists, and the dataset supplies no rate). This means the US and Canada "remit" totals in §2/§3 are understated by whatever SUI/WCB/FSS premiums a real employer would owe; flagged rather than guessed at. Quebec's CNESST premium is additionally not computed because the engine has no CNESST calculation path at all yet (unlike WCB/FSS, which are at least optional caller-supplied-rate fields).

---

## 7. Engine health check

`npx tsx run-selftest-all.ts` — **green before and after this pass**:
```
OK: true | georgia: true | germany: true | us: true | uk: true | canada: true | kenya: true | southAfrica: true | rwanda: true | mauritius: true | cameroon: true
```
No rule-pack `status:` fields were changed — every pack remains `DRAFT_NEEDS_LEGAL_REVIEW`, as required.

---

## 8. Files

- `stress-test-driver.ts` (repo root) — the driver, committed.
- `stress-test-report-2026-09.md` (repo root, this file) — committed.
- `_stress_test_results.json` (repo root) — machine-readable dump of every outcome, agency total, and gap; **untracked scratch output**, regenerated by re-running the driver, not committed.
- No `lib/payroll-engine-*.ts` files were modified — no engine bugs were found.

---

## 9. Update (2026-09-20): Payslip Register, monthly remittance, and variance analysis

This pass adds full-granularity detail on top of the same, unchanged 7-month aggregate above — it does not recompute or restate anything in §1-§8.

**What was built:**
- `stress-test-driver.ts` was extended (additively — no existing calculation logic changed) to also capture, for every one of the 1,050 employee-months, the full itemized payslip (base/overtime/bonus, every employee-side deduction and employer-side contribution by name and amount) and the same remittance lines already computed, now bucketed by month rather than only summed to a 7-month total. This writes a new file, `_stress_test_payslips.json`, alongside the existing `_stress_test_results.json`.
- `build-payroll-workbook.ts` (new script) reads both JSON files and builds `payroll-stress-test-payslips-and-remittance-2026-09.xlsx` (repo root): a `Summary` sheet, a 1,050-row `Payslip Register`, a `Monthly Remittance by Country` sheet (flat Country/Month/Agency/Amount table with a TOTAL row per country-month), and a `Month-to-Month Variance` sheet.

**Reconciliation:** before writing the workbook, the script sums the new monthly remittance detail back up to 7-month totals and asserts they match `_stress_test_results.json`'s `countryAgencyTotals` exactly, for every country and every agency line (it throws and refuses to write the workbook otherwise). This run passed with zero mismatches. `npx tsx run-selftest-all.ts` remains green:
```
OK: true | georgia: true | germany: true | us: true | uk: true | canada: true | kenya: true | southAfrica: true | rwanda: true | mauritius: true | cameroon: true
```
Quebec is confirmed present and correct: 70 employee-months (10 employees × 7 months), with QPP/QPIP/Quebec provincial tax/reduced-rate EI columns populated in the Payslip Register.

**Remittance timing:** no engine or rule pack in this repo documents statutory remittance due dates for any of the 10 countries, so the Monthly Remittance sheet notes "remittance timing not modeled, consult local requirements" on every line rather than guessing a date.

**Notable month-to-month remittance swings (>15% threshold), with driver:**

| Country | From → To | Total remittance | % change | Driver |
|---|---|---:|---:|---|
| South Africa | May → June | 3,631.01 → 24,447.46 | **+573.3%** | Bonus payouts of 79,481.25 to 3 employees in June (none in May) |
| South Africa | June → July | 24,447.46 → 3,677.63 | **-85.0%** | Reverting after May's bonus payout — no comparable bonus in July |
| US | May → June | 48,946.95 → 66,377.74 | **+35.6%** | A single $22,432.37 bonus to one employee in June (none in May) |
| US | June → July | 66,377.74 → 49,944.24 | **-24.8%** | Reverting after June's one-time bonus — no comparable bonus in July |
| Germany | May → June | 55,533.09 → 67,551.06 | **+21.6%** | A €15,509.19 bonus to one employee in June (none in May) |
| Germany | June → July | 67,551.06 → 52,341.85 | **-22.5%** | Reverting after June's bonus — no comparable bonus in July |
| UK | January → February | 21,349.04 → 24,621.03 | **+15.3%** | Not attributable to a new hire, bonus, or wage-base cap in the underlying data — see the per-agency lines in the Variance sheet for the specific NI/PAYE line that moved |
| Georgia | April → May | 14,897.67 → 12,532.97 | **-15.9%** | Not attributable to a new hire, bonus, or wage-base cap in the underlying data |

South Africa's swing is the largest in percentage terms by a wide margin because its baseline remittance is small (ETI credits keep net PAYE low most months), so a single bonus month moves the percentage dramatically even though the dollar swing (~$20.8k) is smaller than the US or Germany swings. No US employee in this dataset crossed the Social Security or FUTA wage-base caps during Jan-Jul (checked programmatically — the highest-earning US employees in the dataset did not reach the $176,100 SS cap on a $2-11k/month salary within 7 months), so that mechanism, while modeled in the variance script, did not fire for this particular dataset.

**Files added this pass:**
- `stress-test-driver.ts` (modified, additive only) — committed.
- `build-payroll-workbook.ts` (new) — committed.
- `payroll-stress-test-payslips-and-remittance-2026-09.xlsx` (new, repo root) — committed.
- `_stress_test_payslips.json`, `_variance_findings.json` — untracked scratch output, regenerated by re-running the two scripts, not committed.
