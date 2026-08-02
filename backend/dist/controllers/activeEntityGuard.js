"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.respondInactiveEntityError = respondInactiveEntityError;
exports.ensureActiveEntity = ensureActiveEntity;
const entityActivation_1 = require("../services/entityActivation");
const INACTIVE_ENTITY_MESSAGE = 'El registro está inactivo. Habilítalo para realizar esta operación.';
function respondInactiveEntityError(error, res) {
    if (!(error instanceof entityActivation_1.InactiveEntityError)) {
        return false;
    }
    res.status(409).json({ message: INACTIVE_ENTITY_MESSAGE });
    return true;
}
async function ensureActiveEntity(entity, id, userId, res) {
    try {
        const found = await (0, entityActivation_1.requireEntityActive)(entity, id, userId);
        if (found === false) {
            res.status(404).json({ message: 'Entity not found' });
            return false;
        }
        return true;
    }
    catch (error) {
        if (respondInactiveEntityError(error, res))
            return false;
        throw error;
    }
}
//# sourceMappingURL=activeEntityGuard.js.map