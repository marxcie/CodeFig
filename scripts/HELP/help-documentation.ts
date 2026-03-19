// @Help & documentation
// @DOC_START
// # CodeFig – Help & documentation
//
// Your TypeScript-powered Figma scripting environment.
//
// ## Documentation tab
//
// Scripts can define a doc block between **// @DOC_START** and **// @DOC_END**. That block is rendered as **Markdown** in the Documentation tab.
//
// **Markdown supported:** headings (`#`, `##`, `###`), **bold**, *italic*, `code`, lists (`- item`), and more.
//
// **Spacing:** A single newline between comment lines = line break. A **blank line** or empty comment line (`//`) = new paragraph / extra vertical space.
//
// ## Script tab
//
// Main code editor: write TypeScript or JavaScript, run with Cmd/Ctrl+R, auto-save as you type. Use the sidebar to open Example Scripts or your saved scripts.
//
// ## Keyboard shortcuts
//
// | Shortcut | Action |
// |----------|--------|
// | Cmd/Ctrl + R | Run current script |
// | Cmd/Ctrl + / | Toggle line comments (in editor) |
// | Cmd/Ctrl + N | Create new script |
// | Cmd/Ctrl + E | Export current script as JSON |
// | Cmd/Ctrl + I | Import script from JSON file |
//
// ## Example Scripts
//
// Browse **Example Scripts** in the sidebar for ready-to-use scripts. They cover:
//
// - **Variables:** duplicate-variable-collection, replace-variables, rename-variables
// - **Styles:** duplicate-styles, replace-styles, replace-style-variable-bindings, rename-styles, text-to-styles
// - **Layout:** frame-or-auto-layout-selected, scale-selection
// - **Utilities:** variable-inspector, comments-to-annotations
//
// Scripts with a **Config** tab expose options (e.g. dropdowns, text inputs) defined via **// @UI_CONFIG_START** … **// @UI_CONFIG_END** in the script. See any Example Script with a Config tab for the pattern.
//
// ## @import system
//
// Reuse code across scripts:
//
// ```
// @import { getAllStyles, generateScale } from "@Core Library"
// @import { getCollection, setVariableValue } from "@Variables"
// @import { displayResults } from "@InfoPanel"
// @import { myFunction } from "My Custom Script"
// ```
//
// **Libraries:** @Core Library, @Math Helpers, @Variables, @InfoPanel, @Pattern Matching, @Replacement Engine, @Styles, @codefig-ui
//
// **User libraries:** Name a script with an `@` prefix (e.g. `@My Utils`) to make it a library. Other scripts can `@import` from it; libraries are not run directly.
//
// ## Common patterns
//
// - **Get data:** `figma.variables.getLocalVariableCollections()`, `figma.getLocalTextStyles()`
// - **User feedback:** `figma.notify('message')`, `console.log(...)`
// - **Selection:** `selection.forEach(node => { ... })`
// @DOC_END
