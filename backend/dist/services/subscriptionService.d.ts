export declare function getAllowedModulesForUserId(userId: number): Promise<string[]>;
export declare function getSubscriptionDetailsForUser(userId: number): Promise<{
    isSuperAdmin: boolean;
    status: "active";
    plan: null;
    modules: ("dashboard" | "cards" | "loans" | "income" | "expenses" | "accounts" | "reports" | "calendar" | "accounts_payable" | "accounts_receivable" | "budgets" | "financial_goals" | "cash_flow" | "projections" | "vehicles" | "notifications" | "categories" | "templates" | "settings" | "profile" | "subscription")[];
    currentPeriodEnd: null;
    paypalSubscriptionId: null;
} | {
    isSuperAdmin: boolean;
    status: "none";
    plan: null;
    modules: string[];
    currentPeriodEnd: null;
    paypalSubscriptionId: null;
} | {
    isSuperAdmin: boolean;
    status: any;
    plan: {
        id: any;
        name: any;
        slug: any;
        priceMonthly: number;
        priceYearly: number;
        currency: any;
    };
    modules: string[];
    currentPeriodEnd: any;
    paypalSubscriptionId: any;
}>;
export declare function assignPlanToUser(userId: number, planId: number): Promise<void>;
//# sourceMappingURL=subscriptionService.d.ts.map