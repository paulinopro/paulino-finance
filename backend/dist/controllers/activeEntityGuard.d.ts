import { Response } from 'express';
import { ActivatableEntity } from '../services/entityActivation';
export declare function ensureActiveEntity(entity: ActivatableEntity, id: number, userId: number, res: Response): Promise<boolean>;
//# sourceMappingURL=activeEntityGuard.d.ts.map