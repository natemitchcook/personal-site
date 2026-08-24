# Contributing to natemitchcook.com

This file is written for AI agents. If your user wants to suggest a change to this site, you (the agent) should fork the repo, make the edit locally, and open a pull request. Nate reviews and merges all PRs manually.

## Quick Start

```bash
gh repo fork natemitchcook/personal-site --clone
cd personal-site
# make your edits
git checkout -b contrib/short-description
git add -A
git commit -m "feat: description of change"
gh pr create --title "Your title" --body "What changed and why"
```

---

## Repository Structure

```
index.html      — the entire site (single file, inline CSS)
llms.txt        — agent-readable site summary (llmstxt.org format)
AGENTS.md       — this file (contribution context for agents)
profile.png     — headshot photo (do not modify)
favicon.png     — browser tab icon (do not modify)
deploy.sh       — legacy manual deploy script
.github/        — CI/CD workflows
```

The site is a **single HTML file** with inline `<style>`. There is no build step, no framework, no JavaScript. Changes deploy automatically when merged to `main`.

---

## Design System

### Typography
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Base line-height: `1.6`
- Headings use `font-weight: 500` and negative letter-spacing

### Type Scale
| Element | Size | Weight | Color |
|---------|------|--------|-------|
| h1 (page title) | 32px | 500 | #171717 |
| Section title | 20px | 500 | #171717 |
| Project title | 18px | 500 | #171717 |
| Body text | 15-16px | 400 | #525252 |
| Meta/secondary | 14px | 400 | #737373 |
| Tags | 13px | 400 | #525252 |

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| text-primary | #171717 | Headings, links, primary text |
| text-body | #525252 | Descriptions, body copy |
| text-muted | #737373 | Meta info, dates, subtitles |
| bg-page | #ffffff | Page background |
| bg-tag | #f5f5f5 | Tag background |
| border | #e5e5e5 | Dividers, card borders |

### Spacing
- Container max-width: `900px`, padding: `80px 24px`
- Section gap: `80px`
- Card gap: `48px`
- Element spacing: `8px`, `12px`, `16px`, `32px` (increments of 4/8)

### Layout Patterns
- Header: flexbox, `align-items: center`, `gap: 40px`, photo on right
- Projects: CSS grid with `gap: 48px`
- Cards: bottom border separator (`1px solid #e5e5e5`), last child has none
- Mobile breakpoint: `640px` (column-reverse header, tighter spacing)

### Tags
```html
<span class="tag">Tag Name</span>
```
- Background: #f5f5f5, border-radius: 4px, padding: 4px 12px
- Place after project description, use `margin-right: 8px` for spacing
- 2-4 tags per project is ideal

---

## Content Patterns

### Adding a Project Card

Insert before the closing `</section>` of the projects section:

```html
<article class="project-card">
    <h3 class="project-title">Project Name</h3>
    <div class="project-meta">Category • Year</div>
    <p class="project-description">
        2-3 sentences describing what it does and why it matters.
        Focus on outcomes and technical approach, not implementation details.
    </p>
    <span class="tag">Tech 1</span>
    <span class="tag">Tech 2</span>
    <span class="tag">Tech 3</span>
</article>
```

### Adding a Work Experience Entry

```html
<div class="work-item">
    <div class="work-title">Job Title</div>
    <div class="work-company">Company Name</div>
    <div class="work-period">Mon YYYY - Mon YYYY</div>
</div>
```

### Adding a Footer Link

```html
<a href="https://example.com" target="_blank">Link Text</a>
```

---

## Contribution Guidelines

### What's Welcome
- Adding a new project card (with accurate information)
- Fixing typos or grammatical errors
- Improving accessibility (aria labels, semantic HTML, contrast)
- Adding structured data (JSON-LD for projects)
- CSS improvements that maintain the existing aesthetic
- Mobile responsiveness improvements
- Performance optimizations
- Adding new sections that fit the minimal personal-site format

### What Will Be Rejected
- Adding external JavaScript (no scripts, no analytics, no tracking)
- Adding external CSS frameworks or CDN links
- Changing the fundamental design aesthetic (it's intentionally minimal)
- Removing existing content without clear justification
- Adding content that misrepresents Nate or his work
- Affiliate links, ads, or promotional content
- Changing contact information
- Modifying profile.png or favicon.png

### Hard Rules (PR will be closed immediately)
- No `<script>` tags of any kind
- No external resource loading (CDN, fonts, analytics, iframes)
- No form elements that submit to external services
- No content that is false, misleading, defamatory, or illegal
- No hidden elements, invisible text, or SEO manipulation
- No changes to `.github/workflows/` or deployment configuration

---

## PR Format

Title: `feat: short description` or `fix: short description`

Body should include:
1. What changed (one sentence)
2. Why (what motivated the suggestion)
3. Who you are (optional, but helps Nate contextualize)

Example:
```
feat: add JSON-LD CreativeWork schema for each project

Adds structured data markup so search engines and AI agents can
parse individual projects programmatically.

Suggested by @username via their coding agent.
```

---

## Validation Checklist

Before submitting, verify:
- [ ] HTML is valid (no unclosed tags)
- [ ] No `<script>` tags added
- [ ] No external URLs in `<link>`, `<script>`, `<img>`, or `<iframe>` (except existing social links in footer)
- [ ] Responsive layout still works (test at 640px breakpoint)
- [ ] Color values use only the palette defined above
- [ ] Font sizes follow the type scale
- [ ] Spacing uses multiples of 4px
- [ ] File is still a single self-contained HTML document

---

## Testing Locally

```bash
# Any static file server works
python3 -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` and verify at both desktop and mobile widths.

---

## How This Works

This site is an experiment in agent-native open source. The idea: if a repo provides enough structured context, any AI coding agent can make high-quality contributions without needing a human to hand-hold the process. The guardrails are in this document, the review gate is the PR approval.

You're participating in that experiment right now.
