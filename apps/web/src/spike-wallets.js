// SPIKE, not for merge: loads the kit with only the modules we would ship, to measure the bundle and the CSP.
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';

StellarWalletsKit.init({ modules: [new FreighterModule(), new xBullModule(), new AlbedoModule()] });
window.__kit = StellarWalletsKit;
document.title = 'kit loaded';
