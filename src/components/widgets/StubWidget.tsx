// Stub widget — placeholder component used by registry entries whose
// real implementation hasn't shipped yet (Phase 5 has only Logcat;
// Shell/Dumpsys/Files/Mirror are stubs until Phases 6–9). The palette
// disables the corresponding cards, but rendering this guarantees the
// registry remains "total" (every WidgetKind always resolves to a
// component) so the dashboard never has to handle an undefined `comp`.

export interface StubWidgetProps {
  tileId: string;
}

export function StubWidget({ tileId }: StubWidgetProps) {
  return (
    <div style={{ padding: 16, color: 'var(--fg-3)', fontSize: 'var(--t-sm)' }}>
      This widget is not yet available. ({tileId})
    </div>
  );
}
