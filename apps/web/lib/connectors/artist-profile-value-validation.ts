import type { ArtistProfileField } from './artist-profile-contract';
import type { ArtistProfilePreviewManifest } from './artist-profile-preview-manifest';
import { profileImageEvidenceSchema } from './artist-profile-preview-manifest';

export interface ProfileValidationResult {
  readonly rule: string;
  readonly valid: boolean;
}

/** No truncation, URL rewriting, asset fetch, or other implicit transformation. */
export function validateArtistProfileValue(
  field: ArtistProfileField,
  canonicalValue: string | null,
  manifest: ArtistProfilePreviewManifest,
  imageEvidence: unknown,
  evidenceRefs: readonly string[]
): { outboundValue: string | null; results: ProfileValidationResult[] } {
  const rules = manifest.constraints[field];
  if (!rules)
    return {
      outboundValue: null,
      results: [{ rule: 'constraints_known', valid: false }],
    };
  const results: ProfileValidationResult[] = [];
  const check = (rule: string, valid: boolean) => results.push({ rule, valid });
  const outboundValue =
    typeof canonicalValue === 'string'
      ? rules.transform === 'trim'
        ? canonicalValue.trim()
        : canonicalValue
      : null;
  check(
    'value_present',
    outboundValue !== null && outboundValue.trim().length > 0
  );
  const policy = manifest.artistProfile.fields[field].validation;
  check(
    'validation_policy',
    policy.status === 'documented' && policy.policyRef === rules.policyRef
  );
  if (outboundValue === null) return { outboundValue, results };
  if (field === 'bio' && 'lengthUnit' in rules) {
    const length =
      rules.lengthUnit === 'utf8_bytes'
        ? new TextEncoder().encode(outboundValue).length
        : rules.lengthUnit === 'code_points'
          ? [...outboundValue].length
          : outboundValue.length;
    check(
      'text_length',
      length >= rules.minLength && length <= rules.maxLength
    );
    check(
      'text_format',
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(outboundValue)
    );
  } else if ('allowedProtocols' in rules) {
    check('url_length', outboundValue.length <= rules.maxLength);
    let validUrl = false;
    try {
      const url = new URL(outboundValue);
      validUrl =
        rules.allowedProtocols.some(protocol => protocol === url.protocol) &&
        !!url.hostname &&
        /^https?:\/\//.test(outboundValue) &&
        !url.username &&
        !url.password &&
        !/[\\\s\u0000-\u001f\u007f]/.test(outboundValue);
    } catch {
      /* Malformed URLs remain a validation failure. */
    }
    check('url_format', validUrl);
    if (field === 'image' && 'mimeTypes' in rules) {
      const parsed = profileImageEvidenceSchema.safeParse(imageEvidence);
      const image = parsed.success ? parsed.data : null;
      check(
        'image_evidence',
        image !== null &&
          image.value === outboundValue &&
          evidenceRefs.includes(image.evidenceRef)
      );
      if (image) {
        check('image_mime_type', rules.mimeTypes.includes(image.mimeType));
        check('image_bytes', image.bytes <= rules.maxBytes);
        check(
          'image_dimensions',
          image.width >= rules.minWidth &&
            image.width <= rules.maxWidth &&
            image.height >= rules.minHeight &&
            image.height <= rules.maxHeight
        );
      }
    }
  }
  return { outboundValue, results };
}
