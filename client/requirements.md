## Packages
diff-match-patch | Needed for generating the before/after text diffs (highlighting changes)
@types/diff-match-patch | TypeScript definitions for diff-match-patch
clsx | For conditional Tailwind classes
tailwind-merge | For merging Tailwind classes safely

## Notes
- The `/api/review` endpoint expects `multipart/form-data` with `file`, `profession`, and `consent` fields, despite the JSON schema definition in the manifest. The frontend fetch call must use `FormData`.
- Feedback voting endpoints fire-and-forget to `/api/feedback`.
- Templates are downloaded directly via standard `<a>` href links to `/api/templates/:name`.
