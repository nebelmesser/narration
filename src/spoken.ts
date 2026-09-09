/** Spoken/subtitle script: drop markup the audience should not hear or read. */
export function spokenText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]\]]*\]/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ +([.,!?;:…])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
