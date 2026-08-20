import { closeSync, openSync, readSync } from 'node:fs';
import { bold, cyan, dim, green, ARROW, CHECK } from './ui.ts';

export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Whether exciton may ask the user anything at all.
 *
 * Every prompt is gated on this. A CLI that blocks on a keypress inside CI —
 * where no key is ever coming — is broken, and exciton is meant to be scriptable.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

/**
 * Reads one keypress.
 *
 * Opens /dev/tty rather than reading fd 0: a non-blocking stdin makes readSync
 * throw EAGAIN, and busy-looping on that burns a core. /dev/tty is a fresh
 * blocking handle to the same terminal, which is also why this is POSIX-only —
 * already a project-wide decision.
 */
function readKey(fd: number): string {
  const buf = Buffer.alloc(8);
  const n = readSync(fd, buf, 0, 8, null);
  return buf.subarray(0, n).toString('utf8');
}

const UP = ['\x1b[A', '\x1bOA', 'k'];
const DOWN = ['\x1b[B', '\x1bOB', 'j'];
const ENTER = ['\r', '\n'];
const INTERRUPT = ['\x03', '\x04'];

function write(s: string): void {
  process.stderr.write(s);
}

/** Runs `body` with the terminal in raw mode and the cursor hidden, always restoring both. */
function withRawTerminal<T>(body: (fd: number) => T): T {
  const fd = openSync('/dev/tty', 'r');
  const wasRaw = process.stdin.isRaw === true;
  process.stdin.setRawMode?.(true);
  write('\x1b[?25l');
  try {
    return body(fd);
  } finally {
    write('\x1b[?25h');
    process.stdin.setRawMode?.(wasRaw);
    closeSync(fd);
  }
}

/** Ctrl-C in raw mode does not raise SIGINT — the key arrives as data, so honour it here. */
function abort(): never {
  write('\n');
  process.exit(130);
}

/**
 * One row per choice.
 *
 * Multi-select draws an explicit `[ ]` / `[✓]` box. A bare space for
 * "unselected" left no sign that selecting was possible at all — the first
 * person to see this prompt pressed enter and chose nothing without ever
 * learning space was the key.
 */
export function choiceLines(
  choices: Choice[], active: number, selected?: Set<string>,
): string[] {
  const width = Math.max(...choices.map(c => c.label.length));
  return choices.map((c, i) => {
    const on = i === active;
    const box = selected ? (selected.has(c.value) ? `[${green(CHECK)}]` : '[ ]') : '';
    const pointer = on ? cyan(ARROW) : ' ';
    // Pad before styling: escape sequences take width in the string but none on
    // screen, so padding a styled label misaligns every coloured row.
    const label = c.label.padEnd(width);
    const hint = c.hint ? dim(`  ${c.hint}`) : '';
    return `  ${pointer} ${box}${box ? ' ' : ''}${on ? bold(label) : label}${hint}`;
  });
}

/** Says which keys do what. Without it, the prompt is a guessing game. */
export function keyHint(multi: boolean): string {
  return dim(multi
    ? '  ↑↓ move · space select · enter confirm (none is fine)'
    : '  ↑↓ move · enter select');
}

/** Redraws in place: move up over the previous frame, clearing each line. */
function repaint(lines: string[], previous: number): number {
  if (previous > 0) write(`\x1b[${previous}A`);
  for (const line of lines) write(`\x1b[2K${line}\n`);
  return lines.length;
}

/** One choice from a list. Returns the chosen value. */
export function select(question: string, choices: Choice[]): string {
  if (choices.length === 0) throw new Error('select needs at least one choice');
  write(`\n${bold(question)}\n${keyHint(false)}\n\n`);

  return withRawTerminal(fd => {
    let active = 0;
    let painted = repaint(choiceLines(choices, active), 0);

    for (;;) {
      const key = readKey(fd);
      if (INTERRUPT.includes(key)) abort();
      if (UP.includes(key)) active = (active - 1 + choices.length) % choices.length;
      else if (DOWN.includes(key)) active = (active + 1) % choices.length;
      else if (ENTER.includes(key)) {
        repaint(choiceLines(choices, active), painted);
        write('\n');
        return choices[active].value;
      }
      painted = repaint(choiceLines(choices, active), painted);
    }
  });
}

/** Any number of choices, including none. Returns the chosen values in list order. */
export function multiselect(question: string, choices: Choice[]): string[] {
  if (choices.length === 0) return [];
  write(`\n${bold(question)}\n${keyHint(true)}\n\n`);

  return withRawTerminal(fd => {
    const selected = new Set<string>();
    let active = 0;
    let painted = repaint(choiceLines(choices, active, selected), 0);

    for (;;) {
      const key = readKey(fd);
      if (INTERRUPT.includes(key)) abort();
      if (UP.includes(key)) active = (active - 1 + choices.length) % choices.length;
      else if (DOWN.includes(key)) active = (active + 1) % choices.length;
      else if (key === ' ') {
        const v = choices[active].value;
        if (selected.has(v)) selected.delete(v); else selected.add(v);
      } else if (key === 'a') {
        if (selected.size === choices.length) selected.clear();
        else for (const c of choices) selected.add(c.value);
      } else if (ENTER.includes(key)) {
        repaint(choiceLines(choices, active, selected), painted);
        write('\n');
        return choices.filter(c => selected.has(c.value)).map(c => c.value);
      }
      painted = repaint(choiceLines(choices, active, selected), painted);
    }
  });
}
