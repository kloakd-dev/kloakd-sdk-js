import type { PipelineEvent } from './models.js';

/** A pipeline event payload (core/pipeline/models.py PipelineEvent.to_dict). */
export function parsePipelineEvent(data: Record<string, unknown>): PipelineEvent {
  const str = (k: string): string | null => (typeof data[k] === 'string' ? (data[k] as string) : null);
  const n = (k: string): number | null => (data[k] != null && Number.isFinite(Number(data[k])) ? Number(data[k]) : null);
  const err = data['error'];
  return {
    eventType: str('event_type') ?? str('type') ?? '',
    stageId: str('stage_id'),
    status: str('status'),
    message: str('message'),
    progressPct: n('progress_pct'),
    metadata: data['metadata'] !== null && typeof data['metadata'] === 'object' ? (data['metadata'] as Record<string, unknown>) : {},
    error: err !== null && typeof err === 'object' ? (err as Record<string, unknown>) : null,
    sequence: n('sequence'),
  };
}
