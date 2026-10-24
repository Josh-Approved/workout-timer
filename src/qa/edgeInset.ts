/**
 * Edge-inset audit — catches content sitting flush against the inside edge of
 * a card, sheet, or button (defect: the Settings "Sounds" card shipped with
 * "Warm up start" touching the card's left border, because DrilldownRow brings
 * no horizontal padding and the card supplied none either).
 *
 * Works on a rendered host tree (`render(...).toJSON()`), so it runs in jest on
 * every PR with no device. For each piece of visible leaf content (a Text run
 * or an SVG icon) it walks up to the nearest *surface* — a view with a fill or
 * a side border, i.e. something with a visible edge — and adds up every
 * padding, margin, and border in between on the side(s) the content actually
 * reaches. Content that can't reach an edge (centered, or a middle child of a
 * row) is skipped; content that reaches one with less than MIN_EDGE_INSET of
 * clearance is a finding.
 *
 * It reads styles, not measured layout, so it judges the common cases (rows,
 * columns, stretch/center alignment) and stays quiet when it can't tell —
 * percentages, `auto` margins, absolute positioning. A miss is possible; a
 * false alarm should be rare enough to fix rather than suppress.
 */

import { StyleSheet } from 'react-native';
import { space } from '../theme/tokens';

export type LayoutNode = {
  type: string;
  props: Record<string, any>;
  children: (LayoutNode | string)[] | null;
};

export type EdgeInsetFinding = {
  /** The text run, or the icon's host type. */
  content: string;
  edge: 'start' | 'end';
  /** Total clearance found between the content and the surface edge, in pt. */
  inset: number;
};

/** Less clearance than this between content and a visible edge reads as touching. */
export const MIN_EDGE_INSET = space.s3;

type Style = Record<string, any>;
type Side = 'start' | 'end';

const flat = (node: LayoutNode): Style => (StyleSheet.flatten(node.props.style) ?? {}) as Style;

const isLeaf = (n: LayoutNode) => n.type === 'Text' || n.type.startsWith('RNSVGSvgView');

// A side value, most specific first. NaN = unknowable (a percentage / 'auto').
function sideValue(s: Style, prop: 'padding' | 'margin', side: Side): number {
  const physical = side === 'start' ? 'Left' : 'Right';
  const logical = side === 'start' ? 'Start' : 'End';
  const v =
    s[`${prop}${logical}`] ?? s[`${prop}${physical}`] ?? s[`${prop}Horizontal`] ?? s[prop] ?? 0;
  return typeof v === 'number' ? v : NaN;
}

function borderValue(s: Style, side: Side): number {
  const physical = side === 'start' ? 'Left' : 'Right';
  const logical = side === 'start' ? 'Start' : 'End';
  const v = s[`border${logical}Width`] ?? s[`border${physical}Width`] ?? s.borderWidth ?? 0;
  return typeof v === 'number' ? v : 0;
}

function isTransparent(color: unknown): boolean {
  if (color == null || color === 'transparent') return true;
  if (typeof color === 'string') {
    const rgba = color.match(/^rgba\(.*,\s*([\d.]+)\s*\)$/);
    if (rgba) return Number(rgba[1]) === 0;
    if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(7).toLowerCase() === '00';
  }
  return false;
}

/** Has a visible edge on this side: a fill, or a border on that side. */
function isSurface(s: Style, side: Side): boolean {
  return !isTransparent(s.backgroundColor) || borderValue(s, side) > 0;
}

function textOf(n: LayoutNode): string {
  return (n.children ?? [])
    .map((c) => (typeof c === 'string' ? c : textOf(c)))
    .join('');
}

/** Children that take part in flow layout (absolutely positioned ones don't). */
function flowChildren(n: LayoutNode): LayoutNode[] {
  return (n.children ?? []).filter(
    (c): c is LayoutNode => typeof c !== 'string' && flat(c).position !== 'absolute'
  );
}

function auditLeaf(leaf: LayoutNode, ancestors: LayoutNode[]): EdgeInsetFinding[] {
  const own = flat(leaf);
  if (own.position === 'absolute') return [];
  const reaches = { start: true, end: true };
  if (leaf.type === 'Text') {
    if (own.textAlign === 'center') return [];
    if (own.textAlign === 'right') reaches.start = false;
  }
  const inset = { start: 0, end: 0 };
  const sides: Side[] = ['start', 'end'];

  // Borders never count as clearance: a border *is* the visible edge.
  let child = leaf;
  for (const s of sides) inset[s] += sideValue(own, 'margin', s) + sideValue(own, 'padding', s);

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const parent = ancestors[i];
    const ps = flat(parent);
    const cs = flat(child);
    const siblings = flowChildren(parent);
    const idx = siblings.indexOf(child);
    const dir = ps.flexDirection ?? 'column';

    if (dir === 'row' || dir === 'row-reverse') {
      const first = dir === 'row' ? 0 : siblings.length - 1;
      const last = dir === 'row' ? siblings.length - 1 : 0;
      if (idx !== first) reaches.start = false;
      if (idx !== last) reaches.end = false;
      const justify = ps.justifyContent ?? 'flex-start';
      if (['center', 'space-around', 'space-evenly'].includes(justify)) return [];
      if (justify === 'flex-end') reaches.start = false;
    } else {
      const align = cs.alignSelf && cs.alignSelf !== 'auto' ? cs.alignSelf : ps.alignItems ?? 'stretch';
      // `width: '100%'` fills the line whatever the alignment (boundedContent).
      const fills = cs.width === '100%';
      if (align === 'center' && !fills) return [];
      if (!fills && align === 'flex-end') reaches.start = false;
      if (!fills && (align === 'flex-start' || align === 'baseline')) reaches.end = false;
    }
    if (!reaches.start && !reaches.end) return [];

    const surfaceSides = sides.filter((s) => reaches[s] && isSurface(ps, s));
    for (const s of sides) inset[s] += sideValue(ps, 'padding', s);
    if (surfaceSides.length > 0) {
      return surfaceSides
        .filter((s) => !Number.isNaN(inset[s]) && inset[s] < MIN_EDGE_INSET)
        .map((s) => ({
          content: leaf.type === 'Text' ? textOf(leaf) : leaf.type,
          edge: s,
          inset: inset[s],
        }));
    }
    for (const s of sides) inset[s] += sideValue(ps, 'margin', s);
    if (sides.every((s) => !reaches[s] || Number.isNaN(inset[s]))) return [];
    child = parent;
  }
  return [];
}

// The jest host tree hangs a ScrollView's `contentContainerStyle` on the
// scroll view itself and leaves the inner content view unstyled; on device that
// style lives on the inner view. Move it there so the padding is counted.
function withContentContainers(node: LayoutNode): LayoutNode {
  const kids = (node.children ?? []).map((c) => (typeof c === 'string' ? c : withContentContainers(c)));
  const ccs = node.props.contentContainerStyle;
  const first = kids[0];
  if (ccs && first && typeof first !== 'string') {
    kids[0] = { ...first, props: { ...first.props, style: [ccs, first.props.style] } };
  }
  return { ...node, children: kids };
}

/** Every leaf in the tree that sits closer than MIN_EDGE_INSET to a visible edge. */
export function findEdgeInsetViolations(
  root: LayoutNode | LayoutNode[] | null
): EdgeInsetFinding[] {
  const findings: EdgeInsetFinding[] = [];
  const visit = (node: LayoutNode, ancestors: LayoutNode[]) => {
    if (isLeaf(node)) {
      findings.push(...auditLeaf(node, ancestors));
      return; // nested Text runs belong to their outer Text
    }
    for (const c of node.children ?? []) {
      if (typeof c !== 'string') visit(c, [...ancestors, node]);
    }
  };
  for (const r of Array.isArray(root) ? root : root ? [root] : []) visit(withContentContainers(r), []);
  return findings;
}
