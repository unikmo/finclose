import type { PackRecord } from './pack-store';
import type { PortfolioStatusColor } from './portfolio-status';
import type { ReviewPack } from './review-pack';

// One saved pack -> the traffic light the firm portfolio uses. Any HIGH exception
// is RED; a signed-off pack with none is GREEN; everything else is YELLOW. No
// pack is NOT_STARTED. This reads the pack only; it posts nothing.

export function packPortfolioStatus(record: PackRecord | null, pack: ReviewPack | null): { status: PortfolioStatusColor; reasons: string[] } {
  if (!record || !pack) return { status: 'NOT_STARTED', reasons: [] };
  const high = pack.exceptions.filter(e => e.severity === 'HIGH').map(e => e.code);
  if (high.length) return { status: 'RED', reasons: [...new Set(high)] };
  if (record.status === 'SIGNED_OFF') return { status: 'GREEN', reasons: [] };
  return { status: 'YELLOW', reasons: [record.status === 'SUPERSEDED' ? 'SUPERSEDED' : 'AWAITING_SIGNOFF'] };
}
