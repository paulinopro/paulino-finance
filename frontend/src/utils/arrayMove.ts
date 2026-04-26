/** Mueve un elemento de `from` a `to` (misma longitud, nuevo array). */
export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  const a = arr.slice();
  if (from < 0 || from >= a.length || to < 0 || to >= a.length) return arr;
  const [m] = a.splice(from, 1);
  a.splice(to, 0, m);
  return a;
}
