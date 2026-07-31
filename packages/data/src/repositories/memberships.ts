import { membershipEntity } from '@relayflow/entities';
import type { MembershipPort } from '@relayflow/ports';
import type { RlsClient } from '../client';
import { run, runMaybe } from '../repository';

const COLUMNS = 'id, organization_id, user_id, role, status, created_at, updated_at';

export function membershipRepository(client: RlsClient): MembershipPort {
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
