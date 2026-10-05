import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  InterstitialAd,
} from 'react-native-google-mobile-ads';
import { AD_FIRST_DELAY_MS, AD_MIN_GAP_MS, INTERSTITIAL_ID } from './config';

// AdMob interstitials shown at the game's natural breaks (the page asks with { type: 'adBreak' }).
// Consent comes first: Google's UMP form is shown in the EEA / UK / Switzerland, and nothing is
// requested until the SDK says ads may be requested.

const started = Date.now();
let ready = false;
let lastShown = 0;
let interstitial: InterstitialAd | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;

function load() {
  if (!ready) return;
  interstitial?.removeAllListeners();
  const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_ID);
  ad.addAdEventListener(AdEventType.ERROR, () => {
    if (retry) clearTimeout(retry);
    retry = setTimeout(load, 60_000);            // no fill or offline: try again later
  });
  ad.load();
  interstitial = ad;
}

export async function initAds(): Promise<void> {
  try {
    await AdsConsent.requestInfoUpdate();
    await AdsConsent.loadAndShowConsentFormIfRequired();
  } catch {
    // Consent service unreachable: canRequestAds below still reflects any earlier answer.
  }
  try {
    const info = await AdsConsent.getConsentInfo();
    if (!info.canRequestAds) return;
    await mobileAds().initialize();
    ready = true;
    load();
  } catch {
    ready = false;
  }
}

/** True when the user must be offered a way to change their consent (shown as a link in the game). */
export async function privacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    return info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

export async function showPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch {
    return;
  }
  if (!ready) await initAds();
}

/** Shows an interstitial if one is loaded and the frequency cap allows it. Returns true if shown. */
export function maybeShowInterstitial(onOpen: () => void, onClose: () => void): boolean {
  const now = Date.now();
  const ad = interstitial;
  if (!ready || !ad || !ad.loaded) return false;
  if (now - started < AD_FIRST_DELAY_MS || now - lastShown < AD_MIN_GAP_MS) return false;
  lastShown = now;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose();
    load();                                        // preload the next one
  };
  ad.addAdEventListener(AdEventType.OPENED, onOpen);
  ad.addAdEventListener(AdEventType.CLOSED, close);
  ad.show().catch(close);
  return true;
}
