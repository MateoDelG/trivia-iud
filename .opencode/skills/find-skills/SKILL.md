---
name: find-skills
description: Find and install agent skills with npx playbooks commands.
---

# find-skills

Source: https://agentskill.sh/iannuttall/find-skills

- Search skills: `npx playbooks find skill "<query>"`
- Semantic search: `npx playbooks find skill "<query>" --semantic`
- List skills from source: `npx playbooks add skill <source> --list`
- Install specific skill: `npx playbooks add skill <source> --skill <skill-name> -a <agent> [-g] [-y]`
- List available agents: `npx playbooks list agents`
