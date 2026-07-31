import type { Result } from '@relayflow/core';
import {
  membershipEntity,
  type Membership,
  type OrganizationId,
  type UserId,
} from '@relayflow/entities';
import type { RlsClient } from '../client';
import { run, runMaybe } from '../repository';

export interface MembershipRepository {
  listForUser(userId: UserId): Promise<Result<Membership[]>>;
  listForOrganization(organizationId: OrganizationId): Promise<Result<Membership[]>>;
  find(organizationId: OrganizationId, userId: UserId): Promise<Result<Membership | null>>;
}

const COLUMNS = 'id, organization_id, user_id, role, status, created_at, updated_at';

export function membershipRepository(client: RlsClient): MembershipRepository {
  return {
    listForUser: (userId) =>
      run(
        client.from('memberships').select(COLUMNS).eq('user_id', userId),
        membershipEntity.parseMany,
        { repository: 'memberships', op: 'listForUser' },
      ),

    listForOrganization: (organizationId) =>
      run(
        client.from('memberships').select(COLUMNS).eq('organization_id', organizationId),
        membershipEntity.parseMany,
        { repository: 'memberships', op: 'listForOrganization' },
      ),

    find: (organizationId, userId) =>
      runMaybe(
        client
          .from('memberships')
          .select(COLUMNS)
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .maybeSingle(),
        membershipEntity.parse,
        { repository: 'memberships', op: 'find' },
      ),
  };
}
