import type React from 'react';
import type { PartId } from '../parts';
import type { SectionProps } from './types';
import { ArtworkSection } from './ArtworkSection';
import { ClaspSection } from './ClaspSection';
import { ClosureSection } from './ClosureSection';
import { DividersSection } from './DividersSection';
import { FlapsSection } from './FlapsSection';
import { HingeSection } from './HingeSection';
import { JointsSection } from './JointsSection';
import { LabelsSection } from './LabelsSection';
import { LidSection } from './LidSection';
import { LivingHingeSection } from './LivingHingeSection';
import { MaterialSection } from './MaterialSection';
import { PrintExportSection } from './PrintExportSection';
import { ScoreLinesSection } from './ScoreLinesSection';
import { SheetSection } from './SheetSection';
import { ShellSection } from './ShellSection';
import { SizeSection } from './SizeSection';

export type { SectionHandlers, SectionProps } from './types';

/** The inspector body for each part. */
export const SECTION_COMPONENTS: Record<PartId, React.FC<SectionProps>> = {
  size: SizeSection,
  material: MaterialSection,
  lid: LidSection,
  hinge: HingeSection,
  clasp: ClaspSection,
  joints: JointsSection,
  dividers: DividersSection,
  'living-hinge': LivingHingeSection,
  closure: ClosureSection,
  flaps: FlapsSection,
  'score-lines': ScoreLinesSection,
  shell: ShellSection,
  labels: LabelsSection,
  artwork: ArtworkSection,
  sheet: SheetSection,
  'print-export': PrintExportSection,
};
