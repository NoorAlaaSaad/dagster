import {Box, ButtonLink, Colors} from '@dagster-io/ui-components';
import {useCallback, useEffect, useState} from 'react';
import {useHistory} from 'react-router-dom';
import styled from 'styled-components';

import {showSharedToaster} from '../app/DomUtils';
import {RepositoryLocationLoadStatus} from '../graphql/types';
import {StatusAndMessage} from '../instance/DeploymentStatusType';
import {WorkspaceLocationNodeFragment} from '../workspace/types/WorkspaceContext.types';
import {
  CodeLocationStatusQuery,
  LocationWorkspaceQuery,
} from '../workspace/types/WorkspaceQueries.types';

type LocationStatusEntry = {
  loadStatus: RepositoryLocationLoadStatus;
  id: string;
  name: string;
  updateTimestamp: number;
};

type EntriesById = Record<string, LocationStatusEntry>;

export const useCodeLocationsStatus = (
  locationEntries: WorkspaceLocationNodeFragment[],
  locationStatuses: CodeLocationStatusQuery | undefined,
  refetch: (locationName: string) => Promise<LocationWorkspaceQuery>,
): StatusAndMessage | null => {
  const [previousEntries, setPreviousEntries] = useState<LocationStatusEntry[] | null>(null);

  const history = useHistory();

  const [showSpinner, setShowSpinner] = useState(false);

  const onClickViewButton = useCallback(() => {
    history.push('/locations');
  }, [history]);

  // Reload the workspace, but don't toast about it.
  const reloadLocationQuietly = useCallback(
    async (name: string) => {
      setShowSpinner(true);
      await refetch(name);
      setShowSpinner(false);
    },
    [refetch],
  );

  // Reload the workspace, and show a success or error toast upon completion.
  const reloadLocationLoudly = useCallback(
    async (name: string) => {
      setShowSpinner(true);
      const result = await refetch(name);
      setShowSpinner(false);

      const didError = result.workspaceLocationEntryOrError?.__typename === 'PythonError';

      const showViewButton = !alreadyViewingCodeLocations();

      if (didError) {
        await showSharedToaster({
          intent: 'warning',
          message: (
            <Box flex={{direction: 'row', justifyContent: 'space-between', gap: 24, grow: 1}}>
              <div>Location {name} failed to loaded with errors</div>
              {showViewButton ? <ViewCodeLocationsButton onClick={onClickViewButton} /> : null}
            </Box>
          ),
          icon: 'check_circle',
        });
      } else {
        await showSharedToaster({
          intent: 'success',
          message: (
            <Box flex={{direction: 'row', justifyContent: 'space-between', gap: 24, grow: 1}}>
              <div>Location {name} reloaded</div>
              {showViewButton ? <ViewCodeLocationsButton onClick={onClickViewButton} /> : null}
            </Box>
          ),
          icon: 'check_circle',
        });
      }
    },
    [onClickViewButton, refetch],
  );

  const onLocationUpdate = useCallback(
    async (data: CodeLocationStatusQuery) => {
      const isFreshPageload = previousEntries === null;

      if (data.locationStatusesOrError.__typename === 'PythonError') {
        // TODO
        return;
      }

      // Given the previous and current code locations, determine whether to show a) a loading spinner
      // and/or b) a toast indicating that a code location is being reloaded.
      const currentEntries = data?.locationStatusesOrError.entries;

      const {added, deleted, updated} = analyzeUpdates(previousEntries ?? [], currentEntries);

      const currentlyLoading = currentEntries.filter(
        ({loadStatus}: LocationStatusEntry) => loadStatus === RepositoryLocationLoadStatus.LOADING,
      );
      const anyCurrentlyLoading = currentlyLoading.length > 0;

      if (added.length || deleted.length || updated.length) {
        setPreviousEntries(currentEntries);
      }

      // If this is a fresh pageload and anything is currently loading, show the spinner, but we
      // don't need to reload the workspace because subsequent polls should see that the location
      // has finished loading and therefore trigger a reload.
      if (isFreshPageload) {
        if (anyCurrentlyLoading) {
          setShowSpinner(true);
        }
        return;
      }

      const showViewButton = !alreadyViewingCodeLocations();

      if (added.length) {
        added.forEach((entry) => {

        });
      }

      if (deleted.length) {
        
      }

      if (updated.length) {
        updated.forEach((entry) => {
          reloadLocationLoudly(entry.oldItem)
        })

      }

        const toastContent = () => {
          if (addedEntries.length === 1) {
            const entryId = addedEntries[0]!;
            const locationName = currEntriesById[entryId]?.name;
            // The entry should be in the entry map, but guard against errors just in case.
            return (
              <span>Code location {locationName ? <strong>{locationName}</strong> : ''} added</span>
            );
          }

          return <span>{addedEntries.length} code locations added</span>;
        };

        await showSharedToaster({
          intent: 'primary',
          message: (
            <Box flex={{direction: 'row', justifyContent: 'space-between', gap: 24, grow: 1}}>
              {toastContent()}
              {showViewButton ? <ViewCodeLocationsButton onClick={onClickViewButton} /> : null}
            </Box>
          ),
          icon: 'add_circle',
        });

        reloadLocationLoudly();
        return;
      }

      const anyPreviouslyLoading = previousEntries.some(
        ({loadStatus}) => loadStatus === RepositoryLocationLoadStatus.LOADING,
      );

      // One or more code locations are updating, so let the user know. We will not refetch the workspace
      // until all code locations are done updating.
      if (!anyPreviouslyLoading && anyCurrentlyLoading) {
        setShowSpinner(true);

        await showSharedToaster({
          intent: 'primary',
          message: (
            <Box flex={{direction: 'row', justifyContent: 'space-between', gap: 24, grow: 1}}>
              {currentlyLoading.length === 1 ? (
                <span>
                  Updating <strong>{currentlyLoading[0]!.name}</strong>
                </span>
              ) : (
                <span>Updating {currentlyLoading.length} code locations</span>
              )}
              {showViewButton ? <ViewCodeLocationsButton onClick={onClickViewButton} /> : null}
            </Box>
          ),
          icon: 'refresh',
        });

        return;
      }

      // A location was previously loading, and no longer is. Our workspace is ready. Refetch it.
      if (anyPreviouslyLoading && !anyCurrentlyLoading) {
        reloadLocationLoudly();
        return;
      }

      if (hasUpdatedEntries) {
        reloadLocationLoudly();
        return;
      }
    },
    [onClickViewButton, previousEntriesById, reloadLocationLoudly, reloadLocationQuietly],
  );

  useEffect(() => {
    if (locationStatuses) {
      onLocationUpdate(locationStatuses);
    }
  }, [locationStatuses, onLocationUpdate]);

  if (showSpinner) {
    return {
      type: 'spinner',
      content: <div>Loading definitions…</div>,
    };
  }

  const repoErrors = locationEntries.filter(
    (locationEntry) => locationEntry.locationOrLoadError?.__typename === 'PythonError',
  );

  if (repoErrors.length) {
    return {
      type: 'warning',
      content: (
        <div style={{whiteSpace: 'nowrap'}}>{`${repoErrors.length} ${
          repoErrors.length === 1 ? 'code location failed to load' : 'code locations failed to load'
        }`}</div>
      ),
    };
  }

  return null;
};

const alreadyViewingCodeLocations = () => document.location.pathname.endsWith('/locations');

const ViewCodeLocationsButton = ({onClick}: {onClick: () => void}) => {
  return (
    <ViewButton onClick={onClick} color={Colors.accentWhite()}>
      View
    </ViewButton>
  );
};

function analyzeUpdates(oldArray: LocationStatusEntry[], newArray: LocationStatusEntry[]) {
  const oldMap = new Map(oldArray.map((item) => [item.id, item]));
  const newMap = new Map(newArray.map((item) => [item.id, item]));

  const updated = [];
  const deleted = [];
  const added = [];

  // Check for updates and deletions in the old array
  for (const oldItem of oldArray) {
    const newItem = newMap.get(oldItem.id);
    if (!newItem) {
      // If item is not in the new array, it's deleted
      deleted.push(oldItem);
    } else if (newItem.updateTimestamp > oldItem.updateTimestamp) {
      // If item is in the new array and has a newer timestamp, it's updated
      updated.push(oldItem);
    }
  }

  // Check for additions in the new array
  for (const newItem of newArray) {
    if (!oldMap.has(newItem.id)) {
      // If item is not in the old array, it's added
      added.push(newItem);
    }
  }

  return {updated, deleted, added};
}

const ViewButton = styled(ButtonLink)`
  white-space: nowrap;
`;
