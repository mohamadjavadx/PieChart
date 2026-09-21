/**
 * A cubic Bézier easing curve from (0, 0) to (1, 1) with the control points (x1, y1) and (x2, y2): what
 * CSS calls `cubic-bezier(x1, y1, x2, y2)` and Android's `PathInterpolator(x1, y1, x2, y2)`.
 */
export function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const x = (t) => ((ax * t + bx) * t + cx) * t;
    const y = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (progress) => {
        if (progress <= 0)
            return 0;
        if (progress >= 1)
            return 1;
        // Find t with x(t) = progress: Newton's method, then bisection where the slope is too flat.
        let t = progress;
        for (let i = 0; i < 8; i++) {
            const error = x(t) - progress;
            if (Math.abs(error) < 1e-7)
                return y(t);
            const slope = dx(t);
            if (Math.abs(slope) < 1e-6)
                break;
            t -= error / slope;
        }
        let low = 0;
        let high = 1;
        t = progress;
        while (low < high) {
            const value = x(t);
            if (Math.abs(value - progress) < 1e-7)
                break;
            if (value < progress)
                low = t;
            else
                high = t;
            t = (low + high) / 2;
            if (high - low < 1e-9)
                break;
        }
        return y(t);
    };
}
/** The curve of the Android library's reveal and data-change animations. */
export const DEFAULT_EASING = cubicBezier(0.3, 0.74, 0.38, 0.93);
