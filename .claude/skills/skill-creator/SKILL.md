---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.
---

# Skill Creator

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages:

**decide intent → draft skill → create test prompts → evaluate results qualitatively and quantitatively → rewrite based on feedback → repeat → expand test set**

## Capturing Intent

Before writing anything, answer these four questions:
1. What capability should Claude gain?
2. When should it trigger? (be specific about phrases and contexts)
3. What is the expected output format?
4. Are test cases appropriate for verification?

## Writing SKILL.md

Structure:
- Frontmatter: `name`, `description` (with explicit trigger contexts)
- Body: procedure, steps, output format, guardrails

**Description must be "pushy"** — explicitly mention contexts where the skill applies, even when users don't explicitly request it. Include trigger phrases in multiple languages if the project is multilingual.

**Keep SKILL.md under 500 lines.** Use references to bundled resources for heavy content.

## Progressive Disclosure

- Metadata always available (~100 words)
- SKILL.md body when triggered (<500 lines ideal)
- Bundled resources (agents/, scripts/) loaded as needed

## Testing

Draft 2-3 realistic prompts that mirror real user requests. Run them both WITH and WITHOUT the skill simultaneously (critical for baseline comparison). Capture timing data.

## Evaluation

Grade outputs using `agents/grader.md` guidelines:
- PASS: Clear evidence of genuine task completion
- FAIL: Missing evidence, superficial satisfaction, or wrong output
- Binary pass/fail — no partial credit

## Improvement Philosophy

- Generalize from feedback rather than overfit to examples
- Keep prompts lean — remove unproductive instructions
- Explain the *why* behind instructions
- Look for repeated work patterns across test cases — bundle into scripts

## Environment (Claude Code)

Full workflow supported: subagents, parallel runs, browser-based reviewer, packaging.

## Final Step

Package skill via `scripts/package_skill.py`. Deliver `.skill` file to user.
