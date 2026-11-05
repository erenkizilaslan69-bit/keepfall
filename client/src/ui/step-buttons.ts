// The "-", "+", "All" and "Half" buttons of an attack form look disabled whenever pressing them would change nothing (no soldiers at home, already at the limit),
// so the player sees why nothing happens. `off` is the reason the whole form is locked (not war, eliminated...).
export function syncStepButtons(body: HTMLElement, off: boolean): void {
  let allSame = true, halfSame = true;
  for (const row of body.querySelectorAll<HTMLElement>('[data-unit]')) {
    const input = row.querySelector<HTMLInputElement>('[data-count]');
    if (!input) continue;
    const max = Number(input.max) || 0, v = Number(input.value) || 0;
    const less = row.querySelector<HTMLButtonElement>('[data-act="less"]'), more = row.querySelector<HTMLButtonElement>('[data-act="more"]');
    if (less) less.disabled = off || v <= 0;
    if (more) more.disabled = off || v >= max;
    if (v !== max) allSame = false;
    if (v !== Math.floor(max / 2)) halfSame = false;
  }
  const all = body.querySelector<HTMLButtonElement>('[data-act="all"]'), half = body.querySelector<HTMLButtonElement>('[data-act="half"]');
  if (all) all.disabled = off || allSame;
  if (half) half.disabled = off || halfSame;
}
