"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIncomeTimeline = exports.getExpenseTimeline = void 0;
const financialItemTimelineService_1 = require("../services/financialItemTimelineService");
function firstQueryString(v) {
    if (v == null)
        return undefined;
    if (Array.isArray(v))
        return firstQueryString(v[0]);
    return String(v);
}
function parseTimelineQuery(req) {
    const rawPage = firstQueryString(req.query.page);
    const rawLimit = firstQueryString(req.query.limit);
    const rawRefresh = firstQueryString(req.query.refreshCalendar);
    const page = Math.max(1, parseInt(String(rawPage ?? '1'), 10) || 1);
    let limit = parseInt(String(rawLimit ?? '10'), 10);
    if (!Number.isFinite(limit))
        limit = 10;
    limit = Math.min(100, Math.max(1, limit));
    const refreshCalendar = String(rawRefresh ?? 'true').toLowerCase() !== 'false';
    return { page, limit, refreshCalendar };
}
const getExpenseTimeline = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id, 10);
        if (Number.isNaN(expenseId)) {
            return res.status(400).json({ message: 'Invalid expense id' });
        }
        const { page, limit, refreshCalendar } = parseTimelineQuery(req);
        const data = await (0, financialItemTimelineService_1.buildExpenseTimeline)(userId, expenseId, { page, limit, refreshCalendar });
        res.json({ success: true, ...data });
    }
    catch (error) {
        if (error instanceof financialItemTimelineService_1.TimelineNotFoundError) {
            return res.status(404).json({ message: error.message });
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Expense timeline error:', error);
        res.status(500).json({ message: 'Error loading expense timeline', error: msg });
    }
};
exports.getExpenseTimeline = getExpenseTimeline;
const getIncomeTimeline = async (req, res) => {
    try {
        const userId = req.userId;
        const incomeId = parseInt(req.params.id, 10);
        if (Number.isNaN(incomeId)) {
            return res.status(400).json({ message: 'Invalid income id' });
        }
        const { page, limit, refreshCalendar } = parseTimelineQuery(req);
        const data = await (0, financialItemTimelineService_1.buildIncomeTimeline)(userId, incomeId, { page, limit, refreshCalendar });
        res.json({ success: true, ...data });
    }
    catch (error) {
        if (error instanceof financialItemTimelineService_1.TimelineNotFoundError) {
            return res.status(404).json({ message: error.message });
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Income timeline error:', error);
        res.status(500).json({ message: 'Error loading income timeline', error: msg });
    }
};
exports.getIncomeTimeline = getIncomeTimeline;
//# sourceMappingURL=financialTimelineController.js.map