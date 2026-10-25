import { AssetContext, assetCodeOf } from '../lib/asset.js';

/**
 * Makes everything inside show amounts in the group's asset.
 * @param {{ group: any, children: import('react').ReactNode }} props
 */
export function AssetProvider({ group, children }) {
  return <AssetContext.Provider value={assetCodeOf(group)}>{children}</AssetContext.Provider>;
}
