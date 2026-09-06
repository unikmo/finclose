import { NextRequest, NextResponse } from 'next/server';
import { COUNTRIES, buildTemplate, getCountry, initializeCompany, listCompanies, realtimeDatabase, saveDataChunk, saveInitialization, statusFor, storageBucket } from '../../../lib/finclose-backend';
import { getServiceDeployment, publicServiceCatalog, saveServiceConfiguration, saveServiceSource, selectServiceConnector, startServiceDeployment } from '../../../lib/service-deployments';
import { linkDeploymentCompany, saveHistoricalContext, skipHistoricalContext } from '../../../lib/onboarding-history';
import { accountResponse, assertCustomerOrLab, currentUser, loginLabAccount, logoutResponse, registerLabAccount } from '../../../lib/lab-auth';
import { getPayrollRun, PAYROLL_RULE_PACKS, payrollEngineSelfTest, preparePayrollRun } from '../../../lib/payroll-engine';
import { BOOKKEEPING_CORE_CAPABILITIES, bookkeepingEngineSelfTest, getBookkeepingBatch, prepareBookkeepingBatch } from '../../../lib/bookkeeping-engine';
import { FINANCE_CYCLE_CAPABILITIES, financeCycleSelfTest, getFinanceCycle, getMonthlyClose, prepareFinanceCycle } from '../../../lib/finance-cycle-engine';

function segments(params: { path?: string[] }) { return params.path || []; }
function historyReady(deployment: Record<string, any>) {
  return deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY';
}

function forbidden(message = 'this service session belongs to another account') {
  const error = new Error(message);
  (error as Error & { status?: number }).status = 403;
  return error;
}

async function authorizedDeployment(req: NextRequest, id: string) {
  const auth = assertCustomerOrLab(req);
  const deployment = await getServiceDeployment(id) as Record<string, any>;
  if (auth.kind === 'customer') {
    const ownerEmail = String(deployment.registrant?.email || '').trim().toLowerCase();
    if (!ownerEmail || ownerEmail !== auth.user.email.trim().toLowerCase()) throw forbidden();
  }
  return { auth, deployment };
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    const p = segments(params);

    if (p.length === 1 && p[0] === 'health') {
      const configured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_STORAGE_BUCKET && process.env.FINCLOSE_LAB_TOKEN);
      const deep = req.nextUrl.searchParams.get('deep') === '1';
      if (!deep || !configured) return NextResponse.json({ version: '0.31.0', hosting: 'vercel', database: 'firebase-realtime-database', storage: 'firebase-storage', configured });
      const reachable = { database: false, storage: false };
      const errors: string[] = [];
      try {
        await realtimeDatabase().ref('finclose_health').limitToFirst(1).once('value');
        reachable.database = true;
      } catch (e) { errors.push(`database: ${(e as Error).message}`); }
      try {
        await storageBucket().getMetadata();
        reachable.storage = true;
      } catch (e) { errors.push(`storage: ${(e as Error).message}`); }
      const payroll = payrollEngineSelfTest();
      const bookkeeping = bookkeepingEngineSelfTest();
      const financeCycle = financeCycleSelfTest();
      if (!payroll.ok) errors.push('payroll-engine: deterministic regression check failed');
      if (!bookkeeping.ok) errors.push('bookkeeping-engine: deterministic regression check failed');
      if (!financeCycle.ok) errors.push('finance-cycle: deterministic regression check failed');
      return NextResponse.json({
        version: '0.31.0',
        hosting: 'vercel',
        database: 'firebase-realtime-database',
        storage: 'firebase-storage',
        configured,
        reachable,
        engines: {
          payroll_ge_basic: payroll.ok,
          bookkeeping_core: bookkeeping.ok,
          finance_cycle: financeCycle.ok,
          monthly_close_controls: financeCycle.ok
        },
        ok: reachable.database && reachable.storage && payroll.ok && bookkeeping.ok && financeCycle.ok,
        errors
      });
    }

    if (p.join('/') === 'account/session') {
      const user = currentUser(req);
      return NextResponse.json({ authenticated: Boolean(user), user });
    }

    if (p.join('/') === 'service-deployments/catalog') return NextResponse.json(publicServiceCatalog());
    if (p.join('/') === 'initialization/countries') return NextResponse.json(COUNTRIES.map(({ code, name, currency }) => ({ code, name, currency })));
    if (p.join('/') === 'bookkeeping/capabilities') return NextResponse.json(BOOKKEEPING_CORE_CAPABILITIES);
    if (p.join('/') === 'finance-cycle/capabilities') return NextResponse.json(FINANCE_CYCLE_CAPABILITIES);

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

    if (p.length === 3 && p[0] === 'initialization' && p[1] === 'template') {
      assertCustomerOrLab(req);
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
      assertCustomerOrLab(req);
      return NextResponse.json(await listCompanies());
    }

    return NextResponse.json({ detail: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ detail: (e as Error).message }, { status: statusFor(e) });
  }
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    const p = segments(params);

    if (p.join('/') === 'account/register') {
      const user = await registerLabAccount(await req.json());
      return accountResponse(user);
    }
    if (p.join('/') === 'account/login') {
      const user = await loginLabAccount(await req.json());
      return accountResponse(user);
    }
    if (p.join('/') === 'account/logout') return logoutResponse();

    const auth = assertCustomerOrLab(req);

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
        country_code: body.country_code ? String(body.country_code) : undefined
      }));
    }

    if (p.length >= 2 && p[0] === 'service-deployments') await authorizedDeployment(req, p[1]);

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'payroll' && p[3] === 'runs') {
      return NextResponse.json(await preparePayrollRun(p[1], await req.json()));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'bookkeeping' && p[3] === 'batches') {
      return NextResponse.json(await prepareBookkeepingBatch(p[1], await req.json()));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'finance-cycles') {
      return NextResponse.json(await prepareFinanceCycle(p[1], await req.json()));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'configuration') {
      return NextResponse.json(await saveServiceConfiguration(p[1], await req.json()));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'company') {
      const body = await req.json();
      if (!body.company_id) return NextResponse.json({ detail: 'company_id is required' }, { status: 400 });
      return NextResponse.json(await linkDeploymentCompany(p[1], String(body.company_id)));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'history') {
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json(await saveHistoricalContext(p[1], String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    if (p.length === 4 && p[0] === 'service-deployments' && p[2] === 'history' && p[3] === 'skip') {
      return NextResponse.json(await skipHistoricalContext(p[1]));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'connector') {
      const deployment = await getServiceDeployment(p[1]) as Record<string, any>;
      if (!historyReady(deployment)) return NextResponse.json({ detail: 'complete historical-context step before selecting a current-system connector' }, { status: 409 });
      const body = await req.json();
      return NextResponse.json(await selectServiceConnector(p[1], String(body.connector || '')));
    }

    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'source') {
      const deployment = await getServiceDeployment(p[1]) as Record<string, any>;
      if (!historyReady(deployment)) return NextResponse.json({ detail: 'complete historical-context step before sending current source data' }, { status: 409 });
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json(await saveServiceSource(p[1], String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    if (p.join('/') === 'initialization/upload') {
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json({ records: [await saveInitialization(String(body.filename), Buffer.from(String(body.content_base64), 'base64'))] });
    }

    if (p.length === 3 && p[0] === 'initialization' && p[2] === 'initialize') {
      return NextResponse.json(await initializeCompany(p[1]));
    }

    if (p.join('/') === 'initialization/initialize-ready') {
      const body = await req.json();
      const ids: string[] = Array.isArray(body.initialization_ids) ? body.initialization_ids : [];
      const initialized = [];
      const blocked = [];
      for (const id of ids) {
        try { initialized.push(await initializeCompany(String(id))); }
        catch (e) { blocked.push({ initialization_id: id, detail: (e as Error).message }); }
      }
      return NextResponse.json({ initialized, blocked });
    }

    if (p.length === 3 && p[0] === 'companies' && p[2] === 'data-chunks') {
      const body = await req.json();
      if (!body.stage || !body.filename || !body.content_base64) return NextResponse.json({ detail: 'stage, filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json(await saveDataChunk(p[1], String(body.stage), String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    return NextResponse.json({ detail: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ detail: (e as Error).message }, { status: statusFor(e) });
  }
}
