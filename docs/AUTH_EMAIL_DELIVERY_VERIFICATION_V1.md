# FinClose Firebase Auth Email Delivery Verification v1

Effective date: 2026-09-07
Scope: controlled PILOT
Status: TEMPLATE — HUMAN MAILBOX CHECK REQUIRED

This record proves actual user-facing email delivery. Automated Firebase OOB API acceptance is necessary but does not prove that verification and password-reset messages reach a real mailbox or render correctly.

## A. Test identity

- Firebase project: `theantibalcony`
- Test date/time: ______________________________________
- Controlled mailbox used: _____________________________
- Tester: ______________________________________________
- Application release/build under test: _________________

Do not record passwords, tokens, OOB codes or full session cookies in this document.

## B. Email verification flow

- [ ] A controlled test account was created through the intended FinClose/Firebase path.
- [ ] The account initially showed `emailVerified=false`.
- [ ] A verification email was requested.
- [ ] The message arrived in the controlled mailbox.
- Delivery time: ________________________________________
- Sender identity/domain appeared expected: `YES` / `NO`
- Subject/body branding was understandable: `YES` / `NO`
- Verification link rendered and was clickable: `YES` / `NO`
- Link completed the intended Firebase verification flow: `YES` / `NO`
- Account subsequently reported verified status: `YES` / `NO`
- Unexpected credential request or redirect observed: `YES` / `NO`

Verification-flow result: `PASS` / `FAIL`
Notes: _________________________________________________________________

## C. Password-reset flow

- [ ] A password reset was requested for the controlled account.
- [ ] The application response did not reveal whether an arbitrary address exists.
- [ ] The reset email arrived in the controlled mailbox.
- Delivery time: ________________________________________
- Sender identity/domain appeared expected: `YES` / `NO`
- Reset link rendered and was clickable: `YES` / `NO`
- Link completed the intended Firebase password-reset flow: `YES` / `NO`
- New password sign-in succeeded: `YES` / `NO`
- Previous password no longer authenticated: `YES` / `NO`
- Unexpected credential request or redirect observed: `YES` / `NO`

Password-reset result: `PASS` / `FAIL`
Notes: _________________________________________________________________

## D. Failure handling

If either message does not arrive or the link/branding is wrong, record:

- failure type: _________________________________________________________
- spam/junk checked: `YES` / `NO`
- Firebase/Auth template/configuration checked: `YES` / `NO`
- remediation taken: ___________________________________________________
- retest date/result: ___________________________________________________

## E. Final decision

Verification email: `PASS` / `FAIL`
Password reset email: `PASS` / `FAIL`
Overall human delivery check: `PASS` / `FAIL`

Tester name: ____________________________  Date: ________________________

### Release rule

The human Auth delivery P0 gate is complete only when both flows pass using a controlled real mailbox. Do not attach or commit sensitive OOB links, tokens, passwords or session material as evidence.
