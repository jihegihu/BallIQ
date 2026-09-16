// Fire-and-forget haptic feedback — native app only, silent no-op on the web.
// Dynamic import behind isNativePlatform() keeps native code out of the web
// bundle (same pattern as PushRegistrar / NativeShell).

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium'): void {
  (async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
      await Haptics.impact({ style: map[style] });
    } catch {
      /* haptics are best-effort */
    }
  })();
}

export function hapticSuccess(): void {
  (async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      /* haptics are best-effort */
    }
  })();
}
