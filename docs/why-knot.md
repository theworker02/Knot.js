# Why Knot?

Package managers already solve _installation_. They still assume this sequence:

```text
declare → install everything → execute
```

That sequence creates a project-local forest of files, repeats identical bytes across repositories, and treats "the folder exists" as a substitute for "the bytes are the ones we meant."

Knot inverts the order:

```text
declare → resolve → execute ↔ retrieve when necessary ↔ verify ↔ share
```

The experiment is whether that model can remain compatible with the existing npm ecosystem. If it cannot, the code and the compatibility matrix should say so — not a marketing page.
