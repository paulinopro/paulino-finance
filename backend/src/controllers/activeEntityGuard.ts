import { Response } from 'express';
import {
  ActivatableEntity,
  InactiveEntityError,
  requireEntityActive,
} from '../services/entityActivation';

const INACTIVE_ENTITY_MESSAGE =
  'El registro está inactivo. Habilítalo para realizar esta operación.';

export function respondInactiveEntityError(error: unknown, res: Response): boolean {
  if (!(error instanceof InactiveEntityError)) {
    return false;
  }

  res.status(409).json({ message: INACTIVE_ENTITY_MESSAGE });
  return true;
}

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
    if (respondInactiveEntityError(error, res)) return false;
    throw error;
  }
}
