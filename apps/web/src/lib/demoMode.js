// Demo mode: the whole app on sample data, without Freighter and without touching Stellar. The choice is kept in
// localStorage so every tab agrees, and switching it reloads the page so the API client is built once for one mode.

export const DEMO_KEY = 'stellar-split.demo';
export const DEMO_STATE_KEY = 'stellar-split.demo-state';
/** The sample person who is "you" in the demo data. */
export const DEMO_ADDRESS = 'GCPIF2AD2CXZXZ6KV3RXALAXJK427UMVGQCXNSTKOUGV2SY7E24NKBJS';

/** @param {() => Storage | null} getStorage */
export function createDemoSwitch(getStorage) {
  const storage = () => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };
  return {
    isOn() {
      try {
        return storage()?.getItem(DEMO_KEY) === '1';
      } catch {
        return false;
      }
    },
    /** @param {boolean} on */
    set(on) {
      try {
        if (on) storage()?.setItem(DEMO_KEY, '1');
        else {
          storage()?.removeItem(DEMO_KEY);
          storage()?.removeItem(DEMO_STATE_KEY); // leaving the demo forgets what was done in it
        }
      } catch {
        // Storage blocked: the demo cannot be kept across a reload.
      }
    },
  };
}

const demoSwitch = createDemoSwitch(() => window.localStorage);

/** True when the app was loaded in demo mode. Fixed for the life of the page. */
export const DEMO = demoSwitch.isOn();

/** Turns demo mode on and loads the groups screen with it. */
export function enterDemo() {
  demoSwitch.set(true);
  window.location.assign('/groups');
}

/** Leaves demo mode, forgets the demo data and goes back to the welcome screen. */
export function exitDemo() {
  demoSwitch.set(false);
  window.location.assign('/');
}
