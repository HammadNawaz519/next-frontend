/**
 * Ultra-responsive, high-performance haptics utility for Web & Mobile
 */
export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'danger' | 'heart' | 'select' = 'light') => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    switch (type) {
      case 'light':
      case 'select':
        navigator.vibrate(6);
        break;
      case 'medium':
        navigator.vibrate(12);
        break;
      case 'heavy':
        navigator.vibrate(22);
        break;
      case 'success':
        navigator.vibrate([10, 30, 15]);
        break;
      case 'warning':
        navigator.vibrate([15, 40, 15]);
        break;
      case 'danger':
        navigator.vibrate([20, 50, 20, 50, 20]);
        break;
      case 'heart':
        navigator.vibrate([10, 40, 12]);
        break;
      default:
        navigator.vibrate(8);
        break;
    }
  } catch {}
};
