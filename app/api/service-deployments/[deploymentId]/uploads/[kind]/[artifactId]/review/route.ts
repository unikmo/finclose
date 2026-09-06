import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '../../../../../../../../lib/managed-auth';
import { getServiceDeployment } from '../../../../../../../../lib/service-deployments';
import { deploymentAuthorization } from '../../../../../../../../lib/tenancy';
import { reviewServiceUpload, type UploadArtifactKind, type UploadReviewDecision } from '../../../../../../../../lib/upload-quarantine';
import { statusFor } from '../../../../../../../../lib/finclose-backend';

export async function POST(
  req: NextRequest,
  { params }: { params: { deploymentId: string; kind: string; artifactId: string } }
) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.kind !== 'customer') return NextResponse.json({ detail: 'customer authentication is required' }, { status: 403 });
    const deployment = await getServiceDeployment(params.deploymentId) as Record<string, any>;
    await deploymentAuthorization(deployment, auth.user, 'ADMIN');
    const kind = String(params.kind || '').toLowerCase();
    if (kind !== 'history' && kind !== 'source') return NextResponse.json({ detail: 'kind must be history or source' }, { status: 400 });
    const body = await req.json();
    const decision = String(body.decision || '').toUpperCase();
    if (decision !== 'CLEAN' && decision !== 'REJECTED') return NextResponse.json({ detail: 'decision must be CLEAN or REJECTED' }, { status: 400 });
    return NextResponse.json(await reviewServiceUpload({
      deployment_id: params.deploymentId,
      kind: kind as UploadArtifactKind,
      artifact_id: params.artifactId,
      actor_user_id: auth.user.user_id,
      decision: decision as UploadReviewDecision,
      note: body.note
    }));
  } catch (error) {
    return NextResponse.json({ detail: (error as Error).message }, { status: statusFor(error) });
  }
}
