import { query } from '../config/database';

export async function logAdminAction(
  actorId: number,
  action: string,
  targetType: string | null = null,
  targetId: number | null = null,
  details: Record<string, unknown> | null = null
): Promise<void> {
  try {
    if (details == null) {
      await query(
        `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)`,
        [actorId, action.slice(0, 80), targetType, targetId]
      );
    } else {
      await query(
        `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [actorId, action.slice(0, 80), targetType, targetId, JSON.stringify(details)]
      );
    }
  } catch (e) {
    console.error('logAdminAction', e);
  }
}
