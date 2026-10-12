// Eksakte rasjonale tall med BigInt. Brukes til fasit og kontroll, slik at
// avrunding aldri skjer i stillhet under regning.

export class Rat {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static of(n: bigint | number, d: bigint | number = 1n): Rat {
    let nn = typeof n === 'number' ? BigInt(n) : n;
    let dd = typeof d === 'number' ? BigInt(d) : d;
    if (dd === 0n) throw new MathError('Deling på null');
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(abs(nn), dd);
    return new Rat(nn / g, dd / g);
  }

  static readonly ZERO = Rat.of(0);
  static readonly ONE = Rat.of(1);

  /** Tolker en desimalstreng eksakt, med punktum eller komma som desimaltegn. */
  static parseDecimal(s: string): Rat {
    const t = s.trim().replace(',', '.');
    const m = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(t);
    if (!m || (m[2] === '' && !m[3])) throw new MathError(`Ugyldig tall: ${s}`);
    const sign = m[1] === '-' ? -1n : 1n;
    const intPart = m[2] === '' ? 0n : BigInt(m[2]);
    const frac = m[3] ?? '';
    const den = 10n ** BigInt(frac.length);
    const num = intPart * den + (frac ? BigInt(frac) : 0n);
    return Rat.of(sign * num, den);
  }

  /** Leser «3/4», «-2,5» eller «12». */
  static parse(s: string): Rat {
    const t = s.trim().replace(/[\u2212\u2013]/g, '-');
    if (t.includes('/')) {
      const [a, b] = t.split('/');
      return Rat.parseDecimal(a.replace(/[()]/g, '')).div(Rat.parseDecimal(b.replace(/[()]/g, '')));
    }
    return Rat.parseDecimal(t);
  }

  /** Konverterer et JS-tall eksakt når det er et heltall eller en kort desimal. */
  static fromNumber(x: number): Rat {
    if (!Number.isFinite(x)) throw new MathError('Ikke et endelig tall');
    if (Number.isInteger(x)) return Rat.of(BigInt(x));
    const s = x.toPrecision(15).replace(/0+$/, '');
    if (/e/i.test(s)) {
      const [mant, exp] = s.toLowerCase().split('e');
      const r = Rat.parseDecimal(mant);
      const e = parseInt(exp, 10);
      return e >= 0 ? r.mul(Rat.of(10n ** BigInt(e))) : r.div(Rat.of(10n ** BigInt(-e)));
    }
    return Rat.parseDecimal(s);
  }

  add(o: Rat): Rat {
    return Rat.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rat): Rat {
    return Rat.of(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rat): Rat {
    return Rat.of(this.n * o.n, this.d * o.d);
  }
  div(o: Rat): Rat {
    if (o.n === 0n) throw new MathError('Deling på null');
    return Rat.of(this.n * o.d, this.d * o.n);
  }
  neg(): Rat {
    return Rat.of(-this.n, this.d);
  }
  inv(): Rat {
    if (this.n === 0n) throw new MathError('Deling på null');
    return Rat.of(this.d, this.n);
  }
  pow(k: number): Rat {
    if (!Number.isInteger(k)) throw new MathError('Ikke-heltallig eksponent');
    if (k === 0) return Rat.ONE;
    if (k < 0) return this.inv().pow(-k);
    let r: Rat = Rat.ONE;
    for (let i = 0; i < k; i++) r = r.mul(this);
    return r;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isInteger(): boolean {
    return this.d === 1n;
  }
  sign(): number {
    return this.n === 0n ? 0 : this.n > 0n ? 1 : -1;
  }
  eq(o: Rat): boolean {
    return this.n === o.n && this.d === o.d;
  }
  cmp(o: Rat): number {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l === r ? 0 : l < r ? -1 : 1;
  }
  abs(): Rat {
    return this.n < 0n ? this.neg() : this;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  /** Rund av til gitt antall desimaler (halv opp, bort fra null). */
  round(decimals: number): Rat {
    const f = 10n ** BigInt(decimals);
    const scaled = this.mul(Rat.of(f));
    const q = scaled.n / scaled.d;
    const r = scaled.n % scaled.d;
    let res = q;
    if (2n * abs(r) >= scaled.d) res = q + (scaled.n < 0n ? -1n : 1n);
    return Rat.of(res, f);
  }
  /** Antall desimaler hvis tallet har en endelig desimalutvikling, ellers null. */
  finiteDecimals(): number | null {
    let d = this.d;
    let twos = 0;
    let fives = 0;
    while (d % 2n === 0n) {
      d /= 2n;
      twos++;
    }
    while (d % 5n === 0n) {
      d /= 5n;
      fives++;
    }
    if (d !== 1n) return null;
    return Math.max(twos, fives);
  }
  /** Norsk formatering med desimalkomma. Eksakt når mulig, ellers avrundet. */
  toNo(maxDecimals = 4): string {
    const fd = this.finiteDecimals();
    const dec = fd === null ? maxDecimals : Math.min(fd, maxDecimals);
    const r = this.round(dec);
    const neg = r.n < 0n;
    const f = 10n ** BigInt(dec);
    const scaled = abs(r.n * (f / r.d));
    const ip = scaled / f;
    const fp = scaled % f;
    let s = groupThousands(ip.toString());
    if (dec > 0) {
      let frac = fp.toString().padStart(dec, '0').replace(/0+$/, '');
      if (frac) s += ',' + frac;
    }
    return (neg && (ip !== 0n || fp !== 0n) ? '−' : '') + s;
  }
  /** Er tallet en "eksakt" verdi eller en avrunding? */
  isExactDecimal(maxDecimals = 4): boolean {
    const fd = this.finiteDecimals();
    return fd !== null && fd <= maxDecimals;
  }
  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }
  toLatex(): string {
    if (this.d === 1n) return this.n < 0n ? `-${abs(this.n)}` : `${this.n}`;
    if (this.isExactDecimal(4)) return this.toNo().replace('−', '-').replace(',', '{,}').replace(/ /g, '\\,');
    const s = this.n < 0n ? '-' : '';
    return `${s}\\frac{${abs(this.n)}}{${this.d}}`;
  }
}

export class MathError extends Error {}

export function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0n ? 1n : a;
}

function groupThousands(s: string): string {
  if (s.length <= 4) return s; // 1000–9999 skrives vanligvis uten mellomrom
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Formaterer et vanlig JS-tall med norsk desimalkomma. */
export function fmtNo(x: number, decimals = 2): string {
  return Rat.fromNumber(Number(x.toFixed(decimals))).toNo(decimals);
}
