import { NextRequest, NextResponse } from 'next/server';
import { COUNTRIES, buildTemplate, getCountry, initializeCompany, listCompanies, realtimeDatabase, saveDataChunk, saveInitialization, statusFor, storageBucket } from '../../../lib/finclose-backend';
import { getServiceDeployment, publicServiceCatalog, saveServiceConfiguration, saveServiceSource, selectServiceConnector, startServiceDeployment } from '../../../lib/service-deployments';
import { linkDeploymentCompany, saveHistoricalContext, skipHistoricalContext } from '../../../lib/onboarding-history';
import { accountResponse, loginLabAccount, registerLabAccount } from '../../../lib/lab-auth';
import { authenticateRequest, createFirebaseSessionResponse, currentManagedUser, loginManagedAccount, logoutManagedResponse, registerManagedAccount, type RequestIdentity } from '../../../lib/managed-auth';
import { ensurePersonalOrganization, deploymentAuthorization, listOrganizationCompanies, requireCompanyAccess, type OrganizationRole } from '../../../lib/tenancy';
import { isRealDataMode, publicRuntimeProfile, runtimeReadiness } from '../../../lib/runtime-mode';
import { ledgerHealth, persistBookkeepingBatch } from '../../../lib/production-ledger';
import { FINANCIAL_UPLOAD_SECURITY } from '../../../lib/file-security';
import { getPayrollRun, PAYROLL_RULE_PACKS, payrollEngineSelfTest, preparePayrollRun } from '../../../lib/payroll-engine';
import { BOOKKEEPING_CORE_CAPABILITIES, bookkeepingEngineSelfTest, getBookkeepingBatch, prepareBookkeepingBatch } from '../../../lib/bookkeeping-engine';
import { FINANCE_CYCLE_CAPABILITIES, financeCycleSelfTest, getFinanceCycle, getMonthlyClose, prepareFinanceCycle } from '../../../lib/finance-cycle-engine';
import { CLOSE_GOVERNANCE_CAPABILITIES, approveMonthlyClose, closeGovernanceSelfTest, configureBalanceSheetScope, configureSourceRequirements, evaluateSourceCompleteness, getCloseGovernance, lockMonthlyClose, prepareBalanceSheetReconciliation, recordPeriodSourceEvidence, reopenMonthlyClose } from '../../../lib/close-governance-engine';

function segments(params: { path?: string[] }) { return params.path || []; }
function historyReady(deployment: Record<string, any>) {
  return deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY';
}

function actorFromAuth(auth: RequestIdentity) {
  if (auth.kind === 'customer') return { kind: 'customer' as const, user_id: auth.user.user_id, name: auth.user.name, email: auth.user.email };
  return { kind: 'lab' as const };
}

async function authorizedDeployment(req: NextRequest, id: string, minimumRole: OrganizationRole = 'VIEWER') {
  const auth = await authenticateRequest(req);
  const deployment = await getServiceDeployment(id) as Record<string, any>;
  if (auth.kind === 'customer' && isRealDataMode()) {
    await deploymentAuthorization(deployment, auth.user, minimumRole);
  } else if (auth.kind === 'customer') {
    const ownerEmail = String(deployment.registrant?.email || '').trim().toLowerCase();
    if (ownerEmail && ownerEmail !== auth.user.email.trim().toLowerCase()) {
      const error = new Error('this service session belongs to another account');
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
  }
  return { auth, deployment };
}

async function authorizedInitialization(req: NextRequest, initializationId: string) {
  const auth = await authenticateRequest(req);
  if (auth.kind === 'lab' || !isRealDataMode()) return auth;
  const snap = await realtimeDatabase().ref(`finclose_initializations/${initializationId}`).once('value');
  if (!snap.exists()) {
    const error = new Error('initialization not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  const initialization = snap.val() as Record<string, unknown>;
  const org = await ensurePersonalOrganization(auth.user);
  if (String(initialization.organization_id || '') !== org.organization_id) {
    const error = new Error('initialization belongs to another organization');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return auth;
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    const p = segments(params);

    if (p.length === 1 && p[0] === 'health') {
      const readiness = runtimeReadiness();
      const configured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_STORAGE_BUCKET);
      const deep = req.nextUrl.searchParams.get('deep') === '1';
      if (!deep || !configured) return NextResponse.json({ version: '0.33.0', hosting: 'vercel', database: 'firebase-realtime-database', storage: 'firebase-storage', runtime: readiness, configured });
      const reachable = { database: false, storage: false, postgres: false };
      const errors: string[] = [];
      try {
        await realtimeDatabase().ref('finclose_health').limitToFirst(1).once('value');
        reachable.database = true;
      } catch (e) { errors.push(`database: ${(e as Error).message}`); }
      try {
        await storageBucket().getMetadata();
        reachable.storage = true;
      } catch (e) { errors.push(`storage: ${(e as Error).message}`); }
      const postgres = await ledgerHealth();
      reachable.postgres = postgres.ready;
      if (readiness.real_data_mode && !postgres.ready) errors.push(`postgres-ledger: ${postgres.error || 'schema not ready'}`);
      const payroll = payrollEngineSelfTest();
      const bookkeeping = bookkeepingEngineSelfTest();
      const financeCycle = financeCycleSelfTest();
      const closeGovernance = closeGovernanceSelfTest();
      if (!payroll.ok) errors.push('payroll-engine: deterministic regression check failed');
      if (!bookkeeping.ok) errors.push('bookkeeping-engine: deterministic regression check failed');
      if (!financeCycle.ok) errors.push('finance-cycle: deterministic regression check failed');
      if (!closeGovernance.ok) errors.push('close-governance: deterministic regression check failed');
      const engineOk = payroll.ok && bookkeeping.ok && financeCycle.ok && closeGovernance.ok;
      const infrastructureOk = reachable.database && reachable.storage && (!readiness.real_data_mode || postgres.ready);
      return NextResponse.json({
        version: '0.33.0',
        hosting: 'vercel',
        database: 'firebase-realtime-database-control-plane',
        authoritative_ledger: 'postgresql',
        storage: 'firebase-storage',
        runtime: readiness,
        configured,
        reachable,
        postgres,
        upload_security: FINANCIAL_UPLOAD_SECURITY,
        engines: {
          payroll_ge_basic: payroll.ok,
          bookkeeping_core: bookkeeping.ok,
          finance_cycle: financeCycle.ok,
          monthly_close_controls: financeCycle.ok,
          source_completeness: closeGovernance.ok,
          balance_sheet_reconciliation: closeGovernance.ok,
          close_approval_and_period_lock: closeGovernance.ok
        },
        ok: infrastructureOk && engineOk && errors.length === 0,
        errors
      });
    }

    if (p.join('/') === 'runtime') return NextResponse.json(publicRuntimeProfile());

    if (p.join('/') === 'account/session') {
      const user = await currentManagedUser(req);
      if (user && isRealDataMode()) await ensurePersonalOrganization(user);
      return NextResponse.json({ authenticated: Boolean(user), user, auth_mode: user?.auth_mode || (isRealDataMode() ? 'FIREBASE_AUTH_SESSION' : 'LAB_ACCOUNT_SESSION') });
    }

    if (p.join('/') === 'service-deployments/catalog') return NextResponse.json(publicServiceCatalog());
    if (p.join('/') === 'initialization/countries') return NextResponse.json(COUNTRIES.map(({ code, name, currency }) => ({ code, name, currency })));
    if (p.join('/') === 'bookkeeping/capabilities') return NextResponse.json(BOOKKEEPING_CORE_CAPABILITIES);
    if (p.join('/') === 'finance-cycle/capabilities') return NextResponse.json(FINANCE_CYCLE_CAPABILITIES);
    if (p.join('/') === 'close-governance/capabilities') return NextResponse.json(CLOSE_GOVERNANCE_CAPABILITIES);

    if (p.length === 3 && p[0] === 'payroll' && p[1] === 'rules') {
      const country = String(p[2] || '').toUpperCase() as keyof typeof PAYROLL_RULE_PACKS;
      const pack = PAYROLL_RULE_PACKS[country];
      if (!pack) return NextResponse.json({ detail: 'unsupported country' }, { status: 404 });
      return NextResponse.json(pack);
    }

    if (p.length === 2 && p[0] === 'service-deployments') {
      const { deployment } = await authorizedDeployment(req, p[1]);
      return NextResponse.json(deployment);
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'payroll' && p[3] === 'runs') {
      await authorizedDeployment(req, p[1]);
      return NextResponse.json(await getPayrollRun(p[1], p[4]));
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'bookkeeping' && p[3] === 'batches') {
      await authorizedDeployment(req, p[1]);
      return NextResponse.json(await getBookkeepingBatch(p[1], p[4]));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'finance-cycles') {
      await authorizedDeployment(req, p[1]);
      return NextResponse.json(await getFinanceCycle(p[1], p[3]));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'monthly-closes') {
      await authorizedDeployment(req, p[1]);
      return NextResponse.json(await getMonthlyClose(p[1], p[3]));
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'monthly-closes' && p[4] === 'governance') {
      await authorizedDeployment(req, p[1]);
      return NextResponse.json(await getCloseGovernance(p[1], p[3]));
    }

    if (p.length === 3 && p[0] === 'initialization' && p[1] === 'template') {
      await authenticateRequest(req);
      const country = getCountry(p[2]);
      if (!country) return NextResponse.json({ detail: 'unsupported country' }, { status: 404 });
      const buffer = buildTemplate(country);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="FinCloseAgent_Initialization_${country.code}.xlsx"`
        }
      });
    }

    if (p.length === 1 && p[0] === 'companies') {
      const auth = await authenticateRequest(req);
      if (auth.kind === 'lab' || !isRealDataMode()) return NextResponse.json(await listCompanies());
      const org = await ensurePersonalOrganization(auth.user);
      return NextResponse.json(await listOrganizationCompanies(org.organization_id));
    }

    return NextResponse.json({ detail: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ detail: (e as Error).message }, { status: statusFor(e) });
  }
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    const p = segments(params);

    if (p.join('/') === 'account/firebase-session') {
      const body = await req.json();
      return createFirebaseSessionResponse(String(body.id_token || ''));
    }
    if (p.join('/') === 'account/register') {
      if (isRealDataMode()) return registerManagedAccount(await req.json());
      const user = await registerLabAccount(await req.json());
      return accountResponse(user);
    }
    if (p.join('/') === 'account/login') {
      if (isRealDataMode()) return loginManagedAccount(await req.json());
      const user = await loginLabAccount(await req.json());
      return accountResponse(user);
    }
    if (p.join('/') === 'account/logout') return logoutManagedResponse(req);

    const auth = await authenticateRequest(req);
    const organization = auth.kind === 'customer' && isRealDataMode() ? await ensurePersonalOrganization(auth.user) : null;

    if (p.join('/') === 'initialization/template/request') {
      const body = await req.json();
      const country = getCountry(String(body.country || ''));
      if (!country) return NextResponse.json({ detail: 'unsupported country' }, { status: 400 });
      return NextResponse.json({ download_url: `/api/initialization/template/${country.code}`, note: `Template ready for ${country.name}.` });
    }

    if (p.join('/') === 'service-deployments/start') {
      const body = await req.json();
      const user = auth.kind === 'customer' ? auth.user : null;
      return NextResponse.json(await startServiceDeployment({
        service: String(body.service || ''),
        name: user?.name || String(body.name || ''),
        email: user?.email || String(body.email || ''),
        country_code: body.country_code ? String(body.country_code) : undefined,
        organization_id: organization?.organization_id,
        owner_user_id: user?.user_id
      }));
    }

    if (p.length >= 2 && p[0] === 'service-deployments') await authorizedDeployment(req, p[1], 'VIEWER');

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'payroll' && p[3] === 'runs') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await preparePayrollRun(p[1], await req.json()));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'bookkeeping' && p[3] === 'batches') {
      const scoped = await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      const batch = await prepareBookkeepingBatch(p[1], await req.json()) as Record<string, any>;
      if (isRealDataMode() && scoped.auth.kind === 'customer') {
        await persistBookkeepingBatch({
          organization_id: String(scoped.deployment.organization_id),
          company_id: String(scoped.deployment.company_id),
          actor_user_id: scoped.auth.user.user_id,
          batch
        });
      }
      return NextResponse.json(batch);
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'finance-cycles') {
      const scoped = await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      const cycle = await prepareFinanceCycle(p[1], await req.json()) as Record<string, any>;
      if (isRealDataMode() && scoped.auth.kind === 'customer' && cycle.bookkeeping_batch_id) {
        const batch = await getBookkeepingBatch(p[1], String(cycle.bookkeeping_batch_id)) as Record<string, any>;
        await persistBookkeepingBatch({
          organization_id: String(scoped.deployment.organization_id),
          company_id: String(scoped.deployment.company_id),
          actor_user_id: scoped.auth.user.user_id,
          batch
        });
      }
      return NextResponse.json(cycle);
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'close-controls' && p[3] === 'source-requirements') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await configureSourceRequirements(p[1], await req.json()));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'close-controls' && p[3] === 'source-evidence') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await recordPeriodSourceEvidence(p[1], await req.json()));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'close-controls' && p[3] === 'balance-sheet-scope') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await configureBalanceSheetScope(p[1], await req.json()));
    }

    if (p.length === 6 && p[0] === 'service-deployments' && p[2] === 'monthly-closes' && p[4] === 'source-completeness' && p[5] === 'evaluate') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await evaluateSourceCompleteness(p[1], p[3]));
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'monthly-closes' && p[4] === 'balance-sheet-reconciliation') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await prepareBalanceSheetReconciliation(p[1], p[3], await req.json()));
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'monthly-closes' && p[4] === 'approve') {
      await authorizedDeployment(req, p[1], 'APPROVER');
      const body = await req.json().catch(() => ({}));
      return NextResponse.json(await approveMonthlyClose(p[1], p[3], actorFromAuth(auth), body.note));
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'monthly-closes' && p[4] === 'lock') {
      await authorizedDeployment(req, p[1], 'APPROVER');
      const body = await req.json().catch(() => ({}));
      return NextResponse.json(await lockMonthlyClose(p[1], p[3], actorFromAuth(auth), body.note));
    }

    if (p.length === 5 && p[0] === 'service-deployments' && p[2] === 'monthly-closes' && p[4] === 'reopen') {
      await authorizedDeployment(req, p[1], 'ADMIN');
      const body = await req.json();
      return NextResponse.json(await reopenMonthlyClose(p[1], p[3], actorFromAuth(auth), String(body.reason || '')));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'configuration') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await saveServiceConfiguration(p[1], await req.json()));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'company') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      const body = await req.json();
      if (!body.company_id) return NextResponse.json({ detail: 'company_id is required' }, { status: 400 });
      if (auth.kind === 'customer' && isRealDataMode()) await requireCompanyAccess(String(body.company_id), auth.user, 'ACCOUNTANT');
      return NextResponse.json(await linkDeploymentCompany(p[1], String(body.company_id)));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'history') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json(await saveHistoricalContext(p[1], String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'history' && p[3] === 'skip') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      return NextResponse.json(await skipHistoricalContext(p[1]));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'connector') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      const deployment = await getServiceDeployment(p[1]) as Record<string, any>;
      if (!historyReady(deployment)) return NextResponse.json({ detail: 'complete historical-context step before selecting a current-system connector' }, { status: 409 });
      const body = await req.json();
      return NextResponse.json(await selectServiceConnector(p[1], String(body.connector || '')));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'source') {
      await authorizedDeployment(req, p[1], 'ACCOUNTANT');
      const deployment = await getServiceDeployment(p[1]) as Record<string, any>;
      if (!historyReady(deployment)) return NextResponse.json({ detail: 'complete historical-context step before sending current source data' }, { status: 409 });
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json(await saveServiceSource(p[1], String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    if (p.join('/') === 'initialization/upload') {
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      const ownership = auth.kind === 'customer' && isRealDataMode()
        ? { organization_id: organization?.organization_id, owner_user_id: auth.user.user_id }
        : undefined;
      return NextResponse.json({ records: [await saveInitialization(String(body.filename), Buffer.from(String(body.content_base64), 'base64'), ownership)] });
    }

    if (p.length === 3 && p[0] === 'initialization' && p[2] === 'initialize') {
      await authorizedInitialization(req, p[1]);
      return NextResponse.json(await initializeCompany(p[1]));
    }

    if (p.join('/') === 'initialization/initialize-ready') {
      const body = await req.json();
      const ids: string[] = Array.isArray(body.initialization_ids) ? body.initialization_ids : [];
      const initialized = [];
      const blocked = [];
      for (const id of ids) {
        try {
          await authorizedInitialization(req, String(id));
          initialized.push(await initializeCompany(String(id)));
        } catch (e) { blocked.push({ initialization_id: id, detail: (e as Error).message }); }
      }
      return NextResponse.json({ initialized, blocked });
    }

    if (p.length === 3 && p[0] === 'companies' && p[2] === 'data-chunks') {
      const body = await req.json();
      if (!body.stage || !body.filename || !body.content_base64) return NextResponse.json({ detail: 'stage, filename and content_base64 are required' }, { status: 400 });
      if (auth.kind === 'customer' && isRealDataMode()) await requireCompanyAccess(p[1], auth.user, 'ACCOUNTANT');
      return NextResponse.json(await saveDataChunk(p[1], String(body.stage), String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    return NextResponse.json({ detail: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ detail: (e as Error).message }, { status: statusFor(e) });
  }
}
