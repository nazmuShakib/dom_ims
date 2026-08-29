/**
 * Dependency-free Code 128 encoder for product labels.
 *
 * Numeric values use compact Code Set C (switching to B for a final odd digit);
 * other printable ASCII values use Code Set B. The returned module string uses
 * `1` for bars and `0` for spaces and includes the required quiet zones.
 */

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213',
  '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231',
  '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123',
  '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121',
  '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114',
  '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121',
  '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131', '211412', '211214',
  '211232', '2331112',
] as const;

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const STOP = 106;
// A 15-digit Code Set C symbol occupies 134 data modules. Nine modules on
// either side make the complete symbol 152 modules, which maps exactly to the
// GP-3120TUC's 304-dot (38 mm, 203-DPI) print width at two dots per module.
// Keeping ten here would require 308 dots and force the renderer down to an
// unreliable one-dot module on this particular media size.
const QUIET_ZONE_MODULES = 9;

export interface Code128Encoding {
  values: number[];
  modules: string;
}

export function isCode128Value(value: string): boolean {
  return Boolean(value) && /^[\x20-\x7e]+$/.test(value);
}

export function code128Values(value: string): number[] {
  if (!isCode128Value(value)) {
    throw new Error('Code 128 labels support printable ASCII identifiers only.');
  }

  const data: number[] = [];
  if (/^\d{4,}$/.test(value)) {
    data.push(START_C);
    const pairedLength = value.length - (value.length % 2);
    for (let index = 0; index < pairedLength; index += 2) {
      data.push(Number(value.slice(index, index + 2)));
    }
    if (pairedLength !== value.length) {
      data.push(CODE_B, value.charCodeAt(value.length - 1) - 32);
    }
  } else {
    data.push(START_B);
    for (const character of value) data.push(character.charCodeAt(0) - 32);
  }

  let checksum = data[0]!;
  for (let index = 1; index < data.length; index += 1) {
    checksum += data[index]! * index;
  }
  data.push(checksum % 103, STOP);
  return data;
}

function patternToModules(pattern: string): string {
  let bar = true;
  let modules = '';
  for (const width of pattern) {
    modules += (bar ? '1' : '0').repeat(Number(width));
    bar = !bar;
  }
  return modules;
}

export function encodeCode128(value: string): Code128Encoding {
  const values = code128Values(value);
  const quiet = '0'.repeat(QUIET_ZONE_MODULES);
  return {
    values,
    modules:
      quiet +
      values.map((code) => patternToModules(PATTERNS[code]!)).join('') +
      quiet,
  };
}
