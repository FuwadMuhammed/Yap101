# Accessibility and UI Report (Phase 2)

2026-11-21 · Commit `52d23ca` · Chromium only (Firefox and WebKit aren't installed in this environment). Screenshots are in `evidence/shots/phase2/`.

**Verdict:** automated WCAG 2.1 A/AA checks pass (axe-core, 0 violations, light and dark). Keyboard flow works, and the editor works from 280 px to desktop. Three P3 issues remain: 200% text clips the two main buttons, the "Clear" target is below 24 px, and the Android back gesture discards the draft (usability, BUG-28).

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| axe-core WCAG 2.1 A/AA: prep, editor empty, editor polished + undo bar, light + dark | **0 violations** (after round-2 BUG-24 fix) | `round2-a11y.json` |
| Accessibility tree (screen-reader view) | dialog "Edit your script"; buttons "Close without saving", "Use our suggestion", "Polish it for me", "Save script"; textboxes "Script", "Anything our suggestion should include?"; live `status` hint: all present | `phase2-editor-aria.txt`, F7 |
| Keyboard only | open editor, type, Tab to Save, Enter: PASS; Escape closes; Enter in steer box submits | S12, E19 |
| Contrast | axe colour-contrast: no violations. The app has one light theme; a dark OS setting keeps it readable | S15, round2-a11y |
| Text scaled to 200% | **FAIL**: no sideways scroll, but "Use our suggestion" and "Polish it for me" labels are clipped (buttons don't wrap) | F5 → BUG-34, `F5-text-200.png` |
| Touch targets | **FAIL (AA 2.5.8)**: "Clear" is 36×20 px (< 24 px high). Under 44 px (AAA, advisory): "Import .txt" 132×40 | F6 → BUG-35 |
| Small / large phones, tablet, desktop (360, 430, 768, 1440 px) with a 40-line script | no overflow; Save visible; editor column caps at 512 px on tablet/desktop | F1–F4 |
| Device matrix (emulated, touch): iPhone SE, 13, 15 Pro Max, Pixel 7, Galaxy S9+, iPad Mini, Galaxy Tab S4, 280 px fold | 8/8 PASS: tap → suggestion → tap Save works | `phase2-devices.json` |
| Rotate mid-edit | text kept; Save visible in landscape | X5 |
| Loading / empty / error states | "Writing…" + Cancel; empty-state hint; busy → message + starter | F8 screenshots |
| Long content scrolling | box scrolls; sticky Save stays reachable | F1–F4 |
| Screen reader with real assistive tech | **NOT TESTED**: no VoiceOver/TalkBack here; tree checked instead | — |

## Usability findings from exploratory testing

| ID | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| BUG-28 | P2 | Android back gesture / browser Back with the editor open leaves the record screen (to /home) and **discards the draft without warning**. The sheet isn't in browser history, so Back doesn't close it. | X1 |
| BUG-29 | P3 | Reloading discards unsaved editor text (no draft autosave, no warning). | X2 |
| BUG-31 | P3 | A saved script can't be removed: Clear disables Save, and after "My own words" + reload the day reopens in script mode. | X4 |
| BUG-34 | P3 | 200% text clips the two main button labels. | F5 |
| BUG-35 | P3 | "Clear" target 36×20 px. | F6 |
