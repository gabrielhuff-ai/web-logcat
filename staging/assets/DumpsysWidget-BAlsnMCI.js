import{j as s,u as H,a as I,r as g,R as W}from"./index-DJgWt06j.js";const D={1:"unknown",2:"charging",3:"discharging",4:"not-charging",5:"full"},E={1:"unknown",2:"good",3:"overheat",4:"dead",5:"over-voltage",6:"failure",7:"cold"};function G(e){const n=u=>{const N=new RegExp(`^\\s*${O(u)}:\\s*(.+?)\\s*$`,"m").exec(e);return N?N[1]:null},r=u=>{const p=n(u);if(p==null)return null;const N=Number(p);return Number.isFinite(N)?N:null},a=u=>n(u)==="true",c=r("level"),l=r("scale")??100,d=r("temperature"),t=r("voltage"),o=r("current_now");let v=null;o!=null&&(v=Math.abs(o)>1e4?Math.round(o/1e3):o);const m=r("charge_time_remaining"),i=(r("Charge counter")==null,null),j=r("cycle_count");return{level:c!=null?c/l:null,levelRaw:c,scale:l,tempC:d!=null?d/10:null,voltageV:t!=null?t/1e3:null,currentMa:v,status:D[String(r("status")??"")]??"unknown",health:E[String(r("health")??"")]??"unknown",technology:n("technology"),powered:{ac:a("AC powered"),usb:a("USB powered"),wireless:a("Wireless powered")},chargeRemainMin:m!=null?Math.round(m/6e4):null,cycleCount:j??i}}function O(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function z(e){const n=e.split(/\r?\n/);let r=null,a=null;const c=/\*\*\s+MEMINFO in pid\s+(\d+)\s+\[([^\]]+)\]\s+\*\*/.exec(e);c&&(r=Number(c[1]),a=c[2]);const l=x=>{const k=new RegExp(`${K(x)}\\s*:\\s*([\\d,]+)`,"i").exec(e);if(!k)return null;const h=Number(k[1].replace(/,/g,""));return Number.isFinite(h)?h:null},d=l("Java Heap"),t=l("Native Heap"),o=l("Code"),v=l("Stack"),m=l("Graphics"),i=l("System"),j=l("TOTAL PSS"),u=[];let p=!1;for(const x of n){if(/Total PSS by process:/i.test(x)){p=!0;continue}if(p){if(/^\s*$/.test(x)||/^Total PSS by/i.test(x)){if(u.length>0)break;continue}const f=/^\s*([\d,]+)K:\s*(\S+)(?:\s+\(pid\s+(\d+)[^)]*\))?/.exec(x);if(f){const k=Number(f[1].replace(/,/g,""));if(Number.isFinite(k)){const h={kb:k,pkg:f[2]};f[3]&&(h.pid=Number(f[3])),u.push(h)}}}}u.sort((x,f)=>f.kb-x.kb);const N=x=>{const k=new RegExp(`${K(x)}:\\s*([\\d,]+)K`,"i").exec(e);if(!k)return null;const h=Number(k[1].replace(/,/g,""));return Number.isFinite(h)?h:null};let w=null;const b=/^\s*TOTAL\s+([\d,]+)\s+([\d,]+)/m.exec(e);if(b){const x=Number(b[2].replace(/,/g,""));Number.isFinite(x)&&(w=x)}return{pid:r,pkg:a,javaHeapKb:d,nativeHeapKb:t,codeKb:o,stackKb:v,graphicsKb:m,systemKb:i,totalPssKb:j,privateDirtyKb:w,procs:u,totalRamKb:N("Total RAM"),freeRamKb:N("Free RAM"),usedRamKb:N("Used RAM")}}function K(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function V(e){const n=/Load:\s*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(e),r=n?{one:Number(n[1]),five:Number(n[2]),fifteen:Number(n[3])}:null,a=[],c=/^\s*(\d+)%\s+(\d+)\/(\S+):\s+(\d+)%\s*user\s*\+\s*(\d+)%\s*kernel/;for(const m of e.split(/\r?\n/)){const i=c.exec(m);i&&a.push({pct:Number(i[1]),pid:Number(i[2]),pkg:i[3].replace(/:+$/,""),user:Number(i[4]),kernel:Number(i[5])})}a.sort((m,i)=>i.pct-m.pct);const d=/(\d+)%\s+TOTAL:\s+(\d+)%\s*user\s*\+\s*(\d+)%\s*kernel(?:\s*\+\s*(\d+)%\s*iowait)?(?:\s*\+\s*(\d+)%\s*softirq)?/.exec(e),t=d?{pct:Number(d[1]),user:Number(d[2]),kernel:Number(d[3]),iowait:Number(d[4]??0),softirq:Number(d[5]??0)}:null,o=[],v=/^CPU\s+(\d+):\s+(\d+)%\s*usr\s*\+\s*(\d+)%\s*nice\s*\+\s*(\d+)%\s*sys\s*\+\s*(\d+)%\s*idle(?:\s*\+\s*(\d+)%\s*iow)?(?:\s*\+\s*(\d+)%\s*irq)?(?:\s*\+\s*(\d+)%\s*sirq)?/;for(const m of e.split(/\r?\n/)){const i=v.exec(m);i&&o.push({id:Number(i[1]),user:Number(i[2]),nice:Number(i[3]),sys:Number(i[4]),idle:Number(i[5]),iowait:Number(i[6]??0),irq:Number(i[7]??0),softirq:Number(i[8]??0)})}return{load:r,procs:a,total:t,cores:o}}function _(e){const n=/\*\*\s+Graphics info for pid\s+(\d+)\s+\[([^\]]+)\]\s+\*\*/.exec(e),r=n?Number(n[1]):null,a=n?n[2]:null,c=i=>{const u=new RegExp(`${T(i)}:\\s*([\\d,]+)`,"i").exec(e);if(!u)return null;const p=Number(u[1].replace(/,/g,""));return Number.isFinite(p)?p:null},l=i=>{const u=new RegExp(`${T(i)}:\\s*([\\d,]+)\\s*ms`,"i").exec(e);if(!u)return null;const p=Number(u[1].replace(/,/g,""));return Number.isFinite(p)?p:null},d=/Janky frames:\s*([\d,]+)\s*\(([\d.]+)%\)/.exec(e),t=d?Number(d[1].replace(/,/g,"")):null,o=d?Number(d[2]):null,v=/^HISTOGRAM:\s*(.+)$/m.exec(e),m=[];if(v){const i=v[1].matchAll(/(\d+)ms=(\d+)/g);for(const j of i)m.push({ms:Number(j[1]),count:Number(j[2])});m.sort((j,u)=>j.ms-u.ms)}return{pkg:a,pid:r,totalFrames:c("Total frames rendered"),jankyFrames:t,jankyPct:o,p50:l("50th percentile"),p90:l("90th percentile"),p95:l("95th percentile"),p99:l("99th percentile"),missedVsync:c("Number Missed Vsync"),highInputLatency:c("Number High input latency"),slowUiThread:c("Number Slow UI thread"),slowBitmapUploads:c("Number Slow bitmap uploads"),slowDrawCommands:c("Number Slow issue draw commands"),frameDeadlineMissed:c("Number Frame deadline missed"),histogram:m}}function T(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function J(e){const n=/Wi-?Fi is enabled/i.test(e),r=/ConnectedSSID:\s*"?([^"\n]+?)"?\s*$/m.exec(e),a=r?r[1].trim():null,c=/RSSI:\s*(-?\d+)\s*dBm/i.exec(e),l=c?Number(c[1]):null,d=/LinkSpeed:\s*(\d+)\s*Mbps/i.exec(e),t=d?Number(d[1]):null,o=/Frequency:\s*(\d+)\s*MHz/i.exec(e),v=o?Number(o[1]):null,m=/IpAddress:\s*([\d.]+)/.exec(e),i=m?m[1]:null,j=/MacAddress:\s*([0-9a-fA-F:*]+)/.exec(e),u=j?j[1]:null,p=[],N=e.split(/\r?\n/);let w=!1;for(const b of N){if(/Latest scan results:/i.test(b)){w=!0;continue}if(!w)continue;if(/^\s*$/.test(b)){if(p.length>0)break;continue}if(/^\s*BSSID\b/i.test(b))continue;const x=/^\s*([0-9a-fA-F:]{17})\s+(\S+)\s+(\d+)\s+(-?\d+)\s+(\S+)/.exec(b);x&&p.push({bssid:x[1],ssid:x[2],freqMhz:Number(x[3]),rssiDbm:Number(x[4]),capabilities:x[5]})}return{enabled:n,ssid:a,rssiDbm:l,linkSpeedMbps:t,freqMhz:v,ipAddress:i,macAddress:u,scan:p}}const A=[{id:"battery",label:"Battery",desc:"Power & charge state",args:["battery"]},{id:"meminfo",label:"Memory",desc:"Memory usage by process",args:["meminfo","system_server"]},{id:"cpuinfo",label:"CPU",desc:"CPU usage",args:["cpuinfo"]},{id:"gfxinfo",label:"GFX",desc:"Frame timing for the foreground app",args:["gfxinfo"]},{id:"wifi",label:"Wi-Fi",desc:"Wi-Fi state & networks",args:["wifi"]}];class B extends Error{constructor(){super("Shell-protocol v2 not supported by this device."),this.name="DumpsysUnsupportedError"}}async function Q(e,n){const r=A.find(d=>d.id===n);if(!r)throw new Error(`Unknown dumpsys preset: ${n}`);const a=e.subprocess.shellProtocol;if(!a)throw new B;const l=(await a.spawnWaitText(["dumpsys",...r.args])).stdout;return{id:n,raw:l,parsed:q(n,l)}}function q(e,n){switch(e){case"battery":return{id:e,data:G(n)};case"meminfo":return{id:e,data:z(n)};case"cpuinfo":return{id:e,data:V(n)};case"gfxinfo":return{id:e,data:_(n)};case"wifi":return{id:e,data:J(n)}}}const X=`Current Battery Service state:
  AC powered: false
  USB powered: true
  Wireless powered: false
  Max charging current: 1500000
  Max charging voltage: 5000000
  Charge counter: 3041000
  status: 2
  health: 2
  present: true
  level: 78
  scale: 100
  voltage: 4180
  temperature: 312
  technology: Li-ion
  charge_time_remaining: 2700000
`,Y=`Applications Memory Usage (in Kilobytes):
Uptime: 4,240,520 Realtime: 8,120,433

** MEMINFO in pid 982 [system_server] **
                   Pss  Private  Private     Swap      Rss     Heap     Heap     Heap
                 Total    Dirty    Clean    Dirty    Total     Size    Alloc     Free
                ------   ------   ------   ------   ------   ------   ------   ------
  Native Heap    52410    52000      120     1340    66400    71680    52144    19536
  Dalvik Heap    24180    23900       40        0    32220    49152    25800    23352
 Dalvik Other     8120     8080        0        0     8420
        Stack     2480     2480        0      192     2604
       Ashmem      640      540        0        0      872
    Other dev      120       80        0        0      136
     .so mmap    18420     1240    13880        0    32810
    .jar mmap     2104        0      820        0     6900
    .apk mmap     8410      120     7240        0    18820
    .ttf mmap      640        0      620        0     1320
    .dex mmap     6280       40     6160        0     8410
    .oat mmap      820        0      640        0     2100
    .art mmap     8410     8200       40       60    18820
   Other mmap     2120     1840        0        0     3120
      EGL mtrack    0        0        0        0        0
       GL mtrack    0        0        0        0        0
          Unknown 1840     1840        0        0     1840
          TOTAL  136994   100360    29560     1592   210804   120832    77944    42888

 App Summary
                       Pss(KB)                        Rss(KB)
                        ------                         ------
           Java Heap:    32140                          51040
         Native Heap:    52000                          66400
                Code:    30260                          71200
               Stack:     2480                           2604
            Graphics:        0                              0
       Private Other:    11700
              System:     8414
             Unknown:                                    1840

           TOTAL PSS:   136994            TOTAL RSS:   210804      TOTAL SWAP (KB):     1592

Total PSS by process:
   312,508K: system_server (pid 982 / activities)
   284,012K: com.android.systemui (pid 1421)
   228,140K: com.example.shopapp (pid 8412)
   180,420K: com.android.chrome (pid 4502)
   152,310K: com.google.android.gms (pid 2104)
   118,480K: com.spotify.music (pid 5810)
    72,210K: com.android.bluetooth (pid 1188)
    61,820K: com.android.vending (pid 3201)

Total PSS by OOM adjustment:
       420,182K: Native
       312,508K: System
       284,012K: Persistent
       912,440K: Foreground
       482,880K: Visible
       340,228K: Cached

Total RAM: 11,924,000K (status normal)
 Free RAM:  4,202,440K
 Used RAM:  7,610,212K
 Lost RAM:    111,348K
`,Z=`Load: 1.42 / 1.18 / 0.92
CPU usage from 32ms to 8284ms ago (2024-12-12 14:12:08.310 to 2024-12-12 14:12:16.370):
  18% 8412/com.example.shopapp: 14% user + 4% kernel / faults: 2,310 minor 2 major
  12% 1421/com.android.systemui: 9% user + 3% kernel
   8% 982/system_server: 5% user + 3% kernel
   6% 4502/com.android.chrome: 5% user + 1% kernel
   5% 5810/com.spotify.music: 3% user + 2% kernel
   2% 2104/com.google.android.gms: 1% user + 1% kernel
   1% 1188/com.android.bluetooth: 0% user + 1% kernel

 56% TOTAL: 38% user + 14% kernel + 3% iowait + 1% softirq
CPU 0:  62% usr + 18% nice +   5% sys +  10% idle +   2% iow +   2% irq +   1% sirq
CPU 1:  48% usr +  4% nice +  10% sys +  30% idle +   4% iow +   2% irq +   2% sirq
CPU 2:  40% usr +  2% nice +   8% sys +  44% idle +   2% iow +   2% irq +   2% sirq
CPU 3:  22% usr +  0% nice +   6% sys +  68% idle +   2% iow +   1% irq +   1% sirq
CPU 4:  14% usr +  0% nice +   4% sys +  78% idle +   2% iow +   1% irq +   1% sirq
CPU 5:   8% usr +  0% nice +   2% sys +  86% idle +   2% iow +   1% irq +   1% sirq
CPU 6:   4% usr +  0% nice +   2% sys +  90% idle +   2% iow +   1% irq +   1% sirq
CPU 7:   2% usr +  0% nice +   1% sys +  94% idle +   1% iow +   1% irq +   1% sirq
`,ss=`Applications Graphics Acceleration Info:
Uptime: 4,240,520 Realtime: 8,120,433

** Graphics info for pid 8412 [com.example.shopapp] **

Stats since: 8120433ms ago
Total frames rendered: 18420
Janky frames: 380 (2.06%)
Janky frames (legacy): 410 (2.22%)
50th percentile: 7ms
90th percentile: 12ms
95th percentile: 18ms
99th percentile: 32ms
Number Missed Vsync: 18
Number High input latency: 4
Number Slow UI thread: 22
Number Slow bitmap uploads: 3
Number Slow issue draw commands: 12
Number Frame deadline missed: 380
HISTOGRAM: 5ms=120 6ms=820 7ms=2410 8ms=4180 9ms=3220 10ms=2410 11ms=1820 12ms=1240 13ms=820 14ms=560 15ms=420 16ms=240 17ms=180 18ms=140 19ms=80 20ms=40 21ms=20 22ms=10 25ms=4 26ms=2 28ms=2 29ms=1 30ms=1 32ms=2 36ms=2 41ms=1 53ms=1
GPU HISTOGRAM: 0ms=120 1ms=820 2ms=2410 3ms=4180 4ms=3220 5ms=2410 6ms=1820 7ms=1240
HWUI Caches:
  Glyph Cache: 1.46 / 16.00 MB (90 / 1024 entries)
  Image Cache: 8.40 / 16.00 MB (28 / 256 entries)
  Total memory usage:
    18.20 MB
`,es=`Wi-Fi is enabled
Stay-awake conditions: 3
Mobile data state: 2
Verbose logging is OFF

Wi-Fi Connections:
  ConnectedSSID: "HomeWifi-5G"
  RSSI: -52 dBm
  LinkSpeed: 866 Mbps
  Frequency: 5180 MHz
  IpAddress: 192.168.1.142
  MacAddress: 04:42:1a:** (randomized)
  Score: 60

Saved networks: 3
  HomeWifi-5G    [WPA2-PSK][ESS]
  Office         [WPA2-EAP][ESS]
  CoffeeShop     [WPA2-PSK][ESS]

Latest scan results:
  BSSID              SSID                 Freq    RSSI    Capabilities
  04:42:1a:11:22:33  HomeWifi-5G          5180    -52     [WPA2-PSK-CCMP][ESS]
  04:42:1a:11:22:34  HomeWifi             2412    -58     [WPA2-PSK-CCMP][ESS]
  60:32:b1:ab:cd:ef  CoffeeShop           2437    -71     [WPA2-PSK-CCMP][ESS]
  ac:84:c6:99:88:77  PrintNet             2462    -78     [WPA2-PSK-CCMP][ESS]
  e8:de:27:00:11:22  Neighbor-2.4         2412    -82     [WPA2-PSK-CCMP][ESS]
`,ns={battery:X,meminfo:Y,cpuinfo:Z,gfxinfo:ss,wifi:es};function rs(e){const n=ns[e];return{id:e,raw:n,parsed:q(e,n)}}const as={unknown:"Unknown",charging:"Charging",discharging:"Discharging","not-charging":"Not charging",full:"Full"},cs={unknown:"Unknown",good:"Good",overheat:"Overheating",dead:"Dead","over-voltage":"Over voltage",failure:"Failure",cold:"Cold"};function is({data:e}){const n=e.level!=null?Math.round(e.level*100):null,r=[];return e.powered.usb&&r.push("USB"),e.powered.ac&&r.push("AC"),e.powered.wireless&&r.push("Wireless"),s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Charge"}),s.jsxs("div",{className:"ds-charge",children:[s.jsx(ls,{pct:n??0,charging:e.status==="charging"}),s.jsxs("div",{className:"ds-charge-meta",children:[s.jsxs("div",{className:"ds-charge-pct",children:[n??"—",s.jsx("span",{children:"%"})]}),s.jsxs("div",{className:"ds-charge-state",children:[as[e.status],r.length>0?` · ${r.join(" · ")}`:""]}),e.chargeRemainMin!=null&&e.status==="charging"&&s.jsxs("div",{className:"ds-charge-eta",children:["≈ ",Math.floor(e.chargeRemainMin/60),"h"," ",e.chargeRemainMin%60,"m until full"]})]})]})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Health"}),s.jsx(M,{k:"State",v:cs[e.health]}),s.jsx(M,{k:"Temperature",v:e.tempC!=null?`${e.tempC.toFixed(1)} °C`:"—",warn:e.tempC!=null&&e.tempC>38}),s.jsx(M,{k:"Voltage",v:e.voltageV!=null?`${e.voltageV.toFixed(2)} V`:"—"}),e.currentMa!=null&&s.jsx(M,{k:"Current",v:`${e.currentMa} mA`}),s.jsx(M,{k:"Technology",v:e.technology??"—"}),e.cycleCount!=null&&s.jsx(M,{k:"Cycles",v:String(e.cycleCount)})]})]})}function M({k:e,v:n,warn:r=!1}){return s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:e}),s.jsx("span",{className:"v"+(r?" warn":""),children:n})]})}function ls({pct:e,charging:n}){const r=Math.max(2,Math.round(e/100*66)),a=e<15?"var(--lvl-e-fg)":e<30?"var(--lvl-w-fg)":"oklch(0.74 0.16 150)";return s.jsxs("svg",{width:"76",height:"40",viewBox:"0 0 76 40","aria-hidden":!0,children:[s.jsx("rect",{x:"2",y:"6",width:"68",height:"28",rx:"5",fill:"none",stroke:"var(--fg-2)",strokeWidth:"2"}),s.jsx("rect",{x:"71",y:"14",width:"4",height:"12",rx:"1",fill:"var(--fg-2)"}),s.jsx("rect",{x:"6",y:"10",width:r,height:"20",rx:"2",fill:a,style:{transition:"width 400ms var(--ease-out)"}}),n&&s.jsx("path",{d:"M 36 12 L 30 22 H 36 L 32 30 L 42 18 H 36 Z",fill:"oklch(1 0 0 / 0.85)",stroke:"oklch(0 0 0 / 0.4)",strokeWidth:"0.5"})]})}function ts({data:e}){const n=(e.totalRamKb??0)/1024/1024,r=(e.usedRamKb??0)/1024/1024,a=(e.freeRamKb??0)/1024/1024,c=e.procs.slice(0,8),l=Math.max(1,...c.map(i=>i.kb)),d=e.javaHeapKb??0,t=e.nativeHeapKb??0,o=e.codeKb??0,v=e.stackKb??0,m=d+t+o+v;return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"RAM"}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Total"}),s.jsxs("span",{className:"v",children:[n.toFixed(1)," GB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Used"}),s.jsxs("span",{className:"v",children:[r.toFixed(1)," GB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Free"}),s.jsxs("span",{className:"v",children:[a.toFixed(1)," GB"]})]}),n>0&&s.jsxs("div",{className:"ds-stackbar",children:[s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${r/n*100}%`,background:"oklch(0.74 0.13 220)"}}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${a/n*100}%`,background:"oklch(0.74 0.16 150)",opacity:.5}})]})]}),e.pkg&&m>0&&s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["App Summary · ",e.pkg,e.pid!=null?` (pid ${e.pid})`:""]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Java heap"}),s.jsxs("span",{className:"v",children:[(d/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Native heap"}),s.jsxs("span",{className:"v",children:[(t/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Code"}),s.jsxs("span",{className:"v",children:[(o/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Stack"}),s.jsxs("span",{className:"v",children:[(v/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-stackbar","aria-label":"Java vs Native heap split",children:[s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${d/m*100}%`,background:"oklch(0.74 0.13 220)"},title:`Java ${(d/1024).toFixed(1)} MB`}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${t/m*100}%`,background:"oklch(0.7 0.16 60)"},title:`Native ${(t/1024).toFixed(1)} MB`}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${o/m*100}%`,background:"oklch(0.65 0.05 270)"},title:`Code ${(o/1024).toFixed(1)} MB`}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${v/m*100}%`,background:"oklch(0.55 0.04 270)"},title:`Stack ${(v/1024).toFixed(1)} MB`})]})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Top processes by PSS"}),s.jsxs("div",{className:"ds-procs",children:[c.length===0&&s.jsx("div",{className:"ds-empty",children:"No process data."}),c.map(i=>s.jsxs("div",{className:"ds-proc",children:[s.jsxs("div",{className:"ds-proc-row",children:[s.jsx("span",{className:"ds-proc-name",children:i.pkg}),s.jsxs("span",{className:"ds-proc-val",children:[(i.kb/1024).toFixed(1)," MB"]})]}),s.jsx("div",{className:"ds-proc-bar",children:s.jsx("div",{className:"ds-proc-fill",style:{width:`${i.kb/l*100}%`}})})]},i.pkg+(i.pid??"")))]})]})]})}function ds({data:e}){const n=e.procs.slice(0,8),r=Math.max(1,...n.map(a=>a.pct));return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Load average"}),s.jsx("div",{className:"ds-loadgrid",children:[{l:"1m",v:e.load?.one},{l:"5m",v:e.load?.five},{l:"15m",v:e.load?.fifteen}].map(a=>s.jsxs("div",{className:"ds-loadcell",children:[s.jsx("div",{className:"ds-loadval",children:a.v!=null?a.v.toFixed(2):"—"}),s.jsx("div",{className:"ds-loadlabel",children:a.l})]},a.l))})]}),e.total&&s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["CPU usage · ",e.total.pct,"% total"]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"User"}),s.jsxs("span",{className:"v",children:[e.total.user,"%"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Kernel"}),s.jsxs("span",{className:"v",children:[e.total.kernel,"%"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"I/O wait"}),s.jsxs("span",{className:"v",children:[e.total.iowait,"%"]})]}),e.total.softirq>0&&s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Soft IRQ"}),s.jsxs("span",{className:"v",children:[e.total.softirq,"%"]})]})]}),e.cores.length>0&&s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Per-core usage"}),s.jsx("div",{className:"ds-cores",children:e.cores.map(a=>{const c=100-a.idle,l=c>80?"var(--lvl-w-fg)":c>50?"oklch(0.72 0.13 80)":"oklch(0.74 0.13 220)";return s.jsxs("div",{className:"ds-core",children:[s.jsxs("div",{className:"ds-core-label",children:["CPU ",a.id]}),s.jsx("div",{className:"ds-core-bar",children:s.jsx("div",{className:"ds-core-fill",style:{width:`${c}%`,background:l}})}),s.jsxs("div",{className:"ds-core-pct",children:[c,"%"]})]},a.id)})})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Top processes by CPU%"}),s.jsxs("div",{className:"ds-procs",children:[n.length===0&&s.jsx("div",{className:"ds-empty",children:"No process data."}),n.map(a=>s.jsxs("div",{className:"ds-proc",children:[s.jsxs("div",{className:"ds-proc-row",children:[s.jsxs("span",{className:"ds-proc-name",children:[a.pkg," ",s.jsxs("span",{className:"ds-proc-pid",children:["(",a.pid,")"]})]}),s.jsxs("span",{className:"ds-proc-val",children:[a.pct,"%"]})]}),s.jsx("div",{className:"ds-proc-bar",children:s.jsx("div",{className:"ds-proc-fill",style:{width:`${a.pct/r*100}%`,background:"oklch(0.74 0.13 220)"}})})]},`${a.pkg}-${a.pid}`))]})]})]})}const R=16;function os({data:e}){const n=[{l:"p50",v:e.p50},{l:"p90",v:e.p90},{l:"p95",v:e.p95},{l:"p99",v:e.p99}];let r=0,a=0,c=0;for(const t of e.histogram)t.ms<=R?r+=t.count:t.ms<=32?a+=t.count:c+=t.count;const l=r+a+c,d=Math.max(1,...e.histogram.map(t=>t.count));return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["Frame rendering",e.pkg?` · ${e.pkg}`:""]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Total frames"}),s.jsx("span",{className:"v",children:e.totalFrames?.toLocaleString()??"—"})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Janky frames"}),s.jsxs("span",{className:"v"+(e.jankyPct!=null&&e.jankyPct>5?" warn":""),children:[e.jankyFrames?.toLocaleString()??"—",e.jankyPct!=null?` (${e.jankyPct.toFixed(2)}%)`:""]})]})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Frame time percentiles"}),s.jsx("div",{className:"ds-pcts",children:n.map(t=>s.jsxs("div",{className:"ds-pct",children:[s.jsxs("div",{className:"ds-pct-val"+(t.v!=null&&t.v>R?" warn":""),children:[t.v!=null?t.v:"—",s.jsx("span",{children:"ms"})]}),s.jsx("div",{className:"ds-pct-label",children:t.l})]},t.l))}),s.jsxs("div",{className:"ds-pct-target",children:["target: ",R,"ms (60fps)"]})]}),l>0&&s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Frame-time distribution"}),s.jsxs("div",{className:"ds-bucket-row",children:[s.jsx("span",{className:"k",children:"≤ 16ms"}),s.jsxs("span",{className:"v",children:[r.toLocaleString()," (",Math.round(r/l*100),"%)"]})]}),s.jsxs("div",{className:"ds-bucket-row",children:[s.jsx("span",{className:"k",children:"17–32ms"}),s.jsxs("span",{className:"v",children:[a.toLocaleString()," (",Math.round(a/l*100),"%)"]})]}),s.jsxs("div",{className:"ds-bucket-row",children:[s.jsx("span",{className:"k",children:"> 32ms"}),s.jsxs("span",{className:"v",children:[c.toLocaleString()," (",Math.round(c/l*100),"%)"]})]}),s.jsxs("div",{className:"ds-stackbar","aria-label":"Frame time distribution",children:[s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${r/l*100}%`,background:"oklch(0.74 0.16 150)"}}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${a/l*100}%`,background:"oklch(0.72 0.13 80)"}}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${c/l*100}%`,background:"var(--lvl-e-fg)"}})]}),s.jsx("div",{className:"ds-histogram","aria-label":"Frame-time histogram by millisecond",children:e.histogram.map(t=>s.jsx("div",{className:"ds-histogram-col",title:`${t.ms}ms · ${t.count} frames`,children:s.jsx("div",{className:"ds-histogram-bar",style:{height:`${t.count/d*100}%`,background:t.ms<=R?"oklch(0.74 0.16 150)":t.ms<=32?"oklch(0.72 0.13 80)":"var(--lvl-e-fg)"}})},t.ms))})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"HWUI stalls"}),s.jsx(C,{k:"Missed Vsync",v:e.missedVsync}),s.jsx(C,{k:"Slow UI thread",v:e.slowUiThread}),s.jsx(C,{k:"High input latency",v:e.highInputLatency}),s.jsx(C,{k:"Slow bitmap uploads",v:e.slowBitmapUploads}),s.jsx(C,{k:"Slow draw commands",v:e.slowDrawCommands}),s.jsx(C,{k:"Frame deadline missed",v:e.frameDeadlineMissed})]})]})}function C({k:e,v:n}){return s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:e}),s.jsx("span",{className:"v",children:n!=null?n.toLocaleString():"—"})]})}function ms({data:e}){if(!e.enabled)return s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Wi-Fi"}),s.jsx("div",{className:"ds-empty",children:"Wi-Fi is disabled on this device."})]});const n=e.freqMhz!=null?e.freqMhz>=5e3?"5 GHz":e.freqMhz>=2400?"2.4 GHz":`${e.freqMhz} MHz`:"—";return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Connected network"}),s.jsx(P,{k:"SSID",v:e.ssid??"—"}),s.jsx(P,{k:"Signal",v:e.rssiDbm!=null?`${e.rssiDbm} dBm`:"—"}),s.jsx(P,{k:"Link speed",v:e.linkSpeedMbps!=null?`${e.linkSpeedMbps} Mbps`:"—"}),s.jsx(P,{k:"Frequency",v:e.freqMhz!=null?`${e.freqMhz} MHz · ${n}`:n}),s.jsx(P,{k:"IP",v:e.ipAddress??"—"}),e.macAddress&&s.jsx(P,{k:"MAC",v:e.macAddress})]}),e.scan.length>0&&s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["Scan results · ",e.scan.length]}),s.jsx("div",{className:"ds-table-wrap",children:s.jsxs("table",{className:"ds-table",children:[s.jsx("thead",{children:s.jsxs("tr",{children:[s.jsx("th",{children:"SSID"}),s.jsx("th",{children:"BSSID"}),s.jsx("th",{children:"Freq"}),s.jsx("th",{children:"RSSI"}),s.jsx("th",{children:"Cap"})]})}),s.jsx("tbody",{children:e.scan.map((r,a)=>s.jsxs("tr",{children:[s.jsx("td",{children:r.ssid}),s.jsx("td",{className:"mono",children:r.bssid}),s.jsx("td",{children:r.freqMhz}),s.jsx("td",{children:r.rssiDbm}),s.jsx("td",{className:"mono small",children:r.capabilities})]},`${r.bssid}-${a}`))})]})})]})]})}function P({k:e,v:n}){return s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:e}),s.jsx("span",{className:"v",children:n})]})}const U=220;function vs({tileId:e}){const{device:n,adb:r,usingFake:a}=H(),{showToast:c}=I(),l=g.useMemo(()=>n?`weblogcat:dumpsys:${n.serial}:${e}:preset`:null,[n,e]),[d,t]=g.useState(()=>{if(typeof window>"u")return"battery";const h="battery";if(!l)return h;try{const S=localStorage.getItem(l);if(S&&A.some($=>$.id===S))return S}catch{}return h}),[o,v]=g.useState(null),[m,i]=g.useState(!1),[j,u]=g.useState(null),[p,N]=g.useState("cards"),w=g.useRef(0);g.useEffect(()=>{if(l)try{localStorage.setItem(l,d)}catch{}},[l,d]);const b=g.useCallback(async h=>{const S=++w.current;i(!0),u(null);const $=Date.now();try{let y;a||!r?y=rs(h):y=await Q(r,h);const F=Date.now()-$;if(F<U&&await new Promise(L=>setTimeout(L,U-F)),w.current!==S)return;v(y),i(!1)}catch(y){if(w.current!==S)return;if(i(!1),y instanceof B){u("This device does not support shell-protocol v2 (dumpsys requires it).");return}const F=y instanceof Error?y.message:String(y);u(F),c(`dumpsys ${h} failed: ${F}`)}},[r,a,c]);g.useEffect(()=>{b(d)},[d,a,r]);const x=g.useCallback(h=>{t(h)},[]),f=g.useCallback(()=>{b(d)},[b,d]),k=g.useCallback(()=>{o&&navigator.clipboard.writeText(o.raw).then(()=>c("Raw output copied")).catch(()=>c("Copy failed"))},[o,c]);return s.jsxs("div",{className:"ds-widget",children:[s.jsxs("div",{className:"ds-toolbar widget-bar",children:[s.jsx("div",{className:"ds-presets",children:A.map(h=>s.jsx("button",{type:"button",className:"ds-pill"+(d===h.id?" on":""),onClick:()=>x(h.id),title:h.desc,children:h.label},h.id))}),s.jsx("button",{type:"button",className:"ds-icon-btn",onClick:f,title:"Run again",disabled:m,children:s.jsx(W,{size:13})}),s.jsx("button",{type:"button",className:"ds-icon-btn",onClick:k,title:"Copy raw output",disabled:!o,children:s.jsx(us,{size:13})}),s.jsx("span",{style:{flex:1}}),s.jsxs("div",{className:"ds-view-seg",role:"tablist","aria-label":"View mode",children:[s.jsx("button",{role:"tab","aria-selected":p==="cards",className:p==="cards"?"on":"",onClick:()=>N("cards"),children:"Parsed"}),s.jsx("button",{role:"tab","aria-selected":p==="raw",className:p==="raw"?"on":"",onClick:()=>N("raw"),children:"Raw"})]})]}),s.jsx("div",{className:"ds-body",children:m?s.jsxs("div",{className:"ds-status",children:[s.jsx("div",{className:"ds-spinner"}),s.jsxs("span",{children:["Running ",s.jsxs("code",{children:["dumpsys ",hs(d)]}),"…"]})]}):j?s.jsx("div",{className:"ds-status ds-status-err",children:s.jsx("span",{children:j})}):o?p==="raw"?s.jsx("pre",{className:"ds-raw",children:o.raw}):s.jsx("div",{className:"ds-cards",children:ps(o)}):s.jsx("div",{className:"ds-status",children:"No output."})})]})}function us({size:e=14}){return s.jsxs("svg",{width:e,height:e,viewBox:"0 0 24 24",fill:"none",children:[s.jsx("rect",{x:"9",y:"3",width:"11",height:"14",rx:"2",stroke:"currentColor",strokeWidth:"1.6"}),s.jsx("path",{d:"M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2",stroke:"currentColor",strokeWidth:"1.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}function hs(e){const n=A.find(r=>r.id===e);return n?n.args.join(" "):e}function ps(e){const{parsed:n}=e;switch(n.id){case"battery":return s.jsx(is,{data:n.data});case"meminfo":return s.jsx(ts,{data:n.data});case"cpuinfo":return s.jsx(ds,{data:n.data});case"gfxinfo":return s.jsx(os,{data:n.data});case"wifi":return s.jsx(ms,{data:n.data})}}export{vs as DumpsysWidget};
//# sourceMappingURL=DumpsysWidget-BAlsnMCI.js.map
