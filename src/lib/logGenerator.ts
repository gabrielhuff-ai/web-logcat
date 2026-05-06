// WebLogcat — fake but realistic Android system + app log generator.
//
// Used in dev / for the "Use simulated data" affordance on the empty state.
// Replace with the real ADB stream (see ./adb.ts) for production.
//
// Ported from design/v1/source/log-generator.jsx with TypeScript types.

import type { LogEntry, LogLevel } from '../types';

interface Process {
  pkg: string;
  pid: number;
  tids: number[];
}

const PROCESSES: Process[] = [
  { pkg: 'com.android.systemui', pid: 1421, tids: [1421, 1432, 1455, 1502] },
  { pkg: 'system_server', pid: 982, tids: [982, 1011, 1023, 1067, 1102] },
  { pkg: 'com.google.android.gms', pid: 2104, tids: [2104, 2120, 2155] },
  { pkg: 'com.android.vending', pid: 3201, tids: [3201, 3215] },
  { pkg: 'com.example.shopapp', pid: 8412, tids: [8412, 8430, 8455, 8501] },
  { pkg: 'com.example.shopapp:remote', pid: 8480, tids: [8480, 8495] },
  { pkg: 'com.android.chrome', pid: 4502, tids: [4502, 4520, 4555] },
  { pkg: 'com.spotify.music', pid: 5810, tids: [5810, 5832] },
  { pkg: 'com.android.bluetooth', pid: 1188, tids: [1188, 1199] },
  { pkg: 'com.google.android.inputmethod.latin', pid: 2890, tids: [2890, 2901] },
];

const TAG_POOL: Record<string, string[]> = {
  'com.android.systemui': [
    'StatusBar',
    'NotifManager',
    'KeyguardUpdateMonitor',
    'BatteryController',
    'QSPanel',
  ],
  system_server: [
    'ActivityManager',
    'ActivityTaskManager',
    'WindowManager',
    'PowerManagerService',
    'AlarmManager',
    'JobScheduler',
    'PackageManager',
    'ConnectivityService',
  ],
  'com.google.android.gms': ['GmsCore', 'Auth', 'Wearable', 'Reachability'],
  'com.android.vending': ['Finsky', 'PlayCore', 'AssetModuleService'],
  'com.example.shopapp': [
    'MainActivity',
    'CartViewModel',
    'ApiClient',
    'ImageLoader',
    'Choreographer',
    'OkHttp',
    'Retrofit',
    'Glide',
    'Room',
  ],
  'com.example.shopapp:remote': ['RemoteWorker', 'SyncAdapter'],
  'com.android.chrome': ['chromium', 'cr_BindingManager', 'cr_TabState'],
  'com.spotify.music': ['AudioPlayer', 'SpotifyService', 'PlaybackController'],
  'com.android.bluetooth': ['BtService', 'GattClient', 'A2dp'],
  'com.google.android.inputmethod.latin': ['LatinIME', 'KeyboardSwitcher'],
};

const LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E'];
const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  V: 0.05,
  D: 0.45,
  I: 0.3,
  W: 0.13,
  E: 0.07,
};

function pickLevel(): LogLevel {
  let r = Math.random();
  for (const l of LEVELS) {
    if ((r -= LEVEL_WEIGHTS[l]) <= 0) return l;
  }
  return 'I';
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rint(a: number, b: number): number {
  return Math.floor(a + Math.random() * (b - a));
}
function hex(n = 4): string {
  return Array.from({ length: n }, () => '0123456789abcdef'[rint(0, 16)]).join('');
}

type MsgFn = () => string;

const MSG_TEMPLATES: Record<string, MsgFn[]> = {
  ActivityManager: [
    () =>
      `Start proc ${rint(8000, 9999)}:com.example.shopapp/u0a${rint(100, 200)} for activity {com.example.shopapp/.MainActivity}`,
    () =>
      `START u0 {act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] flg=0x10200000 cmp=com.example.shopapp/.MainActivity} from uid 1000`,
    () =>
      `Process com.example.shopapp:remote (pid ${rint(8000, 9999)}) has died: cch+${rint(100, 999)} CEM`,
    () =>
      `Killing ${rint(8000, 9999)}:com.example.shopapp:remote/u0a${rint(100, 200)} (adj 905): empty for ${rint(1700, 1900)}s`,
    () => `Force stopping com.example.shopapp appid=10${rint(100, 200)} user=0: from pid ${rint(900, 1100)}`,
    () => `Displayed com.example.shopapp/.MainActivity: +${rint(40, 980)}ms`,
    () => `Foreground service started: com.example.shopapp/.SyncService`,
  ],
  ActivityTaskManager: [
    () => `Resumed: ActivityRecord{${hex(7)} u0 com.example.shopapp/.MainActivity t${rint(100, 999)}}`,
    () => `Activity pause timeout for ActivityRecord{${hex(7)}}`,
    () => `Launching: ActivityRecord{${hex(7)} u0 com.example.shopapp/.CheckoutActivity}`,
  ],
  WindowManager: [
    () => `Relayout Window{${hex(8)} u0 com.example.shopapp/.MainActivity}: oldVis=4 newVis=0`,
    () => `addWindow: New client android.os.BinderProxy@${hex(7)}: window=Window{${hex(7)}}`,
    () => `Window{${hex(7)}}: focus changed to true`,
    () => `Performing post-update of orientation`,
  ],
  PowerManagerService: [
    () => `Setting display power state to BRIGHT (id=0)`,
    () =>
      `Wake lock acquired: PARTIAL_WAKE_LOCK 'AlarmManager' on behalf of uid ${rint(1000, 1099)}`,
    () => `Wake lock released: PARTIAL_WAKE_LOCK 'AlarmManager'`,
    () => `User activity: type=0 fakeMotionEvent=false`,
  ],
  AlarmManager: [
    () =>
      `Alarm triggered: tag=*walarm*:com.google.android.gms/.update.SystemUpdateService whenElapsed=${rint(100000, 999999)} type=2 flags=0x9`,
  ],
  JobScheduler: [
    () => `Running job ${rint(10, 999)}: -1 com.example.shopapp/.SyncJob#${rint(0, 9)}`,
    () => `Job ${rint(10, 999)} finished: -1 result=success`,
  ],
  PackageManager: [
    () => `Permission grant request for android.permission.POST_NOTIFICATIONS uid=10${rint(100, 200)}`,
  ],
  ConnectivityService: [
    () =>
      `NetworkAgentInfo [WIFI () - 10${rint(100, 200)}] EVENT_NETWORK_TESTED: TestResult{ASId=0, mScore=Score{Policies : 0x40, KeepConnectedReason : NONE}}`,
    () => `Validation passed for net id ${rint(100, 200)}: probesSucceeded=DNS|HTTPS|FALLBACK`,
  ],
  StatusBar: [
    () => `clearNotificationEffects: ${rint(0, 5)}`,
    () => `Updating icon: com.example.shopapp / 0x7f08${hex(4)}`,
    () => `Notification posted: com.example.shopapp / order_${hex(4)}`,
  ],
  NotifManager: [
    () =>
      `enqueueNotification(com.example.shopapp, 0, ${rint(1000, 9999)}, n=Notification(channel=orders))`,
    () => `cancel(com.example.shopapp, 0, ${rint(1000, 9999)}, callingUid=10${rint(100, 200)})`,
  ],
  BatteryController: [() => `Battery level: ${rint(20, 100)}%, charging=${Math.random() > 0.5}`],
  KeyguardUpdateMonitor: [
    () => `onScreenTurnedOn`,
    () => `onScreenTurnedOff: why=2`,
    () => `Failing biometric attempt count=${rint(0, 3)}`,
  ],

  MainActivity: [
    () => `onCreate: savedInstanceState=null`,
    () => `onResume: Restoring scroll position offset=${rint(0, 2400)}`,
    () => `onPause: persisting cart with ${rint(0, 12)} items`,
    () => `Theme applied: Theme.ShopApp.DayNight (night=${Math.random() > 0.5})`,
  ],
  CartViewModel: [
    () =>
      `addItem: sku=SKU-${hex(6).toUpperCase()} qty=${rint(1, 4)} price=${(Math.random() * 99 + 1).toFixed(2)}`,
    () => `removeItem: sku=SKU-${hex(6).toUpperCase()}`,
    () => `Subtotal recomputed: $${(Math.random() * 420 + 10).toFixed(2)}, items=${rint(1, 12)}`,
    () => `Coupon SAVE${rint(5, 30)} applied`,
  ],
  ApiClient: [
    () =>
      `--> GET https://api.shop.example.com/v2/products?cat=${pick(['shoes', 'tops', 'sale', 'new'])}&page=${rint(1, 8)}`,
    () => `<-- 200 OK https://api.shop.example.com/v2/products (${rint(80, 480)}ms, ${rint(2, 86)}KB)`,
    () => `--> POST https://api.shop.example.com/v2/cart`,
    () => `<-- 200 OK https://api.shop.example.com/v2/cart (${rint(40, 220)}ms)`,
    () =>
      `<-- 401 Unauthorized https://api.shop.example.com/v2/me (${rint(40, 220)}ms) -- refreshing token`,
    () =>
      `<-- 503 Service Unavailable https://api.shop.example.com/v2/checkout (retry in ${rint(1, 5)}s)`,
  ],
  ImageLoader: [
    () =>
      `Decoding bitmap: ${rint(800, 2400)}x${rint(800, 2400)} (${rint(120, 980)}KB) sample=${pick([1, 2, 4])}`,
    () => `Cache HIT: products/${hex(8)}.webp`,
    () => `Cache MISS: products/${hex(8)}.webp -- fetching`,
  ],
  Choreographer: [
    () =>
      `Skipped ${rint(2, 84)} frames!  The application may be doing too much work on its main thread.`,
  ],
  OkHttp: [
    () =>
      `Sending request https://api.shop.example.com/v2/products on Connection{api.shop.example.com:443, proxy=DIRECT, hostAddress=${rint(100, 200)}.${rint(0, 255)}.${rint(0, 255)}.${rint(0, 255)}, cipherSuite=TLS_AES_128_GCM_SHA256}`,
  ],
  Glide: [() => `Load completed for [https://cdn.shop.example.com/p/${hex(8)}.webp] from [REMOTE]`],
  Room: [
    () =>
      `Query: SELECT * FROM products WHERE category = ? LIMIT 50 (${rint(2, 22)}ms, ${rint(0, 50)} rows)`,
    () => `Migration 14 -> 15 complete in ${rint(20, 220)}ms`,
  ],
  Retrofit: [() => `<-- HTTP 200 ${rint(40, 320)}ms`],
  GmsCore: [() => `[GmsCore] Heartbeat to module ${pick(['AUTH', 'FITNESS', 'LOCATION', 'DRIVE'])}`],
  Auth: [() => `Token refreshed for account ${hex(8)}@example.com`],
  chromium: [
    () =>
      `[INFO:CONSOLE] "WebGL: GPU stall due to ReadPixels" source: about:blank (${rint(1, 999)})`,
  ],
  BtService: [
    () =>
      `onBondStateChanged: address=A4:B1:${hex(2).toUpperCase()}:${hex(2).toUpperCase()}:${hex(2).toUpperCase()}:${hex(2).toUpperCase()} state=12`,
  ],
  LatinIME: [
    () => `Suggestion accepted: "${pick(['the', 'and', 'shopping', 'thanks', 'weekend'])}"`,
  ],
  AudioPlayer: [
    () => `state=PLAYING track=${hex(6)} pos=${rint(0, 240000)}ms`,
    () => `audio focus changed: AUDIOFOCUS_LOSS_TRANSIENT`,
  ],
};

function defaultMsg(tag: string): MsgFn[] {
  return [
    () => `${tag}: routine`,
    () => `event=${pick(['update', 'tick', 'poll', 'sync', 'check'])} ok=true ts=${Date.now()}`,
  ];
}

interface CrashLineInput {
  proc: Process;
  tag: string;
  level: LogLevel;
  message: string;
  isCrashLine: true;
}

function crashBurst(proc: Process): CrashLineInput[] {
  const tag = 'AndroidRuntime';
  const klass = pick([
    'NullPointerException',
    'IllegalStateException',
    'IndexOutOfBoundsException',
    'OutOfMemoryError',
  ]);
  const cause = pick([
    "Attempt to invoke virtual method 'java.lang.String com.example.shopapp.model.Product.getTitle()' on a null object reference",
    'Cannot resolve API endpoint /v2/checkout: unexpected null response',
    'Index 12 out of bounds for length 8',
    `Failed to allocate a ${rint(20, 80)}MB allocation with ${rint(2, 16)}MB free`,
  ]);
  const lines: string[] = [
    `FATAL EXCEPTION: main`,
    `Process: ${proc.pkg}, PID: ${proc.pid}`,
    `java.lang.${klass}: ${cause}`,
    `\tat com.example.shopapp.cart.CartViewModel.checkout(CartViewModel.kt:${rint(40, 220)})`,
    `\tat com.example.shopapp.cart.CheckoutActivity.onClick(CheckoutActivity.kt:${rint(40, 220)})`,
    `\tat android.view.View.performClick(View.java:7448)`,
    `\tat android.view.View.performClickInternal(View.java:7425)`,
    `\tat android.view.View.access$3700(View.java:835)`,
    `\tat android.view.View$PerformClick.run(View.java:28305)`,
    `\tat android.os.Handler.handleCallback(Handler.java:938)`,
    `\tat android.os.Handler.dispatchMessage(Handler.java:99)`,
    `\tat android.os.Looper.loopOnce(Looper.java:201)`,
    `\tat android.os.Looper.loop(Looper.java:288)`,
    `\tat android.app.ActivityThread.main(ActivityThread.java:7898)`,
    `\tat java.lang.reflect.Method.invoke(Native Method)`,
    `\tat com.android.internal.os.RuntimeInit$MethodAndArgsCaller.run(RuntimeInit.java:548)`,
    `\tat com.android.internal.os.ZygoteInit.main(ZygoteInit.java:936)`,
  ];
  return lines.map((message) => ({ proc, tag, level: 'E', message, isCrashLine: true }));
}

let _id = 0;
interface MakeEntryInput {
  proc: Process;
  tag: string;
  level: LogLevel;
  message: string;
  ts?: number;
  isCrashLine?: boolean;
}
function makeEntry(input: MakeEntryInput): LogEntry {
  return {
    id: ++_id,
    ts: input.ts ?? Date.now(),
    pid: input.proc.pid,
    tid: pick(input.proc.tids),
    pkg: input.proc.pkg,
    tag: input.tag,
    level: input.level,
    message: input.message,
    isCrashLine: !!input.isCrashLine,
  };
}

export function generateOne(now = Date.now()): LogEntry {
  const proc = pick(PROCESSES);
  const tags = TAG_POOL[proc.pkg] ?? ['App'];
  const tag = pick(tags);
  const level = pickLevel();
  const tmpls = MSG_TEMPLATES[tag] ?? defaultMsg(tag);
  const message = pick(tmpls)();
  return makeEntry({ proc, tag, level, message, ts: now });
}

/**
 * Generate a batch with realistic clustering + occasional crash bursts.
 * `intensity` (≈ streamingSpeed) bumps count per tick.
 */
export function generateBatch(now: number, intensity = 1): LogEntry[] {
  const out: LogEntry[] = [];
  const count = Math.max(1, Math.round((1 + Math.random() * 4) * intensity));
  for (let i = 0; i < count; i++) {
    out.push(generateOne(now + i));
  }
  // ~1.5% chance of a crash burst
  if (Math.random() < 0.015) {
    const proc = PROCESSES.find((p) => p.pkg === 'com.example.shopapp')!;
    const lines = crashBurst(proc);
    const baseTs = now + count;
    lines.forEach((l, i) => out.push(makeEntry({ ...l, ts: baseTs + i })));
  }
  return out;
}

/** Seed history (so the timeline has data on open). */
export function seedHistory(seconds = 60, perSecond = 4): LogEntry[] {
  const out: LogEntry[] = [];
  const now = Date.now();
  for (let s = seconds; s >= 1; s--) {
    const ts = now - s * 1000;
    const n = Math.max(1, Math.round(perSecond * (0.6 + Math.random() * 1.0)));
    for (let i = 0; i < n; i++) {
      out.push(generateOne(ts + Math.floor(Math.random() * 1000)));
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// `KNOWN_PROCESSES` and `KNOWN_TAGS` used to live here too, but they're
// pure data needed by FilterBar's autocomplete on every session — even
// when the simulator never runs. They're now in `./knownNames.ts` so
// the FilterBar can import them statically while this whole module
// stays lazy-loaded.
