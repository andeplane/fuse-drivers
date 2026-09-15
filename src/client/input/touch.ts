import { NEUTRAL_INPUT, type TruckInput } from '../../shared/input.ts';

const CSS = `
.fd-touch{position:fixed;inset:0;display:grid;gap:10px;padding:12px;box-sizing:border-box;pointer-events:none;z-index:10;
  grid-template-columns:1fr 1fr 1.4fr 1fr 1fr;grid-template-rows:1fr 1fr;grid-template-areas:"l r . n i" "l r . b a"}
.fd-touch.overlay{grid-template-rows:3fr 1fr 1fr;grid-template-areas:". . . . ." "l r . n i" "l r . b a";opacity:.8}
.fd-touch button{pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
  border:4px solid #000;border-radius:18px;font:bold clamp(14px,4vmin,28px) monospace;color:#fff;background:rgba(40,40,48,.6)}
.fd-touch button.on{background:#ffd23f;color:#000}
@media (orientation:portrait){
  .fd-touch{grid-template-columns:1fr 1fr;grid-template-rows:2fr 1fr 1fr;grid-template-areas:"l r" "n i" "b a"}
  .fd-touch.overlay{grid-template-columns:1fr 1fr 1fr 1fr;grid-template-rows:4fr 1.4fr 1fr;grid-template-areas:". . . ." "l l r r" "b n i a"}
}`;

const BUTTONS = [
  ['left', '◀', 'l'], ['right', '▶', 'r'], ['nitro', 'NITRO', 'n'], ['item', 'ITEM', 'i'], ['brake', 'BRAKE', 'b'], ['itemAlt', 'ITEM ↺', 'a'],
] as const;
type Key = (typeof BUTTONS)[number][0];

export interface TouchControls { read(): TruckInput; destroy(): void }

/**
 * On-screen buttons for the phone controller and solo touch play. A thumb can slide between buttons.
 * ITEM ↺ uses the item the other way (mine lobbed ahead, missile backwards), like Down + Space on the keyboard.
 */
export function createTouchControls(options: { overlay?: boolean; onChange?: (input: TruckInput) => void } = {}): TouchControls {
  if (!document.getElementById('fd-touch-css')) {
    const style = document.createElement('style');
    style.id = 'fd-touch-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = options.overlay ? 'fd-touch overlay' : 'fd-touch';
  const els = new Map<Key, HTMLButtonElement>();
  for (const [key, label, area] of BUTTONS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.key = key;
    b.style.gridArea = area;
    els.set(key, b);
    root.append(b);
  }
  document.body.append(root);

  const pointers = new Map<number, Key>();
  let current = NEUTRAL_INPUT;
  const compute = (): TruckInput => {
    const held = new Set(pointers.values());
    return { ...NEUTRAL_INPUT, left: held.has('left'), right: held.has('right'), brake: held.has('brake'), nitro: held.has('nitro'), item: held.has('item') || held.has('itemAlt'), itemAlt: held.has('itemAlt') };
  };
  const refresh = () => {
    const next = compute();
    const held = new Set(pointers.values());
    for (const [key, b] of els) b.classList.toggle('on', held.has(key));
    if (JSON.stringify(next) !== JSON.stringify(current)) { current = next; options.onChange?.(next); }
  };
  const track = (e: PointerEvent) => {
    if (e.type === 'pointermove' && !pointers.has(e.pointerId)) return;
    e.preventDefault();
    const key = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-key]')?.dataset.key as Key | undefined;
    if (key && root.contains(els.get(key)!)) pointers.set(e.pointerId, key); else pointers.delete(e.pointerId);
    refresh();
  };
  const release = (e: PointerEvent) => { pointers.delete(e.pointerId); refresh(); };
  root.addEventListener('pointerdown', track);
  root.addEventListener('pointermove', track);
  for (const type of ['pointerup', 'pointercancel'] as const) root.addEventListener(type, release);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  return { read: () => current, destroy: () => root.remove() };
}
