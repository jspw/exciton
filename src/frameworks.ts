/**
 * The agentic workflow frameworks exciton dials.
 *
 * exciton exists because frameworks install once, globally, and then govern
 * every session. Ordinary plugins — linters, design helpers, language servers —
 * do not have that problem, so exciton does not touch them: anything absent
 * from this set is left exactly as the user configured it.
 *
 * Widening this set is a deliberate act. Each addition needs a staging profile
 * that is known to work for that framework's layout.
 */
export const FRAMEWORKS = new Set(['superpowers']);

export function isFramework(name: string): boolean {
  return FRAMEWORKS.has(name);
}

/**
 * Every managed framework id present in `ids`, whether or not it was named.
 *
 * Frameworks are mutually exclusive: each one wants to define how the session
 * is conducted, so running one means silencing all the others. Selecting only
 * the *named* framework would leave a second one — globally enabled and
 * unmentioned — still governing the session, which is the precise mixture
 * exciton exists to prevent.
 *
 * Ordinary plugins are never selected. They add capability rather than compete
 * for control: superpowers can set the strategy while a design plugin handles
 * the design work in the same session.
 */
export function frameworkIdsIn(ids: string[]): string[] {
  return ids.filter(id => isFramework(id.split('@')[0]));
}
