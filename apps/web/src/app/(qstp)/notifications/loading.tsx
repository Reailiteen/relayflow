import { NotificationsSkeleton } from '@/app/_components/notifications';

export default function Loading() {
  return (
    <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <NotificationsSkeleton />
    </div>
  );
}
