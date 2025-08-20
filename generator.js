import { spawn } from 'child_process';

export async function generateClaudeMd(insights) {
  // Super simple - just pass all insights to Claude and ask for final CLAUDE.md
  const prompt = `
<task>
Consolidate these user preferences from multiple conversations into a clean CLAUDE.md file.
The goal is to create clear, actionable instructions that will guide future Claude interactions.
</task>

<user_preferences>
${insights}
</user_preferences>

<instructions>
Create a well-structured CLAUDE.md with:
- Clear section headings (Communication Style, Code Preferences, Task Execution, etc.)
- Short, declarative bullet points
- No redundancy between rules
- Focus on actionable directives that directly impact Claude's behavior
Output ONLY the final CLAUDE.md content, no meta-commentary.
</instructions>

<examples>
## Communication Style
- Keep responses extremely brief and direct
- Skip preambles, explanations, and summaries
- Match user's casual tone when appropriate

## Code Preferences
- Never add code comments
- Edit existing files instead of creating new ones
- Follow existing patterns and conventions in the codebase

## Task Execution
- Do exactly what's asked, nothing more
- Never create documentation files unless explicitly requested
</examples>`;

  try {
    const content = await new Promise((resolve) => {
      const claude = spawn('claude', ['-p']);
      
      let output = '';
      
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Write prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();
      
      const timeout = setTimeout(() => {
        claude.kill();
        resolve(null);
      }, 20000);
      
      claude.on('close', () => {
        clearTimeout(timeout);
        resolve(output);
      });
      
      claude.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
    
    if (content && content.includes('# Optimized Claude Instructions')) {
      return content + `\n\n---\n\n*Generated on ${new Date().toLocaleDateString()} by ccoptimizer*`;
    }
  } catch (error) {
    console.error('Generation failed:', error.message);
  }
  
  // Simple fallback
  return `# Optimized Claude Instructions

${insights}

---

*Generated on ${new Date().toLocaleDateString()} by ccoptimizer*`;
}