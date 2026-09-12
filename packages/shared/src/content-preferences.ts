/** Optional strong-language filter; the baseline friendly-content review still applies. */
export function containsStrongLanguage(text: string): boolean {
  return /\b(?:fuck(?:s|ed|er|ers|ing)?|motherfuck(?:er|ers|ing)?|bullshit|shit(?:s|ty|ting|ted|head|heads)?|bitch(?:es|ing|y)?|cunts?|assholes?)\b/i.test(text.normalize("NFKC"));
}
