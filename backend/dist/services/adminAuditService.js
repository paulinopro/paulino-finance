"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAdminAction = logAdminAction;
const database_1 = require("../config/database");
async function logAdminAction(actorId, action, targetType = null, targetId = null, details = null) {
    try {
        if (details == null) {
            await (0, database_1.query)(`INSERT INTO admin_audit_log (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)`, [actorId, action.slice(0, 80), targetType, targetId]);
        }
        else {
            await (0, database_1.query)(`INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`, [actorId, action.slice(0, 80), targetType, targetId, JSON.stringify(details)]);
        }
    }
    catch (e) {
        console.error('logAdminAction', e);
    }
}
//# sourceMappingURL=adminAuditService.js.map