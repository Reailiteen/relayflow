import { asId } from '@relayflow/core';
import type {
  Allocation,
  Candidate,
  CandidateDocument,
  Cycle,
  ExceptionRequest,
  Interview,
  PoolEntry,
  Position,
  Selection,
  Startup,
  StartupMember,
  User,
} from '@relayflow/entities';

/**
 * A cycle caught mid-flight, at the moment the product is most interesting:
 * the selection deadline has just passed.
 *
 * The data is arranged so that every screen has something real to show and
 * every "needs attention" item on the QSTP dashboard is genuinely derived
 * rather than hardcoded. In particular it contains all three flows the brief
 * says to build first:
 *
 *   Happy path      Acme Robotics — allocated, submitted, interviewed,
 *                   selected, candidate now in onboarding.
 *   Exception       Northwind — missed selection, asked for more time, pending.
 *   Redistribution  Qatar Fintech Labs — missed selection, no exception, so
 *                   its 40 hours are reclaimable.
 *
 * Plus the awkward cases that break UI: a live candidate conflict, a startup on
 * zero hours waiting for redistribution, a startup that never submitted
 * positions, an unavailable candidate, and a long company name.
 */

const id = <T extends string>(hex: string) => asId<T>(hex);

export const ids = {
  cycle: id<'CycleId'>('c1c1e000-0000-4000-8000-000000000001'),

  // Startups
  acme: id<'StartupId'>('57a27000-0000-4000-8000-000000000001'),
  northwind: id<'StartupId'>('57a27000-0000-4000-8000-000000000002'),
  fintech: id<'StartupId'>('57a27000-0000-4000-8000-000000000003'),
  agritech: id<'StartupId'>('57a27000-0000-4000-8000-000000000004'),
  pearl: id<'StartupId'>('57a27000-0000-4000-8000-000000000005'),
  lusail: id<'StartupId'>('57a27000-0000-4000-8000-000000000006'),
  msheireb: id<'StartupId'>('57a27000-0000-4000-8000-000000000007'),

  // Users
  qstpManager: id<'UserId'>('05e70000-0000-4000-8000-000000000001'),
  qstpOps: id<'UserId'>('05e70000-0000-4000-8000-000000000002'),
  qstpViewer: id<'UserId'>('05e70000-0000-4000-8000-000000000003'),
  acmeOwner: id<'UserId'>('05e70000-0000-4000-8000-000000000004'),
  acmeSupervisor: id<'UserId'>('05e70000-0000-4000-8000-000000000005'),
  northwindOwner: id<'UserId'>('05e70000-0000-4000-8000-000000000006'),
  candidateUser: id<'UserId'>('05e70000-0000-4000-8000-000000000007'),

  // Positions
  posAiDev: id<'PositionId'>('9051f100-0000-4000-8000-000000000001'),
  posEmbedded: id<'PositionId'>('9051f100-0000-4000-8000-000000000002'),
  posDataAnalyst: id<'PositionId'>('9051f100-0000-4000-8000-000000000003'),
  posRiskEng: id<'PositionId'>('9051f100-0000-4000-8000-000000000004'),
  posBioinformatics: id<'PositionId'>('9051f100-0000-4000-8000-000000000005'),
  posDataEng: id<'PositionId'>('9051f100-0000-4000-8000-000000000006'),

  // Candidates
  canLayla: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000001'),
  canOmar: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000002'),
  canSara: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000003'),
  canYusuf: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000004'),
  canMaryam: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000005'),
  canHassan: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000006'),
  canDana: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000007'),
  canRashid: id<'CandidateId'>('ca4d1da7-0000-4000-8000-000000000008'),
} as const;

// "Now" for this fixture set: two days after the selection deadline, which is
// what makes redistribution live and the exception request urgent.
export const FIXTURE_NOW = '2026-03-16T09:00:00.000Z';
const T = (iso: string) => iso;

// ─── Cycle ───────────────────────────────────────────────────────────────────

export const cycle: Cycle = {
  id: ids.cycle,
  name: 'Spring 2026 Internship Cycle',
  stage: 'completion',
  startsOn: '2026-02-01',
  endsOn: '2026-08-31',
  fundedWeeklyHours: 500,
  // The seeded cycle runs the original mode, so the fixtures keep exercising
  // first-come everywhere. Candidate-choice is covered by its own tests rather
  // than by rewriting the fixture every screen depends on.
  selectionMode: 'first_come',
  deadlines: {
    positionSubmission: T('2026-02-28T23:59:00.000Z'),
    candidateSelection: T('2026-03-14T23:59:00.000Z'), // two days ago
    documentSubmission: T('2026-04-04T23:59:00.000Z'),
    offerWindow: null,
  },
  archivedAt: null,
  createdAt: T('2026-01-10T08:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
};

// ─── Startups ────────────────────────────────────────────────────────────────

const startup = (
  sid: Startup['id'],
  name: string,
  slug: string,
  sector: string | null,
  email: string,
): Startup => ({
  id: sid,
  name,
  slug,
  sector,
  contactEmail: email,
  createdAt: T('2026-01-12T10:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
});

export const startups: Startup[] = [
  startup(ids.acme, 'Acme Robotics', 'acme-robotics', 'Robotics', 'ops@acmerobotics.qa'),
  startup(ids.northwind, 'Northwind Analytics', 'northwind', 'Data', 'team@northwind.qa'),
  startup(ids.fintech, 'Qatar Fintech Labs', 'qatar-fintech-labs', 'Fintech', 'hr@qflabs.qa'),
  // Long name on purpose — headers, breadcrumbs and table cells must survive it.
  startup(
    ids.agritech,
    'Desert Bloom Agricultural Technologies',
    'desert-bloom',
    'AgriTech',
    'contact@desertbloom.qa',
  ),
  startup(ids.pearl, 'Pearl Diagnostics', 'pearl-diagnostics', 'HealthTech', 'info@pearldx.qa'),
  startup(ids.lusail, 'Lusail Mobility', 'lusail-mobility', 'Mobility', 'hello@lusailmobility.qa'),
  // Funded, roles approved, and still waiting on candidates. This is the one
  // startup the QSTP board can actually act on — without it every card sits in
  // a stage that moves by itself and the board looks decorative.
  startup(ids.msheireb, 'Msheireb Data Systems', 'msheireb-data', 'Data', 'ops@msheireb.qa'),
];

// ─── Users & members ─────────────────────────────────────────────────────────

const user = (uid: User['id'], fullName: string, email: string, avatar = true): User => ({
  id: uid,
  email,
  fullName,
  avatarUrl: avatar ? `https://i.pravatar.cc/128?u=${uid}` : null,
  createdAt: T('2026-01-12T10:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
});

export const users: User[] = [
  user(ids.qstpManager, 'Noor Al-Kuwari', 'noor@qstp.org.qa'),
  user(ids.qstpOps, 'Faisal Al-Marri', 'faisal@qstp.org.qa'),
  user(ids.qstpViewer, 'Programme Audit', 'audit@qstp.org.qa', false),
  user(ids.acmeOwner, 'Dana Habib', 'dana@acmerobotics.qa'),
  user(ids.acmeSupervisor, 'Karim Nasser', 'karim@acmerobotics.qa', false),
  user(ids.northwindOwner, 'Reem Al-Sulaiti', 'reem@northwind.qa'),
  user(ids.candidateUser, 'Layla Ahmed', 'layla.ahmed@example.com'),
];

const member = (
  n: number,
  startupId: StartupMember['startupId'],
  userId: StartupMember['userId'],
  role: StartupMember['role'],
): StartupMember => ({
  id: id<'StartupMemberId'>(`5e3be000-0000-4000-8000-00000000000${n}`),
  startupId,
  userId,
  role,
  status: 'active',
  createdAt: T('2026-01-12T10:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
});

export const startupMembers: StartupMember[] = [
  member(1, ids.acme, ids.acmeOwner, 'owner'),
  member(2, ids.acme, ids.acmeSupervisor, 'supervisor'),
  member(3, ids.northwind, ids.northwindOwner, 'owner'),
];

// ─── Allocations ─────────────────────────────────────────────────────────────
// 60 + 40 + 40 + 30 + 20 + 0 + 20 = 210 of 500 funded hours allocated.

const allocation = (
  n: number,
  startupId: Allocation['startupId'],
  weeklyHours: Allocation['weeklyHours'],
  score: number | null,
  status: Allocation['status'],
  justification: string | null,
  extra: Partial<Allocation> = {},
): Allocation => ({
  id: id<'AllocationId'>(`a110ca70-0000-4000-8000-00000000000${n}`),
  cycleId: ids.cycle,
  startupId,
  weeklyHours,
  status,
  score,
  overrideReason: null,
  justification,
  fromRedistribution: false,
  revision: 1,
  supersedesAllocationId: null,
  redistributionRoundId: null,
  decidedBy: ids.qstpManager,
  decidedAt: T('2026-02-10T11:00:00.000Z'),
  createdAt: T('2026-02-10T11:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
  ...extra,
});

export const allocations: Allocation[] = [
  allocation(1, ids.acme, 60, 91, 'confirmed', 'Strong technical team, proven intern mentoring.'),
  allocation(2, ids.northwind, 40, 74, 'confirmed', 'Good fit; smaller supervision capacity.'),
  allocation(3, ids.fintech, 40, 71, 'confirmed', 'Solid roles, first cycle in the programme.'),
  // Scored for 20 but granted 30 — an override, so it carries a reason.
  allocation(4, ids.agritech, 30, 44, 'confirmed', 'Strategic sector priority.', {
    overrideReason: 'Agriculture is a programme priority sector for 2026.',
  }),
  allocation(5, ids.pearl, 20, 58, 'confirmed', 'Narrow scope but well defined.'),
  // Zero-hour startup: the redistribution screen's primary audience.
  allocation(6, ids.lusail, 0, 37, 'confirmed', 'Below threshold this cycle; waitlisted.'),
  allocation(7, ids.msheireb, 20, 66, 'confirmed', 'Clear brief, first cycle in the programme.'),
];

// ─── Positions ───────────────────────────────────────────────────────────────

const position = (
  pid: Position['id'],
  startupId: Position['startupId'],
  title: string,
  skills: string[],
  internCount: number,
  hoursPerIntern: number,
  status: Position['status'],
  supervisorName: string | null,
): Position => ({
  id: pid,
  cycleId: ids.cycle,
  startupId,
  // The Spring cycle predates position intents, so these have no provenance.
  intentId: null,
  title,
  description: `${title} supporting the team's delivery for the Spring 2026 cycle.`,
  requiredSkills: skills,
  workArrangement: 'hybrid',
  additionalRequirements: null,
  internCount,
  hoursPerIntern,
  durationWeeks: 12,
  supervisorId: null,
  supervisorName,
  status,
  reviewNote: null,
  reviewHistory: [],
  redistributionRoundId: null,
  createdAt: T('2026-02-20T09:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
});

export const positions: Position[] = [
  // Acme: 2 × 20 + 20 = 60, exactly its allocation.
  position(
    ids.posAiDev,
    ids.acme,
    'AI Developer',
    ['Python', 'PyTorch', 'Computer Vision'],
    2,
    20,
    'approved',
    'Karim Nasser',
  ),
  position(
    ids.posEmbedded,
    ids.acme,
    'Embedded Systems Intern',
    ['C++', 'ROS', 'Electronics'],
    1,
    20,
    'approved',
    'Karim Nasser',
  ),
  position(
    ids.posDataAnalyst,
    ids.northwind,
    'Data Analyst',
    ['SQL', 'Python', 'Tableau'],
    2,
    20,
    'approved',
    'Reem Al-Sulaiti',
  ),
  position(
    ids.posRiskEng,
    ids.fintech,
    'Risk Engineering Intern',
    ['Python', 'Statistics'],
    2,
    20,
    'approved',
    null,
  ),
  // Left as 'submitted' on purpose: the positions tracker needs something to
  // actually review, or the approve/send-back path is unreachable in the demo.
  position(
    ids.posBioinformatics,
    ids.pearl,
    'Bioinformatics Intern',
    ['R', 'Genomics'],
    1,
    20,
    'submitted',
    null,
  ),
  // Approved and waiting on a pool, which is the state the QSTP board exists to
  // clear. Its skills overlap candidates who are available and unclaimed, so
  // dragging this card to "Candidate pool sent" has something real to share.
  position(
    ids.posDataEng,
    ids.msheireb,
    'Data Engineering Intern',
    ['Python', 'SQL', 'Statistics'],
    1,
    20,
    'approved',
    null,
  ),
  // Desert Bloom has 30 hours and has submitted nothing — a dashboard item.
];

// ─── Candidates ──────────────────────────────────────────────────────────────

const candidate = (
  cid: Candidate['id'],
  fullName: string,
  email: string,
  skills: string[],
  availability: Candidate['availability'],
  extra: Partial<Candidate> = {},
): Candidate => ({
  id: cid,
  cycleId: ids.cycle,
  userId: null,
  fullName,
  email,
  phone: '+974 5000 0000',
  skills,
  cvUrl: 'https://example.com/cv.pdf',
  portfolioUrl: null,
  githubUrl: `https://github.com/${fullName.split(' ')[0]?.toLowerCase() ?? 'user'}`,
  availability,
  availabilityConfirmedAt: availability === 'unconfirmed' ? null : T('2026-03-01T10:00:00.000Z'),
  source: 'deema',
  createdAt: T('2026-03-01T08:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
  ...extra,
});

export const candidates: Candidate[] = [
  candidate(
    ids.canLayla,
    'Layla Ahmed',
    'layla.ahmed@example.com',
    ['Python', 'PyTorch', 'Computer Vision'],
    'placed',
    { userId: ids.candidateUser },
  ),
  // Claimed by two startups at once — the conflict screen's subject.
  candidate(ids.canOmar, 'Omar Khalid', 'omar.khalid@example.com', ['Python', 'SQL'], 'available'),
  candidate(ids.canSara, 'Sara Nassif', 'sara.nassif@example.com', ['C++', 'ROS'], 'available'),
  // Took another job. Startups must see this before they spend an interview on it.
  candidate(ids.canYusuf, 'Yusuf Rahman', 'yusuf.rahman@example.com', ['SQL', 'Tableau'], 'employed'),
  candidate(
    ids.canMaryam,
    'Maryam Al-Thani',
    'maryam.althani@example.com',
    ['R', 'Genomics'],
    'unconfirmed',
  ),
  candidate(
    ids.canHassan,
    'Hassan Iqbal',
    'hassan.iqbal@example.com',
    ['Python', 'Statistics'],
    'available',
  ),
  // Imported but not yet sent to any startup — the state the candidates screen
  // exists to resolve. Without these, "not yet shared" is always zero and the
  // share-pool flow has nothing to operate on.
  candidate(ids.canDana, 'Dana Farouk', 'dana.farouk@example.com', ['Java', 'Spring'], 'available'),
  candidate(
    ids.canRashid,
    'Rashid Al-Naimi',
    'rashid.alnaimi@example.com',
    ['Figma', 'Prototyping'],
    'unconfirmed',
  ),
];

// ─── Pools ───────────────────────────────────────────────────────────────────

const poolEntry = (
  n: number,
  positionId: PoolEntry['positionId'],
  candidateId: PoolEntry['candidateId'],
  status: PoolEntry['status'],
): PoolEntry => ({
  id: id<'PoolEntryId'>(`900100e0-0000-4000-8000-00000000000${n}`),
  positionId,
  candidateId,
  status,
  sharedAt: T('2026-03-02T09:00:00.000Z'),
  reviewedAt: status === 'pending' ? null : T('2026-03-08T14:00:00.000Z'),
  createdAt: T('2026-03-02T09:00:00.000Z'),
  updatedAt: FIXTURE_NOW,
});

export const poolEntries: PoolEntry[] = [
  poolEntry(1, ids.posAiDev, ids.canLayla, 'selected'),
  poolEntry(2, ids.posAiDev, ids.canOmar, 'interviewed'),
  poolEntry(3, ids.posAiDev, ids.canHassan, 'pending'),
  poolEntry(4, ids.posEmbedded, ids.canSara, 'shortlisted'),
  poolEntry(5, ids.posDataAnalyst, ids.canOmar, 'selected'),
  poolEntry(6, ids.posDataAnalyst, ids.canYusuf, 'withdrawn'),
  poolEntry(7, ids.posRiskEng, ids.canHassan, 'pending'),
  poolEntry(8, ids.posBioinformatics, ids.canMaryam, 'pending'),
];

// ─── Selections ──────────────────────────────────────────────────────────────

const selection = (
  n: number,
  positionId: Selection['positionId'],
  startupId: Selection['startupId'],
  candidateId: Selection['candidateId'],
  status: Selection['status'],
  reservedAt: string,
  selectedBy: Selection['selectedBy'],
  extra: Partial<Selection> = {},
): Selection => ({
  id: id<'SelectionId'>(`5e1ec700-0000-4000-8000-00000000000${n}`),
  positionId,
  startupId,
  candidateId,
  status,
  reservedAt,
  offeredAt: null,
  acceptedAt: null,
  confirmedAt: status === 'confirmed' ? T('2026-03-11T10:00:00.000Z') : null,
  releasedAt: null,
  selectedBy,
  overrideReason: null,
  overriddenBy: null,
  createdAt: reservedAt,
  updatedAt: FIXTURE_NOW,
  ...extra,
});

export const selections: Selection[] = [
  // Happy path: Acme selected Layla, she confirmed, she is onboarding.
  selection(
    1,
    ids.posAiDev,
    ids.acme,
    ids.canLayla,
    'confirmed',
    T('2026-03-10T08:30:00.000Z'),
    ids.acmeOwner,
  ),
  // Conflict: Acme claimed Omar at 09:15, Northwind at 11:00 the same day.
  // Acme wins on the clock; the dashboard should surface this for review.
  selection(
    2,
    ids.posAiDev,
    ids.acme,
    ids.canOmar,
    'reserved',
    T('2026-03-12T09:15:00.000Z'),
    ids.acmeOwner,
  ),
  selection(
    3,
    ids.posDataAnalyst,
    ids.northwind,
    ids.canOmar,
    'reserved',
    T('2026-03-12T11:00:00.000Z'),
    ids.northwindOwner,
  ),
];

// ─── Exceptions ──────────────────────────────────────────────────────────────

export const exceptions: ExceptionRequest[] = [
  // Northwind missed selection and is asking for a week. Awaiting QSTP.
  {
    id: id<'ExceptionId'>('e8ce9710-0000-4000-8000-000000000001'),
    cycleId: ids.cycle,
    startupId: ids.northwind,
    kind: 'candidate_selection',
    status: 'pending',
    reason:
      'Our technical lead was on medical leave for two weeks and we could not complete interviews in time.',
    requestedDeadline: T('2026-03-21T23:59:00.000Z'),
    grantedDeadline: null,
    decisionNote: null,
    requestedBy: ids.northwindOwner,
    decidedBy: null,
    decidedAt: null,
    createdAt: T('2026-03-13T16:20:00.000Z'),
    updatedAt: T('2026-03-13T16:20:00.000Z'),
  },
  // Qatar Fintech Labs asked too late and was rejected — so its hours are
  // genuinely reclaimable, unlike Northwind's.
  {
    id: id<'ExceptionId'>('e8ce9710-0000-4000-8000-000000000002'),
    cycleId: ids.cycle,
    startupId: ids.fintech,
    kind: 'candidate_selection',
    status: 'rejected',
    reason: 'We need more time to decide between our shortlisted candidates.',
    requestedDeadline: T('2026-03-20T23:59:00.000Z'),
    grantedDeadline: null,
    decisionNote: 'Requested after the deadline had already passed.',
    requestedBy: ids.qstpOps,
    decidedBy: ids.qstpManager,
    decidedAt: T('2026-03-15T09:00:00.000Z'),
    createdAt: T('2026-03-15T07:00:00.000Z'),
    updatedAt: T('2026-03-15T09:00:00.000Z'),
  },
];

// ─── Interviews ──────────────────────────────────────────────────────────────

export const interviews: Interview[] = [
  {
    id: id<'InterviewId'>('137e271e-0000-4000-8000-000000000001'),
    positionId: ids.posAiDev,
    candidateId: ids.canLayla,
    mode: 'online',
    status: 'completed',
    scheduledFor: T('2026-03-09T11:00:00.000Z'),
    durationMinutes: 45,
    location: 'https://meet.google.com/xxx-yyyy-zzz',
    recordingUrl: 'https://example.com/recording.m4a',
    transcriptStatus: 'ready',
    transcript: 'Interviewer: Tell us about your computer vision work…',
    aiSummary:
      'Strong practical CV experience; shipped a defect-detection model during a prior internship. Communicates clearly. Some gaps in deployment tooling.',
    feedback: 'Excellent fit for the defect-detection workstream. Recommend hiring.',
    recommendation: 'advance',
    interviewerId: ids.acmeSupervisor,
    createdAt: T('2026-03-05T09:00:00.000Z'),
    updatedAt: FIXTURE_NOW,
  },
  {
    id: id<'InterviewId'>('137e271e-0000-4000-8000-000000000002'),
    positionId: ids.posAiDev,
    candidateId: ids.canOmar,
    mode: 'in_person',
    status: 'completed',
    scheduledFor: T('2026-03-11T13:00:00.000Z'),
    durationMinutes: 60,
    location: 'QSTP Innovation Centre, Room 204',
    recordingUrl: 'https://example.com/recording-2.m4a',
    // Transcription failed — the UI must show this as a failure, not an absence.
    transcriptStatus: 'failed',
    transcript: null,
    aiSummary: null,
    feedback: 'Good analytical thinking. Second choice behind Layla.',
    recommendation: 'advance',
    interviewerId: ids.acmeSupervisor,
    createdAt: T('2026-03-06T09:00:00.000Z'),
    updatedAt: FIXTURE_NOW,
  },
];

// ─── Documents ───────────────────────────────────────────────────────────────

export const documents: CandidateDocument[] = [
  {
    id: id<'DocumentId'>('d0c00e07-0000-4000-8000-000000000001'),
    candidateId: ids.canLayla,
    startupId: null,
    kind: 'national_id',
    status: 'verified',
    fileName: 'qid-front.jpg',
    storagePath: 'candidates/layla/qid-front.jpg',
    fields: [
      { key: 'id_number', label: 'ID number', extracted: '28912345678', confirmed: '28912345678', confidence: 0.97 },
      { key: 'full_name', label: 'Full name', extracted: 'Layla Ahmed', confirmed: 'Layla Ahmed', confidence: 0.95 },
      { key: 'expiry', label: 'Expiry date', extracted: '2029-06-30', confirmed: '2029-06-30', confidence: 0.88 },
    ],
    rejectionReason: null,
    verifiedBy: ids.qstpOps,
    verifiedAt: T('2026-03-15T12:00:00.000Z'),
    createdAt: T('2026-03-13T09:00:00.000Z'),
    updatedAt: T('2026-03-15T12:00:00.000Z'),
  },
  {
    id: id<'DocumentId'>('d0c00e07-0000-4000-8000-000000000002'),
    candidateId: ids.canLayla,
    startupId: null,
    kind: 'bank_statement',
    status: 'submitted',
    fileName: 'bank-statement.pdf',
    storagePath: 'candidates/layla/bank-statement.pdf',
    fields: [
      // Low confidence on the IBAN: exactly the field that must not be
      // auto-trusted, and the reason candidates confirm before QSTP verifies.
      { key: 'iban', label: 'IBAN', extracted: 'QA58DOHB00001234567890ABCDEFG', confirmed: 'QA58DOHB00001234567890ABCDEFG', confidence: 0.61 },
      { key: 'account_holder', label: 'Account holder', extracted: 'LAYLA AHMED', confirmed: 'Layla Ahmed', confidence: 0.93 },
      { key: 'bank_name', label: 'Bank', extracted: 'Doha Bank', confirmed: 'Doha Bank', confidence: 0.9 },
    ],
    rejectionReason: null,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: T('2026-03-15T10:00:00.000Z'),
    updatedAt: T('2026-03-15T10:00:00.000Z'),
  },
  {
    id: id<'DocumentId'>('d0c00e07-0000-4000-8000-000000000003'),
    candidateId: ids.canLayla,
    startupId: ids.acme,
    kind: 'startup_nda',
    status: 'requested',
    fileName: null,
    storagePath: null,
    fields: [],
    rejectionReason: null,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: T('2026-03-15T10:05:00.000Z'),
    updatedAt: T('2026-03-15T10:05:00.000Z'),
  },
];
