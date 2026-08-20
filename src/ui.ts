/**
 * Terminal styling, kept to what exciton actually uses.
 *
 * No dependency: a colour library would be this project's first runtime one,
 * and the whole need is a handful of SGR codes behind a capability check.
 */

/** Honours NO_COLOR, and never emits escapes into a pipe or a log file. */
export function colorEnabled(): boolean {
  return Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
}

const style = (open: string) => (s: string) =>
  colorEnabled() ? `\x1b[${open}m${s}\x1b[0m` : s;

export const bold = style('1');
export const dim = style('2');
export const cyan = style('36');
export const green = style('32');
export const yellow = style('33');

/** Marks that read as intended even where colour is stripped. */
export const CHECK = '✓';
export const DOT = '·';
export const ARROW = '›';
export const CROSS = '✗';

/** Width on screen: SGR escapes occupy string length but no columns. */
export function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Wraps to the terminal, capped so long lines stay readable on wide screens.
 *
 * A line that already fits is emitted untouched. Re-flowing it would collapse
 * deliberate runs of spaces, which is how aligned things — a table of flags,
 * a command set off from its sentence — lose their alignment.
 */
export function wrap(text: string, width = messageWidth()): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (visibleLength(paragraph) <= width) { out.push(paragraph); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line === '') line = word;
      else if (visibleLength(`${line} ${word}`) <= width) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function messageWidth(): number {
  const columns = process.stderr.columns ?? 80;
  return Math.max(40, Math.min(columns - 6, 74));
}

/**
 * One shape for everything exciton says: a marked headline, then indented
 * detail aligned under it.
 *
 * Without this each call site invented its own prefix and ran to whatever
 * length the sentence happened to be, so a refusal and a success looked
 * identical and neither wrapped to the terminal.
 */
export function block(mark: string, headline: string, details: string[] = []): string {
  const lines = [`  ${mark}  ${headline}`];
  for (const detail of details) {
    lines.push('');
    for (const line of wrap(detail)) lines.push(line === '' ? '' : `     ${line}`);
  }
  // Trailing blank line: two blocks in a row otherwise run together, and the
  // second one's mark lands directly under the first one's last detail.
  return `${lines.join('\n')}\n\n`;
}

export const failure = (headline: string, details: string[] = []) =>
  block(colorEnabled() ? `\x1b[31m${CROSS}\x1b[0m` : CROSS, bold(headline), details);

export const success = (headline: string, details: string[] = []) =>
  block(green(CHECK), headline, details);

export const note = (headline: string, details: string[] = []) =>
  block(dim(DOT), headline, details);

/**
 * An error with presentation attached.
 *
 * The top-level handler used to prefix every message with `exciton: `, which
 * read as "exciton: exciton does not manage warp" whenever the message named
 * the tool itself. Carrying the shape with the error removes the guesswork.
 */
export class UserError extends Error {
  readonly details: string[];
  constructor(headline: string, details: string[] = []) {
    super(headline);
    this.name = 'UserError';
    this.details = details;
  }
  render(): string {
    return failure(this.message, this.details);
  }
}
