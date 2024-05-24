import {useApolloClient, useQuery} from '@apollo/client';
import sortBy from 'lodash/sortBy';
import React, {createContext, useCallback, useEffect, useMemo} from 'react';

import {DagsterRepoOption} from './WorkspaceContext';
import {CODE_LOCATION_STATUS_QUERY, LOCATION_WORKSPACE_QUERY} from './WorkspaceQueries';
import {WorkspaceLocationNodeFragment} from './types/WorkspaceContext.types';
import {
  CodeLocationStatusQuery,
  CodeLocationStatusQueryVariables,
  LocationWorkspaceQuery,
  LocationWorkspaceQueryVariables,
} from './types/WorkspaceQueries.types';
import {useVisibleRepos} from './useVisibleRepos';
import {useQueryRefreshAtInterval} from '../app/QueryRefresh';
import {useCodeLocationsStatus} from '../nav/useCodeLocationsStatus';
import {getData} from '../search/useIndexedDBCachedQuery';

export const WorkspaceContext = createContext<any>({loading: true});

export const WorkspaceProvider = ({children}: {children: React.ReactNode}) => {
  const codeLocationStatusQueryResult = useQuery<
    CodeLocationStatusQuery,
    CodeLocationStatusQueryVariables
  >(CODE_LOCATION_STATUS_QUERY, {
    fetchPolicy: 'network-only',
  });
  useQueryRefreshAtInterval(codeLocationStatusQueryResult, 5000);

  const locations = useMemo(() => {
    const data = codeLocationStatusQueryResult.data;
    return data?.locationStatusesOrError?.__typename === 'WorkspaceLocationStatusEntries'
      ? data?.locationStatusesOrError.entries
      : [];
  }, [codeLocationStatusQueryResult.data]);

  const [locationsData, setLocationsData] = React.useState<
    Record<string, WorkspaceLocationNodeFragment>
  >({});

  const client = useApolloClient();

  const refetchLocation = useCallback(
    async (name: string) => {
      return await getData<LocationWorkspaceQuery, LocationWorkspaceQueryVariables>({
        client,
        query: LOCATION_WORKSPACE_QUERY,
        key: `LocationWorkspace${name}`,
        version: 1,
        variables: {
          name,
        },
      });
    },
    [client],
  );

  useEffect(() => {
    locations.forEach(async (location) => {
      const locationData = getData({
        client,
        query: LOCATION_WORKSPACE_QUERY,
        key: `LocationWorkspace${location.name}`,
        version: 1,
        variables: {
          name: location.name,
        },
      });
      setLocationsData((locationsData) =>
        Object.assign({}, locationsData, {
          [location.name]: locationData,
        }),
      );
    });
  }, [client, locations]);

  const locationEntries = useMemo(() => Object.values(locationsData), [locationsData]);

  const {allRepos} = React.useMemo(() => {
    let allRepos: DagsterRepoOption[] = [];

    allRepos = sortBy(
      locationEntries.reduce((accum, locationEntry) => {
        if (locationEntry.locationOrLoadError?.__typename !== 'RepositoryLocation') {
          return accum;
        }
        const repositoryLocation = locationEntry.locationOrLoadError;
        const reposForLocation = repositoryLocation.repositories.map((repository) => {
          return {repository, repositoryLocation};
        });
        return [...accum, ...reposForLocation];
      }, [] as DagsterRepoOption[]),

      // Sort by repo location, then by repo
      (r) => `${r.repositoryLocation.name}:${r.repository.name}`,
    );

    return {allRepos};
  }, [locationEntries]);

  const {visibleRepos, toggleVisible, setVisible, setHidden} = useVisibleRepos(allRepos);

  useCodeLocationsStatus(locationEntries, codeLocationStatusQueryResult.data, refetchLocation);

  return (
    <WorkspaceContext.Provider
      value={{
        loading: Object.keys(locationsData).length !== locations.length, // Only "loading" on initial load.
        locationEntries,
        allRepos,
        visibleRepos,
        toggleVisible,
        setVisible,
        setHidden,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
