import{p as D,j as s,u as E,f as G,g as O,r as m,h as z,D as V,i as K,R as _,A as T,k as J}from"./index-Jbegyuzf.js";const Y=`Current Battery Service state:
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
`,Q=`Applications Memory Usage (in Kilobytes):
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
`,X=`Applications Graphics Acceleration Info:
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
`,ss=`Wi-Fi is enabled
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
`,es={battery:Y,meminfo:Q,cpuinfo:Z,gfxinfo:X,wifi:ss};function as(e){const a=es[e];return{id:e,raw:a,parsed:D(e,a)}}const ns={unknown:"Unknown",charging:"Charging",discharging:"Discharging","not-charging":"Not charging",full:"Full"},rs={unknown:"Unknown",good:"Good",overheat:"Overheating",dead:"Dead","over-voltage":"Over voltage",failure:"Failure",cold:"Cold"};function is({data:e}){const a=e.level!=null?Math.round(e.level*100):null,n=[];return e.powered.usb&&n.push("USB"),e.powered.ac&&n.push("AC"),e.powered.wireless&&n.push("Wireless"),s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Charge"}),s.jsxs("div",{className:"ds-charge",children:[s.jsx(ls,{pct:a??0,charging:e.status==="charging"}),s.jsxs("div",{className:"ds-charge-meta",children:[s.jsxs("div",{className:"ds-charge-pct",children:[a??"—",s.jsx("span",{children:"%"})]}),s.jsxs("div",{className:"ds-charge-state",children:[ns[e.status],n.length>0?` · ${n.join(" · ")}`:""]}),e.chargeRemainMin!=null&&e.status==="charging"&&s.jsxs("div",{className:"ds-charge-eta",children:["≈ ",Math.floor(e.chargeRemainMin/60),"h"," ",e.chargeRemainMin%60,"m until full"]})]})]})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Health"}),s.jsx(v,{k:"State",v:rs[e.health]}),s.jsx(v,{k:"Temperature",v:e.tempC!=null?`${e.tempC.toFixed(1)} °C`:"—",warn:e.tempC!=null&&e.tempC>38}),s.jsx(v,{k:"Voltage",v:e.voltageV!=null?`${e.voltageV.toFixed(2)} V`:"—"}),e.currentMa!=null&&s.jsx(v,{k:"Current",v:`${e.currentMa} mA`}),s.jsx(v,{k:"Technology",v:e.technology??"—"}),e.cycleCount!=null&&s.jsx(v,{k:"Cycles",v:String(e.cycleCount)})]})]})}function v({k:e,v:a,warn:n=!1}){return s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:e}),s.jsx("span",{className:"v"+(n?" warn":""),children:a})]})}function ls({pct:e,charging:a}){const n=Math.max(2,Math.round(e/100*60)),r=e<15?"var(--lvl-e-fg)":e<30?"var(--lvl-w-fg)":"oklch(0.74 0.16 150)";return s.jsxs("svg",{width:"76",height:"40",viewBox:"0 0 76 40","aria-hidden":!0,children:[s.jsx("rect",{x:"2",y:"6",width:"68",height:"28",rx:"5",fill:"none",stroke:"var(--fg-2)",strokeWidth:"2"}),s.jsx("rect",{x:"71",y:"14",width:"4",height:"12",rx:"1",fill:"var(--fg-2)"}),s.jsx("rect",{x:"6",y:"10",width:n,height:"20",rx:"2",fill:r,style:{transition:"width 400ms var(--ease-out)"}}),a&&s.jsx("path",{d:"M 36 12 L 30 22 H 36 L 32 30 L 42 18 H 36 Z",fill:"oklch(1 0 0 / 0.85)",stroke:"oklch(0 0 0 / 0.4)",strokeWidth:"0.5"})]})}function cs({data:e}){const a=(e.totalRamKb??0)/1024/1024,n=(e.usedRamKb??0)/1024/1024,r=(e.freeRamKb??0)/1024/1024,c=e.procs.slice(0,8),d=Math.max(1,...c.map(u=>u.kb)),t=e.javaHeapKb??0,i=e.nativeHeapKb??0,h=e.codeKb??0,x=e.stackKb??0,o=t+i+h+x;return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"RAM"}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Total"}),s.jsxs("span",{className:"v",children:[a.toFixed(1)," GB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Used"}),s.jsxs("span",{className:"v",children:[n.toFixed(1)," GB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Free"}),s.jsxs("span",{className:"v",children:[r.toFixed(1)," GB"]})]}),a>0&&s.jsxs("div",{className:"ds-stackbar",children:[s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${n/a*100}%`,background:"oklch(0.74 0.13 220)"}}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${r/a*100}%`,background:"oklch(0.74 0.16 150)",opacity:.5}})]})]}),e.pkg&&o>0&&s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["App Summary · ",e.pkg,e.pid!=null?` (pid ${e.pid})`:""]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Java heap"}),s.jsxs("span",{className:"v",children:[(t/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Native heap"}),s.jsxs("span",{className:"v",children:[(i/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Code"}),s.jsxs("span",{className:"v",children:[(h/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Stack"}),s.jsxs("span",{className:"v",children:[(x/1024).toFixed(1)," MB"]})]}),s.jsxs("div",{className:"ds-stackbar","aria-label":"Java vs Native heap split",children:[s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${t/o*100}%`,background:"oklch(0.74 0.13 220)"},title:`Java ${(t/1024).toFixed(1)} MB`}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${i/o*100}%`,background:"oklch(0.7 0.16 60)"},title:`Native ${(i/1024).toFixed(1)} MB`}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${h/o*100}%`,background:"oklch(0.65 0.05 270)"},title:`Code ${(h/1024).toFixed(1)} MB`}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${x/o*100}%`,background:"oklch(0.55 0.04 270)"},title:`Stack ${(x/1024).toFixed(1)} MB`})]})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Top processes by PSS"}),s.jsxs("div",{className:"ds-procs",children:[c.length===0&&s.jsx("div",{className:"ds-empty",children:"No process data."}),c.map(u=>s.jsxs("div",{className:"ds-proc",children:[s.jsxs("div",{className:"ds-proc-row",children:[s.jsx("span",{className:"ds-proc-name",children:u.pkg}),s.jsxs("span",{className:"ds-proc-val",children:[(u.kb/1024).toFixed(1)," MB"]})]}),s.jsx("div",{className:"ds-proc-bar",children:s.jsx("div",{className:"ds-proc-fill",style:{width:`${u.kb/d*100}%`}})})]},u.pkg+(u.pid??"")))]})]})]})}function ds({data:e}){const a=e.procs.slice(0,8),n=Math.max(1,...a.map(r=>r.pct));return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Load average"}),s.jsx("div",{className:"ds-loadgrid",children:[{l:"1m",v:e.load?.one},{l:"5m",v:e.load?.five},{l:"15m",v:e.load?.fifteen}].map(r=>s.jsxs("div",{className:"ds-loadcell",children:[s.jsx("div",{className:"ds-loadval",children:r.v!=null?r.v.toFixed(2):"—"}),s.jsx("div",{className:"ds-loadlabel",children:r.l})]},r.l))})]}),e.total&&s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["CPU usage · ",e.total.pct,"% total"]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"User"}),s.jsxs("span",{className:"v",children:[e.total.user,"%"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Kernel"}),s.jsxs("span",{className:"v",children:[e.total.kernel,"%"]})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"I/O wait"}),s.jsxs("span",{className:"v",children:[e.total.iowait,"%"]})]}),e.total.softirq>0&&s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Soft IRQ"}),s.jsxs("span",{className:"v",children:[e.total.softirq,"%"]})]})]}),e.cores.length>0&&s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Per-core usage"}),s.jsx("div",{className:"ds-cores",children:e.cores.map(r=>{const c=100-r.idle,d=c>80?"var(--lvl-w-fg)":c>50?"oklch(0.72 0.13 80)":"oklch(0.74 0.13 220)";return s.jsxs("div",{className:"ds-core",children:[s.jsxs("div",{className:"ds-core-label",children:["CPU ",r.id]}),s.jsx("div",{className:"ds-core-bar",children:s.jsx("div",{className:"ds-core-fill",style:{width:`${c}%`,background:d}})}),s.jsxs("div",{className:"ds-core-pct",children:[c,"%"]})]},r.id)})})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Top processes by CPU%"}),s.jsxs("div",{className:"ds-procs",children:[a.length===0&&s.jsx("div",{className:"ds-empty",children:"No process data."}),a.map(r=>s.jsxs("div",{className:"ds-proc",children:[s.jsxs("div",{className:"ds-proc-row",children:[s.jsxs("span",{className:"ds-proc-name",children:[r.pkg," ",s.jsxs("span",{className:"ds-proc-pid",children:["(",r.pid,")"]})]}),s.jsxs("span",{className:"ds-proc-val",children:[r.pct,"%"]})]}),s.jsx("div",{className:"ds-proc-bar",children:s.jsx("div",{className:"ds-proc-fill",style:{width:`${r.pct/n*100}%`,background:"oklch(0.74 0.13 220)"}})})]},`${r.pkg}-${r.pid}`))]})]})]})}const S=16;function ts({data:e}){const a=[{l:"p50",v:e.p50},{l:"p90",v:e.p90},{l:"p95",v:e.p95},{l:"p99",v:e.p99}];let n=0,r=0,c=0;for(const i of e.histogram)i.ms<=S?n+=i.count:i.ms<=32?r+=i.count:c+=i.count;const d=n+r+c,t=Math.max(1,...e.histogram.map(i=>i.count));return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["Frame rendering",e.pkg?` · ${e.pkg}`:""]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Total frames"}),s.jsx("span",{className:"v",children:e.totalFrames?.toLocaleString()??"—"})]}),s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:"Janky frames"}),s.jsxs("span",{className:"v"+(e.jankyPct!=null&&e.jankyPct>5?" warn":""),children:[e.jankyFrames?.toLocaleString()??"—",e.jankyPct!=null?` (${e.jankyPct.toFixed(2)}%)`:""]})]})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Frame time percentiles"}),s.jsx("div",{className:"ds-pcts",children:a.map(i=>s.jsxs("div",{className:"ds-pct",children:[s.jsxs("div",{className:"ds-pct-val"+(i.v!=null&&i.v>S?" warn":""),children:[i.v!=null?i.v:"—",s.jsx("span",{children:"ms"})]}),s.jsx("div",{className:"ds-pct-label",children:i.l})]},i.l))}),s.jsxs("div",{className:"ds-pct-target",children:["target: ",S,"ms (60fps)"]})]}),d>0&&s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Frame-time distribution"}),s.jsxs("div",{className:"ds-bucket-row",children:[s.jsx("span",{className:"k",children:"≤ 16ms"}),s.jsxs("span",{className:"v",children:[n.toLocaleString()," (",Math.round(n/d*100),"%)"]})]}),s.jsxs("div",{className:"ds-bucket-row",children:[s.jsx("span",{className:"k",children:"17–32ms"}),s.jsxs("span",{className:"v",children:[r.toLocaleString()," (",Math.round(r/d*100),"%)"]})]}),s.jsxs("div",{className:"ds-bucket-row",children:[s.jsx("span",{className:"k",children:"> 32ms"}),s.jsxs("span",{className:"v",children:[c.toLocaleString()," (",Math.round(c/d*100),"%)"]})]}),s.jsxs("div",{className:"ds-stackbar","aria-label":"Frame time distribution",children:[s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${n/d*100}%`,background:"oklch(0.74 0.16 150)"}}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${r/d*100}%`,background:"oklch(0.72 0.13 80)"}}),s.jsx("div",{className:"ds-stackbar-seg",style:{width:`${c/d*100}%`,background:"var(--lvl-e-fg)"}})]}),s.jsx("div",{className:"ds-histogram","aria-label":"Frame-time histogram by millisecond",children:e.histogram.map(i=>s.jsx("div",{className:"ds-histogram-col",title:`${i.ms}ms · ${i.count} frames`,children:s.jsx("div",{className:"ds-histogram-bar",style:{height:`${i.count/t*100}%`,background:i.ms<=S?"oklch(0.74 0.16 150)":i.ms<=32?"oklch(0.72 0.13 80)":"var(--lvl-e-fg)"}})},i.ms))})]}),s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"HWUI stalls"}),s.jsx(j,{k:"Missed Vsync",v:e.missedVsync}),s.jsx(j,{k:"Slow UI thread",v:e.slowUiThread}),s.jsx(j,{k:"High input latency",v:e.highInputLatency}),s.jsx(j,{k:"Slow bitmap uploads",v:e.slowBitmapUploads}),s.jsx(j,{k:"Slow draw commands",v:e.slowDrawCommands}),s.jsx(j,{k:"Frame deadline missed",v:e.frameDeadlineMissed})]})]})}function j({k:e,v:a}){return s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:e}),s.jsx("span",{className:"v",children:a!=null?a.toLocaleString():"—"})]})}function os({data:e}){if(!e.enabled)return s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Wi-Fi"}),s.jsx("div",{className:"ds-empty",children:"Wi-Fi is disabled on this device."})]});const a=e.freqMhz!=null?e.freqMhz>=5e3?"5 GHz":e.freqMhz>=2400?"2.4 GHz":`${e.freqMhz} MHz`:"—";return s.jsxs(s.Fragment,{children:[s.jsxs("div",{className:"ds-card",children:[s.jsx("div",{className:"ds-card-head",children:"Connected network"}),s.jsx(N,{k:"SSID",v:e.ssid??"—"}),s.jsx(N,{k:"Signal",v:e.rssiDbm!=null?`${e.rssiDbm} dBm`:"—"}),s.jsx(N,{k:"Link speed",v:e.linkSpeedMbps!=null?`${e.linkSpeedMbps} Mbps`:"—"}),s.jsx(N,{k:"Frequency",v:e.freqMhz!=null?`${e.freqMhz} MHz · ${a}`:a}),s.jsx(N,{k:"IP",v:e.ipAddress??"—"}),e.macAddress&&s.jsx(N,{k:"MAC",v:e.macAddress})]}),e.scan.length>0&&s.jsxs("div",{className:"ds-card",children:[s.jsxs("div",{className:"ds-card-head",children:["Scan results · ",e.scan.length]}),s.jsx("div",{className:"ds-table-wrap",children:s.jsxs("table",{className:"ds-table",children:[s.jsx("thead",{children:s.jsxs("tr",{children:[s.jsx("th",{children:"SSID"}),s.jsx("th",{children:"BSSID"}),s.jsx("th",{children:"Freq"}),s.jsx("th",{children:"RSSI"}),s.jsx("th",{children:"Cap"})]})}),s.jsx("tbody",{children:e.scan.map((n,r)=>s.jsxs("tr",{children:[s.jsx("td",{children:n.ssid}),s.jsx("td",{className:"mono",children:n.bssid}),s.jsx("td",{children:n.freqMhz}),s.jsx("td",{children:n.rssiDbm}),s.jsx("td",{className:"mono small",children:n.capabilities})]},`${n.bssid}-${r}`))})]})})]})]})}function N({k:e,v:a}){return s.jsxs("div",{className:"ds-card-row",children:[s.jsx("span",{className:"k",children:e}),s.jsx("span",{className:"v",children:a})]})}const $=220;function vs({tileId:e}){const{adb:a,usingFake:n}=E(),{showToast:r}=G(),[c,d]=O(e,"dumpsys",J),t=c.defaultPreset,i=m.useCallback(l=>d({defaultPreset:l}),[d]),h=c.defaultView,x=m.useCallback(l=>d({defaultView:l}),[d]),[o,u]=m.useState(null),[y,C]=m.useState(!1),[R,M]=m.useState(!1),[A,k]=m.useState(null),b=m.useRef(0),w=m.useCallback(async(l,P={})=>{const F=++b.current,g=P.silent===!0;g?M(!0):(C(!0),k(null));const I=Date.now();try{let p;if(n||!a?p=as(l):p=await z(a,l),!g){const f=Date.now()-I;f<$&&await new Promise(W=>setTimeout(W,$-f))}if(b.current!==F)return;u(p),g?M(!1):C(!1),k(null)}catch(p){if(b.current!==F)return;if(g?M(!1):C(!1),p instanceof V){k("This device does not support shell-protocol v2 (dumpsys requires it).");return}const f=p instanceof Error?p.message:String(p);k(f),g||r(`dumpsys ${l} failed: ${f}`)}},[a,n,r]);m.useEffect(()=>{w(t)},[t,n,a]),m.useEffect(()=>{const l=c.autoRefreshMs;if(!l||l<=0)return;const P=window.setInterval(()=>{b.current>0&&(y||R)||w(t,{silent:!0})},l);return()=>window.clearInterval(P)},[c.autoRefreshMs,t,n,a]);const U=m.useCallback(l=>{i(l)},[i]),B=m.useCallback(()=>{w(t,{silent:o!=null})},[w,t,o]),L=m.useCallback(l=>d({autoRefreshMs:l}),[d]),q=m.useCallback(()=>{o&&navigator.clipboard.writeText(o.raw).then(()=>r("Raw output copied")).catch(()=>r("Copy failed"))},[o,r]),H={"--widget-font-size":`${c.fontSize}px`};return s.jsxs("div",{className:"ds-widget",style:H,children:[s.jsxs("div",{className:"ds-toolbar widget-bar",children:[s.jsx("div",{className:"ds-presets",children:K.map(l=>s.jsx("button",{type:"button",className:"ds-pill"+(t===l.id?" on":""),onClick:()=>U(l.id),title:l.desc,children:l.label},l.id))}),s.jsx("button",{type:"button",className:"ds-icon-btn"+(R?" ds-refresh-pulse":""),onClick:B,title:c.autoRefreshMs>0?`Run again (auto every ${us(c.autoRefreshMs)})`:"Run again",disabled:y,children:s.jsx(_,{size:13})}),s.jsx("select",{className:"ds-auto-refresh",value:c.autoRefreshMs,onChange:l=>L(Number(l.target.value)),title:"Auto-refresh interval","aria-label":"Auto-refresh interval",children:T.map(l=>s.jsx("option",{value:l.ms,children:l.ms===0?"Auto: off":`Auto: ${l.label}`},l.ms))}),s.jsx("button",{type:"button",className:"ds-icon-btn",onClick:q,title:"Copy raw output",disabled:!o,children:s.jsx(ms,{size:13})}),s.jsx("span",{style:{flex:1}}),s.jsxs("div",{className:"ds-view-seg",role:"tablist","aria-label":"View mode",children:[s.jsx("button",{role:"tab","aria-selected":h==="cards",className:h==="cards"?"on":"",onClick:()=>x("cards"),children:"Parsed"}),s.jsx("button",{role:"tab","aria-selected":h==="raw",className:h==="raw"?"on":"",onClick:()=>x("raw"),children:"Raw"})]})]}),s.jsx("div",{className:"ds-body",children:y?s.jsxs("div",{className:"ds-status",children:[s.jsx("div",{className:"ds-spinner"}),s.jsxs("span",{children:["Running ",s.jsxs("code",{children:["dumpsys ",hs(t)]}),"…"]})]}):A?s.jsx("div",{className:"ds-status ds-status-err",children:s.jsx("span",{children:A})}):o?h==="raw"?s.jsx("pre",{className:"ds-raw",children:o.raw}):s.jsx("div",{className:"ds-cards",children:ps(o)}):s.jsx("div",{className:"ds-status",children:"No output."})})]})}function ms({size:e=14}){return s.jsxs("svg",{width:e,height:e,viewBox:"0 0 24 24",fill:"none",children:[s.jsx("rect",{x:"9",y:"3",width:"11",height:"14",rx:"2",stroke:"currentColor",strokeWidth:"1.6"}),s.jsx("path",{d:"M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2",stroke:"currentColor",strokeWidth:"1.6",strokeLinecap:"round",strokeLinejoin:"round"})]})}function hs(e){const a=K.find(n=>n.id===e);return a?a.args.join(" "):e}function us(e){return T.find(n=>n.ms===e)?.label??`${e}ms`}function ps(e){const{parsed:a}=e;switch(a.id){case"battery":return s.jsx(is,{data:a.data});case"meminfo":return s.jsx(cs,{data:a.data});case"cpuinfo":return s.jsx(ds,{data:a.data});case"gfxinfo":return s.jsx(ts,{data:a.data});case"wifi":return s.jsx(os,{data:a.data})}}export{vs as DumpsysWidget};
//# sourceMappingURL=DumpsysWidget-Yrv96zeK.js.map
