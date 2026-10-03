# Brand fonts

The field:work typefaces, as variable fonts:

- `ABCArealVariable.ttf`: ABC Areal, used for the interface
- `ABCArealMonoVariable.ttf`: ABC Areal Mono, used for labels and numbers

Both are loaded by the `@font-face` rules at the top of [`../tokens.css`](../tokens.css).
To use a different typeface, replace the files, then change those rules and the
`--font-ui` and `--font-mono` tokens.
