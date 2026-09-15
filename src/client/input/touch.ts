import { NEUTRAL_INPUT, type TruckInput } from '../../shared/input.ts';

const CSS = `
.fd-touch{position:fixed;inset:0;display:grid;gap:12px;padding:14px;box-sizing:border-box;pointer-events:none;z-index:10;
  grid-template-columns:1fr 1fr 1.4fr 1fr 1fr;grid-template-rows:1fr 1fr;grid-template-areas:"l r . n i" "l r . b a"}
.fd-touch.overlay{grid-template-rows:3fr 1fr 1fr;grid-template-areas:". . . . ." "l r . n i" "l r . b a";opacity:.85}
.fd-touch button{pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
  border:4px solid #000;border-radius:16px;font:900 clamp(15px,4.5vmin,34px) Impact,'Arial Black',monospace;letter-spacing:.04em;color:#fff;
  text-shadow:3px 3px 0 #000;box-shadow:inset 0 5px 0 rgba(255,255,255,.35),inset 0 -8px 0 rgba(0,0,0,.35),0 6px 0 #000;
  transition:transform 40ms,box-shadow 40ms}
.fd-touch button[data-key=left],.fd-touch button[data-key=right]{background:linear-gradient(#6c6f7a,#3a3c44);font-size:clamp(28px,11vmin,80px)}
.fd-touch button[data-key=nitro]{background:linear-gradient(#5ff0ff,#1596b8)}
.fd-touch button[data-key=item]{background:linear-gradient(#c77dff,#6a2bb8)}
.fd-touch button[data-key=itemAlt]{background:linear-gradient(#9a6be0,#4a2386)}
.fd-touch button[data-key=brake]{background:linear-gradient(#ff6a5a,#b3201a)}
.fd-touch button.on{transform:translateY(5px);box-shadow:inset 0 3px 0 rgba(255,255,255,.2),inset 0 -3px 0 rgba(0,0,0,.4),0 1px 0 #000;filter:brightness(1.35)}
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
