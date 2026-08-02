import express from 'express';
import {
  getConnections,
  getItems,
  getOneItem,
  patchItem,
  postImportRange,
  postSync,
  postItem,
  removeItem,
} from '../controllers/agendaController';
import {
  googleCalendarAuthorizeStart,
  googleCalendarDisconnect,
  googleCalendarListWritable,
  googleCalendarOAuthCallbackPublic,
  googleCalendarSetDefault,
} from '../controllers/agendaOAuthController';
import {
  icloudCalendarConnect,
  icloudCalendarDisconnect,
  icloudCalendarListWritable,
  icloudCalendarSetDefault,
} from '../controllers/agendaICloudController';
import { authenticate } from '../middleware/auth';
import { requireSubscriptionModule } from '../middleware/requireSubscriptionModule';

const router = express.Router();

/** OAuth redir público desde Google — valida JWT en param state */
router.get('/connect/google/callback', googleCalendarOAuthCallbackPublic);

router.use(authenticate);
router.use(requireSubscriptionModule('agenda'));

router.get('/connect/google/start', googleCalendarAuthorizeStart);
router.get('/connect/google/calendars', googleCalendarListWritable);
router.patch('/connect/google', googleCalendarSetDefault);
router.delete('/connect/google', googleCalendarDisconnect);

router.post('/connect/icloud', icloudCalendarConnect);
router.get('/connect/icloud/calendars', icloudCalendarListWritable);
router.patch('/connect/icloud', icloudCalendarSetDefault);
router.delete('/connect/icloud', icloudCalendarDisconnect);

router.get('/items', getItems);
router.get('/items/:id', getOneItem);
router.post('/items', postItem);
router.patch('/items/:id', patchItem);
router.delete('/items/:id', removeItem);

router.get('/connections', getConnections);
router.post('/sync', postSync);
router.post('/sync/import-range', postImportRange);

export default router;
