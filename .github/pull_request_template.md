## Summary

<!-- What does this PR do? 2-3 sentences. -->

## Type

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — code change that does not add a feature or fix a bug
- [ ] docs — documentation only
- [ ] test — adding or updating tests
- [ ] chore — dependency, CI, configuration

## Related Issue

Closes #<!-- issue number -->

## Test Plan

- [ ] `node smoke_test.mjs` passes (all 5 checks green)
- [ ] `node multitenant/test_full_flow.js` passes (if multi-tenant code changed)
- [ ] Tested manually via Telegram bot (describe scenario below)

Manual test scenario:
```
1.
2.
3.
```

## Firestore Impact

Does this PR add, modify, or remove Firestore collections or document shapes?

- [ ] No Firestore changes
- [ ] New collection: `___`
- [ ] Changed document shape in: `___`
- [ ] Migration script included: `multitenant/migrate.js`

## Breaking Changes

- [ ] No breaking changes
- [ ] Yes — describe what breaks and migration path:

## Screenshots

<!-- If this affects bot messages or user flow, paste example interactions. -->

## Checklist

- [ ] `firma_id` filter applied to all new Firestore queries
- [ ] No hardcoded secrets or Telegram IDs
- [ ] `MAHAL_MAP` not changed without backwards-compat justification
- [ ] `.env.example` updated if new env vars added
- [ ] `CLAUDE.md` updated if architecture changes
