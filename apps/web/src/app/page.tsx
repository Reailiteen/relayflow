import { can } from '@relayflow/access';
import { getQstpDashboard } from '@relayflow/logic';
import { getActor, getContext } from '@/server/context';

/**
 * A scaffold of the QSTP dashboard — enough to prove the operational numbers
 * are genuinely derived, not enough to be the real screen. Proper layout lands
 * once the visual direction is agreed.
 */
export default async function HomePage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await getQstpDashboard(ctx, {});

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[var(--color-critical)]">{result.error.message}</p>
      </main>
    );
  }

  const { budget, attention, ...summary } = result.data;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-[var(--color-text-muted)]">
          {summary.cycleName} · {summary.stage}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['Funded hours', budget.funded],
          ['Allocated', budget.allocated],
          ['Unallocated', budget.unallocated],
          ['Idle (allocated, unused)', budget.idle],
          ['Reclaimable now', summary.reclaimableHours],
          ['Onboarding', summary.candidatesOnboarding],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          >
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-sm text-[var(--color-text-muted)]">{label}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">Nothing outstanding.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((item, index) => (
              <li
                key={`${item.kind}-${index}`}
                className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <span>{item.summary}</span>
                {/* Capability-gated, so an auditor sees the item but not the action. */}
                {item.kind === 'hours_reclaimable' &&
                  can(actor, { capability: 'redistribution:run' }) && (
                    <span className="shrink-0 text-sm text-[var(--color-accent)]">
                      redistribute
                    </span>
                  )}
                {item.kind === 'exception_pending' &&
                  can(actor, { capability: 'exception:decide' }) && (
                    <span className="shrink-0 text-sm text-[var(--color-accent)]">review</span>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-[var(--color-text-muted)]">
        In-memory fixtures. Set <code>relayflow_dev_actor</code> to <code>manager</code>,{' '}
        <code>operations</code>, <code>auditor</code>, <code>startupOwner</code>,{' '}
        <code>supervisor</code>, <code>lateStartup</code>, <code>candidate</code> or{' '}
        <code>anonymous</code>.
      </p>
    </main>
  );
}
