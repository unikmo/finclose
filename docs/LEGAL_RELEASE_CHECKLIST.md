# Finbuks legal release checklist

Finbuks must not enter PILOT or PRODUCTION with incomplete provider/controller information.

## Mandatory operator configuration

Set these before certification:

- `FINCLOSE_LEGAL_OPERATOR_TYPE=INDIVIDUAL|LEGAL_ENTITY`
- `FINCLOSE_LEGAL_OPERATOR_NAME`
- `FINCLOSE_LEGAL_OPERATOR_ADDRESS`
- `FINCLOSE_LEGAL_CONTACT_EMAIL`

For a legal entity also set:

- `FINCLOSE_LEGAL_FORM`
- `FINCLOSE_LEGAL_REPRESENTATIVE`

Where applicable:

- `FINCLOSE_LEGAL_REGISTER_NAME`
- `FINCLOSE_LEGAL_REGISTER_NUMBER`
- `FINCLOSE_LEGAL_VAT_ID`
- `FINCLOSE_LEGAL_PHONE`
- `FINCLOSE_PRIVACY_CONTACT_EMAIL`

## Product surfaces

The public site must expose, from every page:

- Legal notice
- Privacy notice
- Terms of use

The homepage must also expose a visible navigation menu.

## Release control

The pilot certification treats incomplete legal identity as a mandatory BLOCKED gate. The legal pages themselves intentionally display a pre-release warning rather than inventing missing operator data.

## Before paid production

Legal review must confirm at least:

- provider disclosure under §5 DDG;
- GDPR Articles 13/14 privacy information and controller/processor roles;
- Article 28 processor agreements where Finbuks processes personal data on behalf of business customers;
- retention/deletion schedule and subprocessor list;
- international-transfer safeguards;
- final commercial terms, governing law and liability language;
- whether consumer-law obligations apply or the service is strictly B2B;
- whether a data-protection officer or other statutory contact must be identified;
- cookie/consent treatment if non-essential device storage or tracking is later introduced.
