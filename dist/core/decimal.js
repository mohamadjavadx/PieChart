// Exact decimal numbers, so that totals and shares are not distorted by floating point, like the
// Android library's BigDecimal. Only what the chart needs: parsing, adding, comparing, and dividing
// to 16 significant digits (Java's MathContext.DECIMAL64, rounding half to even).
/** The number of significant digits of a division: the same as Java's MathContext.DECIMAL64. */
const DIVISION_DIGITS = 16;
const NUMBER_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
const pow10 = (n) => 10n ** BigInt(n);
const abs = (n) => (n < 0n ? -n : n);
/** `unscaled / 10^scale`. The scale may be negative. */
export class Decimal {
    static ZERO = new Decimal(0n, 0);
    unscaled;
    scale;
    constructor(unscaled, scale) {
        this.unscaled = unscaled;
        this.scale = scale;
    }
    static from(value) {
        if (value instanceof Decimal)
            return value;
        if (typeof value === "bigint")
            return new Decimal(value, 0);
        if (typeof value === "number") {
            if (!Number.isFinite(value))
                throw new RangeError(`Not a finite number: ${value}`);
            return Decimal.parse(String(value));
        }
        return Decimal.parse(value);
    }
    static parse(text) {
        const match = NUMBER_PATTERN.exec(text.trim());
        if (!match)
            throw new SyntaxError(`Not a decimal number: "${text}"`);
        const [, sign = "", whole = "", fraction = "", exponent = "0"] = match;
        if (whole === "" && fraction === "")
            throw new SyntaxError(`Not a decimal number: "${text}"`);
        const unscaled = BigInt(whole + fraction);
        return new Decimal(sign === "-" ? -unscaled : unscaled, fraction.length - Number(exponent));
    }
    static sum(values) {
        let total = Decimal.ZERO;
        for (const value of values)
            total = total.add(value);
        return total;
    }
    signum() {
        return this.unscaled < 0n ? -1 : this.unscaled > 0n ? 1 : 0;
    }
    add(other) {
        const scale = Math.max(this.scale, other.scale);
        return new Decimal(this.rescaled(scale) + other.rescaled(scale), scale);
    }
    subtract(other) {
        const scale = Math.max(this.scale, other.scale);
        return new Decimal(this.rescaled(scale) - other.rescaled(scale), scale);
    }
    multiply(other) {
        return new Decimal(this.unscaled * other.unscaled, this.scale + other.scale);
    }
    /** This divided by [other], to [DIVISION_DIGITS] significant digits, rounding half to even. */
    divide(other) {
        if (other.signum() === 0)
            throw new RangeError("Division by zero");
        if (this.signum() === 0)
            return Decimal.ZERO;
        // The quotient as a fraction n / d of integers: (a / 10^sa) / (b / 10^sb) is a / b * 10^(sb - sa).
        let n = abs(this.unscaled) * pow10(Math.max(other.scale - this.scale, 0));
        let d = abs(other.unscaled) * pow10(Math.max(this.scale - other.scale, 0));
        const negative = this.signum() !== other.signum();
        // Enough digits to round from: the quotient of n * 10^k / d has more than DIVISION_DIGITS.
        const k = DIVISION_DIGITS + 2 - (n.toString().length - d.toString().length);
        if (k >= 0)
            n *= pow10(k);
        else
            d *= pow10(-k);
        let quotient = n / d;
        const inexact = n % d !== 0n;
        let scale = k;
        const drop = quotient.toString().length - DIVISION_DIGITS;
        if (drop > 0) {
            const unit = pow10(drop);
            const kept = quotient / unit;
            const rest = quotient % unit;
            const half = unit / 2n;
            const up = rest > half || (rest === half && (inexact || kept % 2n === 1n));
            quotient = kept + (up ? 1n : 0n);
            scale -= drop;
        }
        return new Decimal(negative ? -quotient : quotient, scale);
    }
    compareTo(other) {
        const scale = Math.max(this.scale, other.scale);
        const a = this.rescaled(scale);
        const b = other.rescaled(scale);
        return a < b ? -1 : a > b ? 1 : 0;
    }
    /** The nearest number: for drawing and rounding, not for arithmetic. */
    toNumber() {
        return Number(`${this.unscaled}e${-this.scale}`);
    }
    /** The value in plain notation, without an exponent and without trailing zeros. */
    toString() {
        if (this.unscaled === 0n)
            return "0";
        const digits = abs(this.unscaled).toString();
        const sign = this.unscaled < 0n ? "-" : "";
        let text;
        if (this.scale <= 0) {
            text = digits + "0".repeat(-this.scale);
        }
        else if (digits.length > this.scale) {
            text = `${digits.slice(0, digits.length - this.scale)}.${digits.slice(digits.length - this.scale)}`;
        }
        else {
            text = `0.${"0".repeat(this.scale - digits.length)}${digits}`;
        }
        if (text.includes("."))
            text = text.replace(/0+$/, "").replace(/\.$/, "");
        return sign + text;
    }
    rescaled(scale) {
        return this.unscaled * pow10(scale - this.scale);
    }
}
