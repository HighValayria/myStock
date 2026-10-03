import { createCloudRepositories } from './cloud';
import { createMemoryRepositories } from './memory';
import type { InventoryRepositories } from './interfaces';

export type RepositoryMode = 'cloud' | 'memory';

export function createRepositories(mode: RepositoryMode = 'cloud'): InventoryRepositories {
  return mode === 'memory' ? createMemoryRepositories() : createCloudRepositories();
}
