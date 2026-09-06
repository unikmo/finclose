import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../../../../../../lib/managed-auth';
import { getServiceDeployment } from '../../../../../../../../lib/service-deployments';
import { deploymentAuthorization } from '../../../../../../../../lib/tenancy';
import { downloadServiceUploadForReview, reviewServiceUpload, type UploadArtifactKind, type UploadReviewDecision } from '../../../../../../../../lib/upload-quarantine';
import { statusFor } from '../../../../../../../../lib/finclose-backend';

function parsedKind(raw: string): UploadArtifactKind | null {
  const kind = String(raw || '').toLowerCase();
  return kind === 'history' || kind === 'source' ? kind : null;
}

async function authorizedAdmin(req: NextRequest, deploymentId: string) {
  const auth = await authenticateRequest(req);
  if (auth.kind !== 'customer') throw Object.assign(new Error('customer authentication is required'), { status: 403 });
  const deployment = await getServiceDeployment(deploymentId) as Record<string, any>;
  await deploymentAuthorization(deployment, auth.user, 'ADMIN');
  return auth;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { deploymentId: string; kind: string; artifactId: string } }
) {
  try {
    await authorizedAdmin(req, params.deploymentId);
    const kind = parsedKind(params.kind);
    if (!kind) return NextResponse.json({ detail: 'kind must be history or source' }, { status: 400 });
    const result = await downloadServiceUploadForReview({
      deployment_id: params.deploymentId,
      kind,
      artifact_id: params.artifactId
    });
    const safeFilename = result.artifact.filename.replace(/["\r\n]/g, '_');
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${safeFilename}"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
        'x-finclose-sha256': result.artifact.sha256
      }
    });
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { deploymentId: string; kind: string; artifactId: string } }
) {
  try {
    const auth = await authorizedAdmin(req, params.deploymentId);
    const kind = parsedKind(params.kind);
    if (!kind) return NextResponse.json({ detail: 'kind must be history or source' }, { status: 400 });
    const body = await req.json();
    const decision = String(body.decision || '').toUpperCase();
    if (decision !== 'CLEAN' && decision !== 'REJECTED') return NextResponse.json({ detail: 'decision must be CLEAN or REJECTED' }, { status: 400 });
    return NextResponse.json(await reviewServiceUpload({
      deployment_id: params.deploymentId,
      kind,
      artifact_id: params.artifactId,
      actor_user_id: auth.user.user_id,
      decision: decision as UploadReviewDecision,
      note: body.note
    }));
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
