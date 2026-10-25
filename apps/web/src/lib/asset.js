// The settlement asset of the group on screen: USDC (dollars) by default, or EURC (euros). Screens inside a group
// wrap their content in <AssetProvider>, so amounts and labels follow the group without passing a prop everywhere.

import { createContext, useContext } from 'react';

export const ASSETS = {
  USDC: { code: 'USDC', symbol: '$', label: 'Digital dollars' },
  EURC: { code: 'EURC', symbol: '€', label: 'Digital euros' },
};

export const AssetContext = createContext(/** @type {'USDC' | 'EURC'} */ ('USDC'));

/** The asset code of the group on screen. */
export function useAssetCode() {
  return useContext(AssetContext);
}

/**
 * The asset code of a group from the API ({ asset: { code } } on a detail, or a plain code on a list row).
 * @param {{ asset?: { code?: string } | string | null } | null | undefined} group
 * @returns {'USDC' | 'EURC'}
 */
export function assetCodeOf(group) {
  const code = typeof group?.asset === 'string' ? group.asset : group?.asset?.code;
  return code === 'EURC' ? 'EURC' : 'USDC';
}
