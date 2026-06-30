# 🎬 AI Prompt Template Generator

A form-driven generator for **multi-shot cinematic AI video prompts**. You edit the
**Character**, **Object**, **Scene**, **Background** (and more) once as global *tokens* —
they flow into every shot automatically. Add, remove, reorder and reword shots, then copy
the finished prompt.

Ships pre-loaded with the *film-critic / granola-bar* marketing example so you can see the
structure immediately, then swap the subjects to retarget it to any product.

## Run

```bash
npm install
npm start
# → http://localhost:3600   (set PORT to change)
```

Then open the URL in your browser.

## Presets & template kinds

Click **✦ Presets** for built-in starter prompts. There are two template *kinds*:

- **Shots** — cinematic multi-shot video prompts (e.g. *Film Critic — Granola Bar*). Each block is a camera shot with lens/lighting/dialogue/duration.
- **Sections** — structured design/image prompts (e.g. *Grocery Store Grand Opening* poster). Each block is a titled section of content. No `SHOT NN` numbering, camera, or runtime — just heading + body.

The form adapts to the kind: cinematic-only panels (Subjects, Look & Style, brand/duration/verdict) are hidden for **Sections** templates.

## Custom Fields (editable placeholders)

The **Fields** panel lets any template expose its own editable placeholder tokens. Each field has a **Label**, a **Token** key, and a **Value** — the value flows wherever you write `{{key}}`. The grocery poster ships with `{{headline}}`, `{{storeName}}`, `{{openingDate}}`, `{{openingTime}}`, `{{slogan}}`, … so you can re-skin the poster for any store by editing the fields once.

## How it works

### Global tokens (the editable fields)
Type a value once in the **Subjects / Concept / Style** panels and reference it anywhere
with `{{token}}`. Substitution happens live as you type.

| Token | Field |
|-------|-------|
| `{{character}}` | Character |
| `{{object}}` | Object / Product (use a **bare noun**, e.g. `granola bar`; articles live in the sentence) |
| `{{scene}}` | Scene / Setting |
| `{{background}}` | Background |
| `{{surface}}` | Surface / Prop |
| `{{ref}}` | Image reference → renders as `@[Image 1]` |
| `{{grade}}` | Color grade |
| `{{fps}}` | Frame rate |
| `{{brand}}` | Brand name |
| `{{verdict}}` | Verdict / payoff |
| `{{duration}}` | Total duration |

Click any chip in the **Insert token** bar to drop a token into the field you last edited.

### Shots
Each shot is fully editable — Title, Subtitle, **length in seconds**, Camera & lens, Lighting,
Action, Dialogue (auto-wrapped in quotes with a lead-in like *"He delivers:"*), and a Grade/tech
note. Use the per-shot buttons to **move ↑ / ↓**, **duplicate ⧉**, or **delete ✕**, and
**＋ Add shot** for more. Shots are auto-numbered `01, 02, …`.

The per-shot **sec** field feeds an **estimated runtime** shown in the Shots header and the
preview stats (`~25s`, or `~1m 30s` once past a minute). It's planning metadata only — it is
**not** injected into the generated prompt text.

### Output
The right pane shows the assembled prompt live:

```
<Category>:

<Concept summary>

SHOT 01 — <TITLE> — <SUBTITLE>
<camera>. <lighting>. <action> <He delivers: '…'> <grade/tech>

---

SHOT 02 — …
```

**⧉ Copy Prompt** (or ⌘/Ctrl-S) copies it; **↓ .txt** downloads it.

## Saving & sharing your work
- Your current form **autosaves** to the browser (`localStorage`) and reloads next visit.
- **⤓ Save** stores a named template in the **▤ Library** (also browser-local).
- **⤴ Export** downloads the whole template as a portable `.json` file; **⤵ Import** loads one
  back (validated for `meta` / `subjects` / `shots`). This is the way to share a template
  between browsers or with other people.
- A small server-side template store is also exposed for programmatic use:
  - `GET /api/templates`
  - `POST /api/templates` `{ "name": "...", "data": { ... } }` (upsert by name)
  - `DELETE /api/templates/:id`
  - persisted to `data/templates.json`.

## Files
```
server.js            Express static server + templates JSON API
public/index.html    layout + shot card template
public/styles.css    dark cinematic theme
public/data.js       blank/default state + the granola-bar example
public/app.js        state, token substitution, prompt generation, UI wiring
```

## Customising the starter example
Edit `exampleState()` in [public/data.js](public/data.js) to change the default subjects,
style, concept and shots that load on first open / **★ Load Example**.
