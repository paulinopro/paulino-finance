"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureActiveEntity = ensureActiveEntity;
const entityActivation_1 = require("../services/entityActivation");
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
        if (error instanceof entityActivation_1.InactiveEntityError) {
            res.status(409).json({ message: 'El registro está inactivo. Habilítalo para realizar esta operación.' });
            return false;
        }
        throw error;
    }
}
//# sourceMappingURL=activeEntityGuard.js.map