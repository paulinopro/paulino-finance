"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEntityActiveStatusHandler = createEntityActiveStatusHandler;
const entityActivation_1 = require("../services/entityActivation");
function createEntityActiveStatusHandler(entity, setter = entityActivation_1.setEntityActiveStatus) {
    return async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({ message: 'Invalid entity id' });
            }
            if (typeof req.body?.isActive !== 'boolean') {
                return res.status(400).json({ message: 'isActive must be a boolean' });
            }
            const result = await setter(entity, id, req.userId, req.body.isActive);
            if (!result) {
                return res.status(404).json({ message: 'Entity not found' });
            }
            return res.json(result);
        }
        catch (error) {
            console.error('Update entity active status error:', error);
            return res.status(500).json({ message: 'Error updating entity status' });
        }
    };
}
//# sourceMappingURL=entityActiveStatus.js.map