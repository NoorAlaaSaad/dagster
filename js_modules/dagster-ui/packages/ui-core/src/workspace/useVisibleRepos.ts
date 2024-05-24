import {useCallback, useContext, useMemo} from 'react';

import {DagsterRepoOption, HIDDEN_REPO_KEYS} from './WorkspaceContext';
import {RepoAddress} from './types';
import {AppContext} from '../app/AppContext';
import {useStateWithStorage} from '../hooks/useStateWithStorage';

/**
 * useVisibleRepos returns `{reposForKeys, toggleVisible, setVisible, setHidden}` and internally
 * mirrors the current selection into localStorage so that the default selection in new browser
 * windows is the repo currently active in your session.
 */
const validateHiddenKeys = (parsed: unknown) => (Array.isArray(parsed) ? parsed : []);

type SetVisibleOrHiddenFn = (repoAddresses: RepoAddress[]) => void;

export const useVisibleRepos = (
  allRepos: DagsterRepoOption[],
): {
  visibleRepos: DagsterRepoOption[];
  toggleVisible: SetVisibleOrHiddenFn;
  setVisible: SetVisibleOrHiddenFn;
  setHidden: SetVisibleOrHiddenFn;
} => {
  const {basePath} = useContext(AppContext);

  const [hiddenKeys, setHiddenKeys] = useStateWithStorage<string[]>(
    basePath + ':' + HIDDEN_REPO_KEYS,
    validateHiddenKeys,
  );

  const hiddenKeysJSON = JSON.stringify([...hiddenKeys.sort()]);

  const toggleVisible = useCallback(
    (repoAddresses: RepoAddress[]) => {
      repoAddresses.forEach((repoAddress) => {
        const key = `${repoAddress.name}:${repoAddress.location}`;

        setHiddenKeys((current) => {
          let nextHiddenKeys = [...(current || [])];
          if (nextHiddenKeys.includes(key)) {
            nextHiddenKeys = nextHiddenKeys.filter((k) => k !== key);
          } else {
            nextHiddenKeys = [...nextHiddenKeys, key];
          }
          return nextHiddenKeys;
        });
      });
    },
    [setHiddenKeys],
  );

  const setVisible = useCallback(
    (repoAddresses: RepoAddress[]) => {
      const keysToShow = new Set(
        repoAddresses.map((repoAddress) => `${repoAddress.name}:${repoAddress.location}`),
      );
      setHiddenKeys((current) => {
        return current?.filter((key) => !keysToShow.has(key));
      });
    },
    [setHiddenKeys],
  );

  const setHidden = useCallback(
    (repoAddresses: RepoAddress[]) => {
      const keysToHide = new Set(
        repoAddresses.map((repoAddress) => `${repoAddress.name}:${repoAddress.location}`),
      );
      setHiddenKeys((current) => {
        const updatedSet = new Set([...(current || []), ...keysToHide]);
        return Array.from(updatedSet);
      });
    },
    [setHiddenKeys],
  );

  const visibleRepos = useMemo(() => {
    // If there's only one repo, skip the local storage check -- we have to show this one.
    if (allRepos.length === 1) {
      return allRepos;
    }
    const hiddenKeys = new Set(JSON.parse(hiddenKeysJSON));
    return allRepos.filter((o) => !hiddenKeys.has(getRepositoryOptionHash(o)));
  }, [allRepos, hiddenKeysJSON]);

  return {visibleRepos, toggleVisible, setVisible, setHidden};
};

const getRepositoryOptionHash = (a: DagsterRepoOption) =>
  `${a.repository.name}:${a.repositoryLocation.name}`;
