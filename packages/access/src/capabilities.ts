import type { QstpRole } from './actor';
import type { StartupRole } from '@relayflow/entities';

/**
 * The capability catalog — the vocabulary the rest of the system speaks.
 *
 * Code asks "may this actor approve an exception?", never "is this actor an
 * operations user?". Roles are an implementation detail of the grant tables
 * below. Adding a role therefore cannot silently widen anyone's access, and a
 * screen can gate a button on the same fact the use-case will check.
 */
export const CAPABILITIES = [
  // ── Cycle ────────────────────────────────────────────────────────────────
  'cycle:read',
  'cycle:create',
  'cycle:update',
  'cycle:advance_stage',

  // ── Startups & allocation (Stage 1) ──────────────────────────────────────
  'startup:read_all',
  'startup:read_own',
  'startup:manage',
  'allocation:read_all',
  'allocation:read_own',
  'allocation:decide',
  'allocation:override',
  'allocation:acknowledge',
  /**
   * Running the engine is arithmetic over a whole cohort's budget. Rating one
   * startup is judgement about one startup. Deliberately separate capabilities,
   * so a reviewer can be asked to rate without also being handed the button
   * that reshapes the programme's funding.
   */
  'rating:read_all',
  'rating:submit',
  'prioritization:run',

  // ── Positions (Stage 2) ──────────────────────────────────────────────────
  'position:read_all',
  'position:read_own',
  'position:submit',
  'position:review',

  // ── Candidates & pools (Stage 3) ─────────────────────────────────────────
  'candidate:read_all',
  'candidate:read_pool',
  'candidate:read_self',
  'candidate:import',
  'candidate:share_pool',
  'candidate:confirm_availability',

  'interview:read_own',
  'interview:schedule',
  'interview:record',

  'task:read_all',
  'task:assess',
  'task:submit_own',

  'selection:create',
  'selection:read_all',
  'selection:resolve_conflict',
  /**
   * Accepting one of your own offers. Candidate-only, and deliberately not a
   * flavour of `selection:create`: that one commits a *startup*, this one is a
   * person choosing where they work.
   */
  'selection:accept_offer',
  'selection:read_own_offers',

  // ── Exceptions ───────────────────────────────────────────────────────────
  'exception:request',
  'exception:read_all',
  'exception:decide',

  // ── Redistribution (Stage 4) ─────────────────────────────────────────────
  'redistribution:run',

  // ── Documents & onboarding ───────────────────────────────────────────────
  'document:upload_own',
  'document:read_own',
  'document:read_all',
  'document:verify',
  'onboarding:complete',
  'placement:confirm_candidate',
  'placement:confirm_startup',
  'placement:finalize_details',

  'report:read',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * QSTP staff grants.
 *
 * `viewer` is genuinely read-only — it is what leadership and auditors get, and
 * the whole point is that it cannot change a funding decision by accident.
 */
export const QSTP_CAPABILITIES: Readonly<Record<QstpRole, readonly Capability[]>> = {
  program_manager: [
    'cycle:read',
    'cycle:create',
    'cycle:update',
    'cycle:advance_stage',
    'startup:read_all',
    'startup:manage',
    'allocation:read_all',
    'allocation:decide',
    'allocation:override',
    'rating:read_all',
    'rating:submit',
    'prioritization:run',
    'position:read_all',
    'position:review',
    'candidate:read_all',
    'candidate:import',
    'candidate:share_pool',
    'task:read_all',
    'task:assess',
    'selection:read_all',
    'selection:resolve_conflict',
    'exception:read_all',
    'exception:decide',
    'redistribution:run',
    'document:read_all',
    'document:verify',
    'onboarding:complete',
    'placement:finalize_details',
    'report:read',
  ],
  operations: [
    'cycle:read',
    'startup:read_all',
    'allocation:read_all',
    'allocation:decide',
    'rating:read_all',
    'rating:submit',
    'prioritization:run',
    'position:read_all',
    'position:review',
    'candidate:read_all',
    'candidate:import',
    'candidate:share_pool',
    'task:read_all',
    'task:assess',
    'selection:read_all',
    'selection:resolve_conflict',
    'exception:read_all',
    'exception:decide',
    'document:read_all',
    'document:verify',
    'onboarding:complete',
    'placement:finalize_details',
    'report:read',
    // Deliberately absent: cycle setup, allocation overrides, redistribution.
    // Those reshape the programme's budget and stay with the manager.
  ],
  viewer: [
    'cycle:read',
    'startup:read_all',
    'allocation:read_all',
    // Reads the reasoning behind a funding decision; cannot supply any of it.
    'rating:read_all',
    'position:read_all',
    'candidate:read_all',
    'task:read_all',
    'selection:read_all',
    'exception:read_all',
    'document:read_all',
    'report:read',
  ],
};

/**
 * Startup grants. Everything here is implicitly scoped to the actor's own
 * startup — the `_own` and `_pool` suffixes are a reminder that the policy
 * layer still checks *which* startup on every call.
 */
export const STARTUP_CAPABILITIES: Readonly<Record<StartupRole, readonly Capability[]>> = {
  owner: [
    'cycle:read',
    'startup:read_own',
    'allocation:read_own',
    'allocation:acknowledge',
    'position:read_own',
    'position:submit',
    'candidate:read_pool',
    'interview:read_own',
    'interview:schedule',
    'interview:record',
    'task:assess',
    'selection:create',
    'exception:request',
    'document:read_own',
    'placement:confirm_startup',
  ],
  member: [
    'cycle:read',
    'startup:read_own',
    'allocation:read_own',
    'allocation:acknowledge',
    'position:read_own',
    'position:submit',
    'candidate:read_pool',
    'interview:read_own',
    'interview:schedule',
    'interview:record',
    'task:assess',
    'selection:create',
    'exception:request',
    'placement:confirm_startup',
  ],
  // A supervisor runs interviews but does not commit the startup to a hire or
  // to a deadline extension.
  supervisor: [
    'cycle:read',
    'startup:read_own',
    'position:read_own',
    'candidate:read_pool',
    'interview:read_own',
    'interview:schedule',
    'interview:record',
    'task:assess',
  ],
};

/**
 * Candidate grants. Small on purpose: a candidate sees their own journey and
 * nothing else — not the startup's other candidates, not the pool they are in.
 */
export const CANDIDATE_CAPABILITIES: readonly Capability[] = [
  'candidate:read_self',
  'candidate:confirm_availability',
  'interview:read_own',
  'document:upload_own',
  'document:read_own',
  // Under candidate-choice the candidate is the one who decides, so this is the
  // first capability that lets them change something outside their own record.
  'selection:read_own_offers',
  'selection:accept_offer',
  'task:submit_own',
  'placement:confirm_candidate',
];
