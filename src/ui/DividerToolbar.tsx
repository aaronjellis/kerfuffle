import React from 'react';
import { Move, Redo2, RotateCw, SquareSplitHorizontal, Trash2, Undo2 } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import { clearSizes, moveLimits } from '../engine/printDividers';
import type { DisplayUnit } from '../engine/types';
import type { DividerEditing, DividerTool } from './useDividerEditing';

interface DividerToolbarProps {
  editing: DividerEditing;
  displayUnit: DisplayUnit;
}

/**
 * The printed box's divider tools, floating over the stage: place, move, flip, undo and redo,
 * and the selected divider's section sizes.
 */
export const DividerToolbar: React.FC<DividerToolbarProps> = ({ editing, displayUnit }) => {
  const { tool, axis, selectedId, layout, space } = editing;
  const pick = (next: DividerTool) => editing.setTool(tool === next ? null : next);
  const selected = selectedId ? layout.find((d) => d.id === selectedId) : undefined;
  const sizes = selected ? clearSizes(layout, space, selected.id) : null;
  const limits = selected ? moveLimits(layout, space, selected.id) : null;
  // How far each side's gap can go: the other side keeps what the limits leave it.
  const room = selected && sizes && limits ? sizes.before + sizes.after : 0;
  const minBefore = selected && sizes && limits ? sizes.before - (selected.pos - limits.min) : 0;
  const minAfter = selected && sizes && limits ? sizes.after - (limits.max - selected.pos) : 0;
  const [beforeLabel, afterLabel] = selected?.axis === 'x' ? ['Front', 'Back'] : ['Left', 'Right'];
  const unit = displayUnit === 'in' ? 'in' : 'mm';
  return (
    <div className="stage-tools" role="toolbar" aria-label="Divider tools">
      <button
        type="button"
        className="stage-tool-btn"
        aria-pressed={tool === 'place'}
        title="Place dividers: click inside the box"
        onClick={() => pick('place')}
      >
        <SquareSplitHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
        <span>Divider</span>
      </button>
      <button
        type="button"
        className="stage-tool-btn"
        aria-pressed={tool === 'move'}
        title="Move dividers: drag one to slide it"
        onClick={() => pick('move')}
      >
        <Move size={18} strokeWidth={1.75} aria-hidden="true" />
        <span>Move</span>
      </button>
      {tool === 'place' && (
        <button
          type="button"
          className="stage-tool-btn"
          title="Flip direction (R)"
          onClick={editing.flipAxis}
        >
          <RotateCw size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{axis === 'y' ? 'Front to back' : 'Side to side'}</span>
        </button>
      )}
      {tool !== null && (
        <>
          <span className="stage-pill-sep" aria-hidden="true" />
          <button
            type="button"
            className="stage-icon-btn"
            aria-label="Undo divider edit"
            title="Undo"
            disabled={!editing.canUndo}
            onClick={editing.undo}
          >
            <Undo2 size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="stage-icon-btn"
            aria-label="Redo divider edit"
            title="Redo"
            disabled={!editing.canRedo}
            onClick={editing.redo}
          >
            <Redo2 size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </>
      )}
      {selected && sizes && (
        <>
          <span className="stage-pill-sep" aria-hidden="true" />
          <label className="stage-tool-field">
            <span>{beforeLabel}</span>
            <NumberField
              valueMm={sizes.before}
              minMm={minBefore}
              maxMm={room - minAfter}
              step={displayUnit === 'in' ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel={`Section size, ${beforeLabel.toLowerCase()} (${unit})`}
              onChangeMm={(mm) => editing.setClear(selected.id, 'before', mm)}
            />
          </label>
          <label className="stage-tool-field">
            <span>{afterLabel}</span>
            <NumberField
              valueMm={sizes.after}
              minMm={minAfter}
              maxMm={room - minBefore}
              step={displayUnit === 'in' ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel={`Section size, ${afterLabel.toLowerCase()} (${unit})`}
              onChangeMm={(mm) => editing.setClear(selected.id, 'after', mm)}
            />
          </label>
          <button
            type="button"
            className="stage-icon-btn"
            aria-label="Delete divider"
            title="Delete divider (Delete)"
            onClick={() => editing.remove(selected.id)}
          >
            <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
};
