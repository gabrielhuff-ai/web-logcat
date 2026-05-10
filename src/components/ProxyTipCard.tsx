// Dismissible tip on the empty state pointing at Android Web Device
// Proxy as an optional companion to WebUSB. Kept intentionally short:
// summary + link, no install instructions inline (the docs page handles
// the detail). Dismissal is sticky across reloads so we don't re-pester
// users who already know.

import { useEffect, useState } from 'react';
import * as Icons from './Icons';
import { isProxyTipDismissed, markProxyTipDismissed } from '../lib/proxyTip';

const DOWNLOAD_URL = 'https://tools.google.com/dlpage/android_web_device_proxy';
const DOCS_URL = 'docs/features/connecting.html#device-proxy-optional';

export interface ProxyTipCardProps {
  /** True when `probeProxyAvailability()` reported the daemon is up. */
  proxyDetected: boolean;
}

export function ProxyTipCard({ proxyDetected }: ProxyTipCardProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => isProxyTipDismissed());

  // Re-check on mount so SSR / first paint stays consistent — `useState`
  // initialiser ran during render before localStorage was guaranteed.
  useEffect(() => {
    setDismissed(isProxyTipDismissed());
  }, []);

  if (dismissed) return null;

  const onDismiss = () => {
    markProxyTipDismissed();
    setDismissed(true);
  };

  return (
    <div className="proxy-tip" role="note" aria-label="Device Proxy tip">
      <div className="proxy-tip-icon" aria-hidden="true">
        <Icons.Sparkle size={14} />
      </div>
      <div className="proxy-tip-body">
        <div className="proxy-tip-title">
          {proxyDetected
            ? 'Device Proxy detected on this machine'
            : 'Multiple devices, Wi-Fi ADB, or emulators?'}
        </div>
        <div className="proxy-tip-text">
          {proxyDetected ? (
            <>
              You can route through the Android Web Device Proxy to share access with
              Android Studio / scrcpy and reach emulators.{' '}
              <a className="link" href={DOCS_URL}>
                Learn more
              </a>
              .
            </>
          ) : (
            <>
              Install{' '}
              <a className="link" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                Android Web Device Proxy
              </a>{' '}
              to coexist with a running <code>adb</code> and reach emulators.{' '}
              <a className="link" href={DOCS_URL}>
                Learn more
              </a>
              .
            </>
          )}
        </div>
      </div>
      <button
        className="proxy-tip-close"
        onClick={onDismiss}
        aria-label="Dismiss tip"
        title="Don't show again"
      >
        <Icons.Close size={12} />
      </button>
    </div>
  );
}
