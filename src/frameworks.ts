import { UserError } from './ui.ts';

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
 * The single refusal, shared by every path that can be handed a name: running
 * one and caching one have to answer identically, or the tool contradicts
 * itself about what it supports.
 */
export function unmanagedError(strays: string[]): Error {
  const many = strays.length > 1;
  return new UserError(
    `exciton doesn't manage ${strays.join(', ')}`,
    [
      `It manages agentic workflow frameworks — currently ${[...FRAMEWORKS].join(', ')} — ` +
      `because those compete to define how a session is conducted.`,
      `${many ? 'These add capabilities' : 'This adds a capability'} rather than competing, ` +
      `so ${many ? 'they keep' : 'it keeps'} working exactly as your settings already have ` +
      `${many ? 'them' : 'it'}. There's nothing to name here.`,
    ],
  );
}

/**
 * exciton dials agentic workflow frameworks. Refusing anything else is the
 * point, not a limitation: an ordinary plugin is already doing what its owner
 * configured, and exciton has no business overriding it.
 */
export function assertManaged(resolved: { name: string }[]): void {
  const strays = resolved.filter(r => !isFramework(r.name)).map(r => r.name);
  if (strays.length > 0) throw unmanagedError(strays);
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
