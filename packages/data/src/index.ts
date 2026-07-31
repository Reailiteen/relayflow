export * from './client';
export * from './errors';
export * from './repository';
export * from './transaction';
export type { Database, Json } from './generated/database.types';

/**
 * NOTE: this adapter currently ships only its infrastructure — client types,
 * PostgREST error translation, query helpers and the quarantined admin client.
 *
 * The repositories that satisfy @relayflow/ports were removed rather than left
 * to rot: they modelled the generic organizations/memberships schema from the
 * scaffold, not RelayFlow's cycles, allocations and selections. They will be
 * written against the real schema when the hosted project exists, at which
 * point the migrations in supabase/ are generated from @relayflow/entities.
 */
