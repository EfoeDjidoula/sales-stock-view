# English UI dictionary

French is the source language. `src/lib/translations.generated.ts` feeds the runtime DOM translator
(`src/lib/domTranslator.ts`) when English is selected.

To refresh after adding screens (run from the sandbox, needs `LOVABLE_API_KEY`):

1. `mkdir -p /tmp/i18n && cp scripts/i18n/* /tmp/i18n/ && node /tmp/i18n/extract.cjs` — lists new French strings.
2. Build `/tmp/i18n/todo.json` from `/tmp/i18n/strings.json`, then `python3 /tmp/i18n/translate.py`.
3. Regenerate `src/lib/translations.generated.ts` from `/tmp/i18n/done.json`.

Wrap text in `translate="no"` or `data-no-translate` to keep it in its original language.
