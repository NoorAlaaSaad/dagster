import {ApolloClient, DocumentNode, OperationVariables, useApolloClient} from '@apollo/client';
import {cache} from 'idb-lru-cache';
import React, {useCallback} from 'react';

type CacheData<TQuery> = {
  data: TQuery;
  version: number;
};

type FetchStateEntry<TQuery> = {
  onFetched: ((value: TQuery) => void)[];
};

// Maintaining a record of fetch states
const fetchState: Record<string, FetchStateEntry<any>> = {};

export class CacheManager<TQuery> {
  private cache: ReturnType<typeof cache<string, CacheData<TQuery>>>;
  private key: string;

  constructor(key: string) {
    this.key = `indexdbQueryCache:${key}`;
    this.cache = cache<string, CacheData<TQuery>>({dbName: this.key, maxCount: 1});
  }

  async get(version: number): Promise<TQuery | null> {
    if (await this.cache.has('cache')) {
      const {value} = await this.cache.get('cache');
      if (value && version === value.version) {
        return value.data;
      }
    }
    return null;
  }

  set(data: TQuery, version: number): Promise<void> {
    return this.cache.set('cache', {data, version}, {expiry: new Date('3000-01-01')});
  }
}

interface QueryHookParams<TVariables extends OperationVariables, TQuery> {
  key: string;
  query: DocumentNode;
  version: number;
  variables?: TVariables;
  onCompleted?: (data: TQuery) => void;
  bypassCache?: boolean;
}

export function useIndexedDBCachedQuery<TQuery, TVariables extends OperationVariables>({
  key,
  query,
  version,
  variables,
}: QueryHookParams<TVariables, TQuery>) {
  const client = useApolloClient();
  const [data, setData] = React.useState<TQuery | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetch = useCallback(
    async (bypassCache = false) => {
      setLoading(true);
      const newData = await getData<TQuery, TVariables>({
        client,
        key,
        query,
        variables,
        version,
        bypassCache,
      });
      setData(newData);
      setLoading(false);
    },
    [client, key, query, version, variables],
  );

  React.useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    loading,
    fetch: useCallback(() => fetch(true), [fetch]),
  };
}

interface FetchParams<TVariables extends OperationVariables> {
  client: ApolloClient<any>;
  key: string;
  query: DocumentNode;
  variables?: TVariables;
  version: number;
  bypassCache?: boolean;
}

export async function getData<TQuery, TVariables extends OperationVariables>({
  client,
  key,
  query,
  variables,
  version,
  bypassCache = false,
}: FetchParams<TVariables>): Promise<TQuery> {
  const cacheManager = new CacheManager<TQuery>(key);

  if (!bypassCache) {
    const cachedData = await cacheManager.get(version);
    if (cachedData !== null) {
      return cachedData;
    }
  }

  // Handle concurrent fetch requests
  if (fetchState[key]) {
    return new Promise((resolve) => {
      fetchState[key]!.onFetched.push(resolve as any);
    });
  }

  fetchState[key] = {onFetched: []};

  const queryResult = await client.query<TQuery, TVariables>({
    query,
    variables,
    fetchPolicy: 'no-cache',
  });

  const {data} = queryResult;
  await cacheManager.set(data, version);

  const onFetchedHandlers = fetchState[key].onFetched;
  delete fetchState[key]; // Clean up fetch state after handling

  onFetchedHandlers.forEach((handler) => handler(data)); // Notify all waiting fetches

  return data;
}
