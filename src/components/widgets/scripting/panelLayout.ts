// Scripting widget — pure panel-layout grouping.
//
// Walks the ordered controls config and chunks consecutive controls of the
// same category into the design's responsive bands. Pure so it can be unit
// tested; the renderer (ScriptingPanel) maps each group to its band.

import type { ControlConfig } from './scriptingSettings';

export type Category = 'section' | 'inputs' | 'buttons' | 'displays' | 'console';

export interface Group {
  category: Category;
  items: ControlConfig[];
}

export function categoryOf(c: ControlConfig): Category {
  switch (c.kind) {
    case 'section':
      return 'section';
    case 'button':
    case 'daemon':
      return 'buttons';
    case 'console':
      return 'console';
    case 'readout':
    case 'status':
    case 'gauge':
    case 'led':
      return 'displays';
    default:
      return 'inputs';
  }
}

/**
 * Chunk controls into consecutive same-category bands. Inputs, buttons, and
 * displays merge into shared grids/rails; sections and consoles stay
 * singletons so each gets its own heading / fill region.
 */
/**
 * Ids of controls hidden because they sit under a collapsed section. A
 * section "owns" every control after it up to the next section; collapsing
 * it hides that run. Section headings themselves are never hidden — they keep
 * their expand affordance. Controls before the first section always show.
 */
export function hiddenByCollapse(controls: ControlConfig[]): Set<string> {
  const hidden = new Set<string>();
  let collapsed = false;
  for (const c of controls) {
    if (c.kind === 'section') {
      collapsed = c.collapsed === true;
      continue;
    }
    if (collapsed) hidden.add(c.id);
  }
  return hidden;
}

export function groupControls(controls: ControlConfig[]): Group[] {
  const groups: Group[] = [];
  for (const c of controls) {
    const category = categoryOf(c);
    const last = groups[groups.length - 1];
    const mergeable = category === 'inputs' || category === 'buttons' || category === 'displays';
    if (last && last.category === category && mergeable) {
      last.items.push(c);
    } else {
      groups.push({ category, items: [c] });
    }
  }
  return groups;
}
