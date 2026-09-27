// Minimal Python-compatible random.Random: MT19937 seeded like CPython's
// init_by_array, plus shuffle() via _randbelow/getrandbits — so ported
// solvers that shuffle with a fixed seed make exactly the Python choices.

export class PyRandom {
  private mt = new Uint32Array(624)
  private mti = 625

  constructor(seed: number) {
    // CPython seeds with the absolute value split into 32-bit words
    const key: number[] = []
    let s = Math.abs(Math.trunc(seed))
    do {
      key.push(s % 0x100000000)
      s = Math.floor(s / 0x100000000)
    } while (s > 0)
    this.initByArray(key)
  }

  private initGenrand(s: number) {
    const mt = this.mt
    mt[0] = s >>> 0
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
    this.mti = 624
  }

  private initByArray(key: number[]) {
    const mt = this.mt
    this.initGenrand(19650218)
    let i = 1, j = 0
    for (let k = Math.max(624, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0
      i++; j++
      if (i >= 624) { mt[0] = mt[623]; i = 1 }
      if (j >= key.length) j = 0
    }
    for (let k = 623; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0
      i++
      if (i >= 624) { mt[0] = mt[623]; i = 1 }
    }
    mt[0] = 0x80000000
  }

  private genrandUint32(): number {
    const mt = this.mt
    if (this.mti >= 624) {
      for (let kk = 0; kk < 624; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[(kk + 1) % 624] & 0x7fffffff)
        mt[kk] = mt[(kk + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)
      }
      this.mti = 0
    }
    let y = mt[this.mti++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** getrandbits(k) for 0 < k <= 32 */
  private getrandbits(k: number): number {
    return this.genrandUint32() >>> (32 - k)
  }

  private randbelow(n: number): number {
    const k = Math.floor(Math.log2(n)) + 1     // n.bit_length()
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1)
      ;[x[i], x[j]] = [x[j], x[i]]
    }
  }
}
