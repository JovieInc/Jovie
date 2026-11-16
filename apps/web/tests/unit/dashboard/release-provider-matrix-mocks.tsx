/**
 * Stand-ins for the release create flow in ReleaseProviderMatrix tests: the
 * header's create and sync buttons, and the post-create release plan modal
 * with its loading, upgrade and generate states.
 */
export const MockNewReleaseHeaderAction = ({
  canCreateManualReleases,
  onCreateManual,
  onSyncSpotify,
}: {
  canCreateManualReleases: boolean;
  onCreateManual: () => void;
  onSyncSpotify: () => void;
}) => (
  <div>
    {canCreateManualReleases ? (
      <button
        type='button'
        aria-label='Create A New Release'
        onClick={onCreateManual}
      >
        Create A New Release
      </button>
    ) : null}
    <button
      type='button'
      aria-label='Sync releases from Spotify'
      onClick={onSyncSpotify}
    >
      Sync from Spotify
    </button>
  </div>
);

export const MockReleasePlanWizard = ({
  open,
  releaseTitle,
  isGateLoading,
  canGenerateReleasePlans,
  isGeneratingReleasePlan,
  onClose,
  onSubmit,
}: {
  open: boolean;
  releaseTitle: string | null;
  isGateLoading: boolean;
  canGenerateReleasePlans: boolean;
  isGeneratingReleasePlan: boolean;
  onClose: () => void;
  onSubmit: (ctx: unknown) => void;
}) =>
  open ? (
    <div role='dialog' aria-modal='true'>
      <h2>
        {isGateLoading
          ? 'Release Plan'
          : canGenerateReleasePlans
            ? 'Generate Release Plan'
            : 'Upgrade to Generate a Release Plan'}
      </h2>
      <p>
        {isGateLoading
          ? 'Checking whether this workspace can generate tasks for the release plan.'
          : canGenerateReleasePlans
            ? 'Create the step-by-step tasks for this release and jump straight into the plan.'
            : 'Upgrade to turn this release into a step-by-step plan with tasks you can assign to Jovie AI.'}
      </p>
      <p>{releaseTitle ?? 'This release'} is ready.</p>
      <button
        type='button'
        onClick={onClose}
        disabled={isGeneratingReleasePlan}
      >
        Maybe Later
      </button>
      {isGateLoading ? (
        <button type='button' disabled>
          Loading...
        </button>
      ) : canGenerateReleasePlans ? (
        <button
          type='button'
          onClick={() =>
            onSubmit({
              releaseFormat: 'single',
              distribution: 'diy',
              genre: 'pop',
              primaryGoal: 'streams',
              territory: ['GLOBAL'],
              hasPublisher: false,
            })
          }
          disabled={isGeneratingReleasePlan}
        >
          {isGeneratingReleasePlan ? 'Generating...' : 'Generate Release Plan'}
        </button>
      ) : (
        <button type='button'>Upgrade to Pro</button>
      )}
    </div>
  ) : null;
