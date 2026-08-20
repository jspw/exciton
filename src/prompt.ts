import { closeSync, openSync, readSync } from 'node:fs';
import {
  bold, cyan, dim, green, rail, step, ARROW, CHECK, STEP_ACTIVE, STEP_DONE,
} from './ui.ts';

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

/** Says which keys do what. Without it, the prompt is a guessing game. */
export function keyHint(multi: boolean): string {
  return dim(multi
    ? '↑↓ move · space select · enter confirm (none is fine)'
    : '↑↓ move · enter select');
}

/**
 * The question while it is being answered: every choice, on the rail.
 *
 * Multi-select draws an explicit `[ ]` / `[✓]` box. A bare space for
 * "unselected" left no sign that selecting was possible at all — the first
 * person to see this prompt pressed enter and chose nothing without ever
 * learning space was the key.
 */
export function activeLines(
  question: string, choices: Choice[], active: number, selected?: Set<string>,
): string[] {
  const width = Math.max(...choices.map(c => c.label.length));
  const rows = choices.map((c, i) => {
    const on = i === active;
    const box = selected ? (selected.has(c.value) ? `[${green(CHECK)}]` : '[ ]') : '';
    const pointer = on ? cyan(ARROW) : ' ';
    // Pad before styling: escape sequences take width in the string but none on
    // screen, so padding a styled label misaligns every coloured row.
    const label = c.label.padEnd(width);
    const hint = c.hint ? dim(`  ${c.hint}`) : '';
    return rail(`${pointer} ${box}${box ? ' ' : ''}${on ? bold(label) : label}${hint}`);
  });
  return [
    step(STEP_ACTIVE, question),
    rail(keyHint(Boolean(selected))),
    rail(),
    ...rows,
    rail(),
  ];
}

/**
 * The question once it is answered: the question, and what was chosen.
 *
 * Leaving the full list on screen turned the walkthrough into a log. Collapsing
 * also removes the need to restate the choice later — it stays visible here.
 */
export function collapsedLines(question: string, answer: string): string[] {
  return [
    step(STEP_DONE, question),
    rail(answer === '' ? dim('nothing') : answer),
    rail(),
  ];
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
 * Redraws in place.
 *
 * `\x1b[0J` clears from the cursor to the end of the screen, which matters when
 * the new frame is shorter than the old one — collapsing a prompt would
 * otherwise leave the tail of the expanded list stranded below it.
 */
function repaint(lines: string[], previous: number): number {
  if (previous > 0) write(`\x1b[${previous}A`);
  for (const line of lines) write(`\x1b[2K${line}\n`);
  write('\x1b[0J');
  return lines.length;
}

function run(
  question: string, choices: Choice[], selected: Set<string> | undefined,
  answer: (active: number) => string,
): string {
  let active = 0;
  let painted = 0;
  const frame = () => activeLines(question, choices, active, selected);

  return withRawTerminal(fd => {
    painted = repaint(frame(), painted);
    for (;;) {
      const key = readKey(fd);
      if (INTERRUPT.includes(key)) abort();
      if (UP.includes(key)) active = (active - 1 + choices.length) % choices.length;
      else if (DOWN.includes(key)) active = (active + 1) % choices.length;
      else if (selected && key === ' ') {
        const v = choices[active].value;
        if (selected.has(v)) selected.delete(v); else selected.add(v);
      } else if (selected && key === 'a') {
        if (selected.size === choices.length) selected.clear();
        else for (const c of choices) selected.add(c.value);
      } else if (ENTER.includes(key)) {
        const chosen = answer(active);
        repaint(collapsedLines(question, chosen), painted);
        return chosen;
      }
      painted = repaint(frame(), painted);
    }
  });
}

/** One choice from a list. Returns the chosen value. */
export function select(question: string, choices: Choice[]): string {
  if (choices.length === 0) throw new Error('select needs at least one choice');
  let picked = choices[0].value;
  run(question, choices, undefined, active => {
    picked = choices[active].value;
    return choices[active].label;
  });
  return picked;
}

/** Any number of choices, including none. Returns the chosen values in list order. */
export function multiselect(question: string, choices: Choice[]): string[] {
  if (choices.length === 0) return [];
  const selected = new Set<string>();
  run(question, choices, selected, () =>
    choices.filter(c => selected.has(c.value)).map(c => c.label).join(', '));
  return choices.filter(c => selected.has(c.value)).map(c => c.value);
}
