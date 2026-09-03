import { NextRequest, NextResponse } from 'next/server';
import { COUNTRIES, assertLabToken, buildTemplate, getCountry, initializeCompany, listCompanies, realtimeDatabase, saveDataChunk, saveInitialization, statusFor, storageBucket } from '../../../lib/finclose-backend';
import { getServiceDeployment, publicServiceCatalog, saveServiceConfiguration, saveServiceSource, selectServiceConnector, startServiceDeployment } from '../../../lib/service-deployments';
import { linkDeploymentCompany, saveHistoricalContext, skipHistoricalContext } from '../../../lib/onboarding-history';

function segments(params: { path?: string[] }) { return params.path || []; }

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    const p = segments(params);
    if (p.length === 1 && p[0] === 'health') {
      const configured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_STORAGE_BUCKET && process.env.FINCLOSE_LAB_TOKEN);
      const deep = req.nextUrl.searchParams.get('deep') === '1';
      if (!deep || !configured) return NextResponse.json({ version: '0.26.0', hosting: 'vercel', database: 'firebase-realtime-database', storage: 'firebase-storage', configured });
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
      return NextResponse.json({ version: '0.26.0', hosting: 'vercel', database: 'firebase-realtime-database', storage: 'firebase-storage', configured, reachable, ok: reachable.database && reachable.storage, errors });
    }
    if (p.join('/') === 'service-deployments/catalog') return NextResponse.json(publicServiceCatalog());
    if (p.length === 2 && p[0] === 'service-deployments') {
      assertLabToken(req);
      return NextResponse.json(await getServiceDeployment(p[1]));
    }
    if (p.join('/') === 'initialization/countries') return NextResponse.json(COUNTRIES.map(({code,name,currency})=>({code,name,currency})));
    if (p.length === 3 && p[0] === 'initialization' && p[1] === 'template') {
      const country = getCountry(p[2]);
      if (!country) return NextResponse.json({ detail: 'unsupported country' }, { status: 404 });
      const buffer = buildTemplate(country);
      return new NextResponse(new Uint8Array(buffer), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="FinCloseAgent_Initialization_${country.code}.xlsx"` } });
    }
    if (p.length === 1 && p[0] === 'companies') { assertLabToken(req); return NextResponse.json(await listCompanies()); }
    return NextResponse.json({ detail: 'not found' }, { status: 404 });
  } catch (e) { return NextResponse.json({ detail: (e as Error).message }, { status: statusFor(e) }); }
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    const p = segments(params);
    if (p.join('/') === 'initialization/template/request') {
      const body = await req.json();
      const country = getCountry(String(body.country || ''));
      if (!country) return NextResponse.json({ detail: 'unsupported country' }, { status: 400 });
      return NextResponse.json({ download_url: `/api/initialization/template/${country.code}`, note: `Template ready for ${country.name}. Email delivery is not enabled in this Lab build.` });
    }

    assertLabToken(req);

    if (p.join('/') === 'service-deployments/start') {
      const body = await req.json();
      return NextResponse.json(await startServiceDeployment({
        service: String(body.service || ''),
        name: String(body.name || ''),
        email: String(body.email || ''),
        country_code: body.country_code ? String(body.country_code) : undefined
      }));
    }
    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'configuration') {
      const body = await req.json();
      return NextResponse.json(await saveServiceConfiguration(p[1], body));
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
      const historyReady = deployment.history_status === 'RECEIVED' || deployment.history_status === 'NOT_APPLICABLE_NEW_COMPANY';
      if (!historyReady) return NextResponse.json({ detail: 'complete historical-context step before selecting a current-system connector' }, { status: 409 });
      const body = await req.json();
      return NextResponse.json(await selectServiceConnector(p[1], String(body.connector || '')));
    }
    if (p.length === 3 && p[0] === 'service-deployments' && p[2] === 'source') {
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      return NextResponse.json(await saveServiceSource(p[1], String(body.filename), Buffer.from(String(body.content_base64), 'base64')));
    }

    if (p.join('/') === 'initialization/upload') {
      const body = await req.json();
      if (!body.filename || !body.content_base64) return NextResponse.json({ detail: 'filename and content_base64 are required' }, { status: 400 });
      const record = await saveInitialization(String(body.filename), Buffer.from(String(body.content_base64), 'base64'));
      return NextResponse.json({ records: [record] });
    }
    if (p.length === 3 && p[0] === 'initialization' && p[2] === 'initialize') return NextResponse.json(await initializeCompany(p[1]));
    if (p.join('/') === 'initialization/initialize-ready') {
      const body = await req.json();
      const ids: string[] = Array.isArray(body.initialization_ids) ? body.initialization_ids : [];
      const initialized = []; const blocked = [];
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
  } catch (e) { return NextResponse.json({ detail: (e as Error).message }, { status: statusFor(e) }); }
}
