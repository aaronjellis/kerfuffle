import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { BoxParameters, GeneratedBoxModel, PrintDivider } from '../engine/types';
import {
  type DividerPreview,
  type DividerSpace,
  deleteDivider,
  moveDivider,
  placeDivider,
  previewDivider,
  resolveDividers,
  setClearSize,
} from '../engine/printDividers';
import { computePrintBoxDims, resolveDividerHeight } from '../engine/printParts';
import {
  type DividerHistory,
  EMPTY_HISTORY,
  dividerHotkey,
  pushHistory,
  redoHistory,
  undoHistory,
} from './dividerHistory';

export type DividerTool = 'place' | 'move';

/** The divider tools' state and actions, shared by the 2D plan, the 3D view and the toolbar. */
export interface DividerEditing {
  tool: DividerTool | null;
  setTool: (tool: DividerTool | null) => void;
  /** The direction the next divider runs along. */
  axis: 'x' | 'y';
  flipAxis: () => void;
  /** The dividers as they apply to the box now. */
  layout: PrintDivider[];
  space: DividerSpace;
  /** How tall the dividers stand above the floor. */
  heightMm: number;
  selectedId: string | null;
  select: (id: string | null) => void;
  preview: (point: { x: number; y: number }) => DividerPreview | null;
  place: (point: { x: number; y: number }) => void;
  /** One undo step per drag: begin once, drag many times. */
  beginDrag: (id: string) => void;
  dragTo: (rawPos: number) => void;
  setClear: (id: string, side: 'before' | 'after', clearMm: number) => void;
  remove: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

let dividerSeq = 0;
const newDividerId = () => `d-${Date.now()}-${++dividerSeq}`;

/**
 * The printed box's divider tools: which tool is on, the selection, and a divider-only undo
 * history. Null for every other box. Each edit saves the layout that is on screen, with the
 * interior size it was drawn for.
 */
export function useDividerEditing(
  params: BoxParameters,
  setParams: React.Dispatch<React.SetStateAction<BoxParameters>>,
  model: GeneratedBoxModel,
): DividerEditing | null {
  const active = params.templateId === '3d-snap-box';
  const [tool, setToolState] = useState<DividerTool | null>(null);
  const [axis, setAxis] = useState<'x' | 'y'>('y');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<DividerHistory>(EMPTY_HISTORY);

  const { widthMm, depthMm, heightMm } = model.innerDims;
  const resolved = useMemo(() => {
    const dims = computePrintBoxDims(params, widthMm, depthMm, heightMm);
    return {
      ...resolveDividers(params, dims.innerW, dims.innerD, dims.rIn),
      heightMm: resolveDividerHeight(params, dims),
    };
  }, [params, widthMm, depthMm, heightMm]);
  const { layout, space } = resolved;

  // The pointer and key handlers outlive a render; they read the latest state here.
  const latest = useRef({ layout, space, axis, selectedId, history });
  latest.current = { layout, space, axis, selectedId, history };
  /** The saved list this hook last wrote; any other list came from outside (a load, Remove all). */
  const lastWritten = useRef<PrintDivider[] | null>(null);
  const drag = useRef<{ id: string; recorded: boolean } | null>(null);

  // Undo steps hold positions for one saved layout at one interior size; neither survives a
  // layout replaced from outside or a resized box.
  useEffect(() => {
    if (params.printDividers === lastWritten.current) return;
    setHistory(EMPTY_HISTORY);
    setSelectedId(null);
  }, [params.printDividers]);
  useEffect(() => {
    setHistory(EMPTY_HISTORY);
  }, [space.w, space.d]);
  useEffect(() => {
    if (!active) {
      setToolState(null);
      setSelectedId(null);
    }
  }, [active]);

  const actions = useMemo(() => {
    const write = (next: PrintDivider[]) => {
      const { space: s } = latest.current;
      lastWritten.current = next;
      latest.current = { ...latest.current, layout: next };
      setParams((p) => ({ ...p, printDividers: next, printDividersBasis: { w: s.w, d: s.d } }));
    };
    /** Saves an edit as one undo step. */
    const edit = (next: PrintDivider[]) => {
      const { layout: before, history: h } = latest.current;
      if (next === before) return;
      const nextHistory = pushHistory(h, before);
      latest.current = { ...latest.current, history: nextHistory };
      setHistory(nextHistory);
      write(next);
    };
    const step = (dir: 'undo' | 'redo') => {
      const { layout: current, history: h, selectedId: sel } = latest.current;
      const r = dir === 'undo' ? undoHistory(h, current) : redoHistory(h, current);
      if (!r) return;
      latest.current = { ...latest.current, history: r.history };
      setHistory(r.history);
      write(r.layout);
      if (sel && !r.layout.some((d) => d.id === sel)) setSelectedId(null);
    };
    return {
      setTool: (next: DividerTool | null) => {
        setToolState(next);
        setSelectedId(null);
      },
      flipAxis: () => setAxis((a) => (a === 'y' ? 'x' : 'y')),
      select: (id: string | null) => setSelectedId(id),
      preview: (point: { x: number; y: number }) =>
        previewDivider(latest.current.layout, latest.current.space, latest.current.axis, point),
      place: (point: { x: number; y: number }) => {
        const { layout: l, space: s, axis: a } = latest.current;
        edit(placeDivider(l, s, a, point, newDividerId()));
      },
      beginDrag: (id: string) => {
        drag.current = { id, recorded: false };
        setSelectedId(id);
      },
      dragTo: (rawPos: number) => {
        const d = drag.current;
        if (!d) return;
        const { layout: l, space: s } = latest.current;
        const next = moveDivider(l, s, d.id, rawPos);
        if (next === l) return;
        if (d.recorded) write(next);
        else {
          d.recorded = true;
          edit(next);
        }
      },
      setClear: (id: string, side: 'before' | 'after', clearMm: number) => {
        const { layout: l, space: s } = latest.current;
        edit(setClearSize(l, s, id, side, clearMm));
      },
      remove: (id: string) => {
        const { layout: l, space: s } = latest.current;
        edit(deleteDivider(l, s, id));
        setSelectedId(null);
      },
      undo: () => step('undo'),
      redo: () => step('redo'),
    };
  }, [setParams]);

  // Hotkeys, only while a tool is on.
  const toolOn = active && tool !== null;
  useEffect(() => {
    if (!toolOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) return;
      const hotkey = dividerHotkey(e);
      if (!hotkey) return;
      const sel = latest.current.selectedId;
      if (hotkey === 'delete' && !sel) return;
      e.preventDefault();
      if (hotkey === 'flip') actions.flipAxis();
      else if (hotkey === 'delete') actions.remove(sel!);
      else if (hotkey === 'undo') actions.undo();
      else if (hotkey === 'redo') actions.redo();
      else if (sel) actions.select(null);
      else actions.setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolOn, actions]);

  const editing = useMemo<DividerEditing>(
    () => ({
      tool,
      axis,
      layout,
      space,
      heightMm: resolved.heightMm,
      selectedId: selectedId && layout.some((d) => d.id === selectedId) ? selectedId : null,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      ...actions,
    }),
    [tool, axis, layout, space, resolved.heightMm, selectedId, history, actions],
  );
  return active ? editing : null;
}
