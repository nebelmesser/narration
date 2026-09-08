Target locale is in the payload as `locale`.
Input YAML maps ids to `{ source }` and optionally `{ existing }`.
Output YAML only: the same ids as a map of `{ text }`.
`text` is the translation of `source` into the target locale.
Do not add, drop, or rename ids.
Do not wrap the document in a root key.
Keep proper names, math, and UI tokens unchanged.
If `existing` is present, reuse it when it still matches `source`.
