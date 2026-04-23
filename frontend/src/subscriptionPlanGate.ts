/**
 * Estado fuera de React para el interceptor de axios: solo redirigir a /subscription
 * por denegación de módulo cuando el usuario no tiene plan asignado (subscription.plan == null).
 * null = aún no cargó /subscription/me.
 */
let subscriptionPlanAssigned: boolean | null = null;

export function setSubscriptionPlanAssignedFlag(value: boolean | null): void {
  subscriptionPlanAssigned = value;
}

export function getSubscriptionPlanAssignedFlag(): boolean | null {
  return subscriptionPlanAssigned;
}
