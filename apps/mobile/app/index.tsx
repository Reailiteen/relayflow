import { Redirect } from 'expo-router';
import { portalFor, resolveActor } from '../src/session';

/**
 * Entry point: send the session to its own portal.
 *
 * There is no shared home screen because a candidate and a startup have
 * genuinely nothing in common to show — one is following their own application,
 * the other is running a hiring process.
 */
export default function Index() {
  const portal = portalFor(resolveActor());
  return <Redirect href={portal === 'startup' ? '/startup' : '/candidate'} />;
}
