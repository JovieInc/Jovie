export function hasOnlyLowercaseLettersNumbersAndHyphens(
  handle: string
): boolean {
  if (typeof handle !== 'string') {
    return false;
  }

  for (let index = 0; index < handle.length; index += 1) {
    const code = handle.codePointAt(index);
    if (code === undefined) {
      return false;
    }

    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isHyphen = code === 45;

    if (!isDigit && !isLowercaseLetter && !isHyphen) {
      return false;
    }
  }

  return true;
}
