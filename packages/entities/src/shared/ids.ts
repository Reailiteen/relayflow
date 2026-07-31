import { z } from 'zod';
import type { Uuid } from '@relayflow/core';

/**
 * Every id type in the system is declared here once, with a matching schema.
 * `UserId` and `OrganizationId` are both uuids at runtime but are not
 * interchangeable to the compiler.
 */
export type UserId = Uuid<'UserId'>;
export type OrganizationId = Uuid<'OrganizationId'>;
export type MembershipId = Uuid<'MembershipId'>;

const uuid = z.uuid();

export const userId = uuid.transform((v) => v as UserId);
export const organizationId = uuid.transform((v) => v as OrganizationId);
export const membershipId = uuid.transform((v) => v as MembershipId);
