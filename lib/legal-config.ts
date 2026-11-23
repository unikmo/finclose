export type LegalOperatorType = 'INDIVIDUAL' | 'LEGAL_ENTITY';

export type LegalOperator = {
  operator_type: LegalOperatorType | '';
  name: string;
  legal_form: string;
  representative: string;
  address: string;
  email: string;
  phone: string;
  register_name: string;
  register_number: string;
  vat_id: string;
  privacy_contact_email: string;
};

const clean = (name: string) => String(process.env[name] || '').trim();

export function legalOperator(): LegalOperator {
  const operatorType = clean('FINCLOSE_LEGAL_OPERATOR_TYPE').toUpperCase();
  return {
    operator_type: operatorType === 'INDIVIDUAL' || operatorType === 'LEGAL_ENTITY' ? operatorType : '',
    name: clean('FINCLOSE_LEGAL_OPERATOR_NAME'),
    legal_form: clean('FINCLOSE_LEGAL_FORM'),
    representative: clean('FINCLOSE_LEGAL_REPRESENTATIVE'),
    address: clean('FINCLOSE_LEGAL_OPERATOR_ADDRESS'),
    email: clean('FINCLOSE_LEGAL_CONTACT_EMAIL'),
    phone: clean('FINCLOSE_LEGAL_PHONE'),
    register_name: clean('FINCLOSE_LEGAL_REGISTER_NAME'),
    register_number: clean('FINCLOSE_LEGAL_REGISTER_NUMBER'),
    vat_id: clean('FINCLOSE_LEGAL_VAT_ID'),
    privacy_contact_email: clean('FINCLOSE_PRIVACY_CONTACT_EMAIL') || clean('FINCLOSE_LEGAL_CONTACT_EMAIL')
  };
}

export function legalIdentityCheck() {
  const operator = legalOperator();
  const missing: string[] = [];

  if (!operator.operator_type) missing.push('FINCLOSE_LEGAL_OPERATOR_TYPE');
  if (!operator.name) missing.push('FINCLOSE_LEGAL_OPERATOR_NAME');
  if (!operator.address) missing.push('FINCLOSE_LEGAL_OPERATOR_ADDRESS');
  if (!operator.email) missing.push('FINCLOSE_LEGAL_CONTACT_EMAIL');

  if (operator.operator_type === 'LEGAL_ENTITY') {
    if (!operator.legal_form) missing.push('FINCLOSE_LEGAL_FORM');
    if (!operator.representative) missing.push('FINCLOSE_LEGAL_REPRESENTATIVE');
  }

  const registerPartiallyConfigured = Boolean(operator.register_name || operator.register_number);
  if (registerPartiallyConfigured) {
    if (!operator.register_name) missing.push('FINCLOSE_LEGAL_REGISTER_NAME');
    if (!operator.register_number) missing.push('FINCLOSE_LEGAL_REGISTER_NUMBER');
  }

  return {
    ok: missing.length === 0,
    missing,
    operator_type: operator.operator_type || null,
    has_register_details: Boolean(operator.register_name && operator.register_number),
    has_vat_id: Boolean(operator.vat_id),
    has_privacy_contact: Boolean(operator.privacy_contact_email)
  };
}
