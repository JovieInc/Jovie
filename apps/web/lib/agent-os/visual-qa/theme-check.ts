import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';

const MIN_THEME_LUMINANCE_DELTA = 0.04;
const MAX_IDENTICAL_THEME_DIFF_RATIO = 0.001;

export interface VisualQaThemeCheckResult {
  readonly colorScheme: VisualQaColorScheme;
  readonly averageLuminance: number;
  readonly passed: boolean;
  readonly message: string;
}

export interface VisualQaThemePairCheckResult {
  readonly dark: VisualQaThemeCheckResult;
  readonly light: VisualQaThemeCheckResult;
  readonly luminanceDelta: number;
  readonly identicalDiffRatio: number | null;
  readonly passed: boolean;
  readonly message: string;
}

async function measureAverageLuminance(imagePath: string): Promise<number> {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  let total = 0;
  let samples = 0;

  for (let index = 0; index < data.length; index += channels) {
    const red = data[index] / 255;
    const green = data[index + 1] / 255;
    const blue = data[index + 2] / 255;
    const alpha = channels >= 4 ? data[index + 3] / 255 : 1;

    if (alpha <= 0) {
      continue;
    }

    total += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    samples += 1;
  }

  if (samples === 0) {
    throw new Error(`Unable to measure luminance for ${imagePath}`);
  }

  return total / samples;
}

async function measureIdenticalDiffRatio(
  leftPath: string,
  rightPath: string
): Promise<number> {
  const left = await readFile(leftPath);
  const right = await readFile(rightPath);
  const { data, info } = await sharp(left)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rightData = await sharp(right)
    .resize(info.width, info.height)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const channels = info.channels;
  let diffPixels = 0;
  const totalPixels = info.width * info.height;

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const index = pixel * channels;
    const leftRed = data[index];
    const leftGreen = data[index + 1];
    const leftBlue = data[index + 2];
    const rightRed = rightData[index];
    const rightGreen = rightData[index + 1];
    const rightBlue = rightData[index + 2];

    if (
      Math.abs(leftRed - rightRed) > 2 ||
      Math.abs(leftGreen - rightGreen) > 2 ||
      Math.abs(leftBlue - rightBlue) > 2
    ) {
      diffPixels += 1;
    }
  }

  return diffPixels / totalPixels;
}

function evaluateSingleTheme(
  colorScheme: VisualQaColorScheme,
  averageLuminance: number
): VisualQaThemeCheckResult {
  const passed =
    colorScheme === 'dark' ? averageLuminance < 0.5 : averageLuminance >= 0.35;

  return {
    colorScheme,
    averageLuminance,
    passed,
    message: passed
      ? `${colorScheme} capture luminance looks plausible (${averageLuminance.toFixed(3)})`
      : `${colorScheme} capture luminance failed plausibility check (${averageLuminance.toFixed(3)})`,
  };
}

export async function verifyVisualQaThemePair(input: {
  readonly darkScreenshotPath: string;
  readonly lightScreenshotPath: string;
}): Promise<VisualQaThemePairCheckResult> {
  const [darkLuminance, lightLuminance, identicalDiffRatio] = await Promise.all(
    [
      measureAverageLuminance(input.darkScreenshotPath),
      measureAverageLuminance(input.lightScreenshotPath),
      measureIdenticalDiffRatio(
        input.darkScreenshotPath,
        input.lightScreenshotPath
      ),
    ]
  );

  const dark = evaluateSingleTheme('dark', darkLuminance);
  const light = evaluateSingleTheme('light', lightLuminance);
  const luminanceDelta = lightLuminance - darkLuminance;
  const themesDistinct =
    luminanceDelta >= MIN_THEME_LUMINANCE_DELTA &&
    identicalDiffRatio > MAX_IDENTICAL_THEME_DIFF_RATIO;
  const passed = dark.passed && light.passed && themesDistinct;

  const message = passed
    ? `Dark/light captures are visually distinct (delta=${luminanceDelta.toFixed(3)}, diffRatio=${identicalDiffRatio.toFixed(4)})`
    : `Dark/light visual check failed (delta=${luminanceDelta.toFixed(3)}, diffRatio=${identicalDiffRatio.toFixed(4)})`;

  return {
    dark,
    light,
    luminanceDelta,
    identicalDiffRatio,
    passed,
    message,
  };
}
