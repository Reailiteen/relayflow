'use server';

import { createOrganization, listMembers } from '@relayflow/logic';
import { action } from '../action';

/**
 * Every exported Server Action is one line, because everything that could go
 * wrong — validation, authorization, atomicity, error shaping — has already
 * been decided in the layers below. There is nowhere here to forget a check.
 */

export const createOrganizationAction = action(createOrganization);
export const listMembersAction = action(listMembers);
