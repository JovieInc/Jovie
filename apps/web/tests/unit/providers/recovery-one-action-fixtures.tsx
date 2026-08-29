import { Button } from '@jovie/ui';

export const RECOVERY_SECOND_ACTION_FIXTURE_TEST_ID =
  'recovery-second-action-fixture';
export const RECOVERY_NESTED_INTERACTIVE_FIXTURE_TEST_ID =
  'recovery-nested-interactive-fixture';

export function RecoverySecondActionFixture() {
  return (
    <div
      data-testid={RECOVERY_SECOND_ACTION_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-recovery-actions=''
    >
      <Button type='button' variant='primary' size='sm'>
        Try again
      </Button>
      <Button type='button' variant='secondary' size='sm'>
        Go Home
      </Button>
    </div>
  );
}

export function RecoveryNestedInteractiveFixture() {
  return (
    <div
      data-testid={RECOVERY_NESTED_INTERACTIVE_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-recovery-actions=''
    >
      <a href='#nested-recovery-fixture'>
        <Button type='button' variant='secondary' size='sm'>
          Go Home
        </Button>
      </a>
    </div>
  );
}
