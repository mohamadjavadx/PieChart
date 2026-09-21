const FADE_OUT_MS = 100;
const FADE_IN_MS = 160;
/**
 * Decides what the center shows and how visible it is. A change of slice fades the old content out, then
 * the new content in; new content for the same slice replaces the old at once. The center also fades when
 * it stops or starts fitting. A port of the Android library's CenterPresenter, with time given to it.
 */
export class CenterPresenter {
    /** The slice whose content is drawn, which lags behind the selection during a fade-out. */
    displayed = null;
    /** 0..1, applied to everything the renderer draws. */
    alpha = 0;
    wanted = null;
    isAvailable = false;
    fade = null;
    clock;
    onChange;
    constructor(clock, onChange) {
        this.clock = clock;
        this.onChange = onChange;
    }
    get isFading() {
        return this.fade !== null;
    }
    update(slice, isAvailable) {
        this.wanted = slice;
        this.isAvailable = isAvailable;
        this.apply(this.clock());
    }
    /** Stops any fade and jumps to where it was heading, so nothing stays half-faded. */
    cancel() {
        this.fade = null;
        this.displayed = this.wanted;
        this.alpha = this.isAvailable && this.wanted !== null ? 1 : 0;
    }
    /** Moves the fade to [now] (ms). True while there is one. */
    advance(now) {
        const fade = this.fade;
        if (!fade)
            return false;
        const progress = Math.min(Math.max((now - fade.startedAt) / fade.duration, 0), 1);
        this.alpha = fade.from + (fade.to - fade.from) * progress; // linear
        this.onChange();
        if (progress >= 1) {
            this.fade = null;
            this.apply(now);
        }
        return this.fade !== null;
    }
    apply(now) {
        if (this.displayed?.data.id !== this.wanted?.data.id && this.alpha > 0) {
            // Another slice: let the old one fade out first; apply() runs again when done.
            this.fadeTo(0, now);
            return;
        }
        // The same slice, with a new value after a data change, is updated in place.
        if (this.displayed !== this.wanted) {
            this.displayed = this.wanted;
            this.onChange();
        }
        this.fadeTo(this.isAvailable && this.wanted !== null ? 1 : 0, now);
    }
    fadeTo(target, now) {
        this.fade = null;
        if (this.alpha === target)
            return;
        this.fade = { from: this.alpha, to: target, startedAt: now, duration: target > this.alpha ? FADE_IN_MS : FADE_OUT_MS };
    }
}
