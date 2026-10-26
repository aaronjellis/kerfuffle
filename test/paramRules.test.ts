import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { PRINTED_PIN_MAX_MM, withPrintedPinClamp } from '../src/ui/paramRules';

describe('withPrintedPinClamp', () => {
  const wide = { ...DEFAULT_BOX_PARAMETERS, hingePinDiameterMm: 5.5 };

  it('clamps a wide pin when the hinge type becomes printed-hinge', () => {
    const next = withPrintedPinClamp({ ...wide, clamshellHingeType: 'printed-hinge' });
    expect(next.hingePinDiameterMm).toBe(PRINTED_PIN_MAX_MM);
  });

  it('clamps a wide pin when the category becomes 3d-print', () => {
    const next = withPrintedPinClamp({ ...wide, category: '3d-print', templateId: '3d-snap-box' });
    expect(next.hingePinDiameterMm).toBe(PRINTED_PIN_MAX_MM);
  });

  it('leaves a wood side-pivot hole and a narrow pin alone', () => {
    const pivot = { ...wide, category: 'wood-finger' as const, clamshellHingeType: 'side-pivot' as const };
    expect(withPrintedPinClamp(pivot)).toBe(pivot);
    const narrow = { ...DEFAULT_BOX_PARAMETERS, category: '3d-print' as const, hingePinDiameterMm: 1.75 };
    expect(withPrintedPinClamp(narrow)).toBe(narrow);
  });
});
