'use client';

import {
  Boxes,
  CalendarRange,
  ClipboardList,
  FileText,
  LayoutGrid,
  Recycle,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { CurrentSection, Rail, RailToggle, type RailSection } from '@/app/_components/rail';

/**
 * QSTP's sections.
 *
 * The rail itself is shared with the startup portal; only this list is
 * portal-specific. It lives in a client module because the entries carry icon
 * components, which cannot cross the server/client boundary as props.
 */

const HOME = '/';

const sections = (cycleId: string): readonly RailSection[] => [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/cycles', label: 'Cycles', icon: CalendarRange },
  { href: `/cycles/${cycleId}/allocation`, label: 'Participation', icon: Boxes },
  { href: `/cycles/${cycleId}/positions`, label: 'Positions', icon: ClipboardList },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: `/cycles/${cycleId}/selection`, label: 'Selection', icon: ShieldCheck },
  { href: '/exceptions', label: 'Exceptions', icon: ShieldAlert },
  { href: `/cycles/${cycleId}/recovery`, label: 'Recovery', icon: Recycle },
  { href: `/cycles/${cycleId}/placements`, label: 'Ready to Start', icon: FileText },
];

export function QstpSidebar({ cycleId }: { cycleId: string }) {
  return <Rail sections={sections(cycleId)} homeHref={HOME} />;
}

export function QstpNavToggle({ cycleId }: { cycleId: string }) {
  return <RailToggle sections={sections(cycleId)} homeHref={HOME} />;
}

export function QstpHeading({ cycleId }: { cycleId: string }) {
  return <CurrentSection sections={sections(cycleId)} homeHref={HOME} />;
}
