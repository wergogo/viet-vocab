/**
 * True for an Enter that should submit. The Enter that commits an IME composition (pinyin,
 * Vietnamese input methods) doesn't count; Safari reports it as keyCode 229 after compositionend.
 */
export function isSubmitEnter(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
}
