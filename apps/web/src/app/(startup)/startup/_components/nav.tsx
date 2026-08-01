'use client';

import { Briefcase, CalendarClock, FileText, LayoutGrid, Users, Video } from 'lucide-react';
import { CurrentSection, Rail, RailToggle, type RailSection } from '@/app/_components/rail';

/**
 * The startup portal's sections.
 *
 * The same rail as QSTP, deliberately shorter. A startup visits a handful of
 * times per cycle, so the menu is a map of the process rather than a workspace.
 * It lives in a client module because the entries carry icon components, which
 * cannot cross the server/client boundary as props.
 */

const HOME = '/startup';

const sections = (cycleId: string): readonly RailSection[] => [
  { href: '/startup', label: 'Home', icon: LayoutGrid },
  { href: `/startup/cycles/${cycleId}/allocation`, label: 'Allocation', icon: CalendarClock },
  { href: `/startup/cycles/${cycleId}/positions`, label: 'Positions', icon: Briefcase },
  { href: `/startup/cycles/${cycleId}/selection`, label: 'Selection', icon: Users },
  { href: '/startup/interviews', label: 'Interviews', icon: Video },
  { href: '/startup/exception', label: 'Deadline', icon: CalendarClock },
  { href: `/startup/cycles/${cycleId}/placements`, label: 'Ready to Start', icon: FileText },
];

export function StartupSidebar({ startupName, cycleId }: { startupName: string; cycleId: string }) {
  return (
    <Rail sections={sections(cycleId)} homeHref={HOME} context={{ label: 'Startup', value: startupName }} />
  );
}

export function StartupNavToggle({ startupName, cycleId }: { startupName: string; cycleId: string }) {
  return (
    <RailToggle
      sections={sections(cycleId)}
      homeHref={HOME}
      context={{ label: 'Startup', value: startupName }}
    />
  );
}

export function StartupHeading({ cycleId }: { cycleId: string }) {
  return <CurrentSection sections={sections(cycleId)} homeHref={HOME} />;
}
