import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ActivatableEntity, setEntityActiveStatus } from '../services/entityActivation';
type ActiveStatusSetter = typeof setEntityActiveStatus;
export declare function createEntityActiveStatusHandler(entity: ActivatableEntity, setter?: ActiveStatusSetter): (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export {};
//# sourceMappingURL=entityActiveStatus.d.ts.map