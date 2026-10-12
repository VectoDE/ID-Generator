import {
  MemorySequenceStore,
  createPatternGenerator,
  createSnowflake,
  inspectId,
  nanoid,
  parsePattern,
  presets,
  ulid,
  uuidv4,
  uuidv7,
  type PatternGenerator,
  type PresetName,
  type Segment,
  type TokenDefinition,
  type TokenPreview,
} from '../../src/index.js';

const TONES = 6;
const HISTORY_LIMIT = 12;

const byId = <T extends HTMLElement>(id: string, type: new () => T): T => {
  const found = document.getElementById(id);
  if (!(found instanceof type)) {
    throw new TypeError(`The page has no #${id} of the expected type.`);
  }
  return found;
};

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {}
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  return node;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// "a", "a and b", "a, b and c"
const listOf = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;

const ui = {
  preset: byId('preset', HTMLSelectElement),
  pattern: byId('pattern', HTMLInputElement),
  patternError: byId('pattern-error', HTMLParagraphElement),
  values: byId('values', HTMLFieldSetElement),
  valueFields: byId('value-fields', HTMLDivElement),
  display: byId('id-display', HTMLDivElement),
  idText: byId('id-text', HTMLParagraphElement),
  generate: byId('generate', HTMLButtonElement),
  copyNext: byId('copy-next', HTMLButtonElement),
  reset: byId('reset', HTMLButtonElement),
  history: byId('history', HTMLUListElement),
  historyEmpty: byId('history-empty', HTMLParagraphElement),
  formats: byId('formats', HTMLTableSectionElement),
  readInput: byId('read-input', HTMLInputElement),
  readResult: byId('read-result', HTMLDivElement),
  status: byId('status', HTMLParagraphElement),
};

const store = new MemorySequenceStore();
// Values survive pattern changes, so switching back and forth keeps what was typed.
const values: Record<string, string> = {};
let generator: PatternGenerator | undefined;
let segments: Segment[] = [];
let nextId: string | undefined;
let refreshRun = 0;

const announce = (text: string): void => {
  ui.status.textContent = text;
};

const copyTimers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();

const copy = async (text: string, button: HTMLButtonElement): Promise<void> => {
  // The resting label is stored once, so a second click within the feedback time cannot capture "Copied".
  button.dataset.label ??= button.textContent;
  const label = button.dataset.label;
  clearTimeout(copyTimers.get(button));
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    announce(`Copied ${text}`);
  } catch {
    button.textContent = 'Copy failed';
    announce('Copying is blocked in this browser. Select the text and copy it by hand.');
  }
  copyTimers.set(
    button,
    setTimeout(() => {
      button.textContent = label;
    }, 1500)
  );
};

/* Pattern ---------------------------------------------------------------------------------------------------------- */

const presetName = (): PresetName | undefined => {
  const name = ui.preset.value;
  return Object.hasOwn(presets, name) ? (name as PresetName) : undefined;
};

const tokensFor = (pattern: string): Readonly<Record<string, TokenDefinition>> => {
  const name = presetName();
  return name !== undefined && presets[name].pattern === pattern ? presets[name].tokens : {};
};

const exampleFor = (token: string): string | undefined => {
  const name = presetName();
  if (name === undefined) {
    return undefined;
  }
  const example: Readonly<Record<string, string>> = presets[name].example;
  return Object.hasOwn(example, token) ? example[token] : undefined;
};

const renderFields = (): void => {
  ui.valueFields.replaceChildren();
  const valueTokens = generator?.tokens.filter((token) => token.kind === 'value') ?? [];
  ui.values.hidden = valueTokens.length === 0;
  for (const token of valueTokens) {
    const id = `value-${token.name}`;
    const field = make('div', { className: 'field' });
    const label = make('label', { text: token.name });
    label.htmlFor = id;
    if (!token.required) {
      label.append(' ', make('span', { className: 'optional', text: '(optional)' }));
    }
    const input = make('input');
    input.id = id;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.token = token.name;
    input.value = values[token.name] ?? '';
    // Optional tokens have a default; an example there would contradict what the preview shows.
    const example = token.required ? exampleFor(token.name) : undefined;
    if (example !== undefined) {
      input.placeholder = example;
    }
    const describedBy = [`${id}-error`];
    field.append(label, input);
    if (token.description) {
      field.append(Object.assign(make('p', { className: 'hint', text: token.description }), { id: `${id}-hint` }));
      describedBy.unshift(`${id}-hint`);
    }
    const error = Object.assign(make('p', { className: 'error' }), { id: `${id}-error` });
    error.setAttribute('aria-live', 'polite');
    field.append(error);
    input.setAttribute('aria-describedby', describedBy.join(' '));
    ui.valueFields.append(field);
  }
};

const showFieldErrors = (previews: readonly TokenPreview[]): void => {
  for (const preview of previews) {
    const input = document.getElementById(`value-${preview.name}`);
    const error = document.getElementById(`value-${preview.name}-error`);
    if (input && error) {
      // Empty fields are not wrong yet; only say what is missing once something was typed or Generate was pressed.
      const typed = values[preview.name] ?? '';
      const show = preview.error !== undefined && typed !== '';
      // Phrased from what was typed: the library message names the normalized value, which may be empty.
      error.textContent = show ? `"${typed}" is not a valid ${preview.name}. See the note above.` : '';
      input.setAttribute('aria-invalid', String(show));
    }
  }
};

// The ID split into literal text and labelled tokens. Falls back to plain text when a transform changed it.
const renderSpecimen = (id: string, previews: readonly TokenPreview[]): void => {
  const valueOf = new Map(previews.map((preview) => [preview.name, preview.value ?? '']));
  const tones = new Map<string, number>();
  const parts = segments.map((segment) => {
    if (segment.type === 'literal') {
      return { node: make('span', { className: 'lit', text: segment.value }), text: segment.value };
    }
    const tone = tones.get(segment.name) ?? tones.size % TONES;
    tones.set(segment.name, tone);
    const text = valueOf.get(segment.name) ?? '';
    const node = make('span', { className: `tok tone-${tone}` });
    const tag = segment.arg === undefined ? `{${segment.name}}` : `{${segment.name}:${segment.arg}}`;
    const label = make('span', { className: 'tag', text: tag });
    // Shortened under narrow values; the full token name stays available on hover.
    label.title = tag;
    node.append(make('span', { className: 'val', text }), label);
    return { node, text };
  });
  ui.idText.textContent = id;
  if (parts.map((part) => part.text).join('') === id) {
    ui.display.replaceChildren(...parts.map((part) => part.node));
  } else {
    ui.display.replaceChildren(make('span', { className: 'plain', text: id }));
  }
};

const showPlaceholder = (text: string): void => {
  ui.display.replaceChildren(make('span', { className: 'placeholder', text }));
  ui.idText.textContent = text;
};

const refresh = async (): Promise<void> => {
  const run = ++refreshRun;
  if (!generator) {
    nextId = undefined;
    showPlaceholder(ui.pattern.value === '' ? 'Type a pattern to see an ID.' : 'Fix the pattern to see an ID.');
    return;
  }
  const preview = await generator.preview(values);
  // A newer refresh started while this one waited; its result wins.
  if (run !== refreshRun) {
    return;
  }
  nextId = preview.id;
  showFieldErrors(preview.tokens);
  if (preview.id === undefined) {
    const failing = preview.tokens.filter((token) => token.error !== undefined).map((token) => token.name);
    const missing = failing.filter((name) => (values[name] ?? '') === '');
    showPlaceholder(
      missing.length > 0 ? `Fill in ${listOf(missing)} to see the ID.` : `Check ${listOf(failing)} to see the ID.`
    );
  } else {
    renderSpecimen(preview.id, preview.tokens);
  }
  ui.generate.disabled = preview.id === undefined;
  ui.copyNext.disabled = preview.id === undefined;
};

const build = (): void => {
  const pattern = ui.pattern.value;
  generator = undefined;
  segments = [];
  ui.patternError.textContent = '';
  ui.pattern.removeAttribute('aria-invalid');
  // An empty pattern is a starting point, not an error.
  if (pattern !== '') {
    try {
      segments = parsePattern(pattern);
      generator = createPatternGenerator({ pattern, tokens: tokensFor(pattern), store });
    } catch (error) {
      generator = undefined;
      segments = [];
      ui.patternError.textContent = messageOf(error);
      ui.pattern.setAttribute('aria-invalid', 'true');
    }
  }
  ui.generate.disabled = true;
  ui.copyNext.disabled = true;
  renderFields();
  updateRead();
  void refresh();
};

const selectPreset = (): void => {
  const name = presetName();
  ui.pattern.value = name === undefined ? '' : presets[name].pattern;
  build();
};

const addToHistory = (id: string): void => {
  ui.history.prepend(make('li', { text: id }));
  while (ui.history.children.length > HISTORY_LIMIT) {
    ui.history.lastElementChild?.remove();
  }
  ui.historyEmpty.hidden = true;
};

const generate = async (): Promise<void> => {
  if (!generator) {
    return;
  }
  try {
    const id = await generator.generate(values);
    addToHistory(id);
    announce(`Generated ${id}`);
  } catch (error) {
    announce(messageOf(error));
  }
  await refresh();
};

ui.preset.addEventListener('change', () => {
  selectPreset();
  if (presetName() === undefined) {
    ui.pattern.focus();
  }
});
ui.pattern.addEventListener('input', () => {
  const name = presetName();
  if (name !== undefined && presets[name].pattern !== ui.pattern.value) {
    ui.preset.value = 'custom';
  }
  build();
});
ui.valueFields.addEventListener('input', (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.dataset.token !== undefined) {
    values[input.dataset.token] = input.value;
    void refresh();
  }
});
ui.generate.addEventListener('click', () => void generate());
ui.copyNext.addEventListener('click', () => {
  if (nextId !== undefined) {
    void copy(nextId, ui.copyNext);
  }
});
ui.reset.addEventListener('click', () => {
  store.reset();
  // Old entries would repeat once the counter starts over, so the list starts over too.
  ui.history.replaceChildren();
  ui.historyEmpty.hidden = false;
  announce('Counter reset to 1.');
  void refresh();
});

/* Standard formats ------------------------------------------------------------------------------------------------- */

const snowflake = createSnowflake();
const formats = [
  { name: 'UUID v4', make: uuidv4, sorts: 'No, fully random' },
  { name: 'UUID v7', make: uuidv7, sorts: 'Yes, millisecond time first' },
  { name: 'ULID', make: () => ulid(), sorts: 'Yes, millisecond time first' },
  { name: 'NanoID', make: () => nanoid(), sorts: 'No, fully random' },
  { name: 'Snowflake', make: () => snowflake.next(), sorts: 'Yes, millisecond time first' },
];

const cell = (label: string, content: Node | string, className?: string): HTMLTableCellElement => {
  const td = make('td', className === undefined ? {} : { className });
  td.dataset.label = label;
  td.append(content);
  return td;
};

for (const format of formats) {
  const row = make('tr');
  const example = make('span');
  const length = make('span');
  const update = (): void => {
    const value = format.make();
    example.textContent = value;
    length.textContent = `${value.length} characters`;
  };
  update();
  const renew = make('button', { text: 'New' });
  renew.type = 'button';
  renew.setAttribute('aria-label', `New ${format.name}`);
  renew.addEventListener('click', update);
  const copyButton = make('button', { text: 'Copy' });
  copyButton.type = 'button';
  copyButton.setAttribute('aria-label', `Copy ${format.name}`);
  copyButton.addEventListener('click', () => void copy(example.textContent, copyButton));
  const actions = make('td', { className: 'row-actions' });
  actions.append(renew, copyButton);
  const name = make('th', { text: format.name });
  name.scope = 'row';
  row.append(
    name,
    cell('Example', example, 'example'),
    cell('Length', length),
    cell('Sorts by time', format.sorts),
    actions
  );
  ui.formats.append(row);
}

/* Read an ID ------------------------------------------------------------------------------------------------------- */

const describe = (value: string): [string, string][] => {
  const result = inspectId(value);
  const rows: [string, string][] = [];
  if (result.type === 'uuid') {
    rows.push(['Format', result.version === undefined ? 'UUID (nil or max)' : `UUID version ${result.version}`]);
  } else if (result.type === 'ulid') {
    rows.push(['Format', 'ULID']);
  }
  if (result.timestamp) {
    rows.push(['Created', result.timestamp.toISOString()]);
  }
  const parsed = generator?.parse(value);
  if (parsed) {
    for (const [name, part] of Object.entries(parsed)) {
      rows.push([`{${name}}`, part]);
    }
  }
  return rows;
};

// A function declaration, because build() calls it before this point in the file.
function updateRead(): void {
  const value = ui.readInput.value.trim();
  ui.readResult.replaceChildren();
  if (value === '') {
    return;
  }
  const rows = describe(value);
  if (rows.length === 0) {
    ui.readResult.append(
      make('p', {
        className: 'read-note',
        text: 'Not a UUID or ULID, and it does not fit the pattern above. Snowflake IDs need their layout to be read.',
      })
    );
    return;
  }
  const list = make('dl', { className: 'read-result' });
  for (const [term, detail] of rows) {
    list.append(make('dt', { text: term }), make('dd', { text: detail }));
  }
  ui.readResult.append(list);
}

ui.readInput.addEventListener('input', updateRead);

selectPreset();
