import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  ActivatableEntity,
  setEntityActiveStatus,
} from '../services/entityActivation';

type ActiveStatusSetter = typeof setEntityActiveStatus;

export function createEntityActiveStatusHandler(
  entity: ActivatableEntity,
  setter: ActiveStatusSetter = setEntityActiveStatus
) {
  return async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'Invalid entity id' });
      }
      if (typeof req.body?.isActive !== 'boolean') {
        return res.status(400).json({ message: 'isActive must be a boolean' });
      }

      const result = await setter(entity, id, req.userId!, req.body.isActive);
      if (!result) {
        return res.status(404).json({ message: 'Entity not found' });
      }
      return res.json(result);
    } catch (error: any) {
      console.error('Update entity active status error:', error);
      return res.status(500).json({ message: 'Error updating entity status' });
    }
  };
}
