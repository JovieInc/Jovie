/** Escape a workflow-command message per GitHub Actions rules. */
export function escapeAnnotationMessage(text) {
  return String(text ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/** Escape a workflow-command property value (e.g. `title=`). */
export function escapeAnnotationProperty(text) {
  return escapeAnnotationMessage(text)
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}
