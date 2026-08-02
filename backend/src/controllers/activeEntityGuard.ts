import { Response } from 'express';
import {
  ActivatableEntity,
  InactiveEntityError,
  requireEntityActive,
} from '../services/entityActivation';

export async function ensureActiveEntity(
  entity: ActivatableEntity,
  id: number,
  userId: number,
  res: Response
): Promise<boolean> {
  try {
    const found = await requireEntityActive(entity, id, userId);
    if (found === false) {
      res.status(404).json({ message: 'Entity not found' });
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof InactiveEntityError) {
      res.status(409).json({ message: 'El registro está inactivo. Habilítalo para realizar esta operación.' });
      return false;
    }
    throw error;
  }
}
